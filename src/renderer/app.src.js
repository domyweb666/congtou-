/* global dump */
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const SHORT = ['日', '一', '二', '三', '四', '五', '六'];
const BARE_URL = /^https?:\/\/\S+$/i;

const state = {
  today: toKey(new Date()),
  date: toKey(new Date()),
  counts: {},
  calMonth: null,
  settings: null,
  relToUrl: {},
  urlToRel: {},
  dirty: false,
  loading: false,
};
let editor = null;
let saveTimer = null;
const page = $('page');

/* ---------- 小工具 ---------- */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}
function fmtSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
function fmtDate(k) { const d = fromKey(k); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
function fmtShort(k) { const d = fromKey(k); return `${d.getMonth() + 1}月${d.getDate()}日`; }

let toastTimer = null;
function toast(text, ms = 4000) {
  $('toastText').textContent = text;
  $('toastAction').hidden = true;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, ms);
}
window.toast = toast;

/* ---------- 編輯器 ---------- */
const FileChip = Node.create({
  name: 'fileChip',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { rel: { default: '', rendered: false }, name: { default: '', rendered: false }, size: { default: 0, rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'div[data-file]', getAttrs: (n) => ({ rel: n.getAttribute('data-file'), name: n.getAttribute('data-name') || '', size: Number(n.getAttribute('data-size')) || 0 }) }];
  },
  renderHTML({ node }) {
    const { rel, name, size } = node.attrs;
    const ext = name.includes('.') ? name.split('.').pop().slice(0, 5).toUpperCase() : 'FILE';
    return ['div', { 'data-file': rel, 'data-name': name, 'data-size': String(size), class: 'filechip', title: `${name}（點兩下打開）` },
      ['span', { class: 'ext' }, ext], ['span', { class: 'name' }, name], ['span', { class: 'size' }, fmtSize(size)]];
  },
  renderText({ node }) { return node.attrs.name; },
  addStorage() {
    return { markdown: { serialize(st, node) { st.write(`[${node.attrs.name}](${encodeURI(node.attrs.rel)})`); st.closeBlock(node); }, parse: {} } };
  },
});

// 自動時間標記：隔一陣子再丟東西時，前面放一條小小的時間線。
const TimeMark = Node.create({
  name: 'timeMark',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes() { return { time: { default: '', rendered: false }, at: { default: 0, rendered: false } }; },
  parseHTML() { return [{ tag: 'div[data-time-mark]', getAttrs: (n) => ({ time: n.getAttribute('data-time-mark') || '', at: Number(n.getAttribute('data-at')) || 0 }) }]; },
  renderHTML({ node }) { return ['div', { 'data-time-mark': node.attrs.time, 'data-at': String(node.attrs.at), class: 'timemark', title: '自動加上的時間標記；點一下選取後可按 Delete 刪掉' }, ['span', {}, node.attrs.time]]; },
  renderText() { return ''; },
  addStorage() { return { markdown: { serialize(st, node) { st.write(`〔${node.attrs.time}〕`); st.closeBlock(node); }, parse: {} } }; },
});
const MARK_GAP = 10 * 60 * 1000;
const lastEditAt = {};
let pendingMark = null;

function lastMarkAt() {
  let at = 0;
  editor.state.doc.forEach((n) => { if (n.type.name === 'timeMark') at = Math.max(at, n.attrs.at || 0); });
  return at;
}
function onlyEmptyAfter(doc, index) {
  for (let i = index + 1; i < doc.childCount; i++) { const n = doc.child(i); if (!(n.type.name === 'paragraph' && !n.content.size)) return false; }
  return true;
}
function insertMarkBefore(index) {
  const doc = editor.state.doc;
  if (index < 0 || index >= doc.childCount) return;
  if (index > 0 && doc.child(index - 1).type.name === 'timeMark') return;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const now = new Date();
  const node = editor.schema.nodes.timeMark.create({ time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, at: now.getTime() });
  editor.view.dispatch(editor.state.tr.insert(pos, node).setMeta('addToHistory', false).setMeta('timeMark', true));
}
// 只在「今天、接在最後面丟新東西、而且隔了一陣子」時才加
function maybeMark(transaction) {
  if (transaction.getMeta('timeMark') || state.date !== state.today) return;
  const now = Date.now();
  const gap = now - (lastEditAt[state.date] || 0) > MARK_GAP && now - lastMarkAt() > MARK_GAP;
  lastEditAt[state.date] = now;
  if (!gap || !transaction.mapping.maps.length) return;
  let start = null; let end = null;
  transaction.mapping.maps.forEach((map, i) => map.forEach((_a, _b, from, to) => {
    const rest = transaction.mapping.slice(i + 1);
    const f = rest.map(from, -1); const t = rest.map(to, 1);
    start = start == null ? f : Math.min(start, f); end = end == null ? t : Math.max(end, t);
  }));
  if (start == null) return;
  const doc = editor.state.doc;
  const $s = doc.resolve(Math.min(start, doc.content.size));
  const $e = doc.resolve(Math.min(end, doc.content.size));
  const fresh = $s.depth === 0 || ($s.depth === 1 && $s.parentOffset === 0) || $s.pos === $s.start(1);
  const sIndex = $s.index(0);
  const eIndex = Math.min($e.depth === 0 ? Math.max(sIndex, $e.index(0) - 1) : $e.index(0), doc.childCount - 1);
  if (!fresh || !onlyEmptyAfter(doc, eIndex)) return;
  const target = doc.child(Math.min(sIndex, doc.childCount - 1));
  if (target.type.name === 'paragraph' && !target.content.size) return; // 只是按了 Enter，還沒有東西
  if (editor.view.composing) { pendingMark = sIndex; return; }
  insertMarkBefore(sIndex);
}

