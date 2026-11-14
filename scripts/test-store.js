// 垃圾庫讀寫的自動檢查：node scripts/test-store.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-'));
  const s = new Store(dir);
  const d = '2026-11-14';
  assert.deepEqual(s.getPage(d), { doc: null, files: [] });
  await s.savePage(d, { doc: { type: 'doc', content: [] }, text: '', markdown: '', empty: true });
  assert.ok(!fs.existsSync(s.dayDir(d)), '空的一天不該留下資料夾');

  const src = path.join(dir, '第三季 報價(單).pdf'); fs.writeFileSync(src, 'pdf');
  const a1 = (await s.addPath(d, src)).asset; const a2 = (await s.addPath(d, src)).asset;
  assert.equal(a1.rel, 'files/第三季 報價_單_.pdf'); assert.equal(a2.rel, 'files/第三季 報價_單_-2.pdf'); assert.equal(a1.isImage, false);
  assert.ok((await s.addPath(d, dir)).skipped);
  const img = await s.addBuffer(d, '貼上-a:b.png', Buffer.from([1, 2, 3]));
  assert.equal(img.rel, 'files/貼上-a_b.png'); assert.equal(img.isImage, true);
  assert.equal(s.filePath(d, '../../../etc/passwd'), path.join(s.filesDir(d), 'passwd'));

  const doc = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '睡眠鞏固' }] }] };
  await s.savePage(d, { doc, text: '睡眠鞏固\n夜班加工 整理突觸', markdown: '## 睡眠鞏固', empty: false });
  assert.deepEqual(s.counts(), { [d]: 1 });
  assert.equal(s.search('夜班')[0].date, d); assert.deepEqual(s.search('夜班')[0].lines, ['夜班加工 整理突觸']);
  assert.equal(s.search('睡眠 突觸').length, 1); assert.equal(s.search('沒有這個').length, 0);

  const s2 = new Store(dir); // 重開之後資料要還在
  assert.deepEqual(s2.getPage(d).doc, doc); assert.equal(s2.getPage(d).files.length, 3);
  assert.ok(fs.readFileSync(path.join(s.dayDir(d), 'index.md'), 'utf8').includes('## 睡眠鞏固'));
  await s2.savePage(d, { doc: { type: 'doc', content: [] }, text: '', markdown: '', empty: true });
  assert.deepEqual(s2.counts(), {});

  // 0.1 版的舊資料要讀得進來
  const old = '2026-11-13'; fs.mkdirSync(s.dayDir(old), { recursive: true });
  fs.writeFileSync(path.join(s.dayDir(old), 'entries.json'), JSON.stringify({ entries: [{ type: 'text', text: '舊的\n兩行' }, { type: 'link', url: 'https://a.b', title: '標題' }, { type: 'file', file: 'x.pdf', name: 'x.pdf', size: 3 }] }));
  const s3 = new Store(dir);
  assert.equal(s3.getPage(old).doc.content.length, 4); assert.equal(s3.search('標題').length, 1);
  console.log('store 檢查全過');
})().catch((e) => { console.error(e); process.exit(1); });
