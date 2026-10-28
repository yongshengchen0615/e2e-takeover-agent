# 管理端與用戶端 E2E 測試設定（v0.4.0）

## 適用環境

- 受測原始碼：`yongshengchen0615/memberwebsocket-dev-netlify`，靜態頁面位於 `MemberWebsocket-dev/`。
- 預設測試網址：`https://memberwebsocket-dev-netlify.netlify.app`，**仍需**在本機自行設定 `E2E_ALLOW_REMOTE=1` 才能測試遠端站點。
- 本工具需要可見圖形桌面、Playwright Chromium；**ChatGPT 網頁版不提供直接遠端接管本機 Chromium**。
- 本版方案**全為唯讀**：只執行 goto、assertPresent、assertVisible、pauseForLogin，不提交表單、寫資料或呼叫 service_role。

## 管理端／用戶端方案

| profileId | 區域 | 類型 | 範圍 | 驗收意義 |
|---|---|---|---|---|
| `admin-structure` | 管理端 /admin/ | 結構 | 管理工作台、載入狀態、會員管理、QA 分頁 | 只證實 HTML DOM 元件存在 |
| `client-structure` | 用戶端 /member/ | 結構 | 會員卡、會員階級、登入載入容器 | 只證實 HTML DOM 元件存在 |
| `admin-auth` | 管理端 /admin/ | 人工登入後 | `#adminView`、會員管理與名冊可見 | 需真實管理員登入 |
| `client-member-auth` | 用戶端 /member/ | 人工登入後 | `#memberView`、會員卡與會員階級 | 需真實用戶登入 |
| `client-points-auth` | 用戶端 /points/ | 人工登入後 | 集點卡與階級 | 不發送點數 |
| `client-booking-auth` | 用戶端 /booking/ | 人工登入後 | 預約畫面／日期日曆 | 不建立預約 |
| `client-event-auth` | 用戶端 /event/ | 人工登入後 | 票券畫面／列表 | 不領取票券 |
| `client-calendar-auth` | 用戶端 /calendar/ | 人工登入後 | 日曆畫面 | 不建立活動 |

以上選擇器經原始 HTML 確認存在，但**登入後的可見條件仍需真實站點驗證**；例如 LINE LIFF 的驗證流程、登入權限、產品化管理工作區與空資料狀態，可能造成流程差異。結構測試只驗證元素存在（`assertPresent`）而非畫面可見，更不能證明 API 與資料權限正確。

## 操作

1. 在測試電腦取得專案，執行 `npm install`、`npx playwright install chromium`。
2. 本機測試：`npm start`。Netlify 授權測試：macOS/Linux `E2E_ALLOW_REMOTE=1 npm start`，PowerShell `$env:E2E_ALLOW_REMOTE="1"; npm start`。
3. 進入 `http://127.0.0.1:4317` → **測試對象／方案** → 選擇管理端／用戶端 → **載入選取的測試方案**。
4. 檢查受測網址、JSON 計畫、QA / E2E 條件後按「開始測試」。載入方案時若已手動填寫非預設網址會保留該站點；載入後「受測網站」欄位可更新選定方案的測試網址。
5. 人工登入方案會顯示原始 Chromium 及暫停提示。請在**同一視窗**自行登入 LINE／管理端並處理個人資料、同意條款等必要流程，完成後在儀表板按「登入完成，繼續」。
6. `resumeWhen` 會確認對應站內路徑及登入後的主容器可見，否則仍為 manual。之後檢查全部必要條件，將 `artifacts/report.json` 的 Gate 記錄為 passed/failed/blocked。
7. 運行 `npm run acceptance:check -- artifacts/report.json` 核對當次測試是否有完整通過證據。**不要使用單元測試產生的合成報告來宣稱目標網站通過 E2E**。

## MCP 操作範例

- `e2e_profiles`：列出可用方案及各自測試層級與注意事項。
- `e2e_start_profile({profileId:"admin-structure"})`：管理端唯讀 HTML 檢查。
- `e2e_start_profile({profileId:"client-structure"})`：用戶端唯讀 HTML 檢查。
- `e2e_start_profile({profileId:"admin-auth"})`：人工管理員登入，完成後斷言管理工作台。
- `e2e_start_profile({profileId:"client-member-auth",baseUrl:"http://localhost:3000"})`：在指定本機測試站進行用戶端登入驗收。
- `e2e_acceptance`：回傳目前驗收狀態與必要證據。

## 架構與安全注意

- 管理端、用戶端用**不同測試**，避免將管理員登入的瀏覽器上下文錯認成普通會員；每次重新啟動測試會建立新的 BrowserContext。
- 選擇器 `#adminView` 和 `#memberView` 只是 UI 成功訊號；實際管理員權限、用戶資料隔離與 RLS 仍要用獨立的後端測試驗證。
- LINE LIFF 可能只能在 LINE App 內提供完整功能，桌面 Chromium 的測試不能取代行動裝置驗收。
- 遠端網址可能觸發第三方登入；未完成驗證前測試會停在人工接管狀態，不得標示通過。
- 所有測試均未接入會建立、取消、支付、寄送或刪除正式資料的指令。
- GitHub Project #5 仍無 items/fields 讀取權限，尚不能自動移動 QA / E2E 看板卡片。
