// 網頁預覽版：用瀏覽器儲存空間代替 Windows 版的垃圾庫資料夾。介面程式跟 Windows 版是同一份。
(function () {
  const pages = new Map();  // date -> { doc, text, empty }
  const blobs = new Map();  // "date/rel" -> Blob
  const urls = new Map();   // "date/rel" -> blob: URL
  const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
  let db = null;

  const openDb = () => new Promise((resolve) => {
    try {
      const req = indexedDB.open('daily-dump-preview-v2', 1);
      req.onupgradeneeded = () => { req.result.createObjectStore('pages'); req.result.createObjectStore('blobs'); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  const all = (store) => new Promise((resolve) => {
    const out = [];
    try {
      const cur = db.transaction(store).objectStore(store).openCursor();
      cur.onsuccess = () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out); };
      cur.onerror = () => resolve(out);
    } catch { resolve(out); }
  });
  const put = (store, key, value) => { try { if (db) db.transaction(store, 'readwrite').objectStore(store).put(value, key); } catch { /* 存不了就只留在這次開啟 */ } };
  const ready = (async () => {
    db = await openDb();
    if (!db) return;
    for (const [k, v] of await all('pages')) pages.set(k, v);
    for (const [k, v] of await all('blobs')) blobs.set(k, v);
  })();

  const urlFor = (key) => { if (!urls.has(key) && blobs.has(key)) urls.set(key, URL.createObjectURL(blobs.get(key))); return urls.get(key) || ''; };
  const follow = (href) => { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); };
  const trashRead = () => { try { return JSON.parse(localStorage.getItem('dump-trash') || '[]'); } catch { return []; } };
  const trashWrite = (list) => { try { localStorage.setItem('dump-trash', JSON.stringify(list)); } catch { /* 存不了就算了 */ } };
  const settings = { vaultPath: '這個瀏覽器裡（網頁預覽版，只供試用，資料不保證留得住）', hotkey: 'Ctrl+Alt+D', closeToTray: true, launchAtLogin: false, packaged: true };

  window.dump = {
    getPage: async (date) => {
      await ready;
      const out = {};
      for (const key of blobs.keys()) if (key.startsWith(date + '/')) out[key.slice(date.length + 1)] = urlFor(key);
      const p = pages.get(date);
      return { doc: p ? p.doc : null, urls: out };
    },
    savePage: async (date, page) => { const v = { doc: page.doc, text: page.text, empty: page.empty }; pages.set(date, v); put('pages', date, v); },
    counts: async () => { await ready; const o = {}; for (const [d, p] of pages) if (!p.empty) o[d] = 1; return o; },
    recent: async (since) => { await ready; return [...pages.keys()].filter((d) => d >= since && !pages.get(d).empty).sort().reverse().map((date) => ({ date, doc: pages.get(date).doc })); },
    addPaths: async () => ({ assets: [], skipped: [] }),
    addBuffer: async (date, name, data) => {
      let file = name.replace(/[<>:"/\\|?*()[\]]/g, '_'); let n = 2;
      const dot = file.lastIndexOf('.'); const base = dot > 0 ? file.slice(0, dot) : file; const ext = dot > 0 ? file.slice(dot) : '';
      while (blobs.has(`${date}/files/${file}`)) file = `${base}-${n++}${ext}`;
      const isImage = IMAGE.test(file);
      const type = isImage ? 'image/' + ext.slice(1).toLowerCase().replace('jpg', 'jpeg').replace('svg', 'svg+xml') : (/\.pdf$/i.test(file) ? 'application/pdf' : '');
      const blob = new Blob([data], type ? { type } : {});
      const key = `${date}/files/${file}`;
      blobs.set(key, blob); put('blobs', key, blob);
      return { rel: `files/${file}`, name, size: data.byteLength, isImage, url: urlFor(key) };
    },
    openFile: async (date, rel) => { const u = urlFor(`${date}/${rel}`); if (!u) return '檔案不在了'; follow(u); return ''; },
    revealFile: async () => { toast('網頁預覽版沒有資料夾；Windows 版會打開檔案所在位置。'); },
    openUrl: async (url) => { if (/^https?:/i.test(url)) follow(url); },
    fetchTitle: async () => '',
    search: async (query) => {
      const words = String(query).toLowerCase().split(/\s+/).filter(Boolean); const out = [];
      if (!words.length) return out;
      for (const date of [...pages.keys()].sort().reverse()) {
        const p = pages.get(date); if (p.empty) continue;
        const lower = (p.text || '').toLowerCase();
        if (!words.every((w) => lower.includes(w))) continue;
        const hits = p.text.split('\n').map((l) => l.trim()).filter((l) => l && words.some((w) => l.toLowerCase().includes(w)));
        out.push({ date, lines: hits.slice(0, 4), more: Math.max(0, hits.length - 4) });
      }
      return out;
    },
    // 最近刪除：網頁版放在瀏覽器的 localStorage
    addTrash: async (entries) => {
      const now = Date.now();
      const list = trashRead();
      entries.forEach((e, i) => list.unshift({ id: `${now}-${i}`, at: now, date: e.date, node: e.node, text: e.text }));
      trashWrite(list.slice(0, 300));
    },
    listTrash: async () => trashRead().filter((e) => e.at >= Date.now() - 30 * 864e5).sort((a, b) => b.at - a.at),
    takeTrash: async (id) => { const list = trashRead(); const hit = list.find((e) => e.id === id) || null; trashWrite(list.filter((e) => e.id !== id)); return hit; },
    getSettings: async () => ({ ...settings }),
    setSettings: async (patch) => { Object.assign(settings, patch); return { ok: true, message: '', settings: { ...settings } }; },
    chooseVault: async () => { toast('網頁預覽版不能換位置；Windows 版可以。'); return null; },
    openVault: async () => { toast('網頁預覽版沒有資料夾；Windows 版會打開垃圾庫。'); },
    pickFiles: async () => { document.getElementById('webFile').click(); return []; },
    hide: async () => {},
    pin: async (on) => { if (on) toast('網頁預覽版不能釘在最上層；Windows 版會縮成一條浮在稿子旁邊。'); return false; },
    pathFor: () => '',
    on: () => {},
  };

  document.addEventListener('DOMContentLoaded', () => {
    const picker = document.createElement('input');
    picker.type = 'file'; picker.multiple = true; picker.id = 'webFile'; picker.hidden = true;
    picker.addEventListener('change', () => { window.insertFiles([...picker.files]).then(() => { picker.value = ''; }); });
    document.body.append(picker);
    document.getElementById('hotkeyHint').textContent = '全域快捷鍵、系統匣、開機啟動只有 Windows 版有，這裡的開關只是給你看位置。';
  });
})();
