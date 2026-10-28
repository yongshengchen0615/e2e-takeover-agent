import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { E2EEngine, validatePlan } from '../src/engine.mjs';
import { evaluateAcceptance } from '../src/acceptance.mjs';

const base = 'http://localhost:3000';
const acceptance = { method: 'QA / E2E', criteria: [
  { id:'QA-001', title:'首頁驗收', stepNames:['首頁可見'] },
  { id:'E2E-002', title:'標題驗收', stepNames:['文字正確'] }
]};
const steps = [
  { action:'goto', path:'/', name:'進入首頁' },
  { action:'assertVisible', selector:'main', name:'首頁可見' },
  { action:'assertText', selector:'h1', text:'Ready', name:'文字正確' }
];
const plan = () => ({ baseUrl:base, steps, acceptance });
const delay = ms => new Promise(ok => setTimeout(ok, ms));
async function until(predicate) {
  for (let i=0;i<200;i++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error('timeout');
}
function fakeBrowser({ failText=false } = {}) {
  let url='about:blank';
  const page = {
    url: () => url,
    isClosed: () => false,
    goto: async v => { url = v; },
    locator: selector => ({
      isVisible: async () => selector !== 'input[type="password"]',
      innerText: async () => failText ? 'Wrong' : 'Ready',
      click: async () => {},
      fill: async () => {}
    }),
    screenshot: async () => Buffer.from('image')
  };
  return async () => ({ newContext: async () => ({
    newPage: async () => page, pages: () => [page]
  }), close: async () => {} });
}

test('QA/E2E schema rejects unverifiable or invalid acceptance conditions', () => {
  const valid = validatePlan(plan());
  assert.equal(valid.acceptance.criteria.length, 2);
  assert.equal(valid.acceptance.criteria[0].required, true);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ method:'QA / E2E', criteria:[] } }), /criteria/);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ method:'Unit', criteria:acceptance.criteria } }), /QA \/ E2E/);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ ...acceptance, criteria:[
    { id:'QA-001', title:'no assertion', stepNames:['進入首頁'] }
  ] } }), /斷言/);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ ...acceptance, criteria:[
    { id:'QA-001', title:'bad', stepNames:['不存在'] }
  ] } }), /stepNames/);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ ...acceptance, criteria:[
    acceptance.criteria[0], { ...acceptance.criteria[1], id:'QA-001' }
  ] } }), /唯一/);
  assert.throws(() => validatePlan({ ...plan(), steps: [...steps, { ...steps[1] }] }), /名稱不可重複/);
  assert.throws(() => validatePlan({ ...plan(), acceptance:{ ...acceptance, criteria:
    acceptance.criteria.map(c => ({ ...c, required:false })) } }), /必要驗收/);
});

test('QA/E2E only passes after a completed run; saved report includes evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'e2e-qa-'));
  const e = new E2EEngine({ browserFactory:fakeBrowser(), artifactsDir:dir });
  try {
    const initial = await e.start(plan());
    assert.equal(initial.acceptance.accepted, false);
    await until(() => e.state === 'completed');
    const qa = e.status().acceptance;
    assert.equal(qa.gate, 'passed');
    assert.equal(qa.accepted, true);
    assert.deepEqual(qa.summary, {passed:2, failed:0, blocked:0, not_run:0});
    const report=JSON.parse(await readFile(join(dir,'report.json'),'utf8'));
    assert.equal(report.acceptance.gate, 'passed');
    assert.equal(report.acceptance.criteria[1].evidence[0].name,'文字正確');
  } finally { await e.stop(); await rm(dir,{recursive:true,force:true}); }
});

test('QA/E2E failure blocks the acceptance gate and records failed evidence', async () => {
  const e = new E2EEngine({ browserFactory:fakeBrowser({ failText:true }) });
  try {
    await e.start(plan());
    await until(() => e.state === 'failed');
    const qa = e.status().acceptance;
    assert.equal(qa.gate, 'failed');
    assert.equal(qa.accepted, false);
    assert.equal(qa.criteria[0].status,'passed');
    assert.equal(qa.criteria[1].status,'failed');
  } finally { await e.stop(); }
});

test('Manual takeover and stop never mark QA/E2E as accepted', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'e2e-qa-pause-'));
  const e = new E2EEngine({ browserFactory:fakeBrowser(), artifactsDir:dir });
  const manualPlan={ baseUrl:base, steps:[
    {action:'goto',path:'/',name:'開啟'},
    {action:'pauseForLogin',name:'人工登入'},
    {action:'assertVisible',selector:'main',name:'登入後可見'}
  ], acceptance:{method:'QA / E2E',criteria:[
    {id:'QA-LOGIN',title:'登入後畫面',stepNames:['登入後可見']}
  ]}};
  try {
    await e.start(manualPlan);
    await until(() => e.state === 'manual');
    assert.equal(e.status().acceptance.gate,'blocked');
    assert.equal(e.status().acceptance.criteria[0].status,'blocked');
    await e.stop();
    const report=JSON.parse(await readFile(join(dir,'report.json'),'utf8'));
    assert.equal(report.acceptance.accepted,false);
    assert.equal(report.acceptance.gate,'blocked');
  } finally { await e.stop(); await rm(dir,{recursive:true,force:true}); }
});

test('No QA plan cannot produce a passing acceptance gate', () => {
  assert.equal(evaluateAcceptance(undefined, [], 'completed'), null);
});
