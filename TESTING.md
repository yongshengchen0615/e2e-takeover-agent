# 測試驗證紀錄 — v0.1.0

執行環境：Node.js v22.16.0（2026-10-27）。實測限此受控環境及本專案的模擬頁面，不代表任何使用者專案已通過 E2E。

| 編號 | 項目 | 結果 | 證據 / 限制 |
|---|---|---|---|
| T01 | 檔案結構 | 通過 | plugin.json / mcp.json / skill / src / tests / docs |
| T02 | Manifest 與 Schema | 部分通過 | JSON 可解析、必要路徑可找到；未連線官方遠端 JSON Schema 做完整驗證 |
| T03 | Skills 指令與觸發 | 部分通過 | SKILL.md 已建立、可讀；尚未在已安裝 ChatGPT plugin 實際測試技能選用 |
| T04 | 正常輸入 | 通過 | Mock 登入手動接管，原瀏覽器會話 resume 後後續步驟完成 |
| T05 | 錯誤 / 邊界 | 通過 | 限制非 localhost、跨來源自動 goto、敏感欄位 fill |
| T06 | MCP 參數與回傳 | 通過 | Stdio 初始化、tools/list、tools/call、本機 dashboard 回傳 |
| T07 | MCP 連線及認證 | 部分通過 | 本機 stdio 連線通過；ChatGPT 客戶端連線未執行；本機 UI 有 Host/Origin/CSRF 防護 |
| T08 | 權限與敏感操作 | 部分通過 | 預設 localhost 限制、秘密欄位阻擋、手動接管；尚無破壞性 click 的語意預先批准 |
| T09 | 外部服務錯誤 | 部分通過 | 瀏覽器啟動錯誤有處理；無外部 API/網路重試功能 |
| T10 | 機密資訊 | 部分通過 | 人工接管期間停止新截圖；不儲存 Cookie/登入密碼；未做第三方滲透測試 |
| T11 | 實際安裝外掛 E2E | 未執行 | 無目標專案與已連結的本機 MCP 執行客戶端 |
| T12 | 回歸測試 | 通過 | 6 個 node:test 測試重跑全部通過 |

**額外瀏覽器實測**：使用本機已配置的 Chromium 及 Playwright driver，在 Xvfb 圖形桌面啟動 headed Chromium。以模擬登入內容執行 `pauseForLogin → 人工等效頁面操作（測試腳本）→ resume → assertVisible`，流程完成，接管期間 `preview()` 回傳 null。這只是實際瀏覽器核心流程驗證，不是手動輸入真實帳密；此外環境的本機 HTTP 導航遭行政網路政策阻擋，因此沒有宣稱實際網站 E2E 成功。

**部署驗證仍需執行**：在支援視窗的開發者電腦執行 `npm install && npx playwright install chromium && npm start`，使用指定 staging 專案測試登入，確認 1）即時預覽與日誌；2）自動識別；3）使用者可在同一視窗自行登入；4）登入後按繼續；5）後續斷言成立；6）報告完整。

## v0.2 多端點與登入身分驗收

- `tests/workspace.test.mjs`：端點／身分 schema、帳號與端點綁定、密碼欄位拒絕、預設 LINE 人工接管、設定檔持久化。
- `tests/http.test.mjs`：設定 API 必須通過原有本機 CSRF 防護；配置能儲存與讀回。
- `tests/engine.test.mjs`：手機 Playwright context、無效裝置拒絕、登入自動辨識與顯式人工暫停不重複。
- 實際網站測試：逐一選取管理端、至少兩個用戶端，逐個設定有效測試網址，完成 LINE／測試帳號人工登入，確認登入後斷言與權限隔離。**此項必須由具備相應帳號、登入權限與圖形 Chromium 的環境執行，單元測試不能替代。**
- 設定檔不包含密碼、Token 或 Cookies，`config/local.workspace.json` 預設不追蹤。


## 雲端 E2E v0.3 驗收

- `tests/cloud.test.mjs`: 雲端 Browserbase 介面（SDK mock）、手機 viewport、遠端來源白名單、管理者 Basic Auth、CSRF、短效 live URL、簡易控制台與 quick-start API。
- `tests/cloud-suite.test.mjs`: 只輸入管理端與多個用戶端網址即可產生方案；每站獨立序列測試；可勾選 LINE／測試帳號人工登入暫停；非法來源拒絕。
- `tests/engine.test.mjs`: 在人工接管切換期間阻擋洩漏截圖。
- 上述皆可由 GitHub Actions 自動驗證；**不代表**已在 Render 部署、連接真實 Browserbase、完成 LINE OAuth 或對真實網站執行完整業務流程。
- 上線前人工驗收：Render HTTPS /healthz、管理者登入、Browserbase 連接與 live debugger、LINE 人工接管與恢復、手機畫面、多端點相互隔離、錯誤網址封鎖。
