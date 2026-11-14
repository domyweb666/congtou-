const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell, nativeImage, nativeTheme, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Store } = require('./store');

const APP_NAME = '蔥蔥丟';
const DEFAULTS = {
  vaultPath: '',
  hotkey: 'Ctrl+Alt+D',
  closeToTray: true,
  launchAtLogin: false,
  bounds: { width: 640, height: 760 },
};

let win = null;
let tray = null;
let store = null;
let settings = { ...DEFAULTS };
let quitting = false;
let flushed = false;

if (process.env.DAILY_DUMP_USERDATA) app.setPath('userData', process.env.DAILY_DUMP_USERDATA);
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  // 0.3 版叫「蔥頭」，設定存在另一個資料夾；第一次用新名字開的時候把舊設定搬過來（快捷鍵、垃圾庫位置、視窗大小）
  if (!process.env.DAILY_DUMP_USERDATA && !fs.existsSync(settingsFile())) {
    try {
      const before = path.join(app.getPath('appData'), '蔥頭', 'settings.json');
      if (fs.existsSync(before)) { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.copyFileSync(before, settingsFile()); }
    } catch { /* 搬不了就用預設值 */ }
  }
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
  if (!settings.vaultPath) {
    // 以前叫過 Daily Dump、蔥頭，舊資料夾還在就接著用，不搬也不改名
    const docs = app.getPath('documents');
    const before = ['DailyDump', '蔥頭'].map((n) => path.join(docs, n)).find((p) => fs.existsSync(p));
    settings.vaultPath = before || path.join(docs, APP_NAME);
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch { /* 存不了設定不影響使用 */ }
}

const asset = (name) => path.join(__dirname, '..', 'assets', name);

const fileUrl = (date, rel) => pathToFileURL(store.filePath(date, rel)).href;
const withUrl = (date, asset) => ({ ...asset, url: fileUrl(date, asset.rel) });