// 圖片是獨立一塊，寫成 Markdown 時自己佔一段。
const BlockImage = Image.extend({
  addStorage() {
    return { markdown: { serialize(st, node) { st.write(`![${(node.attrs.alt || '').replace(/[\[\]]/g, '')}](${node.attrs.src})`); st.closeBlock(node); }, parse: {} } };
  },
});

function mapImages(node, fn) {
  if (!node) return node;
  if (node.type === 'image' && node.attrs) node.attrs.src = fn(node.attrs.src);
  if (Array.isArray(node.content)) node.content.forEach((c) => mapImages(c, fn));
  return node;
}
function register(rel, url) { if (rel && url) { state.relToUrl[rel] = url; state.urlToRel[url] = rel; } }

function snapshot() {
  const json = JSON.parse(JSON.stringify(editor.getJSON()));
  const doc = mapImages(json, (src) => state.urlToRel[src] || src);
  let markdown = '';
  try {
    markdown = editor.storage.markdown.getMarkdown();
    for (const [url, rel] of Object.entries(state.urlToRel)) markdown = markdown.split(url).join(encodeURI(rel));
  } catch { markdown = editor.getText({ blockSeparator: '\n' }); }
  const extra = [];
  editor.state.doc.descendants((n) => {
    if (n.type.name === 'image' && n.attrs.alt) extra.push(n.attrs.alt);
    for (const m of n.marks || []) if (m.type.name === 'link' && m.attrs.href && m.attrs.href !== n.text) extra.push(m.attrs.href);
  });
  const text = [editor.getText({ blockSeparator: '\n' }), ...extra].join('\n');
  return { doc, markdown, text, empty: editor.isEmpty };
}

async function flush() {
  clearTimeout(saveTimer);
  if (!editor || !state.dirty) return;
  state.dirty = false;
  const date = state.date;
  const snap = snapshot();
  try {
    await dump.savePage(date, snap);
    const had = !!state.counts[date];
    if (snap.empty) delete state.counts[date]; else state.counts[date] = 1;
    if (had !== !snap.empty) { renderWeek(); if (!$('calendar').hidden) renderCalendar(); }
    if (!state.dirty) setSaveState('已儲存');
  } catch (err) {
    state.dirty = true;
    setSaveState('沒存成功，內容還在這一頁', true);
    toast(`沒存成功：${err.message || err}`);
  }
}
function markDirty() {
  if (state.loading) return;
  state.dirty = true;
  setSaveState('儲存中…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

function keepTrailingParagraph() {
  // 最後永遠留一個空白段落：叫出視窗後游標就在這裡，貼上的東西不會黏到上一段後面
  const last = editor.state.doc.lastChild;
  if (last && !(last.type.name === 'paragraph' && !last.content.size)) {
    editor.view.dispatch(editor.state.tr.insert(editor.state.doc.content.size, editor.schema.nodes.paragraph.create()).setMeta('addToHistory', false).setMeta('timeMark', true));
  }
}

/* ---------- 抓手：整塊搬動 ---------- */
const grip = { el: null, pos: null, dom: null };

// 滑鼠所在高度對到哪一個最上層區塊
function blockAt(y) {
  if (!editor) return null;
  const view = editor.view;
  let hit = null;
  for (const child of view.dom.children) {
    const r = child.getBoundingClientRect();
    if (!r.height) continue;
    if (y >= r.top - 4 && y <= r.bottom + 4) { hit = child; break; }
  }
  if (!hit) return null;
  let pos;
  try { pos = view.posAtDOM(hit, 0); } catch { return null; }
  const $p = view.state.doc.resolve(Math.min(pos, view.state.doc.content.size));
  const start = $p.depth >= 1 ? $p.before(1) : pos;
  const node = view.state.doc.nodeAt(start);
  return node ? { dom: hit, pos: start, node } : null;
}
function hideGrip() { if (grip.el) grip.el.hidden = true; grip.pos = null; grip.dom = null; }
function placeGrip(y) {
  if (!grip.el || overlayOpen()) return;
  const b = blockAt(y);
  // 最後那個空白段落不用抓
  if (!b || (b.node.type.name === 'paragraph' && !b.node.content.size) || b.node.type.name === 'timeMark') { hideGrip(); return; }
  const host = $('editor').getBoundingClientRect();
  const r = b.dom.getBoundingClientRect();
  const lh = parseFloat(getComputedStyle(b.dom).lineHeight);
  const firstLine = b.node.isTextblock || /List$/.test(b.node.type.name) || b.node.type.name === 'blockquote';
  const offset = firstLine && lh ? Math.max(0, (lh - 24) / 2) : 4;
  grip.el.style.top = `${r.top - host.top + offset}px`;
  grip.el.hidden = false;
  grip.pos = b.pos; grip.dom = b.dom;
}
function copyBlock() {
  if (grip.pos == null) return;
  const view = editor.view;
  const before = view.state.selection;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, grip.pos)));
  view.focus();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  if (ok) { view.dispatch(view.state.tr.setSelection(before)); toast('已複製整塊', 1500); }
  else toast('這一塊已選取，請按 Ctrl+C 複製');
}
function makeGrip() {
  const copy = el('button', { class: 'gutter-btn', tabindex: '-1', title: '複製整塊（含格式）', 'aria-label': '複製整塊', onclick: copyBlock });
  copy.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" class="line"><rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V5.5a2 2 0 00-2-2H5.5a2 2 0 00-2 2V11a2 2 0 002 2H7"/></svg>';
  copy.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  const g = el('button', { class: 'gutter-btn grip', tabindex: '-1', draggable: 'true', title: '拖曳搬動這一塊；點一下選取整塊（Alt+↑↓ 也能搬）', 'aria-label': '拖曳搬動這一塊' });
  g.innerHTML = '<svg viewBox="0 0 14 14" aria-hidden="true"><circle cx="4.5" cy="2.5" r="1.3"/><circle cx="9.5" cy="2.5" r="1.3"/><circle cx="4.5" cy="7" r="1.3"/><circle cx="9.5" cy="7" r="1.3"/><circle cx="4.5" cy="11.5" r="1.3"/><circle cx="9.5" cy="11.5" r="1.3"/></svg>';
  g.addEventListener('mousedown', (e) => e.stopPropagation());
  g.addEventListener('click', () => {
    if (grip.pos == null) return;
    const view = editor.view;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, grip.pos)));
    view.focus();
  });
  g.addEventListener('dragstart', (e) => {
    if (grip.pos == null) { e.preventDefault(); return; }
    const view = editor.view;
    const sel = NodeSelection.create(view.state.doc, grip.pos);
    view.dispatch(view.state.tr.setSelection(sel));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sel.node.textContent || sel.node.attrs.name || ' ');
    if (grip.dom) e.dataTransfer.setDragImage(grip.dom, 0, 0);
    view.dragging = { slice: sel.content(), move: true, node: sel };
    document.body.classList.add('moving-block');
  });
  g.addEventListener('dragend', () => {
    document.body.classList.remove('moving-block');
    if (editor) editor.view.dragging = null;
    hideGrip();
  });
  const wrap = el('div', { class: 'gutter' }, copy, g);
  wrap.hidden = true;
  grip.el = wrap; grip.handle = g;
  $('editor').append(wrap);
}
page.addEventListener('mousemove', (e) => { if (!document.body.classList.contains('moving-block')) placeGrip(e.clientY); });
page.addEventListener('mouseleave', hideGrip);
page.addEventListener('scroll', hideGrip);
document.addEventListener('keydown', (e) => { if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) hideGrip(); });

