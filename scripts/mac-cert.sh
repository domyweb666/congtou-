#!/usr/bin/env bash
# Mac 簽章憑證小工具（在 Windows 的 Git Bash 就能跑，不需要 Mac）
#
#   bash scripts/mac-cert.sh csr          第一步：產生私鑰和憑證申請檔（CSR），拿去 Apple 網站換憑證
#   bash scripts/mac-cert.sh secrets 檔案.cer   第二步：把 Apple 給的 .cer 包成 .p12，連同帳號資料存進 GitHub Secrets
#
# 私鑰和 .p12 放在專案外面的 ~/congtou-signing，不會進 git。密碼都由你自己打，不會印在畫面上。
set -euo pipefail
DIR="$HOME/congtou-signing"
REPO="domyweb666/congtou-"
mkdir -p "$DIR"

case "${1:-}" in
  csr)
    if [ -f "$DIR/developer-id.key" ]; then
      echo "[mac-cert] $DIR/developer-id.key 已經存在，沿用它，不重新產生" >&2
    else
      openssl genrsa -out "$DIR/developer-id.key" 2048
    fi
    # MSYS_NO_PATHCONV：Git Bash 會把 /CN=... 當成路徑亂改，關掉它
    MSYS_NO_PATHCONV=1 openssl req -new -key "$DIR/developer-id.key" -out "$DIR/developer-id.certSigningRequest" -subj "/CN=Congcongdiu Developer ID/C=TW"
    echo
    echo "好了。把這個檔案上傳到 Apple 網站："
    echo "  $DIR/developer-id.certSigningRequest"
    ;;
  secrets)
    CER="${2:-}"
    [ -f "$CER" ] || { echo "[mac-cert] 找不到 .cer 檔：$CER" >&2; exit 1; }
    [ -f "$DIR/developer-id.key" ] || { echo "[mac-cert] 找不到私鑰，要先跑 csr 那一步" >&2; exit 1; }
    openssl x509 -inform DER -in "$CER" -out "$DIR/developer-id.pem" 2>/dev/null || cp "$CER" "$DIR/developer-id.pem"
    echo "這張憑證是："
    openssl x509 -in "$DIR/developer-id.pem" -noout -subject
    echo
    read -r -s -p "幫 .p12 設一組密碼（打字不會顯示）：" P12PASS; echo
    # 用 3DES 加密，Mac 的鑰匙圈才讀得進去（OpenSSL 3 預設的 AES 舊版 macOS 不認）
    openssl pkcs12 -export -inkey "$DIR/developer-id.key" -in "$DIR/developer-id.pem" -out "$DIR/developer-id.p12" \
      -name "Developer ID Application" -passout "pass:$P12PASS" -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1
    base64 -w0 "$DIR/developer-id.p12" | gh secret set MAC_CERT_P12_BASE64 -R "$REPO"
    printf '%s' "$P12PASS" | gh secret set MAC_CERT_PASSWORD -R "$REPO"
    unset P12PASS
    read -r -p "Apple 帳號的 email：" AID
    printf '%s' "$AID" | gh secret set APPLE_ID -R "$REPO"
    read -r -p "Team ID（10 碼英數字）：" TID
    printf '%s' "$TID" | gh secret set APPLE_TEAM_ID -R "$REPO"
    read -r -s -p "App 專用密碼（xxxx-xxxx-xxxx-xxxx，打字不會顯示）：" ASP; echo
    printf '%s' "$ASP" | gh secret set APPLE_APP_SPECIFIC_PASSWORD -R "$REPO"
    unset ASP
    echo
    echo "五個 Secrets 都存好了："
    gh secret list -R "$REPO"
    ;;
  reuse)
    # 沿用別的專案做好的 .p12（例如 ~/topoi-signing），不用再去 Apple 網站換憑證
    SRC="${2:-$HOME/topoi-signing}"
    P12="$SRC/apple-cert.p12"; PASSFILE="$SRC/p12-password.txt"
    [ -f "$P12" ] && [ -f "$PASSFILE" ] || { echo "[mac-cert] $SRC 裡要有 apple-cert.p12 和 p12-password.txt" >&2; exit 1; }
    # Windows 版 openssl 看不懂 Git Bash 的 /c/Users/... 路徑，要換成 C:/Users/...
    winpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
    PASSARG="file:$(winpath "$PASSFILE")"
    SUBJ=$(openssl pkcs12 -in "$P12" -nokeys -passin "$PASSARG" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null \
      || openssl pkcs12 -legacy -in "$P12" -nokeys -passin "$PASSARG" 2>/dev/null | openssl x509 -noout -subject 2>/dev/null || true)
    case "$SUBJ" in
      *"Developer ID Application"*) echo "憑證：${SUBJ#subject=}" ;;
      *) echo "[mac-cert] 這個 .p12 打不開，或不是 Developer ID Application 憑證：$SUBJ" >&2; exit 1 ;;
    esac
    TID=$(printf '%s' "$SUBJ" | sed -n 's/.*OU=\([A-Z0-9]\{10\}\).*/\1/p')
    base64 -w0 "$P12" | gh secret set MAC_CERT_P12_BASE64 -R "$REPO"
    tr -d '\r\n' < "$PASSFILE" | gh secret set MAC_CERT_PASSWORD -R "$REPO"
    printf '%s' "$TID" | gh secret set APPLE_TEAM_ID -R "$REPO"
    echo "憑證、憑證密碼、Team ID（$TID）已存進 GitHub。"
    echo
    read -r -p "Apple 帳號的 email：" AID
    printf '%s' "$AID" | gh secret set APPLE_ID -R "$REPO"
    echo "App 專用密碼：topoi 用的那組還記得就打那組；忘了就到 https://account.apple.com 產生一組新的"
    read -r -s -p "App 專用密碼（xxxx-xxxx-xxxx-xxxx，打字不會顯示）：" ASP; echo
    printf '%s' "$ASP" | gh secret set APPLE_APP_SPECIFIC_PASSWORD -R "$REPO"
    unset ASP
    echo
    echo "五個 Secrets 都存好了："
    gh secret list -R "$REPO"
    ;;
  apikey)
    # 公證改用 App Store Connect 的 API 金鑰（.p8），不用 App 專用密碼。
    # 預設用 VoiceType 那時建的團隊金鑰 github-ci；Key ID、Issuer ID 是識別碼，不是秘密。
    P8="${2:-$HOME/voicetype-signing/AuthKey_95S932UJWS.p8}"
    KID="${3:-95S932UJWS}"
    ISS="${4:-f692c415-2c9a-47cc-a775-bc68509e3511}"
    [ -f "$P8" ] || { echo "[mac-cert] 找不到金鑰檔：$P8" >&2; exit 1; }
    grep -q "BEGIN PRIVATE KEY" "$P8" || { echo "[mac-cert] $P8 看起來不是 .p8 金鑰" >&2; exit 1; }
    base64 -w0 "$P8" | gh secret set MAC_API_KEY_P8_BASE64 -R "$REPO"
    printf '%s' "$KID" | gh secret set MAC_API_KEY_ID -R "$REPO"
    printf '%s' "$ISS" | gh secret set MAC_API_ISSUER -R "$REPO"
    echo
    echo "API 金鑰（$KID）存好了，之後公證都用它。"
    ;;
  *)
    sed -n '2,8p' "$0"
    ;;
esac
