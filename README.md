<p align="center"><img src="docs/img/icon.png" width="120" alt="蔥蔥丟的圖示：一顆蔥頭形狀的垃圾桶"></p>

# 蔥蔥丟

寫作時的剪下暫存區：每天一頁，把剪掉的段落先丟進來，幾天內要用再撈回去。（原名 Daily Dump、蔥頭）

改稿時剪掉一段，又怕之後用得到，就先丟進今天那一頁。寫到一半需要時，再找出來貼回去。超過三天的頁面大多不會再打開，所以它長得很簡單：打開就是今天這一頁，游標已經在最後面等你貼。

![主畫面：頂列一顆日期鈕，下面就是今天這一頁](docs/img/main.png)

## 下載

目前版本 0.6.0。點檔名直接下載：

| 你的電腦 | 下載 |
|---|---|
| Windows | [congcongdiu-0.6.0-win-x64-setup.exe](https://github.com/domyweb666/congtou-/releases/download/v0.6.0/congcongdiu-0.6.0-win-x64-setup.exe)（安裝檔，122 MB） |
| Mac，M 系列晶片 | [congcongdiu-0.6.0-mac-arm64.dmg](https://github.com/domyweb666/congtou-/releases/download/v0.6.0/congcongdiu-0.6.0-mac-arm64.dmg)（121 MB） |
| Mac，Intel | [congcongdiu-0.6.0-mac-x64.dmg](https://github.com/domyweb666/congtou-/releases/download/v0.6.0/congcongdiu-0.6.0-mac-x64.dmg)（128 MB） |

第一次打開被系統擋下來怎麼辦，看下面的[安裝](#安裝)。


## 怎麼用

### 丟進來

每一天是一頁文件，直接在頁面裡打字和貼上。內容自動存，不用按存檔，頂列右邊會顯示「已儲存」。

- 貼上會保留格式：標題、項目符號、粗體、表格。貼 Markdown 純文字也會變成格式。
- Ctrl+V 貼截圖或從檔案總管複製的檔案；也可以把檔案拖進頁面。圖片直接顯示，其他檔案顯示成一塊，點兩下打開（或選到之後按 Enter）。
- 框起一段字，上方會跳出格式列：把那一塊轉成標題或清單，或加粗體、斜體、刪除線、程式碼、連結（Ctrl+K）。
- 只貼一個網址會自動換成網頁標題。
- 今天這一頁隔 10 分鐘以上再丟東西，會自動加一條時間線，看得出哪些是同一批丟的。
- 全域快捷鍵預設 Ctrl+Alt+D：在任何程式裡叫出或收起視窗（可在設定裡改）。丟完按 Esc 就收起來。

### 放圖片和檔案

在頁面裡打 `/`，選單第一項就是「圖片或檔案」，所以打 `/` 再按 Enter 就會開選檔視窗。頂列的迴紋針、Ctrl+O、拖放、貼上也都可以。

![打 / 叫出的選單，第一項是圖片或檔案，下面是格式](docs/img/slash.png)

同一個選單裡還有格式：內文、三種標題、項目符號、編號清單、待辦勾選、引言、程式碼區塊、分隔線、粗體、斜體、刪除線、插入現在時間。打 `/` 之後繼續打字可以篩選。

習慣 Markdown 的話直接打也行：`# 空格` 變標題、`- 空格` 變項目符號、`1. 空格` 變編號、`[ ] 空格` 變待辦、`> 空格` 變引言。

### 撈回去

滑鼠移到某一塊，左邊會出現三顆小按鈕：「用過了」、「複製整塊」和抓手。不想碰滑鼠就按 Ctrl+Shift+C，會複製游標所在的那一整塊，格式一起帶走。

撈回稿子之後，按勾勾（或 Ctrl+Shift+U）把那一塊標成「用過了」，它會變灰、劃線，過幾天回來看也分得出哪些已經放回稿子。複製整塊時，提示旁邊也有一顆「標成用過了」。再按一次就取消。

抓手可以拖曳搬動，放開會落在綠線的位置。Alt+↑、Alt+↓ 也能搬。

每一塊的右邊有一個淡淡的編號，從上往下數。空白段落和時間線不算。視窗很窄時編號會收起來。

![拖曳搬動一塊時，綠線標出放開後會落在哪裡](docs/img/move.png)

### 找以前丟的

Ctrl+F 會搜尋所有日子，多個字用空格分開。結果直接列出命中的那一整塊，滑鼠移上去右邊有一顆複製，不用先跳到那一天；點文字會跳到那一天的那一塊。

![搜尋面板：找遍所有日子，命中的字會標出來](docs/img/search.png)

頂列中間是這一週（週一到週日），點哪天就跳到哪天；正在看的那天是綠色，今天前面有一個點，沒丟東西的日子字比較淡。兩邊的箭頭換上一週、下一週。右邊「今天」回到今天，旁邊的小箭頭開月曆。

### 刪掉的救得回來

整塊刪掉的東西會先收進左下角的「最近刪除」，留 30 天。按「放回去」，它會回到原本那一天的最後面。刪掉後馬上按 Ctrl+Z 救回來的，不會收進去。

### 設定

右上角「⋯」裡有格式、複製這一塊、快捷鍵一覽、設定。

![設定：垃圾庫位置、全域快捷鍵、關閉時留在系統匣、開機啟動](docs/img/settings.png)

- 關閉視窗預設會留在系統匣；要真的結束，對系統匣圖示按右鍵選「結束」。
- 開機啟動預設是關的，而且要用打包好的版本才會生效。

### 視窗可以很窄

最小寬度 600，再小頂列就排不下；要跟稿子並排就用下面的圖釘。

按頂列的圖釘（或 Ctrl+Shift+P），視窗會縮成一條貼在螢幕右邊，而且一直浮在最上層，寫稿時剪下、丟過來、撈回去都不用切換視窗。再按一次回到原本的大小和位置。

<img src="docs/img/narrow.png" width="300" alt="視窗縮到很窄時的樣子">

## 快捷鍵

在 app 裡按 Ctrl+/ 可以看同一張表。

| 按鍵 | 做什麼 |
|---|---|
| Ctrl+Alt+D | 在任何程式裡叫出或收起視窗（可改） |
| Ctrl+V | 貼上文字、網址、截圖、檔案 |
| Ctrl+Shift+V | 貼成純文字 |
| Ctrl+O | 選檔案放進這一頁 |
| `/` | 叫出選單：放圖片或檔案、換格式 |
| Ctrl+Shift+C | 複製游標所在的整塊 |
| Ctrl+Shift+U | 把這一塊標成「用過了」，再按一次取消 |
| Enter | 選到檔案或圖片時打開它 |
| Alt+↑、Alt+↓ | 把這一塊往上、往下搬 |
| Alt+T | 插入現在時間 |
| Ctrl+F | 搜尋所有日子 |
| Alt+←、Alt+→ | 前一天、後一天 |
| Alt+PageUp、Alt+PageDown | 上一週、下一週 |
| Ctrl+Shift+P | 釘在最上層＋縮成窄條，再按一次還原 |
| Ctrl+T | 回到今天 |
| Ctrl+G | 月曆（方向鍵選日子，PageUp、PageDown 換月） |
| Ctrl+, | 設定 |
| Ctrl+/ | 快捷鍵一覽 |
| Esc | 關掉面板；沒有面板時收起視窗 |

## 資料放哪

預設在「文件\蔥蔥丟」。以前用過舊版的話，「文件\DailyDump」或「文件\蔥頭」還在就接著用，不會搬也不會改名。可在設定裡換位置。

```
蔥蔥丟/
  2026/
    2026-11-14/
      page.json      編輯器的正本
      index.md       可直接讀的 Markdown 副本，每次變動自動重寫
      files/         丟進來的檔案（複製一份）
```

`index.md` 是純文字，用任何編輯器都打得開，哪天不用蔥蔥丟了資料也還讀得到。

從頁面上刪掉圖片或檔案時，`files` 裡的那份不會跟著刪。換垃圾庫位置不會搬舊資料，要搬請自己把整個資料夾移過去。

## 安裝

下載連結在最上面的[下載](#下載)，所有版本在 [Releases](https://github.com/domyweb666/congtou-/releases)。

### Windows

下載 `congcongdiu-版號-win-x64-setup.exe`，執行後照畫面按下一步。裝在自己的使用者資料夾，不用系統管理員權限；裝完桌面和開始功能表會有「蔥蔥丟」。要移除就到「設定 → 應用程式」裡解除安裝，垃圾庫裡的資料不會被刪。

安裝檔沒有程式碼簽章，Windows 可能跳出「Windows 已保護您的電腦」，按「其他資訊」再按「仍要執行」。

自己打包：

```
npm install
npm run pack:win
```

安裝檔會在 `dist/`，旁邊的 `dist/win-unpacked/` 是不用安裝、直接執行的版本。

### Mac

下載對應晶片的 `.dmg`，打開後把「蔥蔥丟」拖進「應用程式」：

- `congcongdiu-版號-mac-arm64.dmg`：M 系列晶片的 Mac
- `congcongdiu-版號-mac-x64.dmg`：Intel 的 Mac

Mac 版要在 Mac 上打包。這個 repo 有一支 GitHub Actions 幫忙做：到 Actions 頁籤選「打包」，按 Run workflow，跑完在那一次執行的頁面最下面下載。自己有 Mac 的話，直接跑 `npm install` 和 `npm run pack:mac` 也可以（沒有憑證時要加 `-c.mac.identity=- -c.mac.hardenedRuntime=false -c.mac.notarize=false` 改回本機簽章）。

從 0.6.0 起，Mac 版用 Developer ID 簽章並通過 Apple 公證，打開 `.dmg`、把蔥蔥丟拖進「應用程式」就能直接用，macOS 不會再擋。簽章用的憑證和金鑰放在 GitHub 的 Secrets，設定方法見 [Mac簽章設定.md](Mac簽章設定.md)。

0.5.0 以前的 Mac 版沒有簽章，第一次打開要對 `蔥蔥丟.app` 按右鍵選「打開」。

Mac 版目前只確認打包得出來，沒有在 Mac 上實際用過。系統匣、全域快捷鍵、開機啟動在 Mac 上的行為還沒驗。

## 開發

```
npm install
npm start        # 打包介面後執行
npm test         # 儲存層檢查
npm run web      # 產生網頁版，並更新 docs/index.html（GitHub Pages 用）
npm run icons    # 從 assets/icon.svg 重新產生 icon.png、tray.png、icon.ico、icon.icns
npm run pack:win # 做 Windows 安裝檔到 dist/
npm run pack:mac # 做 Mac 的 dmg 到 dist/（要在 Mac 上跑）
```

整個 app 跑一輪並截圖（本頁的附圖就是這樣拍的，用的是暫存資料夾，不會碰你的垃圾庫）：

```
npx electron scripts/smoke.js
```

截圖會存到 `shots/`。

### 檔案在哪

```
src/
  main.js              主程序：視窗、系統匣、全域快捷鍵、選檔、設定
  preload.js           主程序與頁面之間的橋
  store.js             讀寫垃圾庫（page.json、index.md、files）
  renderer/
    index.html         頁面骨架
    app.src.js         介面程式（Tiptap 編輯器）；打包成 app.js
    app.css            介面樣式
    theme.css          產品色「蔥綠」
  design/
    domy-desktop.css   借來的設計代號
assets/                圖示（icon.svg 是來源，其他由 npm run icons 產生）
scripts/               測試、冒煙測試、網頁版、圖示
web/                   網頁預覽版用的替身（用瀏覽器儲存空間代替資料夾）
docs/                  GitHub Pages 的網頁預覽版，還有這一頁的附圖
.uiux-win/             設計紀錄：核心動作卡、審查紀錄、閘門紀錄
electron-builder.yml   安裝檔的打包設定
```

## 介面的規矩

介面借用 Domy 桌面設計系統的代號：`src/design/domy-desktop.css` 是從 `E:\domy-design` 複製來的一份，不要手改。`src/renderer/app.css` 裡的顏色、字級、間距、圓角、陰影、動畫時間都只寫代號；真的只用一次的值，在那一行寫「例外:原因」。產品色蔥綠是蔥蔥丟自己的，放在 `src/renderer/theme.css`，不放回 domy-design。