// Alt+↑↓：把游標所在的那一塊（清單裡就是那一個項目）往上或往下搬
function moveBlock(dir) {
  const view = editor.view;
  const { state } = view;
  const sel = state.selection;
  const $f = sel.$from;
  let depth = sel instanceof NodeSelection ? $f.depth + 1 : 1;
  if (!(sel instanceof NodeSelection)) {
    for (let d = $f.depth; d >= 1; d--) if (/Item$/.test($f.node(d).type.name)) { depth = d; break; }
  }
  const parent = $f.node(depth - 1);
  const index = $f.index(depth - 1);
  const other = index + dir;
  if (other < 0 || other >= parent.childCount) return true;
  const node = parent.child(index);
  const start = sel instanceof NodeSelection ? sel.from : $f.before(depth);
  const sibling = parent.child(other);
  // 不要把東西搬到最後那個空白段落後面
  if (depth === 1 && dir > 0 && other === parent.childCount - 1 && sibling.type.name === 'paragraph' && !sibling.content.size) return true;
  const target = dir < 0 ? start - sibling.nodeSize : start + sibling.nodeSize;
  const tr = state.tr.delete(start, start + node.nodeSize).insert(target, node);
  if (sel instanceof NodeSelection) tr.setSelection(NodeSelection.create(tr.doc, target));
  else tr.setSelection(TextSelection.create(tr.doc, target + (sel.anchor - start), target + (sel.head - start)));
  view.dispatch(tr.scrollIntoView());
  hideGrip();
  return true;
}

