import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTargets, runSmoke } from '../scripts/remote-smoke.mjs';

const ADMIN='https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test';

test('URL-only runner plans exact admin route and separately sized clients',()=>{
  const targets=buildTargets({adminUrl:ADMIN,clientUrls:'https://app.example.com/\nhttps://shop.example.com/cart',mobileClients:true});
  assert.equal(targets.length,3);
  assert.equal(targets[0].url,ADMIN);
  assert.equal(targets[0].device,'desktop');
  assert.deepEqual(targets.slice(1).map(t=>t.device),['mobile','mobile']);
});
test('cloud runner refuses localhost, private IPs, HTTP and embedded passwords',()=>{
  for(const url of ['http://example.com','https://127.0.0.1/admin','https://[::1]/','https://localhost','https://user:pass@example.com','https://example.com#access_token=s']) {
    assert.throws(()=>buildTargets({adminUrl:url}),url);
  }
  assert.throws(()=>buildTargets({adminUrl:'https://example.com',clientUrls:'https://example.com'}),/重複/);
});

function mockBrowser({code=200, redirectedTo=null, password=false, visible=true, throwError=null}={}){
  const visit=[],contexts=[];
  return {
    visit,contexts,
    browser:{
      async newContext(settings) {
        contexts.push(settings);
        let latest='about:blank';
        return {
          async newPage(){return {
            async goto(url){visit.push(url);latest=redirectedTo||url;if(throwError)throw new Error(throwError);return {status:()=>code};},
            url:()=>latest,
            locator(selector){
              if(selector==='body')return {isVisible:async()=>visible};
              if(selector==='input[type="password"]')return {count:async()=>password?1:0};
              throw new Error('unexpected selector');
            },
            async screenshot(){return Buffer.from('test-image')}
          };},
          async close(){}
        };
      },
      async close(){}
    }
  };
}

test('read-only E2E visits site in cloud browser and reports success with independent contexts', async()=>{
  const mock=mockBrowser();
  const results=await runSmoke({adminUrl:ADMIN,clientUrls:'https://app.example.com/home'},{
    chromium:{launch:async(options)=>{assert.equal(options.headless,true);return mock.browser;}}
  });
  assert.equal(results.length,2);
  assert.deepEqual(results.map(r=>r.state),['passed','passed']);
  assert.deepEqual(mock.visit,[ADMIN,'https://app.example.com/home']);
  assert.deepEqual(mock.contexts.map(c=>c.viewport),[{width:1440,height:900},{width:390,height:844}]);
});
test('auth redirect or login form is manual-required, never reports logged-in success',async()=>{
  for(const options of [{redirectedTo:'https://access.line.me/oauth2/'},{password:true}]){
    const mock=mockBrowser(options);
    const results=await runSmoke({adminUrl:ADMIN},{chromium:{launch:async()=>mock.browser}});
    assert.equal(results[0].state,'login_required');
  }
});
test('server errors, empty pages and network errors are failures rather than green',async()=>{
  for(const options of [{code:503},{visible:false},{throwError:'net::ERR_CONNECTION_TIMED_OUT'}]){
    const mock=mockBrowser(options);
    const results=await runSmoke({adminUrl:ADMIN},{chromium:{launch:async()=>mock.browser}});
    assert.equal(results[0].state,'failed');
  }
});
