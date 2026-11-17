# Mac 版簽章設定

做完這份，GitHub 打包出來的 Mac 版會用你的 Apple 開發者身分簽章、送 Apple 公證，Mac 打開時就不會再擋。全程在 Windows 上做，不需要 Mac。

只要做一次。憑證五年後到期，到時候再做一次。

## 1. 產生憑證申請檔

在專案資料夾開 Git Bash，跑：

```bash
bash scripts/mac-cert.sh csr
```

會在 `C:\Users\fcharlie\congtou-signing\` 產生兩個檔：

- `developer-id.key`：私鑰。留在這台電腦，**不要傳給任何人**，也不要放進專案資料夾
- `developer-id.certSigningRequest`：等一下要上傳給 Apple

## 2. 到 Apple 網站換憑證

1. 打開 https://developer.apple.com/account/resources/certificates/list ，登入你的開發者帳號
2. 按「Certificates」旁邊的 ＋
3. 選 **Developer ID Application**（不是 Apple Distribution，也不是 Developer ID Installer），按 Continue
4. Profile Type 選 **G2 Sub-CA**
5. 上傳第 1 步的 `developer-id.certSigningRequest`，按 Continue
6. 按 Download，拿到一個 `developerID_application.cer`

只有帳號持有人（Account Holder）能建 Developer ID 憑證。選項是灰的，就是登入的身分不是持有人。

## 3. 準備另外兩樣東西

- **Team ID**：https://developer.apple.com/account 往下捲，「Membership details」裡 10 碼的英數字
- **App 專用密碼**：到 https://account.apple.com ，登入後找「App 專用密碼」，產生一組，名字打「蔥蔥丟公證」。它長得像 `abcd-efgh-ijkl-mnop`，只會顯示一次，先複製起來

## 4. 存進 GitHub

回到 Git Bash，把第 2 步下載的 `.cer` 路徑接在後面：

```bash
bash scripts/mac-cert.sh secrets ~/Downloads/developerID_application.cer
```

它會依序問你：

1. 幫 `.p12` 設一組密碼：自己編一組，打完就不用記，它會存進 GitHub
2. Apple 帳號的 email
3. Team ID
4. App 專用密碼

最後會列出五個 Secrets，都在就完成了。密碼打的時候畫面不會顯示，這是正常的。

## 5. 跟 Claude 說「Secrets 放好了」

我會重跑打包，確認簽章和公證都過，再換掉 0.5.0 Release 上的兩個 dmg。

公證第一次可能要等 5 到 30 分鐘，Apple 那邊在掃檔案。
