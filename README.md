# 蔥頭

寫作時的剪下暫存區：每天一頁，把剪掉的段落先丟進來，幾天內要用再撈回去。（原名 Daily Dump）

## 用法

每一天是一頁文件，直接在頁面裡打字和貼上。

- 貼上會保留格式：標題、項目符號、粗體、表格。貼 Markdown 純文字也會變成格式。
- 打字時 `# 空格` 變標題、`- 空格` 變項目符號、`1. 空格` 變編號、`[ ] 空格` 變待辦、`> 空格` 變引言。
- Ctrl+V 貼截圖或從檔案總管複製的檔案；也可以把檔案拖進頁面。圖片直接顯示，其他檔案顯示成一塊，點兩下打開。
- 只貼一個網址會自動換成網頁標題。
- 打 `/` 叫出格式選單。滑鼠移到某一塊，左邊會出現「複製整塊」和抓手（拖曳搬動，Alt+↑↓ 也行）。
- Ctrl+Shift+C 複製游標所在的整塊，不用碰滑鼠。選到檔案或圖片時按 Enter 打開。
- Ctrl+/ 看全部快捷鍵。週條可以用左右鍵換日子，月曆用方向鍵選日子。
- 今天這一頁隔 10 分鐘以上再丟東西，會自動加一條時間線。
- 全域快捷鍵預設 Ctrl+Alt+D：在任何程式裡叫出或收起視窗（可在設定裡改）。
- 關閉視窗會留在系統匣；要真的結束，對系統匣圖示按右鍵選「結束」。
- 內容自動存，不用按存檔。

## 資料放哪

預設在「文件\蔥頭」（已有舊的「文件\DailyDump」就接著用），可在設定裡換位置：

```
蔥頭/
  2026/
    2026-11-14/
      page.json      編輯器的正本
      index.md       可直接讀的 Markdown 副本，每次變動自動重寫
      files/         丟進來的檔案（複製一份）
```

從頁面上刪掉圖片或檔案時，files 裡的那份不會跟著刪。

## 開發

```
npm install
npm start        # 打包介面後執行
npm test         # 儲存層檢查
npm run web      # 產生網頁版，並更新 docs/index.html（GitHub Pages 用）
npm run pack     # 打包 Windows 版到 dist/
npm run design   # 從 E:\domy-design 複製設計代號到 src/design/（design:check 只比對）
```

## 介面的規矩

介面用 Domy 桌面設計系統的代號（`src/design/domy-desktop.css`，從 domy-design 複製來的，不要手改）。`src/renderer/app.css` 裡的顏色、字級、間距、圓角、陰影、動畫時間都只寫代號；真的只用一次的值，在那一行寫「例外:原因」。產品色蔥綠是 domy-design 的 `themes.scallion`，同樣複製到 `src/design/domy-desktop-scallion.css`。