async function insertFiles(fileList, pos) {
  const date = state.date;
  const paths = []; const loose = [];
  for (const f of fileList) { const p = dump.pathFor(f); if (p) paths.push(p); else loose.push(f); }
  const assets = []; const skipped = [];
  if (paths.length) { const r = await dump.addPaths(date, paths); assets.push(...r.assets); skipped.push(...r.skipped); }
  for (const f of loose) {
    const ext = ((f.type || '').split('/')[1] || 'bin').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const now = new Date();
    const name = f.name && f.name !== 'image.png' ? f.name : `貼上-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
    assets.push(await dump.addBuffer(date, name, await f.arrayBuffer()));
  }
  insertAssets(assets, pos);
  if (skipped.length) toast(`沒收進來：${skipped.join('、')}`);
}
function insertAssets(assets, pos) {
  if (!assets.length || !editor) return;
  const nodes = assets.map((a) => {
    register(a.rel, a.url);
    return a.isImage ? { type: 'image', attrs: { src: a.url, alt: a.name } } : { type: 'fileChip', attrs: { rel: a.rel, name: a.name, size: a.size } };
  });
  const chain = editor.chain().focus();
  if (pos != null) {
    // 丟在某一塊上面，就放到那一塊後面，不把原本的段落切開
    const $p = editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size));
    chain.insertContentAt($p.depth >= 1 ? $p.after(1) : pos, nodes).run();
  } else chain.insertContent(nodes).run();
}
window.insertFiles = insertFiles;

async function pasteUrl(url) {
  editor.chain().focus().insertContent([{ type: 'text', text: url, marks: [{ type: 'link', attrs: { href: url } }] }, { type: 'text', text: ' ' }]).run();
  const used = editor;
  let title = '';
  try { title = await dump.fetchTitle(url); } catch { /* 沒標題就留網址 */ }
  if (!title || editor !== used) return;
  let found = null;
  editor.state.doc.descendants((n, p) => {
    if (!found && n.isText && n.text === url && n.marks.some((m) => m.type.name === 'link' && m.attrs.href === url)) found = { from: p, to: p + n.nodeSize, marks: n.marks };
  });
  if (found) editor.view.dispatch(editor.state.tr.replaceWith(found.from, found.to, editor.schema.text(title, found.marks)));
}

function makeEditor(doc) {
  hideGrip(); closeSlash(); pendingMark = null;
  if (editor) editor.destroy();
  $('editor').textContent = '';
  editor = new Editor({
    element: $('editor'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }),
      BlockImage.configure({ inline: false, allowBase64: true }),
      TaskList, TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      FileChip, TimeMark,
      Placeholder.configure({ placeholder: state.date === state.today ? '把剪下來的段落貼在這裡，或直接打字、拖檔案進來。打 / 叫出格式選單。' : `${fmtShort(state.date)} 這天沒有東西。直接打字或貼上就會記在這天。` }),
      Markdown.configure({ html: false, linkify: true, breaks: true, transformPastedText: true, transformCopiedText: false }),
    ],
    content: doc || '',
    editorProps: {
      clipboardTextSerializer: (slice) => slice.content.textBetween(0, slice.content.size, '\n', (n) => n.attrs.name || n.attrs.alt || n.attrs.time || '').replace(/\n{2,}/g, '\n').trim(),
      attributes: { 'aria-label': `${fmtDate(state.date)} 的內容`, spellcheck: 'false' },
      handlePaste(view, event) {
        const data = event.clipboardData;
        if (!data) return false;
        const text = data.getData('text/plain');
        const files = [...data.files];
        const real = files.filter((f) => dump.pathFor(f));
        // 從檔案總管複製的檔案一定收；截圖只在沒有文字時收（Excel 複製格子會同時帶一張圖）。
        if (real.length || (files.length && !text.trim())) {
          insertFiles(real.length ? real : files).catch((err) => toast(`沒存成功：${err.message || err}`));
          return true;
        }
        if (BARE_URL.test(text.trim()) && view.state.selection.empty) { pasteUrl(text.trim()); return true; }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !event.dataTransfer || !event.dataTransfer.files.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        event.preventDefault();
        insertFiles([...event.dataTransfer.files], at ? at.pos : null).catch((err) => toast(`沒存成功：${err.message || err}`));
        return true;
      },
      handleClick(_view, _pos, event) {
        const a = event.target.closest && event.target.closest('a[href]');
        if (!a) return false;
        event.preventDefault();
        dump.openUrl(a.getAttribute('href'));
        return true;
      },
      handleDoubleClickOn(_view, _pos, node) {
        const rel = node.type.name === 'fileChip' ? node.attrs.rel : node.type.name === 'image' ? state.urlToRel[node.attrs.src] : '';
        if (!rel) return false;
        dump.openFile(state.date, rel).then((err) => { if (err) toast(`打不開：${err}`); });
        return true;
      },
      handleKeyDown(_view, event) {
        if (slashKey(event)) { event.preventDefault(); return true; }
        if (event.altKey && !event.ctrlKey && !event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
          event.preventDefault();
          return moveBlock(event.key === 'ArrowUp' ? -1 : 1);
        }
        if (event.altKey && !event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 't') {
          const now = new Date();
          editor.commands.insertContent(`${pad(now.getHours())}:${pad(now.getMinutes())} `);
          return true;
        }
        return false;
      },
    },
    onCreate() { state.loading = true; keepTrailingParagraph(); state.loading = false; },
    onUpdate({ transaction }) { if (!state.loading) { keepTrailingParagraph(); maybeMark(transaction); markDirty(); updateSlash(true); } },
    onSelectionUpdate() { updateSlash(false); },
  });
  makeGrip();
  editor.view.dom.addEventListener('compositionend', () => { if (pendingMark != null) { const i = pendingMark; pendingMark = null; setTimeout(() => insertMarkBefore(i), 0); } });
  // 連結在編輯器裡不要真的導頁
  $('editor').addEventListener('click', (e) => { if (e.target.closest('a[href]')) e.preventDefault(); });
}
function focusEditor() { if (editor) editor.commands.focus('end'); }

/* ---------- 週條與標題 ---------- */
function weekStart(k) { const d = fromKey(k); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return toKey(d); }

function renderWeek() {
  const wrap = $('week');
  wrap.textContent = '';
  const start = weekStart(state.date);
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    const d = fromKey(k);
    const cls = ['day', k === state.date && 'current', k === state.today && 'today', state.counts[k] && 'has', (d.getDay() === 0 || d.getDay() === 6) && 'weekend'].filter(Boolean).join(' ');
    wrap.append(el('button', {
      class: cls, role: 'tab', 'aria-selected': k === state.date ? 'true' : 'false',
      title: `${fmtDate(k)} ${WEEKDAYS[d.getDay()]}${state.counts[k] ? '（有東西）' : ''}`,
      onclick: () => goTo(k),
    }, el('span', { text: SHORT[d.getDay()] }), el('b', { text: String(d.getDate()) })));
  }
}

function renderHeading() {
  const d = fromKey(state.date);
  const thisYear = d.getFullYear() === fromKey(state.today).getFullYear();
  $('dateTitle').textContent = thisYear ? fmtShort(state.date) : fmtDate(state.date);
  $('weekday').textContent = WEEKDAYS[d.getDay()];
  $('todayBadge').hidden = state.date !== state.today;
  document.title = state.date === state.today ? '蔥頭' : `蔥頭 — ${fmtShort(state.date)}`;
}
function setSaveState(text, bad) { const n = $('saveState'); n.textContent = text; n.classList.toggle('bad', !!bad); }

async function refreshCounts() { state.counts = await dump.counts(); renderWeek(); if (!$('calendar').hidden) renderCalendar(); }

async function load(find) {
  state.loading = true;
  const data = await dump.getPage(state.date);
  state.relToUrl = {}; state.urlToRel = {};
  for (const [rel, url] of Object.entries(data.urls || {})) register(rel, url);
  const doc = data.doc ? mapImages(JSON.parse(JSON.stringify(data.doc)), (src) => state.relToUrl[src] || src) : null;
  makeEditor(doc);
  state.loading = false;
  state.dirty = false;
  setSaveState('');
  renderHeading();
  renderWeek();
  page.scrollTop = 0;
  if (find) {
    window.getSelection().removeAllRanges();
    editor.commands.focus('start');
    try { window.find(find, false, false, true); } catch { /* 找不到就停在頁首 */ }
  } else {
    focusEditor();
    if (state.date === state.today) page.scrollTop = page.scrollHeight;
  }
}

async function goTo(k, find) {
  await flush();
  state.date = k;
  await load(find);
}
function goToday() { state.today = toKey(new Date()); return goTo(state.today); }

async function pickFiles() {
  const paths = await dump.pickFiles();
  if (!paths.length) return;
  const r = await dump.addPaths(state.date, paths);
  insertAssets(r.assets);
  if (r.skipped.length) toast(`沒收進來：${r.skipped.join('、')}`);
}
$('attachBtn').addEventListener('click', pickFiles);

const overlayOpen = () => !$('searchPanel').hidden || !$('settingsPanel').hidden;

// 點頁面下方的空白處，游標就到最後
page.addEventListener('mousedown', (e) => { if (e.target === page) { e.preventDefault(); focusEditor(); } });

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || overlayOpen()) return;
  dragDepth++;
  $('dropDate').textContent = state.date === state.today ? '今天' : fmtShort(state.date);
  $('drop').hidden = false;
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = overlayOpen() ? 'none' : 'copy'; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop').hidden = true; });
window.addEventListener('drop', (e) => {
  dragDepth = 0; $('drop').hidden = true;
  if (e.defaultPrevented || !hasFiles(e)) return; // 編輯器已經接走了
  e.preventDefault();
  if (overlayOpen()) return;
  const doc = editor.state.doc; const last = doc.lastChild;
  const end = last && last.type.name === 'paragraph' && !last.content.size ? doc.content.size - last.nodeSize : doc.content.size;
  insertFiles([...e.dataTransfer.files], end).catch((err) => toast(`沒存成功：${err.message || err}`));
});

/* ---------- 格式選單 ---------- */
const FORMATS = [
  ['內文', '', (c) => c.setParagraph(), (e) => e.isActive('paragraph') && !e.isActive('bulletList') && !e.isActive('orderedList') && !e.isActive('taskList') && !e.isActive('blockquote'), 'text p neiwen'],
  ['大標題', '#', (c) => c.toggleHeading({ level: 1 }), (e) => e.isActive('heading', { level: 1 }), 'h1 title biaoti'],
  ['中標題', '##', (c) => c.toggleHeading({ level: 2 }), (e) => e.isActive('heading', { level: 2 }), 'h2 biaoti'],
  ['小標題', '###', (c) => c.toggleHeading({ level: 3 }), (e) => e.isActive('heading', { level: 3 }), 'h3 biaoti'],
  null,
  ['項目符號', '-', (c) => c.toggleBulletList(), (e) => e.isActive('bulletList'), 'ul bullet list qingdan'],
  ['編號清單', '1.', (c) => c.toggleOrderedList(), (e) => e.isActive('orderedList'), 'ol number list'],
  ['待辦勾選', '[ ]', (c) => c.toggleTaskList(), (e) => e.isActive('taskList'), 'todo task check daiban'],
  ['引言', '>', (c) => c.toggleBlockquote(), (e) => e.isActive('blockquote'), 'quote yinyan'],
  ['程式碼區塊', '```', (c) => c.toggleCodeBlock(), (e) => e.isActive('codeBlock'), 'code'],
  ['分隔線', '---', (c) => c.setHorizontalRule(), () => false, 'hr line divider'],
  null,
  ['粗體', 'Ctrl+B', (c) => c.toggleBold(), (e) => e.isActive('bold'), 'bold b'],
  ['斜體', 'Ctrl+I', (c) => c.toggleItalic(), (e) => e.isActive('italic'), 'italic i'],
  ['刪除線', 'Ctrl+Shift+S', (c) => c.toggleStrike(), (e) => e.isActive('strike'), 'strike'],
  ['插入現在時間', 'Alt+T', (c) => { const n = new Date(); return c.insertContent(`${pad(n.getHours())}:${pad(n.getMinutes())} `); }, () => false, 'time now shijian'],
];
function openFormat() {
  closeCalendar();
  const menu = $('formatMenu');
  menu.textContent = '';
  for (const f of FORMATS) {
    if (!f) { menu.append(el('hr')); continue; }
    const [label, hint, run, active] = f;
    const on = editor && active(editor);
    menu.append(el('button', { role: 'menuitemcheckbox', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '', onclick: () => { closeFormat(); run(editor.chain().focus()).run(); } },
      el('span', { text: label }), hint ? el('kbd', { text: hint }) : null));
  }
  menu.hidden = false;
  $('formatBtn').setAttribute('aria-expanded', 'true');
}
function closeFormat() { $('formatMenu').hidden = true; $('formatBtn').setAttribute('aria-expanded', 'false'); }
$('formatBtn').addEventListener('mousedown', (e) => e.preventDefault()); // 不要讓編輯器失去選取
$('formatBtn').addEventListener('click', () => { if ($('formatMenu').hidden) { openFormat(); if (document.activeElement === $('formatBtn')) $('formatMenu').querySelector('button').focus(); } else closeFormat(); });
$('formatMenu').addEventListener('mousedown', (e) => e.preventDefault());
$('formatMenu').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = [...$('formatMenu').querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
});
document.addEventListener('mousedown', (e) => {
  if (!$('formatMenu').hidden && !$('formatMenu').contains(e.target) && !$('formatBtn').contains(e.target)) closeFormat();
});

