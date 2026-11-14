// 在虛擬螢幕上把整個 app 跑一輪並截圖：xvfb-run electron --no-sandbox scripts/smoke.js
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs'); const os = require('os'); const path = require('path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-smoke-'));
process.env.DAILY_DUMP_USERDATA = path.join(tmp, 'user');
app.setPath('documents', path.join(tmp, 'docs'));
const errors = [];
require('../src/main.js');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  await wait(1800);
  const win = BrowserWindow.getAllWindows()[0];
  // 0. 真的打字：「# 」要變標題，「- 」要變項目符號
  win.focus(); win.webContents.focus();
  for (const t of ['# ', '今天的大標題', '\n', '- ', '第一個項目', '\n', '第二個項目']) {
    if (t === '\n') { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' }); }
    else await win.webContents.insertText(t);
    await wait(120);
  }
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' }); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
  await wait(200);
  win.webContents.on('console-message', (e) => { if (e.level === 'error' || e.level === 'warning') errors.push(e.message); });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => { await wait(400); fs.writeFileSync(path.join(__dirname, '..', 'shots', name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  const png = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray.png')).resize({ width: 96 }).toPNG();
  const pdf = path.join(tmp, '第三季報價單.pdf'); fs.writeFileSync(pdf, Buffer.alloc(234567));
  await js(`(async()=>{
    const ed = getEditor(); const v = ed.view;
    // 1. 直接打字，用「# 」「- 」變格式
    // 2. 從網頁複製的內容（帶格式）
    ed.commands.focus('end');
    v.pasteHTML('<h2>跟現實互動的機制</h2><p>我會先用三個問題篩選，<strong>三題都過</strong>才放進來：</p><ol><li><strong>現實那個動作本身就紓壓嗎？</strong> 牠只負責給回饋。</li><li>跟果凍的物理對得上嗎？</li></ol><ul><li><strong>吹一口氣</strong>：對著手機長長吐氣。</li></ul>');
    // 3. 貼上 Markdown 純文字
    ed.commands.focus('end');
    const md = new DataTransfer(); md.setData('text/plain', '### 貼上的 Markdown\\n\\n- 第一點\\n- 第二點有 **粗體**\\n\\n> 一句引言\\n\\n- [ ] 還沒做\\n- [x] 做完了');
    v.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: md, bubbles: true, cancelable: true }));
    ed.commands.focus('end');
    // 4. 截圖與檔案
    await insertFiles([new File([new Uint8Array(${JSON.stringify([...png])})], 'image.png', { type: 'image/png' })]);
    const r = await dump.addPaths(state.date, [${JSON.stringify(pdf)}]);
    ed.chain().focus('end').insertContent(r.assets.map(a => ({ type: 'fileChip', attrs: { rel: a.rel, name: a.name, size: a.size } }))).run();
    // 5. 只貼一個網址
    ed.commands.focus('end');
    const dt = new DataTransfer(); dt.setData('text/plain', 'https://example.com/');
    v.dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  })()`);
  await wait(3000);
  await js('flush()'); await wait(300);
  console.log('types', await js('getEditor().getJSON().content.map(n=>n.type+(n.attrs&&n.attrs.level?n.attrs.level:"")).join(",")'));
  console.log('link text', await js(`[...document.querySelectorAll('.doc a')].map(a=>a.textContent).join('|')`));
  await js('document.getElementById("page").scrollTop=0'); await shot('1-top');
  await js('document.getElementById("page").scrollTop=430'); await shot('2-middle');
  const day = fs.readdirSync(path.join(tmp, 'docs', '蔥頭'))[0];
  const dayDir = path.join(tmp, 'docs', '蔥頭', day, fs.readdirSync(path.join(tmp, 'docs', '蔥頭', day))[0]);
  console.log('files', fs.readdirSync(dayDir, { recursive: true }).join(', '));
  console.log('--- index.md ---\n' + fs.readFileSync(path.join(dayDir, 'index.md'), 'utf8'));
  const saved = fs.readFileSync(path.join(dayDir, 'page.json'), 'utf8');
  console.log('image stored as rel', /"src":"files\//.test(saved), 'no file url leak', !saved.includes('file://'));
  // 換一天再回來：內容與圖片要還在，而且不能被 Ctrl+Z 帶到別天
  await js('goTo("2026-01-01")'); await wait(500);
  console.log('other day empty', await js('getEditor().isEmpty'), 'undo depth', await js('getEditor().can().undo()'));
  await shot('3-empty-day');
  await js('goTo(state.today)'); await wait(600);
  console.log('back: blocks', await js('getEditor().getJSON().content.length'), 'img ok', await js(`(()=>{const i=document.querySelector('.doc img');return !!i&&i.naturalWidth>0})()`));
  await js(`openSearch(); document.getElementById('searchInput').value='果凍 回饋'; runSearch()`); await wait(500); await shot('4-search');
  console.log('search days', await js(`document.querySelectorAll('.result').length`), await js(`document.querySelector('.result .snippet')?.textContent`));
  await js(`document.querySelector('.result').click()`); await wait(700);
  console.log('found selection', JSON.stringify(await js('String(window.getSelection())')));
  await js('openSettings()'); await shot('5-settings'); await js('closeSettings()');
  win.setSize(360, 560); await wait(300); await js('document.getElementById("page").scrollTop=0'); await shot('6-narrow');
  // 打「/」：選單第一項要是「圖片或檔案」
  win.setSize(640, 760); await wait(300);
  await js(`(()=>{const ed=getEditor(); ed.commands.focus('end'); ed.commands.insertContent('/');})()`); await wait(300); await shot('7-slash');
  console.log('slash first', await js(`document.querySelector('#slashMenu button span')?.textContent`));
  // 拖曳搬動一塊：落點那條線要看得見
  await js(`(()=>{const ed=getEditor(); const v=ed.view; document.getElementById('page').scrollTop=0;
    const blocks=[...v.dom.children]; const r=blocks[3].getBoundingClientRect(); placeGrip(blocks[1].getBoundingClientRect().top+4);
    const sel=v.state.selection.constructor; const pos=v.posAtDOM(blocks[1],0)-1;
    v.dragging={slice:v.state.doc.slice(pos, pos+v.state.doc.nodeAt(pos).nodeSize), move:true};
    v.dom.dispatchEvent(new DragEvent('dragover',{clientX:r.left+20, clientY:r.top+1, bubbles:true, cancelable:true}));})()`);
  await shot('9-dropline');
  console.log('drop line', await js(`(()=>{const d=document.querySelector('.drop-line'); if(!d) return 'none'; const r=d.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height)+' '+getComputedStyle(d).backgroundColor})()`));
  await js('getEditor().view.dragging=null');
  await js('goTo("2026-01-01")'); await wait(500); await shot('8-other-day');
  console.log('errors', JSON.stringify(errors));
  app.exit(0);
});
