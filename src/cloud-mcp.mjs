import { createInterface } from 'node:readline';
import { cloudAllowedOrigins, createCloudEngine, verifyCloudUrl } from './cloud-browser.mjs';
import { CloudSuite } from './cloud-suite.mjs';
import { loadWorkspace, buildProfilePlan } from './workspace.mjs';
import { validatePlan } from './engine.mjs';

// Cloud-first MCP: no localhost dashboard or local Playwright launch.
// Only approved public HTTPS origins may be opened using Browserbase.
let runner = null;
let runMode = '';
const idle = () => ({ state:'idle', pauseReason:null, results:[], events:[], total:0 });
const status = () => runner ? runner.status() : idle();
const dashboardUrl = () => {
  const raw = process.env.PUBLIC_BASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error('PUBLIC_BASE_URL 必須為已部署的 HTTPS 控制台來源');
  }
  return url.origin;
};
function requireCloudCredentials() {
  if (!process.env.BROWSERBASE_API_KEY) {
    throw new Error('雲端測試需要 BROWSERBASE_API_KEY；請在雲端執行環境設定 Browserbase 機密。');
  }
  if (!process.env.BROWSERBASE_PROJECT_ID) {
    throw new Error('雲端測試需要 BROWSERBASE_PROJECT_ID；請在雲端執行環境設定 Browserbase 專案 ID。');
  }
}
function allowedOrigins() { return cloudAllowedOrigins(process.env.E2E_ALLOWED_ORIGINS); }
function assertCanStart() {
  if (['starting','running','manual'].includes(status().state)) throw new Error('已有執行中的雲端測試，請先完成或停止');
}
function response() { return { dashboardUrl: dashboardUrl(), mode:'cloud', status: status() }; }
function reportError(error) {
  return String(error?.message ?? error).replace(/https?:\/\/[^\s]+/g,'[網址已隱藏]').slice(0, 350);
}
function reply(id, value, error = false) {
  if (id === null || id === undefined) return;
  process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, ...(error ? { error:{ code:-32000, message:String(value) } } : { result:value }) }) + '\n');
}
const toolDefs = [
  { name:'e2e_open_dashboard', description:'取得已部署的 HTTPS 雲端控制台網址；不啟動 localhost。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_profiles', description:'列出已核准的雲端 HTTPS 網域及設定檔中的管理端／用戶端資料，不含密碼。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_start', description:'使用 Browserbase 開始單一管理端／用戶端 HTTPS 測試。直接傳 baseUrl（可含路徑和 query）或 targetId；完全不需要 E2E_ALLOW_REMOTE 或本機瀏覽器。', inputSchema:{type:'object', properties:{baseUrl:{type:'string'}, targetId:{type:'string'}, accountId:{type:'string'},device:{type:'string',enum:['desktop','mobile']},steps:{type:'array',items:{type:'object'}},login:{type:'boolean'}},additionalProperties:false} },
  { name:'e2e_quick_start', description:'只要填管理端 adminUrl 與用戶端 clientUrls（字串每行一個或陣列），在雲端依序進行 E2E 冒煙測試。可勾選 login 手動進行 LINE 登入。', inputSchema:{type:'object',properties:{adminUrl:{type:'string'},clientUrls:{oneOf:[{type:'string'},{type:'array',items:{type:'string'}}]},mobile:{type:'boolean'},login:{type:'boolean'}},required:['adminUrl','clientUrls'],additionalProperties:false} },
  { name:'e2e_status', description:'取得目前雲端測試執行狀態、結果與人工接管狀態。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_live', description:'取得目前雲端瀏覽器短效互動式網址。視為敏感連結，勿轉傳。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_takeover', description:'暫停測試並交還 Browserbase 雲端瀏覽器給使用者進行 LINE、OTP 或測試帳號登入。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_resume', description:'使用者登入後恢復原雲端瀏覽器工作階段與 E2E 測試。', inputSchema:{type:'object',properties:{},additionalProperties:false} },
  { name:'e2e_stop', description:'停止雲端測試並關閉雲端瀏覽器。', inputSchema:{type:'object',properties:{},additionalProperties:false} }
];
function fromBaseUrl(args) {
  const target = new URL(args.baseUrl);
  const steps = args.steps ?? [
    {name:'開啟指定網站',action:'goto',path:target.pathname + target.search},
    ...(args.login ? [{name:'人工 LINE／測試帳號登入',action:'pauseForLogin'}] : []),
    {name:'確認網站畫面可見',action:'assertVisible',selector:'body'}
  ];
  return { baseUrl:target.origin,device:args.device || 'desktop',steps };
}
async function callTool(name, args) {
  if (name === 'e2e_open_dashboard') {
    const value = dashboardUrl();
    if (!value) throw new Error('雲端控制台尚未部署：請先部署 Render Web Service 並設定 PUBLIC_BASE_URL；不會提供 localhost 網址');
    return response();
  }
  if (name === 'e2e_status') return response();
  if (name === 'e2e_profiles') return { ...response(), allowedOrigins:allowedOrigins(), workspace:await loadWorkspace() };
  if (name === 'e2e_start') {
    assertCanStart();
    const origins = allowedOrigins();
    const planned = args.targetId
      ? buildProfilePlan(await loadWorkspace(), args)
      : fromBaseUrl(args);
    const clean = validatePlan(planned, { allowRemote:true });
    verifyCloudUrl(clean.baseUrl, origins);
    requireCloudCredentials();
    runner = createCloudEngine({ allowedOrigins:origins });
    runMode = 'single';
    await runner.start(clean);
    return response();
  }
  if (name === 'e2e_quick_start') {
    assertCanStart();
    const origins = allowedOrigins();
    // Validate every target before contacting the remote browser provider.
    const { quickPlans } = await import('./cloud-suite.mjs');
    quickPlans(args, origins);
    requireCloudCredentials();
    runner = new CloudSuite({ allowedOrigins:origins, engineFactory:() => createCloudEngine({ allowedOrigins:origins }) });
    runMode = 'multi';
    await runner.start(args);
    return response();
  }
  if (!runner) throw new Error('尚未開始雲端測試，請先呼叫 e2e_start 或 e2e_quick_start');
  switch (name) {
    case 'e2e_live': return { ...response(), liveUrl:await runner.live(), expiresInSeconds:120 };
    case 'e2e_takeover': {
      const outcome = runner.takeover('使用者接管 Browserbase 雲端瀏覽器');
      return { ...response(), status: outcome?.state ? outcome : runner.status() };
    }
    case 'e2e_resume': await runner.resume(); return response();
    case 'e2e_stop': await runner.stop(); return response();
    default: throw new Error('未知的雲端 E2E 工具');
  }
}
async function handle(message) {
  if (!message || message.jsonrpc !== '2.0') return;
  try {
    switch (message.method) {
      case 'initialize':
        reply(message.id, {
          protocolVersion: message.params?.protocolVersion || '2025-06-18',
          capabilities:{tools:{listChanged:false}},
          serverInfo:{name:'e2e-takeover-agent-cloud',version:'0.3.1'}
        });
        break;
      case 'notifications/initialized': break;
      case 'ping': reply(message.id,{}); break;
      case 'tools/list': reply(message.id,{tools:toolDefs}); break;
      case 'tools/call': {
        const data = await callTool(message.params?.name,message.params?.arguments || {});
        reply(message.id,{content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data});
        break;
      }
      default: reply(message.id,{code:-32601,message:'Method not found'},true);
    }
  } catch (error) {
    const safe = reportError(error);
    if (message.method === 'tools/call') reply(message.id,{content:[{type:'text',text:safe}],isError:true});
    else reply(message.id,safe,true);
  }
}
const lines = createInterface({input:process.stdin,crlfDelay:Infinity});
lines.on('line',raw=>{
  try { void handle(JSON.parse(raw)); }
  catch { process.stderr.write('無效的 MCP JSON 訊息\n'); }
});
process.on('SIGTERM',async()=>{
  if (runner) { try { await runner.stop(); } catch { /* cleanup */ } }
  process.exit(0);
});
