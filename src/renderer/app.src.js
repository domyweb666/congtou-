/* global dump */
import { Editor, Node, Extension } from '@tiptap/core';
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
import { NodeSelection, TextSelection, Plugin } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { DOMSerializer } from '@tiptap/pm/model';

const $ = (id) => document.getElementById(id);
// 深色跟著系統走：設計系統的深色代號掛在 <html data-theme="dark">
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => { if (darkQuery.matches) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme; };
applyTheme();
darkQuery.addEventListener('change', applyTheme);
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

/* ---------- 蔥頭垃圾桶（logo，蓋子會動） ---------- */
// 圖形來自 assets/icon.svg；蓋子拆成 .can-lid，以鉸鍊為原點轉。平常半開，拖東西進來時大開，丟進來時「咚」闔一下。
let canSeq = 0;
function canSvg() {
  const id = `cang${++canSeq}`;
  return `<svg viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A3C12"/><stop offset="1" stop-color="#32160A"/></linearGradient></defs>`
    + `<rect width="1024" height="1024" rx="225" fill="url(#${id})"/>`
    + '<g transform="translate(512 540) scale(0.9) translate(-512 -560)"><g class="can-body">'
    + '<rect x="427" y="900" width="38" height="78" rx="19" fill="#CDB07E" transform="rotate(24 446 900)"/><rect x="493" y="900" width="38" height="78" rx="19" fill="#CDB07E"/><rect x="559" y="900" width="38" height="78" rx="19" fill="#CDB07E" transform="rotate(-24 578 900)"/>'
    + '<ellipse cx="512" cy="430" rx="282" ry="74" fill="#1A0A05"/>'
    + '<path d="M230 430 A282 74 0 0 0 794 430 C854 640 774 910 512 920 C250 910 170 640 230 430 Z" fill="#F4E6C8"/><path d="M347 510 Q294 690 400 860M512 510 Q512 690 512 860M677 510 Q730 690 624 860" fill="none" stroke="#CDB07E" stroke-width="44" stroke-linecap="round"/>'
    + '<ellipse cx="512" cy="430" rx="282" ry="74" fill="none" stroke="#3F8A34" stroke-width="54"/></g>'
    + '<g transform="translate(205 400)"><g class="can-lid"><g transform="translate(240 -40) rotate(32) scale(0.8) translate(-240 40)"><path d="M240 -60 C180 -170 90 -230 44 -226 C110 -160 170 -100 216 -40 Z" fill="#86CC62"/><path d="M234 -50 C280 -190 360 -270 410 -262 C350 -180 304 -110 274 -40 Z" fill="#86CC62"/></g><rect x="0" y="-40" width="480" height="80" rx="40" fill="#86CC62"/></g></g></g></svg>';
}
for (const n of document.querySelectorAll('[data-can]')) n.innerHTML = canSvg();
// 丟進東西時，每個垃圾桶都闔一下蓋子
function gulp() {
  for (const n of document.querySelectorAll('.can')) { n.classList.remove('gulp'); void n.offsetWidth; n.classList.add('gulp'); }
}
document.addEventListener('animationend', (e) => { const c = e.target.closest && e.target.closest('.can'); if (c && e.animationName === 'can-gulp') c.classList.remove('gulp'); });
function canOpen(on) { for (const n of document.querySelectorAll('.can:not(.drop .can)')) n.classList.toggle('open', on); }

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
// action：{ label, run }，提示右邊多一顆按鈕
function toast(text, ms = 4000, bad = false, action = null) {
  $('toastText').textContent = text;
  $('toast').classList.toggle('is-error', !!bad);
  const btn = $('toastAction');
  btn.hidden = !action;
  btn.onclick = action ? () => { $('toast').hidden = true; action.run(); } : null;
  if (action) btn.textContent = action.label;
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
    return ['div', { 'data-file': rel, 'data-name': name, 'data-size': String(size), ...(node.attrs.used ? { 'data-used': node.attrs.used } : {}), class: 'filechip', title: `${name}（點兩下，或選取後按 Enter 打開）` },
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
// 右邊的段落編號：只有「有內容的段落」才算一號。空行、只有換行或空白的段落、時間標記、分隔線都不算。
const NO_NUM = new Set(['timeMark', 'horizontalRule']);
function hasContent(node) {
  if (NO_NUM.has(node.type.name)) return false;
  if (node.isLeaf) return true;
  if (/[^\s​﻿]/.test(node.textContent)) return true;
  let found = false;
  node.descendants((n) => { if (found) return false; if (n.isLeaf && !n.isText && n.type.name !== 'hardBreak') found = true; return !found; });
  return found;
}
function numberDecos(doc) {
  const decos = [];
  doc.forEach((node, pos) => { if (hasContent(node)) decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'numbered' })); });
  return DecorationSet.create(doc, decos);
}
const BlockNumbers = Extension.create({
  name: 'blockNumbers',
  addProseMirrorPlugins() {
    return [new Plugin({
      state: { init: (_c, st) => numberDecos(st.doc), apply: (tr, old) => (tr.docChanged ? numberDecos(tr.doc) : old) },
      props: { decorations(st) { return this.getState(st); } },
    })];
  },
});
// 貼上、拖進來、放檔案時，新的那幾塊從上面掉進頁面、閃一下淡綠，看得出剛剛丟的是哪段。
// 只算整塊都是新的（貼在一段字中間不會讓整段掉下來）；時間標記不掉。
const FALL_MS = 2300;
let fallTimer = null;
function changedRange(tr) {
  let from = Infinity; let to = -Infinity;
  tr.mapping.maps.forEach((map, i) => map.forEach((_os, _oe, ns, ne) => {
    const rest = tr.mapping.slice(i + 1);
    from = Math.min(from, rest.map(ns, -1)); to = Math.max(to, rest.map(ne, 1));
  }));
  return from <= to ? { from, to } : null;
}
const FallIn = Extension.create({
  name: 'fallIn',
  addProseMirrorPlugins() {
    return [new Plugin({
      state: {
        init: () => DecorationSet.empty,
        apply(tr, old) {
          if (tr.getMeta('fallClear')) return DecorationSet.empty;
          const set = old.map(tr.mapping, tr.doc);
          if (!tr.docChanged || !(tr.getMeta('fallIn') || ['paste', 'drop'].includes(tr.getMeta('uiEvent')))) return set;
          const r = changedRange(tr);
          if (!r) return set;
          const decos = [];
          tr.doc.forEach((node, pos) => {
            if (pos < r.from - 1 || pos + node.nodeSize > r.to + 1) return;
            if (node.type.name === 'timeMark' || !hasContent(node)) return;
            decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'fall-in' }));
          });
          if (!decos.length) return set;
          clearTimeout(fallTimer);
          fallTimer = setTimeout(() => { if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('fallClear', true).setMeta('addToHistory', false)); }, FALL_MS);
          return set.add(tr.doc, decos);
        },
      },
      props: { decorations(st) { return this.getState(st); } },
    })];
  },
});
// 「用過了」：撈回稿子的那一塊標起來，變灰、劃線。記在最上層區塊的 used 屬性（page.json 會存，index.md 不會）。
const USED_TYPES = ['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'image', 'fileChip', 'table'];
const UsedMark = Extension.create({
  name: 'usedMark',
  addGlobalAttributes() {
    return [{ types: USED_TYPES, attributes: { used: { default: null, parseHTML: (n) => n.getAttribute('data-used') || null, renderHTML: (a) => (a.used ? { 'data-used': a.used } : {}) } } }];
  },
});
function toggleUsed(pos) {
  if (pos == null || !editor) return;
  const node = editor.state.doc.nodeAt(pos);
  if (!node || !USED_TYPES.includes(node.type.name) || (node.type.name === 'paragraph' && !node.content.size)) { toast('這一塊是空的，不用標', 2000); return; }
  const used = node.attrs.used ? null : toKey(new Date());
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, used }));
  toast(used ? '標成用過了（再按一次取消）' : '取消「用過了」', 1800);
}
/* ---------- 最近刪除：整塊被刪掉的東西先收起來 ---------- */
// 每次文件變動時，看哪些最上層區塊整塊不見了。同樣的東西在新文件裡還有（拖曳搬動、Alt+↑↓、只改了「用過了」）就不算刪。
// 等 4 秒再寫進去：這段時間按 Ctrl+Z 救回來的，就不收。
let pendingTrash = [];
let trashTimer = null;
const blockKey = (n) => `${n.type.name}|${n.textContent}|${n.attrs.src || n.attrs.rel || ''}`;
function collectDeleted(tr) {
  // 復原、重做造成的變動不收（例如撤回剛剛的貼上，那些東西本來就不想要）
  if (!tr.docChanged || tr.getMeta('timeMark') || tr.getMeta('history$')) return;
  const left = new Map();
  tr.doc.forEach((n) => { const k = blockKey(n); left.set(k, (left.get(k) || 0) + 1); });
  tr.before.forEach((n, pos) => {
    if (!hasContent(n)) return;
    if (tr.mapping.map(pos, 1) < tr.mapping.map(pos + n.nodeSize, -1)) return; // 還在，只是被改了
    const k = blockKey(n);
    if (left.get(k)) { left.set(k, left.get(k) - 1); return; }
    const json = mapImages(JSON.parse(JSON.stringify(n.toJSON())), (src) => state.urlToRel[src] || src);
    pendingTrash.push({ date: state.date, key: k, node: json, text: nodeText(json).replace(/\s+/g, ' ').trim() });
  });
  if (pendingTrash.length) { clearTimeout(trashTimer); trashTimer = setTimeout(flushTrash, 4000); }
}
async function flushTrash() {
  clearTimeout(trashTimer);
  if (!pendingTrash.length) return;
  const here = new Set();
  if (editor) editor.state.doc.forEach((n) => here.add(blockKey(n)));
  const out = pendingTrash.filter((e) => !(e.date === state.date && here.has(e.key))).map(({ date, node, text }) => ({ date, node, text }));
  pendingTrash = [];
  if (out.length) { try { await dump.addTrash(out); } catch { /* 收不進最近刪除不影響編輯 */ } }
}
function fmtAgo(at) {
  const d = new Date(at); const k = toKey(d);
  const day = k === state.today ? '今天' : k === addDays(state.today, -1) ? '昨天' : fmtShort(k);
  return `${day} ${pad(d.getHours())}:${pad(d.getMinutes())} 刪掉`;
}
async function openTrash() {
  closeCalendar(); closeFormat();
  $('settingsPanel').hidden = true; $('keysPanel').hidden = true;
  await flushTrash();
  const list = await dump.listTrash();
  const box = $('trashList'); box.textContent = '';
  if (!list.length) box.append(el('div', { class: 'note', text: '這 30 天沒有整塊刪掉的東西。' }));
  else box.append(el('p', { class: 'trash-hint', text: '整塊刪掉的東西會在這裡留 30 天。按「放回去」會回到原本那一天的最後面。' }));
  for (const e of list) {
    const isFile = e.node.type === 'image' || e.node.type === 'fileChip';
    const row = el('div', { class: 'trash-row' },
      el('div', { class: 'trash-main' },
        el('div', { class: 'trash-meta', text: `${fmtShort(e.date)} 那一頁・${fmtAgo(e.at)}` }),
        el('div', { class: 'trash-text', text: e.text || (isFile ? '（圖片或檔案）' : '（沒有文字）') })),
      el('button', { class: 'action', onclick: () => restoreTrash(e.id) }, '放回去'));
    box.append(row);
  }
  $('trashPanel').hidden = false;
  $('trashClose').focus();
}
function closeTrash() { $('trashPanel').hidden = true; focusEditor(); }
async function restoreTrash(id) {
  const e = await dump.takeTrash(id);
  if (!e) { toast('這一塊已經不在最近刪除裡了', 3000); openTrash(); return; }
  $('trashPanel').hidden = true;
  if (e.date !== state.date) await goTo(e.date, null, true);
  const node = editor.schema.nodeFromJSON(mapImages(e.node, (src) => state.relToUrl[src] || src));
  const doc = editor.state.doc; const last = doc.lastChild;
  const end = last && last.type.name === 'paragraph' && !last.content.size ? doc.content.size - last.nodeSize : doc.content.size;
  editor.view.dispatch(editor.state.tr.insert(end, node).setMeta('fallIn', true));
  setTimeout(() => { const dom = editor.view.nodeDOM(end); if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'center' }); }, 0);
  toast(`放回 ${fmtShort(e.date)} 那一頁的最後面`, 2500);
}
$('trashBtn').addEventListener('click', openTrash);
$('trashClose').addEventListener('click', closeTrash);
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
    if (!state.dirty) setSaveState('');
  } catch (err) {
    state.dirty = true;
    setSaveState('沒存成功，內容還在這一頁', true);
    toast(`這一頁沒存成功，內容還留在畫面上，5 秒後會再存一次。（${err.message || err}）`, 6000, true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 5000);
  }
}
function markDirty() {
  if (state.loading) return;
  state.dirty = true;
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

// 時間標記後面的東西被刪光了，那條線就不留（不然日期底下會掛一條孤單的時間）
function dropOrphanMarks() {
  const doc = editor.state.doc;
  let tr = null; let pos = doc.content.size;
  for (let i = doc.childCount - 1; i >= 0; i--) {
    const n = doc.child(i); pos -= n.nodeSize;
    if (n.type.name === 'paragraph' && !n.content.size) continue;
    if (n.type.name !== 'timeMark') break;
    tr = (tr || editor.state.tr).delete(pos, pos + n.nodeSize);
  }
  if (tr) editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('timeMark', true));
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
// 游標所在的最上層區塊位置（鍵盤複製整塊用）
function currentBlockPos() {
  const sel = editor.state.selection;
  const $f = sel.$from;
  if ($f.depth >= 1) return $f.before(1);
  return sel instanceof NodeSelection ? sel.from : null;
}
function copyBlock(at) {
  const pos = typeof at === 'number' ? at : grip.pos;
  if (pos == null) return;
  const view = editor.view;
  const target = view.state.doc.nodeAt(pos);
  if (!target || (target.type.name === 'paragraph' && !target.content.size)) { toast('這一塊是空的，沒有東西可以複製', 2000); return; }
  const before = view.state.selection;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  view.focus();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  if (ok) {
    view.dispatch(view.state.tr.setSelection(before));
    // 複製通常就是要撈回稿子：順手給一顆「標成用過了」
    if (target.attrs.used) toast('已複製整塊', 1500);
    else toast('已複製整塊', 4000, false, { label: '標成用過了', run: () => toggleUsed(pos) });
  }
  else toast('這一塊已選取，請按 Ctrl+C 複製');
}
function makeGrip() {
  const copy = el('button', { class: 'gutter-btn', tabindex: '-1', title: '複製整塊，含格式（Ctrl+Shift+C）', 'aria-label': '複製整塊', onclick: () => copyBlock() });
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
  const usedBtn = el('button', { class: 'gutter-btn', tabindex: '-1', title: '標成用過了／取消（Ctrl+Shift+U）', 'aria-label': '標成用過了', onclick: () => toggleUsed(grip.pos) });
  usedBtn.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" class="line"><path d="M4.5 10.5l3.5 3.5 7.5-8"/></svg>';
  usedBtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); });
  const wrap = el('div', { class: 'gutter' }, usedBtn, copy, g);
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
  const chain = editor.chain().focus().command(({ tr }) => { tr.setMeta('fallIn', true); return true; });
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

