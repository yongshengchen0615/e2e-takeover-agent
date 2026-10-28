# E2E Takeover Agent — v0.2.0（專案化測試設計）

針對 **Web 專案**的可見 Playwright E2E 測試工具。當需要登入、雙重驗證或第三方登入時，交還操控權讓使用者直接操作同一個 Chromium 瀏覽器視窗，完成登入後恢復後續測試。

## 實際功能

- Headed Chromium（看得到游標操作與頁面變化）
- `http://127.0.0.1:4317` 即時儀表板（預覽畫面約每 1.2 秒刷新、逐步日誌）
- 支援 `goto`、`click`、`fill`、`assertVisible`、`assertText`、`assertUrl`、`pauseForLogin`
- 自動偵測網址中的常見 login 路徑、可見密碼欄位及跨網域第三方登入；也可手動點「交還控制權」
- 人工接管期間不擷取預覽截圖，使用者可在 Chromium 視窗操作；按「登入完成，繼續」後檢查離開登入畫面，從原本步驟接續
- 結果輸出到 `artifacts/report.json`；不存 Cookie、不存登入憑證、不擷取登入時的 Trace
- MCP `stdio` 工具與 Agent Plugins `plugin.json`/`mcp.json`/`skills` 封裝

## v0.2.0 新增

- `resumeWhen`：人工接管恢復之前可指定**登入後路徑**及／或**登入後可見元件**，避免只靠離開登入網址就視為成功。若兩者皆指定，必須同時符合。無設定時仍保留原版啟發式行為。
- 儀表板可貼上**完整測試計畫 JSON**（含 baseUrl、steps、resumeWhen），也可沿用原本的步驟陣列。
- `config/memberwebsocket-dev.smoke.json`：Netlify MemberWebsocket 開發入口唯讀冒煙測試，需手動允許遠端測試；**尚未宣稱真實站點測試通過**。
- 專案對應、風險與後續測試矩陣：`docs/MEMBERWEBSOCKET_INTEGRATION.md`。

**注意**：既有的本機控制介面可視化，並不代表 ChatGPT 網頁或手機可以直接接管遠端瀏覽器。

## 安裝（在你自己的桌上型電腦）

需求：Node.js 20+、macOS／Windows／Linux 圖形桌面、可使用 `npm` 下載依賴。

```bash
npm install
npx playwright install chromium
npm start
```

用瀏覽器開啟 `http://127.0.0.1:4317`，填入網站 URL，修改測試步驟 JSON，按「開始測試」。

預設只允許 `http://localhost`、`http://127.0.0.1` 與本機 IPv6 回環位址，避免誤觸正式環境。要測試遠端 staging，必須由你在啟動程式時顯式開啟：

macOS / Linux：
```bash
E2E_ALLOW_REMOTE=1 npm start
```

Windows PowerShell：
```powershell
$env:E2E_ALLOW_REMOTE="1"; npm start
```

**請只對授權測試環境使用。** `click` 可能提交表單或造成真實副作用，本 MVP 尚未實作破壞性操作預先審批；正式生產環境不可直接執行未知步驟。

## 人工接管細節

1. 到登入頁時自動暫停；也可以自己按「交還控制權」。
2. 在**同一個 Playwright 開啟的 Chromium 視窗**親自輸入帳密、OTP 或完成第三方登入。這段期間儀表板不擷取預覽畫面。
3. 返回受測網站後，回到儀表板按「登入完成，繼續」。
4. 程式驗證已離開登入頁及第三方身份提供者；通過後使用相同 `BrowserContext` 執行剩餘測試。不保存含 Cookie 的儲存狀態。

### 目前限制

- 本機可見瀏覽器 **不等於** 在 ChatGPT 聊天視窗內可直接接管的雲端瀏覽器。若要從手機或遠端電腦接管，需另建認證保護的遠端桌面/瀏覽器控制層，這版未包含。
- 此 MVP 適合 Web UI。行動 App 原生畫面、API 專屬測試、全自動案例生成、AI 自動修復尚未完成。
- 複雜 SSO、iframe 登入、非標準頁面路徑可能無法自動偵測。使用者可隨時主動接管；登入驗證是保守啟發式，後續應另外編寫登入成功的斷言。
- 使用者人工登入的 Chromium 視窗仍由 Playwright 程序持有；敏感資訊不提供給模型，但瀏覽器本身與受測網站仍會正常處理登入資料。
- 目前未在你的真實專案環境完成瀏覽器 E2E 安裝與實測；`npm test` 驗證核心模組（以 Mock 取代真實瀏覽器）。

## MCP / GPT Plugin

`plugin.json` 是 Agent Plugins 的可攜 Manifest；`mcp.json` 設定本地 `stdio` MCP server。若在允許本地 MCP 程序的 Agent/桌面環境使用，請先完成 `npm install` 與 Chromium 安裝，然後由支援 local executor 的客戶端啟動此外掛。此 ZIP **不能直接讓 ChatGPT 網頁版控制你的本機電腦**；需要客戶端、權限、MCP 連線與安裝驗證。

暴露工具：`e2e_open_dashboard`、`e2e_start`、`e2e_status`、`e2e_takeover`、`e2e_resume`、`e2e_stop`。若只是要使用儀表板，完全不需連 MCP。

## 安全性

- 僅綁定 `127.0.0.1`，CSRF Token/Origin/Host 檢查，禁止跨來源自動 `goto`。
- `fill` 阻擋常見密碼及 OTP 欄位 selector，但不能保證辨識所有自訂敏感欄位；請一律人工輸入秘密。
- 輸入不會被送給 GPT 做登入；測試報告只保存測試名稱、成功/失敗與耗時。
- 未自動保存 Cookies 與 storage state；憑證始終留在活躍瀏覽器工作階段，關閉瀏覽器後通常會失效。
- 避免在共享電腦或不可信開發環境使用真實帳號。

## 測試

```bash
npm run check
npm test
```

實際 E2E 驗證須完成 Chromium 安裝並連向你自己的測試網站。請勿以此專案單元測試通過，誤認為你的網站 E2E 已測試通過。