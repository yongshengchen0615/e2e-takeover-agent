import test from 'node:test';
import assert from 'node:assert/strict';
import { E2EEngine, validatePlan } from '../src/engine.mjs';
import { listProfiles, createProfilePlan } from '../src/profiles.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(check) {
  for(let i=0; i<220; i++) { if (check()) return; await sleep(10); }
  throw new Error('timeout');
}

function fakeBrowser() {
  let url='about:blank', authenticated=false, loginScreen=false;
  const called = [];
  const page={
    url:()=>url,
    isClosed:()=>false,
    goto:async u=>{url=u;called.push(['goto',u]);loginScreen=false;},
    locator:selector=>({
      count:async()=>selector==='#not-present'?0:1,
      isVisible:async()=>selector==='input[type="password"]'?loginScreen:authenticated,
      waitFor:async ({state})=>{if(state!=='visible'||!authenticated)throw new Error('not visible');},
      click:async()=>{called.push(['click',selector]);},
      fill:async()=>{called.push(['fill',selector]);},
      innerText:async()=> '管理工作台'
    }),
    screenshot:async()=> Buffer.from('fakeimage')
  };
  return {
    called, page,
    factory:async()=>({newContext:async()=>({newPage:async()=>page,pages:()=>[page]}),close:async()=>{}}),
    authenticate:()=>{authenticated=true;loginScreen=false;},
    fakeLogin:()=>{url='http://localhost:3000/login';loginScreen=true;},
    navigateBack:()=>{url='http://localhost:3000/admin/';loginScreen=false;}
  };
}

test('admin and client suite catalog is complete, normalized and read-only', () => {
  const profiles=listProfiles();
  assert.equal(profiles.length,8);
  assert.ok(profiles.some(p=>p.id==='admin-structure'));
  assert.ok(profiles.some(p=>p.id==='client-structure'));
  assert.ok(profiles.some(p=>p.id==='admin-auth'));
  assert.ok(profiles.some(p=>p.id==='client-booking-auth'));
  assert.equal(new Set(profiles.map(p=>p.id)).size,profiles.length);
  assert.throws(()=>createProfilePlan('not-allowed'),/找不到/);
  for(const profile of profiles) {
    const raw=createProfilePlan(profile.id,{baseUrl:'http://localhost:3000'});
    const plan=validatePlan(raw);
    assert.equal(plan.profileId,profile.id);
    assert.equal(plan.audience,profile.audience);
    assert.equal(plan.level,profile.level);
    assert.equal(plan.acceptance.criteria.length, raw.steps.filter(s=>s.action.startsWith('assert')).length);
    assert.ok(plan.steps.every(s=>['goto','assertPresent','assertVisible','pauseForLogin'].includes(s.action)));
    assert.ok(plan.steps.every(s=>!['click','fill'].includes(s.action)));
    assert.equal(plan.steps.filter(s=>s.action==='pauseForLogin').length,profile.level==='authenticated'?1:0);
    assert.equal(plan.steps.filter(s=>s.action==='assertPresent').length>0,profile.level==='structure');
    if (profile.level==='authenticated') {
      assert.equal(plan.resumeWhen.path, raw.steps[0].path);
      assert.ok(plan.resumeWhen.selector);
    }
    assert.ok(raw.acceptance.criteria.every(c=>c.required));
  }
});

test('admin and client structure tests complete without credentials and retain QA evidence', async () => {
  for (const id of ['admin-structure','client-structure']) {
    const fb=fakeBrowser();
    const engine=new E2EEngine({browserFactory:fb.factory});
    try{
      await engine.start(createProfilePlan(id,{baseUrl:'http://localhost:3000'}));
      await until(()=>engine.state==='completed');
      assert.equal(engine.status().profile.id,id);
      assert.equal(engine.status().acceptance.gate,'passed');
      assert.ok(engine.results.every(r=>r.status==='passed'));
      assert.equal(fb.called.length,1,'structure suite only navigates, never clicks');
    } finally { await engine.stop(); }
  }
});

test('admin authenticated UI check remains blocked until user explicitly verifies login', async () => {
  const fb=fakeBrowser(),engine=new E2EEngine({browserFactory:fb.factory});
  try{
    await engine.start(createProfilePlan('admin-auth',{baseUrl:'http://localhost:3000'}));
    await until(()=>engine.state==='manual');
    assert.equal(engine.status().acceptance.gate,'blocked');
    await assert.rejects(engine.resume(),/指定元件/);
    fb.authenticate();
    await engine.resume();
    await until(()=>engine.state==='completed');
    assert.equal(engine.status().acceptance.gate,'passed');
    assert.equal(fb.called.length,1);
  }finally{await engine.stop();}
});

test('client member authenticated check cannot pass without visible authenticated view', async () => {
  const fb=fakeBrowser(),engine=new E2EEngine({browserFactory:fb.factory});
  try{
    await engine.start(createProfilePlan('client-member-auth',{baseUrl:'http://localhost:3000'}));
    await until(()=>engine.state==='manual');
    await assert.rejects(engine.resume(),/指定元件/);
    assert.equal(engine.status().acceptance.accepted,false);
    await engine.stop();
    assert.equal(engine.status().acceptance.gate,'blocked');
  }finally{await engine.stop();}
});

test('automatically detected login does not cause a second manual takeover at the next explicit pause step', async () => {
  const fb=fakeBrowser(),engine=new E2EEngine({browserFactory:fb.factory});
  const originalGoto=fb.page.goto;
  fb.page.goto=async u=>{await originalGoto(u);fb.fakeLogin();};
  try {
    await engine.start(createProfilePlan('admin-auth',{baseUrl:'http://localhost:3000'}));
    await until(()=>engine.state==='manual');
    fb.authenticate();
    fb.navigateBack();
    await engine.resume();
    await until(()=>engine.state==='completed');
    assert.equal(engine.events.filter(e=>e.type==='manual').length,1,'login must not prompt twice');
    assert.equal(engine.status().acceptance.gate,'passed');
  }finally{await engine.stop();}
});

test('assertPresent checks the DOM even if hidden but rejects absent elements', async () => {
  const fb=fakeBrowser(),engine=new E2EEngine({browserFactory:fb.factory});
  try{
    await engine.start({baseUrl:'http://localhost:3000',steps:[
      {name:'找不存在的元件',action:'assertPresent',selector:'#not-present'}
    ]});
    await until(()=>engine.state==='failed');
    assert.match(engine.results[0].error,/DOM 元件不存在/);
  }finally{await engine.stop();}
});
