// 把介面合成一個可以直接開的網頁：npm run web
const fs = require('fs'); const path = require('path');
const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const safe = (js) => js.replace(/<\/script/gi, '<\\/script');
let html = r('src/renderer/index.html');
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\n/, () => '<meta name="viewport" content="width=device-width, initial-scale=1">\n');
html = html.replace('<title>蔥頭</title>', () => '<title>蔥頭 網頁預覽版</title>');
html = html.replace('<link rel="stylesheet" href="app.css">', () => `<style>\n${r('src/renderer/app.css')}\n</style>`);
html = html.replace('<script src="app.js"></script>', () => `<script>\n${safe(r('web/shim.js'))}\n</script>\n<script>\n${safe(r('src/renderer/app.js'))}\n</script>`);
fs.writeFileSync(path.join(__dirname, '..', 'web', 'index.html'), html);
console.log('web/index.html', html.length);
