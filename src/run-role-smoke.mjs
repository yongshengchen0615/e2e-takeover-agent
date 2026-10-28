import { resolve } from 'node:path';
import { E2EEngine } from './engine.mjs';
import { createProfilePlan } from './profiles.mjs';

const id = process.argv[2];
const device = process.argv[3] || 'desktop';
if (!['desktop','mobileSmall','mobileStandard','mobileLarge'].includes(device)) {
  console.error('不支援的行動裝置預設尺寸');
  process.exit(2);
}
if (!['admin-structure', 'client-structure'].includes(id)) {
  console.error('只允許唯讀管理端／用戶端結構測試：admin-structure 或 client-structure');
  process.exit(2);
}
if (process.env.E2E_ALLOW_REMOTE !== '1') {
  console.error('遠端網站測試必須由執行者明確設定 E2E_ALLOW_REMOTE=1');
  process.exit(2);
}
const { chromium } = await import('playwright');
const engine = new E2EEngine({
  browserFactory: () => chromium.launch({ headless: true }),
  artifactsDir: resolve('artifacts', id,device),
  allowRemote: true
});
let accepted = false;
try {
  await engine.start(createProfilePlan(id,{device}));
  const deadline = Date.now() + 60000;
  while (['starting','running'].includes(engine.state) && Date.now() < deadline) {
    await new Promise(ok => setTimeout(ok, 250));
  }
  // This runner never attempts human authentication in an unattended workflow.
  if (engine.state === 'manual') {
    console.error('遇到需要登入的畫面，唯讀 CI 測試阻塞；不自動登入或繞過。');
  } else if (['starting','running'].includes(engine.state)) {
    console.error('瀏覽器測試逾時，未通過驗收。');
  }
  if (!['starting','running','manual'].includes(engine.state) && engine.running) {
    await engine.running;
  }
  const qa = engine.status().acceptance;
  accepted = engine.state === 'completed' && qa?.accepted === true;
  console.log(JSON.stringify({profile:id,device,state:engine.state,gate:qa?.gate,results:engine.results.map(x=>({name:x.name,status:x.status}))},null,2));
  if (!accepted) process.exitCode=1;
} catch(err) {
  console.error('唯讀 E2E 執行失敗：'+String(err.message).split('\n')[0].slice(0,180));
  process.exitCode=1;
} finally {
  await engine.stop();
}
