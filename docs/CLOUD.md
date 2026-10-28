# 雲端 E2E 版本 v0.3 — 最簡操作

> 這個 PR 從多端點分支延伸，保留本機模式、MCP、管理端／多用戶端能力。**雲端版不需要在自己電腦安裝 Chromium 或開 localhost**，但需要長駐 Node.js 伺服器與 Browserbase 雲端瀏覽器帳號。

## 一鍵測試流程

1. 在已部署的 HTTPS 控制台登入管理者帳號。
2. 「管理端網址」已預填 `https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test`；輸入「用戶端網址」（多個用戶端可每行一個，最多 8 個），或修改管理端網址以測試其他授權環境。
3. 按 **開始管理端＋用戶端 E2E 自動測試**。
4. 如需 LINE 或測試帳號登入，在「進階設定」勾選「需要 LINE／測試帳號登入」，確保每站開啟後暫停供人工登入；沒有勾選時會直接執行預設的基礎冒煙測試。
5. 控制台依序建立獨立 Browserbase Chromium 工作階段：管理端桌面 1440×900、用戶端預設手機 390×844。逐一開啟網站，確認頁面可見，顯示即時預覽、步驟日誌及測試結果。
6. 如果網站遇到 LINE/OTP/密碼頁面而需要人工處理：選擇「開啟雲端互動瀏覽器」取得短效網址，再按「人工接管」，在 **Browserbase 雲端互動視窗** 完成登入後回控制台按「登入完成，繼續」。保留同一個 session。人工接管期間不擷取預覽畫面。

**注意：** 沒有專屬業務測試案例時，系統只會執行安全的 **E2E 基礎冒煙測試**（頁面開啟與 DOM 可見），不是已經測試完整的下單、資料儲存、角色權限等業務流程。原有可編輯的步驟／測試身分仍保留於本機進階控制台，雲端版先提供零設定的基礎測試流程。

## 雲端部署（Render 範例）

- 官方 Render Web Service 可部署 Node 長駐 HTTP 服務，會提供 *.onrender.com HTTPS 網域。此程式已加入 [render.yaml](../render.yaml) 與 \`npm run cloud\` 啟動命令。
- 建立 Browserbase 帳號與專案，從其後台取得 API Key 和 Project ID；雲端機密設定中加入 \`BROWSERBASE_API_KEY\`、\`BROWSERBASE_PROJECT_ID\`。
- 已提供的管理端網域：`https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app`；預填網址的 `/admin/?business=test` 會完整保留並作為測試開啟路徑。這個網域要加入 `E2E_ALLOWED_ORIGINS`，否則雲端安全限制會拒絕啟動測試。
- 在 Render Web Service 設定 \`PUBLIC_BASE_URL\` 為你的實際 **https://...onrender.com** 網站 origin；\`CLOUD_ADMIN_USER\` 與 **24 字以上隨機密碼** \`CLOUD_ADMIN_PASSWORD\`；\`E2E_ALLOWED_ORIGINS\` 設為允許測試的 HTTPS 網站來源清單，以逗號分隔（**不要含路徑**）。
- 在 Render 連接 GitHub 此 PR 的分支，建立 Web Service（建議先使用測試／預覽服務，不要覆蓋既有產品站台）；使用 [render.yaml](../render.yaml) 建置，或自行設定 Build: \`npm install --no-audit --no-fund\`、Start: \`npm run cloud\`。
- 在部署完成後透過 \`https://...onrender.com/healthz\` 確認公開健康檢查，再用 Basic Auth 登入根目錄。
- 本分支屬基礎設施原始碼，**不代表部署已經完成**。需要有效 Browserbase 憑證與 Render 帳號才能進行真實雲端連線測試。

## 安全限制

- Cloud E2E 不接受任何 localhost、RFC1918 私網或 http: 受測目標。由部署管理員維護精確的 \`E2E_ALLOWED_ORIGINS\` 清單；管理員不能在 UI 任意新增未批准網站而繞過清單。
- 每個雲端 session 預設停用 Browserbase session recording、logging 及 CAPTCHA solving。**但登入資料仍交由受測網站與第三方雲端瀏覽器處理**，使用測試帳號，不建議個人正式帳號。
- 所有控制端點、HTML、JS、設定及即時 Browserbase debugger URL 都有 Basic Auth 保護，寫入操作另有 CSRF Token 與 Origin 驗證；/healthz 不包含秘密。強烈建議正式環境再加上 SSO／零信任存取層、IP 限制及短效人員權限。
- Browserbase 即時 debugger URL 是短效存取權限，視同機密；請勿截圖、複製或轉傳到公開頻道。
- Node 伺服器採單執行緒記憶體佇列（一次一個網站），重啟時執行中的工作會中止；尚未實作持久佇列、多租戶或水平擴充。
- Render 基本檔案系統可能隨重啟消失。請勿在公開服務存放真實帳號、Cookie、金鑰。設定請透過環境變數管理。
- E2E 行為可能造成副作用；這個簡化模式預設只有開頁／檢查，不會自動按送出或刪除鈕。

## 開發與驗收

\`\`\`bash
npm install
npm run check
npm test
\`\`\`

測試涵蓋：遠端安全來源驗證、Browserbase SDK 呼叫 mock、控制台存取權／CSRF、URL-only 方案與獨立 session 排程。CI 通過不代表真正 Browserbase／LINE 端對端測試成功。

要在開發環境模擬雲端服務的 HTTP 層，可使用程式測試輸入 Mock adapter；不要把假的 Browserbase session 當成真實測試結果。
