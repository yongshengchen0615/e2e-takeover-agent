# E2E Takeover Agent — v0.2.0

針對 **Web 專案**的可見 Playwright E2E 測試工具。當需要登入、雙重驗證或第三方登入時，交還操控權讓使用者直接操作同一個 Chromium 瀏覽器視窗，完成登入後恢復後續測試。

## 實際功能

- Headed Chromium（看得到游標操作與頁面變化）
- `http://127.0.0.1:4317` 即時儀表板（預覽畫面約每 1.2 秒刷新、逐步日誌）
- 支援 `goto`、`click`、`fill`、`assertVisible`、`assertText`、`assertUrl`、`pauseForLogin`
- 自動偵測網址中的常見 login 路徑、可見密碼欄位及跨網域第三方登入；也可手動點「交還控制權」
- 人工接管期間不擷取預覽截圖，使用者可在 Chromium 視窗操作；按「登入完成，繼續」後檢查離開登入畫面，從原本步驟接續
- 結果輸出到 `artifacts/report.json`；不存 Cookie、不存登入憑證、不擷取登入時的 Trace
- MCP `stdio` 工具與 Agent Plugins `plugin.json`/`mcp.json`/`skills` 封裝

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

暴露工具：`e2e_open_dashboard`、`e2e_profiles`、`e2e_start`、`e2e_status`、`e2e_takeover`、`e2e_resume`、`e2e_stop`。若只是要使用儀表板，完全不需連 MCP。

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
## v0.2.0：管理端、多用戶端與測試身分

本版本可在 **本機儀表板**直接新增／移除受測端、修改網址與起始路徑、選擇桌面或手機模擬，以及建立多組身分。**預設值是 localhost 示範網址，不是已驗證的真實站點**：

| 受測端 | 預設網址 | 起始路徑 | 畫面 |
| --- | --- | --- | --- |
| 管理端 | `http://localhost:3000` | `/admin` | 桌面 1440 × 900 |
| 用戶端 A | `http://localhost:3001` | `/` | 桌面 1440 × 900 |
| 用戶端 B | `http://localhost:3002` | `/` | 手機 390 × 844 |

1. 執行 `npm start`，在控制台選擇受測端。網址與起始路徑請換成自己的測試／staging 系統；若是遠端網址，需事先以 `E2E_ALLOW_REMOTE=1` 啟動，且只對獲授權的站點測試。
2. 按「新增用戶端」建立更多端點；每個端點可使用不同主機、連接埠、頁面和桌面／手機版設定。
3. 在「測試身分」選擇或新增身分，可設定 **LINE 登入**或 **一般測試帳號**。一般測試帳號只記錄非秘密的帳號名稱（例如測試 email）；選擇適用的多個端點後儲存。
4. 選擇測試端點與身分，按「開始測試」。LINE OAuth、密碼、OTP 都需**在彈出的 Chromium 由人員完成**；人工接管期間不擷取畫面；完成後按「登入完成，繼續」。
5. 自訂測試步驟 JSON 可留空，使用「進入指定頁面→（需要時）人工登入→確認頁面可見」。如果提供自訂步驟，登入身分會自動加入人工登入暫停（除非已有 `pauseForLogin`）。

設定儲存於 `config/local.workspace.json`（已加入 `.gitignore`），版本庫中另附 `config/example.workspace.json` 範例。**不要把密碼、LINE Access Token、Cookie、OTP 放進帳號名稱、步驟 JSON 或 GitHub**。設定檔不建立帳號，也不修改 LINE Developers、Supabase Auth 或真實網站的登入機制。

MCP 可先呼叫 `e2e_profiles` 查看受測端／身分，再用 `e2e_start` 指定 `targetId` 與可選的 `accountId`。例如：

```json
{ "targetId": "client-mobile", "accountId": "client-line" }
```

舊有 `{ "baseUrl": "http://localhost:3000", "steps": [...] }` 呼叫仍可使用；也可指定 `"device": "mobile"`。**多端點是可管理、可逐一測試的多個網站配置，不代表同時並行跑多個瀏覽器**。網站是否登入成功仍需依各專案新增登入後斷言；真正 LINE 登入／真實帳號、Netlify 部署與 GitHub Projects 看板同步均需各自權限及實際驗證。
