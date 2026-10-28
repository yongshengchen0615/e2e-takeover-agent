import test from 'node:test';
import assert from 'node:assert/strict';
import { E2EEngine, validatePlan } from '../src/engine.mjs';
import { listDevices, validateDevice, contextOptions } from '../src/devices.mjs';
import { createProfilePlan } from '../src/profiles.mjs';

const tick=ms=>new Promise(ok=>setTimeout(ok,ms));
async function until(check) {
 for(let i=0;i<150;i++){if(check())return;await tick(10)}
 throw new Error('timeout');
}
function browser(metrics={viewportWidth:390,scrollWidth:390}) {
 let url='about:blank',saved;
 const page={
  url:()=>url,isClosed:()=>false,goto:async u=>{url=u},
  locator:()=>({count:async()=>1,isVisible:async()=>false}),
  evaluate:async()=>metrics,
  screenshot:async()=>Buffer.from('placeholder')
 };
 return {
  factory: async()=>({newContext:async options=>{saved=options;return {newPage:async()=>page,pages:()=>[page]};},close:async()=>{}}),
  getOptions:()=>saved
 };
}
test('mobile devices are fixed safe phone viewport presets',()=>{
 const devices=listDevices();
 assert.equal(devices.length,4);
 assert.equal(validateDevice('mobileSmall').viewport.width,360);
 assert.equal(validateDevice('mobileStandard').viewport.height,844);
 assert.equal(validateDevice('mobileLarge').viewport.width,430);
 assert.deepEqual(contextOptions({id:'mobileStandard'}),{
  viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:3
 });
 assert.throws(()=>validateDevice('customScript'),/未知裝置/);
 assert.throws(()=>validatePlan({baseUrl:'http://localhost:3000',device:{width:999}}),/未知裝置/);
});
test('mobile admin/client plans insert required horizontal overflow check',()=>{
 for(const id of ['admin-structure','client-structure','admin-auth','client-booking-auth']) {
  const x=createProfilePlan(id,{baseUrl:'http://localhost:3000',device:'mobileStandard'});
  const plan=validatePlan(x);
  assert.equal(plan.device.viewport.width,390);
  assert.equal(plan.steps.filter(s=>s.action==='assertNoHorizontalOverflow').length,1);
  assert.equal(plan.acceptance.criteria.at(-1).id,'RWD-001');
  assert.equal(plan.acceptance.criteria.at(-1).required,true);
 }
});
test('mobile engine applies chromium context size and passes non-overflow QA gate',async()=>{
 const b=browser();
 const e=new E2EEngine({browserFactory:b.factory});
 try {
  await e.start(createProfilePlan('client-structure',{baseUrl:'http://localhost:3000',device:'mobileStandard'}));
  await until(()=>e.state==='completed');
  assert.deepEqual(b.getOptions(),contextOptions({id:'mobileStandard'}));
  assert.equal(e.status().device.viewport.width,390);
  assert.equal(e.status().acceptance.gate,'passed');
 }finally{await e.stop();}
});
test('mobile viewport horizontal overflow causes QA gate failure',async()=>{
 const b=browser({viewportWidth:360,scrollWidth:415});
 const e=new E2EEngine({browserFactory:b.factory});
 try {
  await e.start(createProfilePlan('admin-structure',{baseUrl:'http://localhost:3000',device:'mobileSmall'}));
  await until(()=>e.state==='failed');
  assert.equal(e.status().acceptance.gate,'failed');
  assert.match(e.results.at(-1).error,/橫向溢出/);
 }finally{await e.stop();}
});