function openNode(node) {
  const rel = node.type.name === 'fileChip' ? node.attrs.rel : node.type.name === 'image' ? state.urlToRel[node.attrs.src] : '';
  if (!rel) return false;
  dump.openFile(state.date, rel).then((err) => { if (err) toast(`打不開這個檔案，頁面上的內容沒有變動。（${err}）`, 5000, true); });
  return true;
}

function makeEditor(doc) {
  hideGrip(); closeSlash(); if (typeof closeBubble === 'function') closeBubble(); pendingMark = null;
  if (editor) editor.destroy();
  $('editor').textContent = '';
  editor = new Editor({
    element: $('editor'),
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, dropcursor: { color: false, width: 3, class: 'drop-line' } }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true, HTMLAttributes: { rel: 'noopener', target: '_blank' } }),
      BlockImage.configure({ inline: false, allowBase64: true }),
      TaskList, TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      FileChip, TimeMark, BlockNumbers, FallIn, UsedMark,
      Placeholder.configure({ placeholder: state.date === state.today ? '把剪下來的段落貼在這裡，或直接打字、拖檔案進來。打 / 放圖片、檔案，或換格式。' : `${fmtShort(state.date)} 這天沒有東西。直接打字或貼上就會記在這天。` }),
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
        if (text.trim() || files.length) gulp();
        const real = files.filter((f) => dump.pathFor(f));
        // 從檔案總管複製的檔案一定收；截圖只在沒有文字時收（Excel 複製格子會同時帶一張圖）。
        if (real.length || (files.length && !text.trim())) {
          insertFiles(real.length ? real : files).catch((err) => toast(`檔案沒放進來，這一頁其他內容沒有變動。（${err.message || err}）`, 6000, true));
          return true;
        }
        if (BARE_URL.test(text.trim()) && view.state.selection.empty) { pasteUrl(text.trim()); return true; }
        return false;
      },
      handleDrop(view, event, _slice, moved) {
        if (moved || !event.dataTransfer || !event.dataTransfer.files.length) return false;
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
        event.preventDefault();
        gulp();
        insertFiles([...event.dataTransfer.files], at ? at.pos : null).catch((err) => toast(`檔案沒放進來，這一頁其他內容沒有變動。（${err.message || err}）`, 6000, true));
        return true;
      },
      handleClick(_view, _pos, event) {
        const a = event.target.closest && event.target.closest('a[href]');
        if (!a) return false;
        event.preventDefault();
        dump.openUrl(a.getAttribute('href'));
        return true;
      },
      handleDoubleClickOn(_view, _pos, node) { return openNode(node); },
      handleKeyDown(_view, event) {
        if (slashKey(event)) { event.preventDefault(); return true; }
        if (event.key === 'Escape' && !$('bubble').hidden) { event.preventDefault(); closeBubble(); return true; }
        if (event.ctrlKey && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') { event.preventDefault(); linkMode(); return true; }
        const sel = editor.state.selection;
        if (event.key === 'Enter' && !event.ctrlKey && !event.altKey && sel instanceof NodeSelection && openNode(sel.node)) { event.preventDefault(); return true; }
        if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') { event.preventDefault(); copyBlock(currentBlockPos()); return true; }
        if (event.ctrlKey && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'u') { event.preventDefault(); toggleUsed(currentBlockPos()); return true; }
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
    onCreate() { state.loading = true; keepTrailingParagraph(); dropOrphanMarks(); state.loading = false; },
    onUpdate({ transaction }) { if (!state.loading) { collectDeleted(transaction); keepTrailingParagraph(); maybeMark(transaction); if (!transaction.getMeta('timeMark') && !editor.view.composing) dropOrphanMarks(); markDirty(); updateSlash(true); touchSide(); } },
    onSelectionUpdate() { updateSlash(false); bubbleOnSelection(); },
    onTransaction() { if (!$('bubble').hidden && !bubble.linking) { clearTimeout(bubble.timer); bubble.timer = setTimeout(renderBubble, 0); } },
    onBlur({ event }) { const to = event && event.relatedTarget; if (!bubble.linking && !(to && ($('bubble').contains(to) || $('turnMenu').contains(to)))) closeBubble(); },
  });
  makeGrip();
  editor.view.dom.addEventListener('compositionend', () => { if (pendingMark != null) { const i = pendingMark; pendingMark = null; setTimeout(() => insertMarkBefore(i), 0); } });
  // 連結在編輯器裡不要真的導頁
  $('editor').addEventListener('click', (e) => { if (e.target.closest('a[href]')) e.preventDefault(); });
}
function focusEditor() { if (editor) editor.commands.focus('end'); }

