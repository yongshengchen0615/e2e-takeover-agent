# E2E Takeover Agent

> 可視化、可人工接管的 Web E2E 測試工具。以 Playwright 執行瀏覽器測試；碰到登入、雙重驗證或其他需要人員介入的步驟時，暫停自動化並讓使用者在**同一個 Chromium 工作階段**操作，完成後再繼續測試。

**專案狀態：v0.1.0 開發中（MVP）**。本儲存庫包含本機測試引擎、瀏覽器即時預覽儀表板、MCP 介面及測試案例。**目前不是直接在 ChatGPT 聊天畫面內操控瀏覽器的遠端服務。**

## 直接在雲端測試管理端（不用 localhost）

已提供不需任何 Browserbase / Render 金鑰的 [GitHub Actions 一鍵遠端 E2E](https://github.com/yongshengchen0615/e2e-takeover-agent/actions/workflows/remote-e2e.yml)：點 **Run workflow**，已預填 Netlify 管理端 `https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test`；用戶端網址可選填。GitHub 雲端 Chromium 會執行唯讀載入測試並提供結果報告，無須本機 localhost。**GitHub Actions 暫不支援登入人工接管及即時畫面**；完整互動雲端瀏覽器仍需部署 Browserbase 服務。見 [完整操作手冊](docs/REMOTE-E2E-QUICKSTART.md)。

## 快速開始

需求：Node.js 20+、圖形桌面、可下載 npm 套件與 Chromium。

```bash
npm install
npx playwright install chromium
npm start
```

於本機開啟 **http://127.0.0.1:4317**。依照畫面輸入測試站 URL 與步驟 JSON，開始測試。遇到登入時，切換到 Playwright 開啟的 Chromium 視窗自行登入，再回儀表板按「登入完成，繼續」。

預設只允許 `localhost` 測試。若要測試你有權限操作的遠端 staging 網站，須自行設定 `E2E_ALLOW_REMOTE=1`。此功能尚未提供破壞性動作審批，**勿直接對正式環境執行未知或具副作用的測試**。

## 核心功能

- 看得見的 Chromium 測試執行過程與即時日誌
- 在密碼／OTP／SSO 流程期間暫停自動化、由使用者人工接管
- 使用同一 `BrowserContext` 繼續測試，避免重新登入
- 執行常見的 UI 操作與斷言；產出本機 JSON 報告
- MCP `stdio` 工具與外掛技能文件（平台安裝相容性尚待驗證）

## 程式碼與文件

- [`src/`](src/)：Playwright 引擎、Web 控制台、MCP 服務
- [`skills/run-e2e/SKILL.md`](skills/run-e2e/SKILL.md)：AI 測試工作流程
- [`tests/`](tests/)：Node.js 自動化測試
- [`config/example.plan.json`](config/example.plan.json)：測試步驟範例
- [`README.zh-TW.md`](README.zh-TW.md)：繁體中文完整使用手冊
- [`TESTING.md`](TESTING.md)：測試範圍與限制
- [`docs/ROADMAP.md`](docs/ROADMAP.md)：版本計畫與驗收條件
- [`SECURITY.md`](SECURITY.md)：安全與登入憑證處理規範

## 驗證

```bash
npm run check
npm test
```

GitHub Actions 僅執行**不需要真實帳號登入的靜態檢查與自動化單元測試**。需要人類輸入登入資訊的互動式 E2E 測試，應在隔離的開發／測試環境執行。

## 貢獻與開發

請優先開 issue 說明需求，再以 PR 提交變更。詳見 [`CONTRIBUTING.md`](CONTRIBUTING.md)。目前尚未聲稱通過真實專案的端對端測試，也未聲稱已完成 ChatGPT 插件發佈／安裝。