/* ---------- 打「/」叫出的選單 ---------- */
const slash = { open: false, from: 0, items: [], index: 0, dismissed: -1 };
function closeSlash() { slash.open = false; const m = $('slashMenu'); if (m) m.hidden = true; }
function renderSlash() {
  const menu = $('slashMenu');
  menu.textContent = '';
  slash.items.forEach((f, i) => {
    const [label, hint] = f;
    const b = el('button', { role: 'option', 'aria-selected': i === slash.index ? 'true' : 'false', class: i === slash.index ? 'sel' : '', tabindex: '-1', onclick: () => applySlash(i) },
      el('span', { text: label }), hint ? el('kbd', { text: hint }) : null);
    b.addEventListener('mousemove', () => { if (slash.index !== i) { slash.index = i; renderSlash(); } });
    menu.append(b);
  });
  menu.hidden = false;
  const c = editor.view.coordsAtPos(slash.from);
  const h = menu.offsetHeight; const w = menu.offsetWidth;
  const below = c.bottom + 6 + h <= window.innerHeight - 8;
  menu.style.top = `${below ? c.bottom + 6 : Math.max(8, c.top - 6 - h)}px`;
  menu.style.left = `${Math.max(8, Math.min(c.left, window.innerWidth - w - 8))}px`;
  const sel = menu.querySelector('.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function updateSlash(typed) {
  if (!editor) return;
  const sel = editor.state.selection;
  const parent = sel.$from.parent;
  if (!sel.empty || !parent.isTextblock || parent.type.name === 'codeBlock' || editor.view.composing) { closeSlash(); return; }
  const before = parent.textBetween(0, sel.$from.parentOffset, undefined, '￼');
  const m = /(?:^|\s)[\/／]([^\s\/／]{0,12})$/.exec(before);
  if (!m) { closeSlash(); slash.dismissed = -1; return; }
  const from = sel.from - m[1].length - 1;
  if (from === slash.dismissed) { closeSlash(); return; }
  if (!slash.open && !typed) return;
  const q = m[1].toLowerCase();
  const items = FORMATS.filter((f) => f && (!q || f[0].toLowerCase().includes(q) || (f[4] || '').split(' ').some((k) => k.startsWith(q))));
  if (!items.length) { closeSlash(); return; }
  if (!slash.open || slash.items.length !== items.length) slash.index = 0;
  Object.assign(slash, { open: true, from, items });
  renderSlash();
}
function applySlash(i) {
  const f = slash.items[i];
  if (!f) return;
  const range = { from: slash.from, to: editor.state.selection.from };
  closeSlash();
  f[2](editor.chain().focus().deleteRange(range)).run();
}
function slashKey(event) {
  if (!slash.open) return false;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    slash.index = (slash.index + (event.key === 'ArrowDown' ? 1 : -1) + slash.items.length) % slash.items.length;
    renderSlash(); return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') { applySlash(slash.index); return true; }
  if (event.key === 'Escape') { slash.dismissed = slash.from; closeSlash(); return true; }
  return false;
}
document.addEventListener('mousedown', (e) => { if (slash.open && !$('slashMenu').contains(e.target)) closeSlash(); });
page.addEventListener('scroll', closeSlash);

/* ---------- 月曆 ---------- */
function renderCalendar() {
  const [y, m] = state.calMonth;
  $('calTitle').textContent = `${y}年${m + 1}月`;
  const grid = $('calGrid');
  grid.textContent = '';
  for (const s of ['一', '二', '三', '四', '五', '六', '日']) grid.append(el('div', { class: 'dow', text: s }));
  const first = new Date(y, m, 1);
  const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const k = toKey(d);
    const n = state.counts[k] || 0;
    const cls = [d.getMonth() !== m && 'other', k === state.today && 'today', k === state.date && 'current', n && 'has'].filter(Boolean).join(' ');
    grid.append(el('button', { class: cls, title: `${fmtDate(k)}${n ? `，${n} 筆` : ''}`, 'aria-label': `${fmtDate(k)}${n ? `，${n} 筆` : ''}`, onclick: () => { closeCalendar(); goTo(k); } }, String(d.getDate())));
  }
}
function openCalendar() {
  closeFormat();
  const d = fromKey(state.date);
  state.calMonth = [d.getFullYear(), d.getMonth()];
  $('calendar').hidden = false;
  renderCalendar();
  const cur = $('calGrid').querySelector('.current');
  if (cur) cur.focus();
}
function closeCalendar() { $('calendar').hidden = true; }
function shiftMonth(n) { const d = new Date(state.calMonth[0], state.calMonth[1] + n, 1); state.calMonth = [d.getFullYear(), d.getMonth()]; renderCalendar(); }
$('calBtn').addEventListener('click', () => ($('calendar').hidden ? openCalendar() : closeCalendar()));
$('calPrev').addEventListener('click', () => shiftMonth(-1));
$('calNext').addEventListener('click', () => shiftMonth(1));
document.addEventListener('mousedown', (e) => {
  if (!$('calendar').hidden && !$('calendar').contains(e.target) && !$('calBtn').contains(e.target)) closeCalendar();
});

