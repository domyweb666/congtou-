// 從 assets/icon.svg 產生 app 圖示：npx electron scripts/make-icons.js
//   assets/icon.png  256×256，視窗與工作列用
//   assets/tray.png  32×32，系統匣用
//   assets/icon.ico  16、24、32、48、64、128、256，打包成 exe 時用
//   assets/icon.icns 16 到 1024，打包成 Mac 的 .app 時用
// 用 Electron 自己的瀏覽器畫 SVG，不用另外裝轉檔套件。
const { app, BrowserWindow } = require('electron');
const fs = require('fs'); const path = require('path');
const assets = path.join(__dirname, '..', 'assets');
const svg = fs.readFileSync(path.join(assets, 'icon.svg'), 'utf8');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const MAC = { icp4: 16, icp5: 32, icp6: 64, ic07: 128, ic08: 256, ic09: 512, ic10: 1024 };
const INSET = 0.04;   // 四周留白，佔邊長的比例
const RADIUS = 0.22;  // 圓角半徑，佔方塊邊長的比例

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  // 離屏視窗：用 1024 畫一次，再由畫布縮到各個尺寸（比直接畫小圖銳利）
  const win = new BrowserWindow({ show: false, width: 300, height: 300, webPreferences: { offscreen: true } });
  await win.loadURL('about:blank');
  const pngs = {};
  for (const size of [...SIZES, 512, 1024]) {
    const dataUrl = await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = ${size}; c.height = ${size};
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        // 桌面圖示：四周留一點邊、切成圓角方塊，在工作列上才不會是一塊滿版的方形
        const pad = ${size} * ${INSET}; const side = ${size} - pad * 2;
        g.beginPath(); g.roundRect(pad, pad, side, side, side * ${RADIUS}); g.clip();
        g.drawImage(img, pad, pad, side, side);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('SVG 畫不出來'));
      img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    })`);
    pngs[size] = Buffer.from(dataUrl.split(',')[1], 'base64');
  }
  fs.writeFileSync(path.join(assets, 'icon.png'), pngs[256]);
  fs.writeFileSync(path.join(assets, 'tray.png'), pngs[32]);
  // .ico：檔頭 6 位元組，每張圖 16 位元組的目錄，後面接各張 PNG 原始資料
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(SIZES.length, 4);
  const dir = []; let offset = 6 + 16 * SIZES.length;
  for (const size of SIZES) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size; e[1] = size === 256 ? 0 : size;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(pngs[size].length, 8); e.writeUInt32LE(offset, 12);
    offset += pngs[size].length; dir.push(e);
  }
  fs.writeFileSync(path.join(assets, 'icon.ico'), Buffer.concat([head, ...dir, ...SIZES.map((s) => pngs[s])]));
  // .icns：檔頭 'icns'＋總長度，每張圖是 4 個字的代號＋長度（含這 8 位元組）＋PNG
  const parts = Object.entries(MAC).map(([type, size]) => { const h = Buffer.alloc(8); h.write(type, 0, 'ascii'); h.writeUInt32BE(pngs[size].length + 8, 4); return Buffer.concat([h, pngs[size]]); });
  const top = Buffer.alloc(8); top.write('icns', 0, 'ascii'); top.writeUInt32BE(8 + parts.reduce((n, b) => n + b.length, 0), 4);
  fs.writeFileSync(path.join(assets, 'icon.icns'), Buffer.concat([top, ...parts]));
  console.log('[make-icons] 已產生 icon.png、tray.png、icon.ico、icon.icns', SIZES.map((s) => `${s}:${pngs[s].length}`).join(' '));
  app.exit(0);
}).catch((err) => { console.error('[make-icons] 失敗', err); app.exit(1); });
