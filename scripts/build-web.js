// 把介面合成一個可以直接開的網頁：npm run web
const fs = require('fs'); const path = require('path');
const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');
let html = r('src/renderer/index.html');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, () => '<meta name="viewport" content="width=device-width, initial-scale=1">\n');
html = html.replace('<title>蔥蔥丟</title>', () => '<title>蔥蔥丟 網頁預覽版</title>');
// 樣式表全部塞進頁面：設計系統代號、產品色、介面樣式，順序照 index.html
let sheets = 0;
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_m, href) => { sheets++; return `<style>\n${r(path.posix.join('src/renderer', href))}\n</style>`; });
if (sheets < 3) throw new Error(`樣式表只找到 ${sheets} 份，index.html 的 <link> 寫法變了`);
html = html.replace('<script src="app.js"></script>', () => `<script>\n${safe(r('web/shim.js'))}\n</script>\n<script>\n${safe(r('src/renderer/app.js'))}\n</script>`);
fs.writeFileSync(path.join(__dirname, '..', 'web', 'index.html'), html);
console.log('web/index.html', html.length);