/* ---------- 搜尋 ---------- */
let searchTimer = null;
function highlight(text, words) {
  const frag = document.createDocumentFragment();
  const lower = text.toLowerCase();
  const first = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const begin = Math.max(0, first - 30);
  const slice = (begin ? '…' : '') + text.slice(begin, begin + 200);
  const sl = slice.toLowerCase();
  let pos = 0;
  while (pos < slice.length) {
    let best = -1; let len = 0;
    for (const w of words) { const i = sl.indexOf(w, pos); if (i >= 0 && (best < 0 || i < best)) { best = i; len = w.length; } }
    if (best < 0) { frag.append(slice.slice(pos)); break; }
    frag.append(slice.slice(pos, best));
    frag.append(el('mark', { text: slice.slice(best, best + len) }));
    pos = best + len;
  }
  return frag;
}
async function runSearch() {
  const q = $('searchInput').value.trim();
  const box = $('searchResults');
  box.textContent = '';
  if (!q) { box.append(el('div', { class: 'note', text: '輸入幾個字，會找遍所有日子。多個字用空格分開。' })); return; }
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  await flush();
  const results = await dump.search(q);
  if (q !== $('searchInput').value.trim()) return;
  box.textContent = '';
  if (!results.length) { box.append(el('div', { class: 'note', text: `找不到「${q}」。` })); return; }
  for (const r of results) {
    const lines = el('span', { class: 'lines' });
    for (const line of r.lines) lines.append(el('span', { class: 'snippet' }, highlight(line, words)));
    if (r.more) lines.append(el('span', { class: 'kind', text: `還有 ${r.more} 行` }));
    box.append(el('button', { class: 'result', onclick: () => { $('searchPanel').hidden = true; goTo(r.date, words[0]); } },
      el('span', { class: 'result-date', text: `${fmtDate(r.date)} ${WEEKDAYS[fromKey(r.date).getDay()]}` }), lines));
  }
}
function openSearch() {
  closeCalendar(); closeFormat();
  $('settingsPanel').hidden = true;
  $('searchPanel').hidden = false;
  $('searchInput').focus(); $('searchInput').select();
  runSearch();
}
function closeSearch() { $('searchPanel').hidden = true; focusEditor(); }
$('searchBtn').addEventListener('click', openSearch);
$('searchClose').addEventListener('click', closeSearch);
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 150); });
$('searchInput').addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'ArrowDown' || e.key === 'Enter') { const first = $('searchResults').querySelector('.result'); if (first) { e.preventDefault(); first.focus(); } }
});
$('searchResults').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...$('searchResults').querySelectorAll('.result')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  if (e.key === 'ArrowUp' && i === 0) $('searchInput').focus();
  else (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || items[i]).focus();
});
for (const id of ['searchPanel', 'settingsPanel']) {
  $(id).addEventListener('mousedown', (e) => { if (e.target === $(id)) { $(id).hidden = true; focusEditor(); } });
}

