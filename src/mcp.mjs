import { createInterface } from 'node:readline';
import { E2EEngine } from './engine.mjs';
import { createDashboard } from './server.mjs';
import { listProfiles, createProfilePlan } from './profiles.mjs';

const engine = new E2EEngine();
const dashboard = createDashboard(engine, { port: 0 });
let dashboardUrl;
function reply(id, payload, error = false) {
  if (id === undefined || id === null) return;
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error: { code: -32000, message: String(payload) } } : { result: payload }) }) + '\n');
}
const toolDefs = [
  { name: 'e2e_open_dashboard', description: '開啟本機 E2E 即時測試控制台並取得其網址。僅允許本機瀏覽器存取。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_start', description: '在可見 Chromium 中開始網站 E2E 測試。預設僅允許 localhost；需要人工登入時自動暫停。', inputSchema: { type: 'object', required: ['baseUrl'], properties: { baseUrl: { type: 'string' }, steps: { type: 'array', items: { type: 'object' } }, resumeWhen: { type: 'object', properties: { path: { type: 'string' }, selector: { type: 'string' } }, additionalProperties: false, minProperties: 1 }, acceptance: { type: 'object', required: ['method', 'criteria'], properties: { method: { type: 'string', enum: ['QA / E2E'] }, criteria: { type: 'array', minItems: 1, maxItems: 30, items: { type: 'object', required: ['id', 'title', 'stepNames'], properties: { id: { type: 'string' }, title: { type: 'string' }, required: { type: 'boolean' }, stepNames: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } } }, additionalProperties: false } }, additionalProperties: false } },
  { name: 'e2e_profiles', description: '列出管理端與用戶端的唯讀結構或人工登入後驗收測試方案。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_start_profile', description: '以管理端／用戶端測試範本開始執行，人工登入時在原始 Chromium 交給使用者接管。遠端網站需顯式允許。', inputSchema: { type: 'object', required: ['profileId'], properties: { profileId: { type: 'string' }, baseUrl: { type: 'string' } }, additionalProperties: false } },
  { name: 'e2e_acceptance', description: '讀取目前 QA / E2E 驗收條件、證據、Gate（passed/failed/blocked/in_progress）及是否可驗收；未執行不得視為通過。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_status', description: '取得執行狀態、步驟結果、人工接管狀態與本機儀表板網址。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_takeover', description: '應使用者要求暫停後續操作並交還瀏覽器控制權。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_resume', description: '使用者明確表示已完成登入時，檢查登入頁已離開後恢復同一瀏覽器工作階段。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'e2e_stop', description: '停止測試並關閉測試瀏覽器。', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
].map(def => ({ ...def, outputSchema: { type:'object', properties: { dashboardUrl: { type:'string' }, status: { type:'object' }, profiles: { type:'array' } }, required:['dashboardUrl','status'] } }));
async function callTool(name, args) {
  if (!dashboardUrl) dashboardUrl = await dashboard.listen();
  switch (name) {
    case 'e2e_open_dashboard': return { dashboardUrl, status: engine.status() };
    case 'e2e_start': return { dashboardUrl, status: await engine.start(args) };
    case 'e2e_acceptance': return { dashboardUrl, status: engine.status() };
    case 'e2e_profiles': return { dashboardUrl, status: engine.status(), profiles: listProfiles() };
    case 'e2e_start_profile': return {
      dashboardUrl,
      status: await engine.start(createProfilePlan(args.profileId,
        args.baseUrl ? { baseUrl: args.baseUrl } : {}))
    };
    case 'e2e_status': return { dashboardUrl, status: engine.status() };
    case 'e2e_takeover': return { dashboardUrl, status: engine.takeover('使用者要求接管') };
    case 'e2e_resume': return { dashboardUrl, status: await engine.resume() };
    case 'e2e_stop': return { dashboardUrl, status: await engine.stop() };
    default: throw new Error('找不到 MCP 工具');
  }
}
async function handle(msg) {
  if (!msg || msg.jsonrpc !== '2.0') return;
  try {
    switch(msg.method) {
      case 'initialize':
        reply(msg.id, { protocolVersion: msg.params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'e2e-takeover-agent', version: '0.4.0' } });
        break;
      case 'notifications/initialized': break;
      case 'ping': reply(msg.id, {}); break;
      case 'tools/list': reply(msg.id, { tools: toolDefs }); break;
      case 'tools/call': {
        const data = await callTool(msg.params?.name, msg.params?.arguments || {});
        reply(msg.id, { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data });
        break;
      }
      default: reply(msg.id, { code: -32601, message: 'Method not found' }, true);
    }
  } catch (err) {
    // 工具錯誤以 isError 傳回，讓代理可以指出真實原因而不誤認成功。
    if (msg.method === 'tools/call') reply(msg.id, { content: [{ type: 'text', text: String(err.message).slice(0, 250) }], isError: true });
    else reply(msg.id, err.message, true);
  }
}
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on('line', raw => {
  try { void handle(JSON.parse(raw)); } catch { process.stderr.write('無效的 MCP JSON 訊息\n'); }
});
process.on('SIGTERM', async () => { await dashboard.close(); process.exit(0); });
