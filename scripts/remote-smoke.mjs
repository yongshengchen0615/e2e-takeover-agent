import { isIP } from 'node:net';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ADMIN_URL = 'https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test';

function publicUrl(input) {
  let url;
  try { url = new URL(input); } catch { throw new Error('受測網址不是有效的 HTTPS 網址'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash)
    throw new Error('只允許無內嵌帳密或片段的 HTTPS 網址');
  const name=url.hostname.toLowerCase().replace(/\.$/,'').replace(/^\[|\]$/g,'');
  if (isIP(name) !== 0 || name === 'localhost' || name.endsWith('.localhost') ||
      name.endsWith('.local') || name.endsWith('.internal') ||
      name.endsWith('.test') || name.endsWith('.invalid') || name.endsWith('.onion'))
    throw new Error('禁止測試內網、IP 或保留網域');
  if (input.length > 2048) throw new Error('受測網址太長');
  return url;
}
export function buildTargets({adminUrl=DEFAULT_ADMIN_URL,clientUrls='',mobileClients=true}={}) {
  const clients=typeof clientUrls === 'string'
    ? clientUrls.split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean)
    : clientUrls;
  if (!Array.isArray(clients) || clients.length > 8 || clients.some(c=>typeof c!=='string'))
    throw new Error('用戶端網址需是最多八筆的清單');
  const targets=[{name:'管理端',url:adminUrl,device:'desktop'},
    ...clients.map((url,i)=>({name:'用戶端 '+(i+1),url,device:mobileClients?'mobile':'desktop'}))];
  if (new Set(targets.map(t=>t.url)).size !== targets.length) throw new Error('受測網址不可重複');
  return targets.map(t=>({...t,url:publicUrl(t.url).href}));
}
const describe = e=> String(e?.message??e).split('\n')[0].replace(/https?:\/\/\S+/g,'[URL 隱藏]').slice(0,170);

export async function runSmoke(input={}, {chromium, screenshots=false, reportDir=resolve('artifacts/remote-e2e')}={}) {
  const targets=buildTargets(input);
  const implementation=chromium ?? (await import('playwright')).chromium;
  const browser=await implementation.launch({headless:true});
  const results=[];
  try {
    for(const target of targets) {
      let context;
      const result={target:target.name,hostname:new URL(target.url).hostname,device:target.device,state:'failed',httpStatus:null,details:''};
      try {
        context=await browser.newContext({
          viewport:target.device==='mobile'?{width:390,height:844}:{width:1440,height:900},
          isMobile:target.device==='mobile',
          hasTouch:target.device==='mobile',
          ignoreHTTPSErrors:false,
          acceptDownloads:false,
          serviceWorkers:'block'
        });
        if (typeof context.route==='function') {
          await context.route('**/*', async route => {
            const address=route.request().url();
            if (/^(data:|blob:)/.test(address)) return route.continue();
            try { publicUrl(address); return route.continue(); }
            catch { return route.abort('blockedbyclient'); }
          });
        }
        const page=await context.newPage();
        const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:35000});
        result.httpStatus=response?.status()??null;
        if (result.httpStatus!==null && result.httpStatus>=400) {
          result.details='伺服器回應 HTTP '+result.httpStatus;
        } else if (!await page.locator('body').isVisible({timeout:10000})) {
          result.details='畫面 body 不可見';
        } else {
          const destination=new URL(page.url());
          const passwordVisible=await page.locator('input[type="password"]').count()>0;
          const looksLikeLogin=/(^|\/)(login|log-in|signin|sign-in)(\/|$)/i.test(destination.pathname);
          if (destination.origin!==new URL(target.url).origin || passwordVisible || looksLikeLogin) {
            result.state='login_required';
            result.details='網站顯示登入／跨網域驗證；需人工接管，未測試登入後功能';
          } else {
            result.state='passed';
            result.details='HTTP 成功且頁面可見；僅代表公開頁面冒煙測試通過';
            if (screenshots && page.screenshot) {
              await mkdir(resolve(reportDir,'screenshots'),{recursive:true,mode:0o700});
              await page.screenshot({path:resolve(reportDir,'screenshots',target.device+'-'+results.length+'.png'),timeout:4000});
            }
          }
        }
      } catch(e) {
        result.state='failed';
        result.details=describe(e);
      } finally {
        if(context)await context.close().catch(()=>{});
      }
      results.push(result);
      console.log(target.name+': '+result.state+' ('+result.hostname+') '+result.details);
    }
  } finally { await browser.close(); }
  return results;
}
export async function writeReport(results,{reportDir=resolve('artifacts/remote-e2e'),summaryFile=process.env.GITHUB_STEP_SUMMARY}={}) {
  await mkdir(reportDir,{recursive:true,mode:0o700});
  await writeFile(resolve(reportDir,'results.json'),JSON.stringify({
    at:new Date().toISOString(),mode:'github-actions-headless-readonly',results
  },null,2)+'\n',{mode:0o600});
  const outcome=results.some(x=>x.state==='failed')?'FAIL':results.some(x=>x.state==='login_required')?'LOGIN REQUIRED':'PASS';
  const summary=['## 雲端 E2E 即時執行結果','','總體：**'+outcome+'**（僅公開頁面冒煙測試；不代表登入成功）','',
    '| 受測端 | 域名 | 模式 | 狀態 | 訊息 |','|---|---|---|---|---|',
    ...results.map(x=>'| '+x.target+' | '+x.hostname+' | '+x.device+' | '+x.state+' | '+x.details.replace(/[|]/g,'/')+' |'),
    '', 'LINE/OTP 人工接管需使用獨立雲端互動瀏覽器服務；GitHub Actions 無法提供即時人工登入。'].join('\n');
  if(summaryFile) await appendFile(summaryFile,summary+'\n');
  return outcome;
}
async function main() {
  const results=await runSmoke({
    adminUrl:process.env.E2E_ADMIN_URL||DEFAULT_ADMIN_URL,
    clientUrls:process.env.E2E_CLIENT_URLS||'',
    mobileClients:process.env.E2E_MOBILE_CLIENTS!=='false'
  },{screenshots:process.env.E2E_SCREENSHOTS==='true'});
  const outcome=await writeReport(results);
  console.log('Cloud smoke suite: '+outcome);
  if(outcome==='FAIL')process.exitCode=1;
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  main().catch(e=>{console.error('雲端測試無法執行：'+describe(e));process.exitCode=1;});
}
