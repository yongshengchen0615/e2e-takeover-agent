# 不用 localhost，直接在 GitHub 測試遠端網站（可立即使用）

## 進入測試

1. 開啟 [Remote E2E — 直接測試管理端／用戶端](https://github.com/yongshengchen0615/e2e-takeover-agent/actions/workflows/remote-e2e.yml)。
2. 按右側 **Run workflow（執行工作流程）**，Branch 選 **main**。
3. 管理端網址已預填：`https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test`。
4. 如果還沒有用戶端網址，可先留空。將來可輸入一個或多個 HTTPS 用戶端網址（最多 8 個）。
5. 按綠色 **Run workflow**。點最新產生的工作流程，查看 **「真實 HTTPS 管理端 Chromium 冒煙測試」** 的每個步驟。
6. 執行完成後，在同一個工作流程查看 **Summary** 的測試表格，以及 **Artifacts → remote-e2e-report-...** 的 JSON 結果。

這個流程在 **GitHub 的雲端 Ubuntu + Chromium** 執行，**不用 localhost、不用在電腦安裝程式，也不需要 `E2E_ALLOW_REMOTE=1`、Render 或 Browserbase API Key**。

## 做到什麼、做不到什麼

- 測試管理端指定 HTTPS 網址，保留 `/admin/?business=test`，以桌面 1440×900 模擬。
- 用戶端多網址支援逐一測試，預設手機 390×844，各自獨立瀏覽器 context。
- 檢查 HTTP 回應與 `body` 可見；如有跨網域導向、登入路徑或密碼欄位，結果明確標為 **login_required**，不會假裝已登入。
- 不會填入密碼、OTP、按表單提交或刪除資料，預設不保存截圖。可選擇保存公開頁面截圖；請注意 GitHub 儲存庫是公開的，截圖 Artifact 可能暴露畫面內容，不要用含個資的網站開啟截圖。
- **GitHub Actions 不提供人工登入接管，也沒有同步即時瀏覽器畫面**，只有執行紀錄與事後報告。此能力另由 PR #3 的 Browserbase 雲端控制台提供，仍需相關服務憑證與正式部署。
- 真實網站可能要求授權登入，或阻擋 CI 雲端 IP；此時狀態可能是 login_required / failed，不能判定業務系統故障，請依報告分析。
- 測試公開網站前，請確保受測網址是你擁有或獲授權的環境。

## 維護

程式：`scripts/remote-smoke.mjs`。不依賴仍在 PR #2/#3 的進階 Cloud MCP 實作。單元測試：`node --test tests/remote-smoke.test.mjs`。GitHub Workflow：`.github/workflows/remote-e2e.yml`。

安全限制：workflow 的 GITHUB_TOKEN 僅 contents:read；不使用任何儲存庫秘密、停用預設截圖、拒絕 http/localhost/字面 IP。這是 **GitHub-hosted 遠端 E2E 冒煙測試**，不是完全多租戶的網頁 SaaS 測試服務。
