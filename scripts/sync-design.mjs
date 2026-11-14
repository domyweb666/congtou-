// 從 domy-design 複製桌面設計代號到 src/design/。src/design/ 裡的檔不准手改。
//   node scripts/sync-design.mjs           複製
//   node scripts/sync-design.mjs --check   只比對，不一樣就失敗
// domy-design 預設在 E:\domy-design，換位置用環境變數 DOMY_DESIGN 指過去。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.DOMY_DESIGN || 'E:\\domy-design';
// 蔥頭的產品色是「蔥綠」（domy-design 的 themes.scallion）
const files = ['css/domy-desktop.css', 'css/domy-desktop-scallion.css'];
const check = process.argv.includes('--check');

let drift = 0;
for (const rel of files) {
  const from = path.join(source, rel);
  const to = path.join(root, 'src', 'design', path.basename(rel));
  if (!fs.existsSync(from)) { console.error(`[sync-design] 找不到 ${from}`); process.exit(1); }
  const want = fs.readFileSync(from, 'utf8');
  const have = fs.existsSync(to) ? fs.readFileSync(to, 'utf8') : null;
  if (want === have) { console.log(`[sync-design] 一樣 ${path.basename(rel)}`); continue; }
  drift++;
  if (check) { console.error(`[sync-design] 不一樣 ${path.basename(rel)}，跑 npm run design 更新`); continue; }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.writeFileSync(to, want);
  console.log(`[sync-design] 已複製 ${path.basename(rel)}`);
}
if (check && drift) process.exit(1);
