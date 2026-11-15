// 垃圾庫的讀寫：每天一個資料夾。page.json 是編輯器的正本，index.md 是給人看的副本，files/ 放附件。
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif', '.svg']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class Store {
  constructor(vaultPath) {
    this.setVault(vaultPath);
  }

  setVault(vaultPath) {
    this.vault = vaultPath;
    this.cache = new Map(); // date -> 純文字（有內容的日子才在裡面）
    fs.mkdirSync(this.vault, { recursive: true });
    this._scan();
  }

  dayDir(date) {
    if (!DATE_RE.test(date)) throw new Error('日期格式錯誤：' + date);
    return path.join(this.vault, date.slice(0, 4), date);
  }
  filesDir(date) { return path.join(this.dayDir(date), 'files'); }

  // rel 一律是 "files/檔名"，只認檔名，避免跑出當天資料夾。
  filePath(date, rel) {
    const name = path.basename(String(rel || '').replace(/\\/g, '/'));
    return name ? path.join(this.filesDir(date), name) : null;
  }

  _scan() {
    let years = [];
    try { years = fs.readdirSync(this.vault); } catch { return; }
    for (const y of years) {
      if (!/^\d{4}$/.test(y)) continue;
      let days = [];
      try { days = fs.readdirSync(path.join(this.vault, y)); } catch { continue; }
      for (const d of days) {
        if (!DATE_RE.test(d)) continue;
        const page = this._read(d);
        if (page && !page.empty) this.cache.set(d, page.text || '');
      }
    }
  }

  _read(date) {
    const dir = this.dayDir(date);
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, 'page.json'), 'utf8'));
    } catch { /* 沒有就看看有沒有 0.1 版的舊格式 */ }
    try {
      const old = JSON.parse(fs.readFileSync(path.join(dir, 'entries.json'), 'utf8'));
      if (Array.isArray(old.entries) && old.entries.length) return this._convertOld(date, old.entries);
    } catch { /* 這天沒東西 */ }
    return null;
  }

  // 0.1 版是一筆一筆的清單，轉成一頁文件。
  _convertOld(date, entries) {
    const content = [];
    const text = [];
    for (const e of entries) {
      if (e.type === 'text') {
        for (const line of String(e.text).split('\n')) content.push(line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' });
        text.push(e.text);
      } else if (e.type === 'link') {
        content.push({ type: 'paragraph', content: [{ type: 'text', text: e.title || e.url, marks: [{ type: 'link', attrs: { href: e.url } }] }] });
        text.push(e.title || '', e.url);
      } else if (e.type === 'image') {
        content.push({ type: 'image', attrs: { src: `files/${e.file}`, alt: e.name } });
        text.push(e.name);
      } else if (e.file) {
        content.push({ type: 'fileChip', attrs: { rel: `files/${e.file}`, name: e.name, size: e.size || 0 } });
        text.push(e.name);
      }
    }
    return { date, doc: { type: 'doc', content }, text: text.join('\n'), empty: !content.length };
  }

  listFiles(date) {
    try { return fs.readdirSync(this.filesDir(date)).map((n) => `files/${n}`); } catch { return []; }
  }

  getPage(date) {
    const page = this._read(date);
    return { doc: page ? page.doc : null, files: this.listFiles(date) };
  }

  async savePage(date, page) {
    const dir = this.dayDir(date);
    const empty = !!page.empty;
    if (empty && !fs.existsSync(dir)) { this.cache.delete(date); return; }
    await fsp.mkdir(dir, { recursive: true });
    const data = { date, doc: page.doc, text: String(page.text || ''), empty };
    const tmp = path.join(dir, 'page.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify(data), 'utf8');
    await fsp.rename(tmp, path.join(dir, 'page.json'));
    await fsp.writeFile(path.join(dir, 'index.md'), `# ${date}\n\n${page.markdown || ''}\n`, 'utf8');
    if (empty) this.cache.delete(date); else this.cache.set(date, data.text);
  }

  async _uniqueName(date, name) {
    const dir = this.filesDir(date);
    await fsp.mkdir(dir, { recursive: true });
    const safe = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[()[\]]/g, '_') || 'file';
    const ext = path.extname(safe);
    const base = path.basename(safe, ext);
    let candidate = safe;
    let n = 2;
    while (fs.existsSync(path.join(dir, candidate))) candidate = `${base}-${n++}${ext}`;
    return candidate;
  }

  _asset(name, file, size) {
    return { rel: `files/${file}`, name, size, isImage: IMAGE_EXT.has(path.extname(file).toLowerCase()) };
  }

  // 把電腦上的檔案複製一份進垃圾庫。資料夾不收。
  async addPath(date, srcPath) {
    const stat = await fsp.stat(srcPath);
    if (stat.isDirectory()) return { skipped: path.basename(srcPath), reason: '資料夾' };
    const name = path.basename(srcPath);
    const file = await this._uniqueName(date, name);
    await fsp.copyFile(srcPath, path.join(this.filesDir(date), file));
    return { asset: this._asset(name, file, stat.size) };
  }

  // 剪貼簿裡沒有路徑的東西（例如截圖）。
  async addBuffer(date, name, buffer) {
    const file = await this._uniqueName(date, name);
    await fsp.writeFile(path.join(this.filesDir(date), file), buffer);
    return this._asset(name, file, buffer.length);
  }

  counts() {
    const out = {};
    for (const d of this.cache.keys()) out[d] = 1;
    return out;
  }

  // 側邊欄用：since（含）之後有內容的日子，新的在前，連同那天的文件一起給。
  recent(since) {
    return [...this.cache.keys()].filter((d) => d >= since).sort().reverse().map((date) => {
      const page = this._read(date);
      return { date, doc: page ? page.doc : null };
    });
  }

  // 每個字都要出現在那一天；回傳那天裡命中的幾行。
  search(query, limit = 200) {
    const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    for (const date of [...this.cache.keys()].sort().reverse()) {
      const text = this.cache.get(date);
      const lower = text.toLowerCase();
      if (!words.every((w) => lower.includes(w))) continue;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const hits = lines.filter((l) => { const ll = l.toLowerCase(); return words.some((w) => ll.includes(w)); });
      out.push({ date, lines: hits.slice(0, 4), more: Math.max(0, hits.length - 4) });
      if (out.length >= limit) break;
    }
    return out;
  }
}

module.exports = { Store, IMAGE_EXT };