/* ---------- 側邊欄 ---------- */
// 最近幾天的清單。每一天的摘要從文件算出來：開頭一行、幾段、幾個檔案、時間標記。
const RECENT_DAYS = 14;
const days = new Map(); // date -> 摘要
const narrowQuery = window.matchMedia('(max-width: 760px)');
const side = { pref: true, narrowOpen: false };
try { side.pref = localStorage.getItem('side') !== '0'; } catch { /* 記不住就每次都打開 */ }

function nodeText(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text || '';
  if (n.type === 'hardBreak') return ' ';
  if (n.type === 'fileChip') return (n.attrs && n.attrs.name) || '';
  if (n.type === 'image') return (n.attrs && n.attrs.alt) || '';
  const kids = n.content || [];
  return kids.map(nodeText).join(kids.some((k) => k.type === 'text') ? '' : ' ');
}
function summarize(doc) {
  const out = { preview: '', blocks: 0, files: 0, marks: [] };
  let mark = null;
  ((doc && doc.content) || []).forEach((n, index) => {
    if (n.type === 'timeMark') { mark = { time: (n.attrs && n.attrs.time) || '', index, text: '' }; out.marks.push(mark); return; }
    if (n.type === 'horizontalRule') return;
    const isFile = n.type === 'image' || n.type === 'fileChip';
    const text = nodeText(n).replace(/[\s\u200b\ufeff]+/g, ' ').trim();
    if (!isFile && !text) return;
    if (isFile) out.files++; else out.blocks++;
    if (!out.preview && text) out.preview = text.slice(0, 90);
    if (mark && !mark.text && text) mark.text = text.slice(0, 40);
  });
  return out;
}
const sideVisible = () => (narrowQuery.matches ? side.narrowOpen : side.pref);
function applySide() {
  const on = sideVisible();
  document.body.classList.toggle('side-off', !on);
  $('sideShow').hidden = on;
  fitWeek();
}
function setSide(on) {
  if (narrowQuery.matches) side.narrowOpen = on;
  else { side.pref = on; try { localStorage.setItem('side', on ? '1' : '0'); } catch { /* 沒差 */ } }
  applySide();
  if (on) renderSide();
}
narrowQuery.addEventListener('change', () => { side.narrowOpen = false; applySide(); });
// 窄視窗的側邊欄是蓋在內容上面的，挑完日子或點旁邊就收起來
function closeNarrowSide() { if (narrowQuery.matches && side.narrowOpen) setSide(false); }
document.addEventListener('mousedown', (e) => { if (narrowQuery.matches && side.narrowOpen && !$('side').contains(e.target) && !$('sideShow').contains(e.target) && !$('calendar').contains(e.target)) setSide(false); });
$('sideHide').addEventListener('click', () => { setSide(false); focusEditor(); });
$('sideShow').addEventListener('click', () => setSide(true));
$('settingsBtn').addEventListener('click', () => openSettings());