function createWindow() {
  const b = settings.bounds || DEFAULTS.bounds;
  win = new BrowserWindow({
    width: b.width, height: b.height, x: b.x, y: b.y,
    minWidth: 340, minHeight: 380,
    title: APP_NAME,
    icon: asset('icon.png'),
    show: false,
    autoHideMenuBar: true,
    // 開視窗那一瞬間的底色，跟設計系統 --ap-surface 淺色、深色同值，深色下才不會先閃一下白
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#232326' : '#ffffff',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: false, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });

  const remember = () => { if (win && !win.isMinimized() && !win.isMaximized()) settings.bounds = win.getBounds(); };
  win.on('resized', remember);
  win.on('moved', remember);
  win.on('close', (e) => {
    saveSettings();
    if (!quitting && settings.closeToTray) { e.preventDefault(); win.hide(); return; }
    if (!flushed) {
      // 真的要關之前，等頁面把還沒寫入的內容存好（最多等一秒半）。
      e.preventDefault();
      const done = () => { if (flushed) return; flushed = true; if (win) win.close(); };
      ipcMain.once('flushed', done);
      setTimeout(done, 1500);
      win.webContents.send('flush');
    }
  });
  win.on('hide', () => { if (win) win.webContents.send('flush'); });
  win.on('closed', () => { win = null; flushed = false; });
  // 右鍵選單：Windows 的基本動作都要在（每一項在別處也有入口，這裡不放獨家指令）。
  win.webContents.on('context-menu', (_e, p) => {
    const items = [];
    if (p.linkURL) items.push({ label: '打開連結', click: () => shell.openExternal(p.linkURL) }, { label: '複製連結網址', click: () => require('electron').clipboard.writeText(p.linkURL) }, { type: 'separator' });
    if (p.isEditable) items.push({ label: '復原', role: 'undo', enabled: p.editFlags.canUndo }, { label: '重做', role: 'redo', enabled: p.editFlags.canRedo }, { type: 'separator' },
      { label: '剪下', role: 'cut', enabled: p.editFlags.canCut });
    items.push({ label: '複製', role: 'copy', enabled: p.editFlags.canCopy });
    if (p.isEditable) items.push({ label: '貼上', role: 'paste', enabled: p.editFlags.canPaste }, { label: '貼成純文字', role: 'pasteAndMatchStyle', enabled: p.editFlags.canPaste }, { type: 'separator' }, { label: '全選', role: 'selectAll' });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
  // 外部連結一律交給預設瀏覽器，不在這個視窗裡開。
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
}

function showWindow(goToday) {
  if (!win) createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (goToday) win.webContents.send('go-today');
}

function toggleWindow() {
  if (win && win.isVisible() && win.isFocused()) win.hide();
  else showWindow(true);
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(asset('tray.png')));
  tray.setToolTip(`${APP_NAME}（${settings.hotkey || '未設定快捷鍵'}）`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `打開${APP_NAME}`, click: () => showWindow(true) },
    { label: '打開垃圾庫資料夾', click: () => shell.openPath(settings.vaultPath) },
    { label: '設定…', click: () => { showWindow(false); win.webContents.send('open-settings'); } },
    { type: 'separator' },
    { label: '結束', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', () => showWindow(true));
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  if (!settings.hotkey) return true;
  try { return globalShortcut.register(settings.hotkey, toggleWindow); } catch { return false; }
}

function applyLoginItem() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, args: ['--hidden'] });
}

async function fetchTitle(url) {
  try {
    if (!/^https?:\/\//i.test(url)) return '';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    const res = await net.fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 DailyDump' } });
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !type.includes('html')) { clearTimeout(timer); return ''; }
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, 300000);
    clearTimeout(timer);
    const head = buf.toString('latin1');
    const charset = (type.match(/charset=([\w-]+)/i) || head.match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8';
    let html;
    try { html = new TextDecoder(charset).decode(buf); } catch { html = buf.toString('utf8'); }
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) return '';
    return m[1].replace(/\s+/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ')
      .trim().slice(0, 200);
  } catch { return ''; }
}

function registerIpc() {
  ipcMain.handle('page:get', (_e, date) => {
    const page = store.getPage(date);
    const urls = {};
    for (const rel of page.files) urls[rel] = fileUrl(date, rel);
    return { doc: page.doc, urls };
  });
  ipcMain.handle('page:save', (_e, date, page) => store.savePage(date, page));
  ipcMain.handle('days:counts', () => store.counts());
  ipcMain.handle('add:paths', async (_e, date, paths) => {
    const assets = []; const skipped = [];
    for (const p of paths) {
      try {
        const r = await store.addPath(date, p);
        if (r.asset) assets.push(withUrl(date, r.asset)); else skipped.push(`${r.skipped}（${r.reason}）`);
      } catch (err) { skipped.push(`${path.basename(p)}（讀不到）`); }
    }
    return { assets, skipped };
  });
  ipcMain.handle('add:buffer', async (_e, date, name, data) => withUrl(date, await store.addBuffer(date, name, Buffer.from(data))));
  ipcMain.handle('file:open', async (_e, date, rel) => {
    const p = store.filePath(date, rel);
    if (!p || !fs.existsSync(p)) return '檔案不在了';
    return shell.openPath(p);
  });
  ipcMain.handle('file:reveal', (_e, date, rel) => {
    const p = store.filePath(date, rel);
    if (p && fs.existsSync(p)) shell.showItemInFolder(p); else shell.openPath(store.dayDir(date));
  });
  ipcMain.handle('url:open', (_e, url) => { if (/^https?:/i.test(url)) shell.openExternal(url); });
  ipcMain.handle('url:title', (_e, url) => fetchTitle(url));
  ipcMain.handle('search', (_e, q) => store.search(q));

  ipcMain.handle('settings:get', () => ({ ...settings, packaged: app.isPackaged }));
  ipcMain.handle('settings:set', (_e, patch) => {
    const result = { ok: true, message: '' };
    if (typeof patch.closeToTray === 'boolean') settings.closeToTray = patch.closeToTray;
    if (typeof patch.launchAtLogin === 'boolean') { settings.launchAtLogin = patch.launchAtLogin; applyLoginItem(); }
    if (typeof patch.hotkey === 'string') {
      const previous = settings.hotkey;
      settings.hotkey = patch.hotkey;
      if (!registerHotkey()) {
        settings.hotkey = previous; registerHotkey();
        result.ok = false; result.message = '這組快捷鍵被別的程式佔用了，已還原成原本那組。';
      }
      if (tray) tray.setToolTip(`${APP_NAME}（${settings.hotkey || '未設定快捷鍵'}）`);
    }
    saveSettings();
    return { ...result, settings: { ...settings, packaged: app.isPackaged } };
  });
  ipcMain.handle('vault:choose', async () => {
    const r = await dialog.showOpenDialog(win, { title: '選擇垃圾庫資料夾', defaultPath: settings.vaultPath, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    settings.vaultPath = r.filePaths[0];
    store.setVault(settings.vaultPath);
    saveSettings();
    if (win) win.webContents.send('vault:changed');
    return settings.vaultPath;
  });
  ipcMain.handle('vault:open', () => shell.openPath(settings.vaultPath));
  ipcMain.handle('pick:files', async () => {
    const r = await dialog.showOpenDialog(win, { title: '選擇要丟進來的檔案', properties: ['openFile', 'multiSelections'] });
    return r.canceled ? [] : r.filePaths;
  });
  ipcMain.handle('window:hide', () => { if (win) { if (settings.closeToTray) win.hide(); else win.minimize(); } });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow(true));
  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId('org.domyweb.dailydump');
    loadSettings();
    store = new Store(settings.vaultPath);
    registerIpc();
    createWindow();
    createTray();
    registerHotkey();
    applyLoginItem();
  });
  app.on('before-quit', () => { quitting = true; saveSettings(); });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => { if (!settings.closeToTray) app.quit(); });
}
