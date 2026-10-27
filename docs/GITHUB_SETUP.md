# GitHub 儲存庫與協作

目前儲存庫： https://github.com/yongshengchen0615/e2e-takeover-agent

專案已直接寫入 GitHub。開發時從儲存庫 clone；請勿上傳敏感資訊或登入工作階段。

```bash
git clone https://github.com/yongshengchen0615/e2e-takeover-agent.git
cd e2e-takeover-agent
npm install
npx playwright install chromium
npm run check
npm test
npm start
```

## 預設分支與 CI

預設分支 main，push / pull request 會觸發 CI：Node.js 語法檢查及單元測試。

## 安全

此儲存庫建立時為 **Public**。如果準備加入私人專案資料，請先在 GitHub Settings → General → Danger Zone 調整 Visibility 為 Private。不要提交 credentials、cookies、session 或 production data。

互動式登入測試需要桌面 Chromium，GitHub CI 不會代表使用者完成 2FA。
