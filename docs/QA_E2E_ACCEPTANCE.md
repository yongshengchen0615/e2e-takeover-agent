# QA / E2E 驗收方式（v0.3.0）

## 核心規則

此外掛的 `acceptance` 提供可執行的 **QA / E2E 驗收關卡**。QA 是品質驗收，E2E 是從畫面到功能流程的端到端驗證。每個 criteria 需對應真實已執行的 E2E 步驟，至少一個斷言，不允許「只打開頁面」就算通過。

範例：

```json
{
  "baseUrl": "http://localhost:3000",
  "steps": [
    { "name": "開啟首頁", "action": "goto", "path": "/" },
    { "name": "驗證首頁", "action": "assertVisible", "selector": "main" },
    { "name": "驗證標題", "action": "assertText", "selector": "h1", "text": "Ready" }
  ],
  "acceptance": {
    "method": "QA / E2E",
    "criteria": [
      { "id": "QA-001", "title": "首頁結構", "required": true, "stepNames": ["驗證首頁"] },
      { "id": "E2E-001", "title": "首頁內容", "required": true, "stepNames": ["驗證標題"] }
    ]
  }
}
```

- `method` 目前只能是 `QA / E2E`。
- `criteria` 必須是 1–30 項；每項有唯一 `id`、`title`、至少一個 `stepNames`，以及選用的 `required`（預設 true）。
- `stepNames` 引用計畫中已存在且**唯一命名**的步驟；每個驗收條件至少包含一個 `assertVisible`、`assertText` 或 `assertUrl`。
- 最少一項必要條件，避免全部設為選用導致空驗收。
- 沒有 `acceptance` 設定時保留既有測試功能，但不產生 QA / E2E 通過判定。

## 狀態與關卡

| 狀態 | 條件 | 是否可發布 |
|---|---|---|
| `passed` | **整體測試已 completed**，且全部必要 criteria 的相關步驟皆 passed | 是（僅對這次計畫涵蓋範圍） |
| `failed` | 整體測試失敗，或必要驗收項目失敗 | 否 |
| `blocked` | 人工登入接管中，或執行途中被停止 | 否 |
| `in_progress` | 測試執行中 | 否 |
| `not_run` | 尚未執行 | 否 |
| `incomplete` | 計畫已結束但仍存在必要項目未完成 | 否 |

`accepted` 僅於 gate 為 `passed` 時等於 `true`；**選用項目失敗時整體測試仍會失敗**（測試引擎採 fail-fast，不容將真實步驟失敗藏在選用驗收裡）。

工具：
- `e2e_start`：提交含 `acceptance` 的完整測試計畫。
- `e2e_status`：同時回傳 `status.acceptance`、驗收證據與 Gate。
- `e2e_acceptance`：專門查詢 QA / E2E 驗收狀態；與 `e2e_status` 共用同一個真實測試工作階段。
- `e2e_takeover` / `e2e_resume`：人工登入時 gate = `blocked`，只有恢復後完成必要斷言才可通過。
- 本機儀表板：顯示 Gate 與各項條件；只用 DOM `textContent` 顯示資料，不插入測試名稱作為 HTML。
- `artifacts/report.json`：記錄 `acceptance.method`、`gate`、`accepted`、統計及各條件測試證據（步驟名稱、狀態、耗時、錯誤摘要）；不保存登入工作階段及驗證碼。

## 專案 QA / E2E 驗收清單

針對 MemberWebsocket-dev，`config/memberwebsocket-dev.smoke.json` 已納入以下四項必備驗收：

1. `QA-001`：首頁標題與會員中心導覽可見
2. `E2E-001`：會員卡入口存在
3. `E2E-002`：預約入口存在
4. `E2E-003`：管理端入口存在

這些只是**唯讀冒煙／基本導覽驗收**，不代表會員登入、建立預約、資料存取權限、LINE LIFF、Supabase API 或管理員權限均通過。若要做發布全量驗收，需再加入有測試資料隔離的登入、角色授權、預約與票券等測試，並先完成副作用審批機制。

## 與 GitHub Project #5 的對應

專案看板名稱包含 `QA / E2E` 階段，但在查詢時目前 `views` 可讀、`items`／`fields` 權限 403。因此：

- 可將這份 JSON Gate 報告視為**本機可驗證的 QA / E2E 驗收證據**。
- **尚未**實作自動移動 GitHub Project item 或更新驗收欄位。不能將外掛 `accepted:true` 說成看板已變成「QA / E2E 通過」。
- 若日後授予 Projects item/field 權限，可由授權後的 GitHub workflow 把結果連結到對應任務卡；操作前必須確認 issue/PR ID、過濾狀態欄、避免誤更新。
- 即使 Gate `passed`，也只代表計畫中覆蓋的驗收，**不是無條件允許正式發布**。

## 自動化驗收 CLI（發布前使用）

真實 E2E 測試完成並產生 `artifacts/report.json` 後，可執行：

```bash
npm run acceptance:check -- artifacts/report.json
```

- `0`：驗收 Gate 為 passed，整體測試 completed，存在必要 criteria，且對應實際步驟及驗收證據全部通過。
- `1`：找不到報告、未設定、失敗、登入待接管、測試中止、必要證據缺漏，或報告的 Gate 與實際步驟不一致。
- 在部署 CI 中，應把這個命令接在**實際 Playwright E2E** 之後，並只傳入該次執行產出的報告。**不能用單元測試、模擬報告替代真實 E2E 證據。**
- 報告是本機普通 JSON，不含不可竄改簽章。請使用可信 CI runner / artifact 與對應 commit SHA 保存來源資訊，禁止把不可信的外部報告直接視為正式發布批准。

## 操作與驗證

1. 本機安裝 `npm install`、`npx playwright install chromium`。
2. 啟動 `npm start`，或對授權遠端 staging 明確執行 `E2E_ALLOW_REMOTE=1 npm start`。
3. 開啟 `http://127.0.0.1:4317`，貼入完整 JSON（含 `acceptance`），執行。
4. 審核顯示的 Gate、每個條件證據、`artifacts/report.json`。
5. 對 CI / E2E / 發布驗收**各自**留存證據，不因 Mock 測試通過而宣稱真實網站驗收通過。

`npm test` 驗證 schema、failed/pass/blocked 判定與 MCP 回傳等程式行為；真正的網站 E2E 和人工登入接管仍須另外實際操作。

## 已知風險

- 本地伺服器控制流程沒有雲端真人接管能力。
- 畫面驗收不能取代 Supabase RLS/後端授權測試。
- 登入後可見預覽可能包含真實個資，應使用專用測試帳號及受信任的本機環境。
- E2E fail-fast 表示後續尚未執行項目標為 not_run，絕不自動算 passed。