/* ---------- 設定 ---------- */
function showSettings(s) {
  state.settings = s;
  $('vaultPath').textContent = s.vaultPath;
  $('hotkeyInput').value = s.hotkey || '（沒有）';
  $('closeToTray').checked = s.closeToTray;
  $('launchAtLogin').checked = s.launchAtLogin;
  $('loginHint').hidden = s.packaged;
}
async function openSettings() {
  closeCalendar(); closeFormat();
  $('searchPanel').hidden = true;
  showSettings(await dump.getSettings());
  $('settingsPanel').hidden = false;
  $('settingsClose').focus();
}
function closeSettings() { $('settingsPanel').hidden = true; focusEditor(); }
async function patchSettings(patch) {
  const r = await dump.setSettings(patch);
  showSettings(r.settings);
  if (!r.ok) toast(r.message);
  return r;
}
$('settingsBtn').addEventListener('click', openSettings);
$('settingsClose').addEventListener('click', closeSettings);
$('vaultOpen').addEventListener('click', () => dump.openVault());
$('vaultChoose').addEventListener('click', async () => { const p = await dump.chooseVault(); if (p) showSettings(await dump.getSettings()); });
$('closeToTray').addEventListener('change', (e) => patchSettings({ closeToTray: e.target.checked }));
$('launchAtLogin').addEventListener('change', (e) => patchSettings({ launchAtLogin: e.target.checked }));
$('hotkeyClear').addEventListener('click', () => patchSettings({ hotkey: '' }));
const hotkeyInput = $('hotkeyInput');
hotkeyInput.addEventListener('focus', () => { hotkeyInput.classList.add('capturing'); hotkeyInput.value = '按下新的組合鍵…'; });
hotkeyInput.addEventListener('blur', () => { hotkeyInput.classList.remove('capturing'); if (state.settings) hotkeyInput.value = state.settings.hotkey || '（沒有）'; });
hotkeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') return;
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Escape') { hotkeyInput.blur(); return; }
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  let key = '';
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key;
  else key = { Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown' }[e.code] || '';
  if (!key) return;
  if (!mods.length && !/^F\d/.test(key)) { $('hotkeyHint').textContent = '要加上 Ctrl、Alt 或 Shift，不然平常打字就會觸發。'; return; }
  patchSettings({ hotkey: [...mods, key].join('+') }).then(() => hotkeyInput.blur());
});