function dayLabel(k) {
  const d = fromKey(k);
  const thisYear = d.getFullYear() === fromKey(state.today).getFullYear();
  return `${thisYear ? fmtShort(k) : fmtDate(k)} ${WEEKDAYS[d.getDay()]}`;
}
function dayItem(k) {
  const s = days.get(k);
  const count = s ? [s.blocks && `${s.blocks} 段`, s.files && `${s.files} 檔案`].filter(Boolean).join('・') : '';
  const preview = s ? (s.preview || '圖片或檔案') : '還沒丟東西';
  return el('button', { class: `day${k === state.date ? ' current' : ''}${s ? '' : ' blank'}`, 'aria-current': k === state.date ? 'true' : null, onclick: () => { closeNarrowSide(); if (k !== state.date) goTo(k); else focusEditor(); } },
    el('span', { class: 'day-head' }, el('b', { text: dayLabel(k) }), count ? el('span', { class: 'day-count', text: count }) : null),
    el('span', { class: 'day-preview', text: preview }));
}
async function jumpToMark(index) {
  closeNarrowSide();
  if (state.date !== state.today) await goTo(state.today);
  const doc = editor.state.doc;
  if (index >= doc.childCount) return;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const dom = editor.view.nodeDOM(pos);
  if (dom && dom.scrollIntoView) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
function renderSide() {
  if (!sideVisible()) return;
  // 正在看的這一天以畫面上的內容為準（可能還沒存檔）
  if (editor && !state.loading) {
    const live = summarize(editor.getJSON());
    if (live.blocks + live.files) days.set(state.date, live); else days.delete(state.date);
  }
  const box = $('sideList');
  const keepOlder = !!box.querySelector('#olderBtn[aria-expanded="true"]');
  box.textContent = '';
  const since = addDays(state.today, -(RECENT_DAYS - 1));
  box.append(el('div', { class: 'side-label', text: '今天' }), dayItem(state.today));
  const marks = (days.get(state.today) || { marks: [] }).marks.filter((m) => m.text);
  if (marks.length) {
    const list = el('div', { class: 'marks' });
    for (const m of marks) list.append(el('button', { class: 'mark', title: `跳到 ${m.time} 丟的那一段`, onclick: () => jumpToMark(m.index) }, el('span', { class: 'mark-time', text: m.time }), el('span', { class: 'mark-text', text: m.text })));
    box.append(list);
  }
  const recent = [...days.keys()].filter((k) => k !== state.today && k >= since).sort().reverse();
  if (recent.length) {
    box.append(el('div', { class: 'side-label', text: '最近幾天' }));
    for (const k of recent) box.append(dayItem(k));
  }
  box.append(el('div', { class: 'side-label', text: '更早' }));
  if (state.date < since) box.append(dayItem(state.date));
  box.append(el('button', { class: 'older', id: 'olderBtn', 'aria-haspopup': 'dialog', 'aria-expanded': keepOlder ? 'true' : 'false', title: '用月曆挑更早的日子（Ctrl+G）', onclick: (e) => ($('calendar').hidden ? openCalendar(e.currentTarget) : closeCalendar()) },
    el('span', { text: '用月曆挑日子' }), el('span', { class: 'older-chev', text: '›', 'aria-hidden': 'true' })));
}
let sideTimer = null;
function touchSide() { clearTimeout(sideTimer); sideTimer = setTimeout(renderSide, 300); }
async function refreshDays() {
  const list = await dump.recent(addDays(state.today, -(RECENT_DAYS - 1)));
  days.clear();
  for (const r of list) days.set(r.date, summarize(r.doc));
  renderSide();
}
applySide();

/* ---------- 週條與標題 ---------- */

// 頂列只剩一顆日期鈕；不在今天時才出現「回今天」
// 頂列中間是一整週（週一到週日），正在看的那天是綠色膠囊，今天前面有一個點；
// 沒丟東西的日子字淡一點。視窗變窄時，離正在看的那天比較遠的先藏起來（data-off 給 CSS 用）。
function renderWeek() {
  const d = fromKey(state.date);
  const monday = addDays(state.date, -((d.getDay() + 6) % 7));
  const box = $('weekDays');
  box.textContent = '';
  for (let i = 0; i < 7; i++) {
    const k = addDays(monday, i);
    const day = fromKey(k);
    const cur = k === state.date;
    box.append(el('button', {
      class: `wd${cur ? ' current' : ''}${k === state.today ? ' today' : ''}${state.counts[k] ? '' : ' blank'}`,
      'data-off': String(Math.abs(i - ((d.getDay() + 6) % 7))),
      'aria-current': cur ? 'date' : null,
      title: `${fmtDate(k)} ${WEEKDAYS[day.getDay()]}${k === state.today ? '（今天）' : ''}`,
      onclick: () => { if (k !== state.date) goTo(k); else focusEditor(); },
    }, el('span', { class: 'wd-name', text: `週${SHORT[day.getDay()]}` }), el('span', { class: 'wd-num', text: String(day.getDate()) })));
  }
  $('todayBtn').classList.toggle('is-today', state.date === state.today);
  fitWeek();
}
// 頂列放不下整週時，從離正在看那天最遠的日子開始藏（同樣遠的先藏後面的），至少留正在看的那天。
// 用實際量到的寬度判斷，側邊欄開關、視窗縮放、存檔字樣出現都會重算，不會再疊到「今天」按鈕上。
function fitWeek() {
  const bar = document.querySelector('.bar');
  const days = [...$('weekDays').children];
  for (const d of days) d.hidden = false;
  const order = days.map((d, i) => ({ d, i, off: Number(d.dataset.off) })).sort((a, b) => b.off - a.off || b.i - a.i);
  for (let k = 0; k < order.length - 1 && bar.scrollWidth > bar.clientWidth; k++) order[k].d.hidden = true;
}
// 不用 requestAnimationFrame：視窗在背景時它不跑，日期條就會停在舊的樣子
let fitTimer = 0;
const refit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fitWeek, 0); };
new ResizeObserver(() => fitWeek()).observe(document.querySelector('.bar'));
window.addEventListener('resize', refit);
if (document.fonts) document.fonts.ready.then(refit);

