# MemberWebsocket-dev E2E 整合設計（v0.2.0）

> 狀態：設計＋程式碼提交。**尚未在目標 Netlify 網站執行真實瀏覽器 E2E，也未完成 ChatGPT 外掛安裝驗證。**

## 系統對應

| 角色 | 資源 |
|---|---|
| 外掛程式庫 | https://github.com/yongshengchen0615/e2e-takeover-agent |
| 應用程式碼 | https://github.com/yongshengchen0615/memberwebsocket-dev-netlify |
| Netlify 測試站 | https://memberwebsocket-dev-netlify.netlify.app |
| Supabase 專案 | MemberWebsocket-dev（ref: dbuquirnaskrwcamdxki） |
| GitHub Project | https://github.com/users/yongshengchen0615/projects/5/views/3 |

2026-10-28：GitHub Project #5 的 views 列表可讀，但 items、fields、project metadata 回傳 403。**不可宣稱能自動把案例對應任務卡片或同步欄位。** 適當取得 Projects 權限前，以程式庫與受測應用之實際檔案為依據。

## 邊界及既有能力

目標專案已有自己的 browser / integration test 和 GitHub Actions。此 Agent 是**可見瀏覽器＋人工接管層**，不替代專案原本的測試：單元、DOM、Edge Functions、資料庫/授權測試應繼續由原有 CI 執行。

Supabase 既有 `automation_test_runs`、`automation_test_cases`、`automation_test_steps`、`test_execution_leases`、`e2e_case_learning_state` 等表；本版**不直接寫入或清除**任何資料，不透過 service_role 給瀏覽器開權限。後續若要串接，須先審查 API 權限、RLS、保留政策與測試資料隔離。

目標網站含 LINE LIFF。第三方 LINE 驗證的端點與 callback 須在 LINE Developers 的授權設定另行確認。**靜態首頁成功不等於 LIFF 登入成功**；在普通 Chromium 上也可能無法完整模擬 LINE App 內情境。

## 第一階段：唯讀冒煙測試（無須登入）

`config/memberwebsocket-dev.smoke.json` 只測試開發站首頁標題、導覽、會員卡／預約／管理入口的 HTML 存在，不點擊表單、不寫資料，也不宣稱登入或後端流程通過。

執行：
1. 在具備圖形桌面的個人電腦安裝：`npm install`、`npx playwright install chromium`。
2. macOS/Linux 啟動：`E2E_ALLOW_REMOTE=1 npm start`；Windows PowerShell：`$env:E2E_ALLOW_REMOTE="1"; npm start`。
3. 以同一台電腦開啟 `http://127.0.0.1:4317`。
4. 將 `config/memberwebsocket-dev.smoke.json` 的**完整內容**貼到步驟／計畫 JSON 欄位，按開始測試。
5. 檢視本機事件、狀態與 `artifacts/report.json`。注意遠端允許旗標是全域開關，切勿測試不受授權的網址。

CLI 無人值守測試可以沿用目標專案既有 GitHub Actions；此本機顯示瀏覽器不應直接放到無人看守的 CI 中要求人工登入。

## 第二階段：人工登入後的正向斷言

針對 **已取得測試帳號、且允許人工登入的測試環境**，由專案實際身分驗證流程決定成功條件，勿假設登入頁路徑或某個隱藏 DOM 等於成功。

計畫範例（僅示意，請以真實驗收頁面替換 selector）：

```json
{
  "baseUrl": "http://localhost:3000",
  "resumeWhen": { "path": "/member/", "selector": "[data-testid='authenticated-member-dashboard']" },
  "steps": [
    { "action": "goto", "path": "/member/" },
    { "action": "pauseForLogin" },
    { "action": "assertVisible", "selector": "[data-testid='authenticated-member-dashboard']" }
  ]
}
```

`resumeWhen` 支援同時設定 `path` 與 `selector`；兩者均需符合才允許從人工模式恢復。這只是**UI 成功訊號**，不可取代伺服器端驗證 token、角色授權或 RLS。

人工接管期間不擷取新的預覽圖片、不記錄 Cookie、OTP 或登入用 storageState。此架構依賴**同一台電腦顯示原始 Chromium 視窗**；並不支援直接從 ChatGPT 網頁／手機遠端接管。

## 後續測試矩陣與優先順序

| 等級 | 範圍 | 判定 |
|---|---|---|
| P0 | 首頁、路由、靜態資產、基本錯誤畫面 | 唯讀冒煙測試 |
| P0 | 會員登入、人工接管、恢復與會話保留 | 真實授權測試帳號驗證 |
| P0 | 會員資料權限／RLS／跨帳號隔離 | 非破壞性 API／資料庫整合測試 |
| P1 | 預約查詢、可用時段、管理頁可見性 | 測試帳號與固定資料集 |
| P1 | 預約成立、點數、票券、取消／回滾 | 測試資料隔離與副作用審批後才能執行 |
| P1 | 管理員角色／權限及拒絕未授權操作 | 獨立角色測試帳號 |
| P2 | 行動版 RWD、LIFF 特殊瀏覽器、效能 | 裝置矩陣、LINE 平台配置 |

## 安全性與治理

- 任何遠端網站操作都需測試授權；預設只允許 localhost。
- 不將真實會員、預約、點數或票券資料當測試資料；預先定義測試帳號及清理策略。
- 對建立、送出、刪除、付款等副作用功能，在 v0.2 尚無語意審批機制，**禁止透過本 Agent 在真實正式資料上執行**。
- 視覺預覽可能顯示登入後的個資；只在受信任的本機啟用，勿轉播、上傳或外流。
- GitHub Projects 目前欠缺 items/fields 讀取權限；不要依猜測同步看板。
- 正式上線前先以原有 CI 驗證，再由有人監督的真實測試環境完成接管驗收。

## 驗收條件

1. 同一瀏覽器完成 `manual → resume`，後續步驟接著執行。
2. 登入成功條件不符合時，仍維持 manual，不能偷偷自動繼續。
3. 首頁冒煙測試能輸出每個步驟的結果；不得把靜態驗證當成會員登入通過。
4. 不將密碼、OTP、Cookie、secret key 寫入報告。
5. 真實專案 E2E、CI 和外掛安裝必須分別提供實際執行證據，否則標示「未執行」。

## v0.3.0 QA / E2E 驗收

`config/memberwebsocket-dev.smoke.json` 已加入四個必要驗收條件（QA-001、E2E-001、E2E-002、E2E-003），並由 `e2e_acceptance`、控制面板與本機 report.json 顯示 Gate。詳見 `docs/QA_E2E_ACCEPTANCE.md`。此 Gate 只代表四個唯讀條件的執行結果，不能宣稱全部會員系統功能驗收完成。