/* ---------- 頂列與鍵盤 ---------- */
$('prevWeek').addEventListener('click', () => goTo(addDays(state.date, -7)));
$('nextWeek').addEventListener('click', () => goTo(addDays(state.date, 7)));
$('todayBtn').addEventListener('click', () => goToday());

document.addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229 || e.defaultPrevented) return;
  const ctrl = e.ctrlKey && !e.altKey && !e.shiftKey;
  const alt = e.altKey && !e.ctrlKey && !e.shiftKey;
  if (e.key === 'Escape') {
    if (!$('formatMenu').hidden) { closeFormat(); focusEditor(); }
    else if (!$('calendar').hidden) { closeCalendar(); focusEditor(); }
    else if (!$('searchPanel').hidden) closeSearch();
    else if (!$('settingsPanel').hidden) closeSettings();
    else flush().then(() => dump.hide());
    return;
  }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (overlayOpen()) return;
  if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); goToday(); }
  else if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); $('calendar').hidden ? openCalendar() : closeCalendar(); }
  else if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); }
  else if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); flush().then(() => toast('已存好（平常會自動存）', 1500)); }
  else if (alt && e.key === 'ArrowLeft') { e.preventDefault(); goTo(addDays(state.date, -1)); }
  else if (alt && e.key === 'ArrowRight') { e.preventDefault(); goTo(addDays(state.date, 1)); }
  else if (alt && e.key === 'PageUp') { e.preventDefault(); goTo(addDays(state.date, -7)); }
  else if (alt && e.key === 'PageDown') { e.preventDefault(); goTo(addDays(state.date, 7)); }
});

/* ---------- 主程序來的訊息 ---------- */
dump.on('go-today', () => { $('searchPanel').hidden = true; $('settingsPanel').hidden = true; closeCalendar(); goToday(); });
dump.on('open-settings', openSettings);
dump.on('vault:changed', async () => { state.dirty = false; await refreshCounts(); await load(); });
dump.on('flush', () => { flush().then(() => { if (dump.flushed) dump.flushed(); }); });
window.addEventListener('blur', () => { flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('focus', () => {
  const now = toKey(new Date());
  if (now !== state.today) { const wasToday = state.date === state.today; state.today = now; if (wasToday) goTo(now); else { renderWeek(); renderHeading(); } }
});

/* ---------- 開始 ---------- */
Object.assign(window, { state, goTo, flush, openSearch, openSettings, closeSettings, openCalendar, closeCalendar, runSearch, getEditor: () => editor, placeGrip, grip, openFormat, closeFormat, slash, copyBlock, lastEditAt });
(async function start() {
  state.counts = await dump.counts();
  await load();
})();