function renderHeading() {
  const d = fromKey(state.date);
  $('phWeekday').textContent = state.date === state.today ? `${WEEKDAYS[d.getDay()]}・今天` : WEEKDAYS[d.getDay()];
  $('phDate').textContent = fmtDate(state.date);
  document.title = state.date === state.today ? '蔥蔥丟' : `蔥蔥丟 — ${fmtShort(state.date)}`;
}
function setSaveState(text, bad) { const n = $('saveState'); n.textContent = text; n.classList.toggle('bad', !!bad); }

async function refreshCounts() { state.counts = await dump.counts(); renderWeek(); if (!$('calendar').hidden) renderCalendar(); }

async function load(find, stay) {
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
  renderSide();
  page.scrollTop = 0;
  if (find) {
    window.getSelection().removeAllRanges();
    editor.commands.focus('start');
    try { window.find(find, false, false, false); } catch { /* 找不到就停在頁首 */ }
  } else if (stay) {
    $('calBtn').focus();
  } else {
    focusEditor();
    if (state.date === state.today) page.scrollTop = page.scrollHeight;
  }
}

async function goTo(k, find, stay) {
  await flush();
  await flushTrash();
  state.date = k;
  await load(find, stay);
}
function goToday() { state.today = toKey(new Date()); return goTo(state.today); }

async function pickFiles() {
  const paths = await dump.pickFiles();
  if (!paths.length) return;
  const r = await dump.addPaths(state.date, paths);
  insertAssets(r.assets);
  if (r.assets.length) gulp();
  if (r.skipped.length) toast(`沒收進來：${r.skipped.join('、')}`);
}
$('attachBtn').addEventListener('click', pickFiles);

const overlayOpen = () => !$('settingsPanel').hidden || !$('keysPanel').hidden || !$('trashPanel').hidden;

// 點頁面下方的空白處，游標就到最後
page.addEventListener('mousedown', (e) => { if (e.target === page) { e.preventDefault(); focusEditor(); } });

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e) || overlayOpen()) return;
  dragDepth++;
  $('dropDate').textContent = state.date === state.today ? '今天' : fmtShort(state.date);
  $('drop').hidden = false;
  canOpen(true);
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = overlayOpen() ? 'none' : 'copy'; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { $('drop').hidden = true; canOpen(false); } });
window.addEventListener('drop', (e) => {
  dragDepth = 0; $('drop').hidden = true; canOpen(false);
  if (e.defaultPrevented || !hasFiles(e)) return; // 編輯器已經接走了
  e.preventDefault();
  if (overlayOpen()) return;
  gulp();
  const doc = editor.state.doc; const last = doc.lastChild;
  const end = last && last.type.name === 'paragraph' && !last.content.size ? doc.content.size - last.nodeSize : doc.content.size;
  insertFiles([...e.dataTransfer.files], end).catch((err) => toast(`檔案沒放進來，這一頁其他內容沒有變動。（${err.message || err}）`, 6000, true));
});

/* ---------- 格式選單 ---------- */
const FORMATS = [
  ['圖片或檔案', 'Ctrl O', (c) => c, () => false, 'image img pic photo file tupian dangan fujian 圖 檔 照片 附件', () => pickFiles()],
  null,
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
  ['粗體', 'Ctrl B', (c) => c.toggleBold(), (e) => e.isActive('bold'), 'bold b'],
  ['斜體', 'Ctrl I', (c) => c.toggleItalic(), (e) => e.isActive('italic'), 'italic i'],
  ['刪除線', 'Ctrl Shift S', (c) => c.toggleStrike(), (e) => e.isActive('strike'), 'strike'],
  ['插入現在時間', 'Alt T', (c) => { const n = new Date(); return c.insertContent(`${pad(n.getHours())}:${pad(n.getMinutes())} `); }, () => false, 'time now shijian'],
];
// 選單與月曆貼在叫出它的按鈕下面（頂列在窄視窗會變兩排，位置不能寫死）
function anchor(box, btn) {
  const r = btn.getBoundingClientRect();
  const top = Math.round(r.bottom + 6);
  // 靠右對齊按鈕；視窗太窄、左邊會被切掉時往右推回來
  const right = Math.min(Math.round(window.innerWidth - r.right), window.innerWidth - box.offsetWidth - 8);
  box.style.top = `${top}px`;
  box.style.right = `${Math.max(8, right)}px`;
  box.style.maxHeight = `${window.innerHeight - top - 8}px`;
  box.style.overflowY = 'auto';
}
// 從側邊欄叫出來的月曆：靠左貼在那顆按鈕旁邊，放不下就往上推
function anchorLeft(box, btn) {
  const r = btn.getBoundingClientRect();
  box.style.right = 'auto';
  box.style.left = `${Math.max(8, Math.min(Math.round(r.left), window.innerWidth - box.offsetWidth - 8))}px`;
  box.style.top = `${Math.max(8, Math.min(Math.round(r.bottom + 6), window.innerHeight - box.offsetHeight - 8))}px`;
  box.style.maxHeight = ''; box.style.overflowY = '';
}
function openFormat() {
  closeCalendar();
  const menu = $('formatMenu');
  menu.textContent = '';
  for (const f of FORMATS) {
    if (!f) { menu.append(el('hr')); continue; }
    const [label, hint, run, active] = f;
    const on = editor && active(editor);
    menu.append(el('button', { role: 'menuitemcheckbox', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '', onclick: () => { closeFormat(); run(editor.chain().focus()).run(); if (f[5]) f[5](); } },
      el('span', { text: label }), hint ? el('kbd', { text: hint }) : null));
  }
  menu.append(el('hr'));
  menu.append(el('button', { role: 'menuitem', onclick: () => { closeFormat(); editor.commands.focus(); copyBlock(currentBlockPos()); } }, el('span', { text: '複製這一塊' }), el('kbd', { text: 'Ctrl Shift C' })));
  menu.append(el('button', { role: 'menuitem', onclick: () => { closeFormat(); openKeys(); } }, el('span', { text: '快捷鍵一覽' }), el('kbd', { text: 'Ctrl /' })));
  menu.append(el('button', { role: 'menuitem', onclick: () => { closeFormat(); openSettings(); } }, el('span', { text: '設定' }), el('kbd', { text: 'Ctrl ,' })));
  menu.hidden = false;
  anchor(menu, $('formatBtn'));
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
  if (f[5]) f[5]();
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

/* ---------- 選字浮動工具列：框起字就出現，像 Notion ---------- */
// 左邊「轉成」換整塊的樣子（標題、清單…），右邊是字的格式。滑鼠放開或用 Shift+方向鍵選好才出現，不在拖曳途中閃。
const TURN_NAMES = ['內文', '大標題', '中標題', '小標題', '項目符號', '編號清單', '待辦勾選', '引言', '程式碼區塊'];
const TURN = TURN_NAMES.map((n) => FORMATS.find((f) => f && f[0] === n));
const svgIcon = (d, solid) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 20 20'); s.setAttribute('class', solid ? 'ic solid' : 'ic'); s.setAttribute('aria-hidden', 'true'); s.innerHTML = d; return s; };
const MARKS = [
  ['B', '粗體（Ctrl B）', (c) => c.toggleBold(), (e) => e.isActive('bold'), 'b-bold'],
  ['I', '斜體（Ctrl I）', (c) => c.toggleItalic(), (e) => e.isActive('italic'), 'b-italic'],
  ['S', '刪除線（Ctrl Shift S）', (c) => c.toggleStrike(), (e) => e.isActive('strike'), 'b-strike'],
  [svgIcon('<path d="M7 6l-4 4 4 4M13 6l4 4-4 4"/>'), '行內程式碼（Ctrl E）', (c) => c.toggleCode(), (e) => e.isActive('code')],
  [svgIcon('<path d="M8.5 11.5a3 3 0 004.2 0l2.6-2.6a3 3 0 00-4.2-4.2l-.9.9M11.5 8.5a3 3 0 00-4.2 0l-2.6 2.6a3 3 0 004.2 4.2l.9-.9"/>'), '連結（Ctrl K）', null, (e) => e.isActive('link'), 'link'],
  [svgIcon('<path d="M4 5h9M8.5 5L6 15M12 11l5 5M17 11l-5 5"/>'), '清除格式', (c) => c.unsetAllMarks(), () => false],
];
const bubble = { mouse: false, linking: false, timer: null };
function bubbleWanted() {
  if (!editor || slash.open || overlayOpen()) return false;
  const sel = editor.state.selection;
  if (sel.empty || !(sel instanceof TextSelection)) return false;
  return !!editor.state.doc.textBetween(sel.from, sel.to, ' ').trim();
}
function closeTurn() { $('turnMenu').hidden = true; const t = $('bubble').querySelector('.turn-btn'); if (t) t.setAttribute('aria-expanded', 'false'); }
function closeBubble() { $('bubble').hidden = true; bubble.linking = false; closeTurn(); }
function placeBubble() {
  const box = $('bubble');
  const range = window.getSelection().rangeCount ? window.getSelection().getRangeAt(0) : null;
  let r = range && range.getBoundingClientRect();
  if (!r || (!r.width && !r.height)) { const c = editor.view.coordsAtPos(editor.state.selection.from); r = { top: c.top, bottom: c.bottom, left: c.left, width: 0 }; }
  const floor = page.getBoundingClientRect().top + 4;
  const h = box.offsetHeight; const w = box.offsetWidth;
  const above = r.top - h - 8 >= floor;
  box.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`;
  box.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))}px`;
  box.classList.toggle('below', !above);
}
function linkMode() {
  if (!bubbleWanted()) return;
  bubble.linking = true; closeTurn();
  const box = $('bubble'); box.textContent = '';
  const old = editor.getAttributes('link').href || '';
  const input = el('input', { class: 'link-input', type: 'text', placeholder: '貼上網址，Enter 套用', 'aria-label': '連結網址', value: old });
  const done = (apply) => {
    if (apply) {
      const u = input.value.trim();
      const chain = editor.chain().focus().extendMarkRange('link');
      (u ? chain.setLink({ href: /^[a-z][\w+.-]*:/i.test(u) ? u : `https://${u}` }) : chain.unsetLink()).run();
    } else editor.commands.focus();
    bubble.linking = false; renderBubble();
  };
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); done(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
  });
  input.addEventListener('blur', () => { if (bubble.linking) setTimeout(() => { if (bubble.linking && !$('bubble').contains(document.activeElement)) closeBubble(); }, 0); });
  box.append(input, old ? el('button', { class: 'bb', title: '拿掉連結', 'aria-label': '拿掉連結', onclick: () => { input.value = ''; done(true); } }, svgIcon('<path d="M5 5l10 10M15 5L5 15"/>')) : null);
  box.hidden = false; placeBubble(); input.focus(); input.select();
}
function renderBubble() {
  clearTimeout(bubble.timer);
  if (bubble.linking) return;
  if (bubble.mouse || !bubbleWanted()) { closeBubble(); return; }
  const box = $('bubble'); box.textContent = '';
  const cur = TURN.find((f) => f[3](editor));
  const turnBtn = el('button', { class: 'bb turn-btn', title: '把這一塊轉成標題、清單、引言…', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => ($('turnMenu').hidden ? openTurn(turnBtn) : closeTurn()) },
    el('span', { text: cur ? cur[0] : '轉成' }), svgIcon('<path d="M5.5 8l4.5 4.5L14.5 8"/>'));
  box.append(turnBtn, el('span', { class: 'bb-sep' }));
  for (const [label, title, run, active, cls] of MARKS) {
    const on = active(editor);
    box.append(el('button', { class: `bb${on ? ' on' : ''}${cls ? ` ${cls}` : ''}`, title, 'aria-label': title, 'aria-pressed': on ? 'true' : 'false',
      onclick: () => { if (!run) { linkMode(); return; } run(editor.chain().focus()).run(); renderBubble(); } },
    typeof label === 'string' ? el('span', { text: label }) : label));
  }
  box.hidden = false;
  placeBubble();
}
function openTurn(btn) {
  const menu = $('turnMenu'); menu.textContent = '';
  for (const f of TURN) {
    const on = f[3](editor);
    menu.append(el('button', { role: 'menuitemcheckbox', 'aria-checked': on ? 'true' : 'false', class: on ? 'on' : '',
      onclick: () => { closeTurn(); if (!on) f[2](editor.chain().focus()).run(); setTimeout(renderBubble, 0); } },
    el('span', { text: f[0] }), f[1] ? el('kbd', { text: f[1] }) : null));
  }
  menu.hidden = false;
  const r = btn.getBoundingClientRect();
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${r.bottom + 6 + h <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
  btn.setAttribute('aria-expanded', 'true');
}
for (const id of ['bubble', 'turnMenu']) $(id).addEventListener('mousedown', (e) => { if (!e.target.closest('input')) e.preventDefault(); });
document.addEventListener('mousedown', (e) => {
  if (editor && editor.view.dom.contains(e.target)) { bubble.mouse = true; closeBubble(); return; }
  if (!$('bubble').hidden && !$('bubble').contains(e.target) && !$('turnMenu').contains(e.target)) closeBubble();
});
document.addEventListener('mouseup', () => { if (bubble.mouse) { bubble.mouse = false; setTimeout(renderBubble, 0); } });
page.addEventListener('scroll', () => { if (!$('bubble').hidden) { closeTurn(); placeBubble(); } });
window.addEventListener('resize', () => { if (!$('bubble').hidden) placeBubble(); });
// 鍵盤選字（Shift+方向鍵）停一下才出現；打字把選取蓋掉就收起來
function bubbleOnSelection() {
  if (bubble.mouse || bubble.linking) return;
  if (!bubbleWanted()) { closeBubble(); return; }
  clearTimeout(bubble.timer);
  bubble.timer = setTimeout(renderBubble, $('bubble').hidden ? 250 : 0);
}

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
    const label = `${fmtDate(k)} ${WEEKDAYS[d.getDay()]}${n ? '，有東西' : ''}`;
    grid.append(el('button', { class: cls, title: label, 'aria-label': label, 'data-key': k, tabindex: k === state.calFocus ? '0' : '-1', onclick: () => { closeCalendar(); goTo(k); } }, String(d.getDate())));
  }
}
function focusCalDay(k) {
  const d = fromKey(k);
  state.calFocus = k;
  if (d.getFullYear() !== state.calMonth[0] || d.getMonth() !== state.calMonth[1]) state.calMonth = [d.getFullYear(), d.getMonth()];
  renderCalendar();
  const cell = $('calGrid').querySelector(`[data-key="${k}"]`);
  if (cell) cell.focus();
}
$('calGrid').addEventListener('keydown', (e) => {
  if (e.altKey || e.ctrlKey) return;
  const cur = state.calFocus || state.date;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  let next = null;
  if (step) next = addDays(cur, step);
  else if (e.key === 'PageUp' || e.key === 'PageDown') { const d = fromKey(cur); d.setMonth(d.getMonth() + (e.key === 'PageUp' ? -1 : 1)); next = toKey(d); }
  else if (e.key === 'Home') next = state.today;
  if (!next) return;
  e.preventDefault(); e.stopPropagation();
  focusCalDay(next);
});
function openCalendar(from) {
  closeFormat();
  const btn = from && from.isConnected ? from : $('calBtn');
  const d = fromKey(state.date);
  state.calMonth = [d.getFullYear(), d.getMonth()];
  $('calendar').hidden = false;
  renderCalendar();
  if (btn === $('calBtn')) { $('calendar').style.left = 'auto'; anchor($('calendar'), btn); } else anchorLeft($('calendar'), btn);
  btn.setAttribute('aria-expanded', 'true');
  focusCalDay(state.date);
}
function closeCalendar() {
  $('calendar').hidden = true; $('calBtn').setAttribute('aria-expanded', 'false');
  const older = $('olderBtn'); if (older) older.setAttribute('aria-expanded', 'false');
}
function shiftMonth(n) {
  const d = new Date(state.calMonth[0], state.calMonth[1] + n, 1);
  state.calMonth = [d.getFullYear(), d.getMonth()];
  // 換月後讓鍵盤停點落在這個月：原本那天還在這個月就留著，不然停在 1 號
  const f = fromKey(state.calFocus || state.date);
  if (f.getFullYear() !== d.getFullYear() || f.getMonth() !== d.getMonth()) state.calFocus = toKey(d);
  renderCalendar();
}
$('calBtn').addEventListener('click', () => ($('calendar').hidden ? openCalendar($('calBtn')) : closeCalendar()));
$('calPrev').addEventListener('click', () => shiftMonth(-1));
$('calNext').addEventListener('click', () => shiftMonth(1));
document.addEventListener('mousedown', (e) => {
  if (!$('calendar').hidden && !$('calendar').contains(e.target) && !$('calBtn').contains(e.target) && !e.target.closest('#olderBtn')) closeCalendar();
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
  // 沒打字就是平常的日子清單；有打字，側邊欄換成搜尋結果
  $('sideList').hidden = !!q; box.hidden = !q; $('searchEsc').hidden = !q;
  if (!q) return;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  await flush();
  const results = await dump.search(q);
  if (q !== $('searchInput').value.trim()) return;
  box.textContent = '';
  if (!results.length) { box.append(el('div', { class: 'note', text: `找不到「${q}」。` })); return; }
  // 結果直接是命中的那一整塊：看得到全文，旁邊就能複製，不用先跳到那一天
  let shown = 0;
  for (const r of results.slice(0, 40)) {
    const page = r.date === state.date ? { doc: editor.getJSON() } : await dump.getPage(r.date);
    if (q !== $('searchInput').value.trim()) return;
    const blocks = ((page.doc && page.doc.content) || []).map((n, index) => ({ n, index, text: nodeText(n).trim() }))
      .filter((b) => b.text && b.n.type !== 'timeMark' && words.some((w) => b.text.toLowerCase().includes(w)));
    if (!blocks.length) continue;
    box.append(el('div', { class: 'result-date sticky', text: `${fmtDate(r.date)} ${WEEKDAYS[fromKey(r.date).getDay()]}` }));
    for (const b of blocks.slice(0, 8)) {
      shown++;
      const used = b.n.attrs && b.n.attrs.used;
      box.append(el('div', { class: `hit${used ? ' used' : ''}` },
        el('button', { class: 'hit-text', title: '跳到那一天的這一塊', onclick: () => { closeNarrowSide(); goToBlock(r.date, b.index); } }, highlightAll(b.text, words)),
        el('button', { class: 'hit-copy', title: '複製這一塊（含格式）', 'aria-label': '複製這一塊', onclick: () => copyJson(b.n) }, svgIcon('<rect x="7" y="7" width="9.5" height="9.5" rx="2"/><path d="M13 7V5.5a2 2 0 00-2-2H5.5a2 2 0 00-2 2V11a2 2 0 002 2H7"/>'))));
    }
    if (blocks.length > 8) box.append(el('div', { class: 'kind more', text: `這天還有 ${blocks.length - 8} 塊` }));
  }
  if (!shown) box.append(el('div', { class: 'note', text: `找不到「${q}」。` }));
}
// 整塊都標出命中的字；太長只留前 600 字
function highlightAll(text, words) {
  const frag = document.createDocumentFragment();
  const s = text.length > 600 ? `${text.slice(0, 600)}…` : text;
  const sl = s.toLowerCase();
  let pos = 0;
  while (pos < s.length) {
    let best = -1; let len = 0;
    for (const w of words) { const i = sl.indexOf(w, pos); if (i >= 0 && (best < 0 || i < best)) { best = i; len = w.length; } }
    if (best < 0) { frag.append(s.slice(pos)); break; }
    frag.append(s.slice(pos, best), el('mark', { text: s.slice(best, best + len) }));
    pos = best + len;
  }
  return frag;
}
// 把別天的一塊（JSON）複製到剪貼簿：貼到 Word、Notion 有格式，貼到純文字的地方就是字
function copyJson(json) {
  try {
    const node = editor.schema.nodeFromJSON(json);
    const div = document.createElement('div');
    div.append(DOMSerializer.fromSchema(editor.schema).serializeNode(node));
    const text = nodeText(json).trim();
    // 用 copy 事件塞內容，跟「複製整塊」一樣不需要額外的剪貼簿權限
    const onCopy = (ev) => { ev.preventDefault(); ev.clipboardData.setData('text/html', div.innerHTML); ev.clipboardData.setData('text/plain', text); };
    document.addEventListener('copy', onCopy, { once: true });
    const ok = document.execCommand('copy');
    document.removeEventListener('copy', onCopy);
    if (!ok) throw new Error('瀏覽器不讓複製');
    toast('已複製這一塊', 1500);
  } catch (err) { toast(`沒複製成功（${err.message || err}）`, 4000, true); }
}
// 跳到某一天的第幾塊，捲到中間、閃一下
async function goToBlock(date, index) {
  if (date !== state.date) await goTo(date, null, true);
  const doc = editor.state.doc;
  if (index >= doc.childCount) return;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
  const dom = editor.view.nodeDOM(pos);
  if (!dom || !dom.scrollIntoView) return;
  dom.scrollIntoView({ block: 'center' });
  dom.classList.remove('found'); void dom.offsetWidth; dom.classList.add('found');
  setTimeout(() => dom.classList.remove('found'), 1800);
  editor.chain().focus().setTextSelection(pos + 1).run();
  dom.scrollIntoView({ block: 'center' });
}
const searching = () => document.activeElement === $('searchInput') || !!$('searchInput').value;
function openSearch() {
  closeCalendar(); closeFormat();
  $('settingsPanel').hidden = true; $('keysPanel').hidden = true;
  if (!sideVisible()) setSide(true);
  $('searchInput').focus(); $('searchInput').select();
}
function closeSearch() { $('searchInput').value = ''; runSearch(); focusEditor(); }
$('searchInput').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 150); });
$('searchInput').addEventListener('keydown', (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'ArrowDown' || e.key === 'Enter') { const first = $('searchResults').querySelector('.hit-text'); if (first) { e.preventDefault(); first.focus(); } }
});
$('searchResults').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = [...$('searchResults').querySelectorAll('.hit-text')];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  if (e.key === 'ArrowUp' && i === 0) $('searchInput').focus();
  else (items[i + (e.key === 'ArrowDown' ? 1 : -1)] || items[i]).focus();
});
for (const id of ['settingsPanel', 'keysPanel', 'trashPanel']) {
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
  $('keysPanel').hidden = true;
  showSettings(await dump.getSettings());
  $('settingsPanel').hidden = false;
  $('settingsClose').focus();
}
function closeSettings() { $('settingsPanel').hidden = true; focusEditor(); }
function openKeys() {
  closeCalendar(); closeFormat();
  $('settingsPanel').hidden = true;
  $('keysPanel').hidden = false;
  $('keysClose').focus();
}
function closeKeys() { $('keysPanel').hidden = true; focusEditor(); }
$('keysOpen').addEventListener('click', openKeys);
$('keysClose').addEventListener('click', closeKeys);
async function patchSettings(patch) {
  const r = await dump.setSettings(patch);
  showSettings(r.settings);
  if (!r.ok) toast(r.message);
  return r;
}
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
// 釘在最上層＋窄版（Windows 版由主程序縮視窗、設最上層）
let pinned = false;
async function togglePin() {
  pinned = !!(await dump.pin(!pinned));
  $('pinBtn').setAttribute('aria-pressed', pinned ? 'true' : 'false');
  $('pinBtn').classList.toggle('on', pinned);
  if (pinned) toast('釘住了，會一直浮在最上層。再按一次圖釘回到原本大小', 3000);
}
$('pinBtn').addEventListener('click', togglePin);
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
    else if (!$('settingsPanel').hidden) closeSettings();
    else if (!$('keysPanel').hidden) closeKeys();
    else if (!$('trashPanel').hidden) closeTrash();
    else if (searching()) closeSearch();
    else if (narrowQuery.matches && side.narrowOpen) { setSide(false); focusEditor(); }
    else flush().then(() => dump.hide());
    return;
  }
  if (ctrl && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch(); return; }
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePin(); return; }
  if (ctrl && e.key === ',') { e.preventDefault(); openSettings(); return; }
  if (ctrl && e.key === '\\') { e.preventDefault(); const on = !sideVisible(); setSide(on); if (!on) focusEditor(); return; }
  if (ctrl && e.key === '/') { e.preventDefault(); if ($('keysPanel').hidden) openKeys(); else closeKeys(); return; }
  if (overlayOpen()) return;
  if (ctrl && e.key.toLowerCase() === 't') { e.preventDefault(); goToday(); }
  else if (ctrl && e.key.toLowerCase() === 'g') { e.preventDefault(); $('calendar').hidden ? openCalendar($('calBtn')) : closeCalendar(); }
  else if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); }
  else if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); flush().then(() => toast('已存好（平常會自動存）', 1500)); }
  else if (alt && e.key === 'ArrowLeft') { e.preventDefault(); goTo(addDays(state.date, -1)); }
  else if (alt && e.key === 'ArrowRight') { e.preventDefault(); goTo(addDays(state.date, 1)); }
  else if (alt && e.key === 'PageUp') { e.preventDefault(); goTo(addDays(state.date, -7)); }
  else if (alt && e.key === 'PageDown') { e.preventDefault(); goTo(addDays(state.date, 7)); }
});

/* ---------- 主程序來的訊息 ---------- */
dump.on('go-today', () => { $('settingsPanel').hidden = true; $('keysPanel').hidden = true; $('trashPanel').hidden = true; closeCalendar(); goToday(); });
dump.on('open-settings', openSettings);
dump.on('vault:changed', async () => { state.dirty = false; await refreshCounts(); await load(); await refreshDays(); });
dump.on('flush', () => { Promise.all([flush(), flushTrash()]).then(() => { if (dump.flushed) dump.flushed(); }); });
window.addEventListener('blur', () => { flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('focus', () => {
  const now = toKey(new Date());
  if (now !== state.today) { const wasToday = state.date === state.today; state.today = now; if (wasToday) goTo(now); else { renderWeek(); renderHeading(); } refreshDays(); }
});

/* ---------- 開始 ---------- */
Object.assign(window, { state, goTo, flush, openSearch, openSettings, closeSettings, openCalendar, closeCalendar, runSearch, getEditor: () => editor, placeGrip, grip, openFormat, closeFormat, slash, copyBlock, lastEditAt, openKeys, closeKeys, renderSide, refreshDays, setSide, summarize });
(async function start() {
  state.counts = await dump.counts();
  await load();
  await refreshDays();
})();
