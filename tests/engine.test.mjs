import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { E2EEngine, validatePlan } from '../src/engine.mjs';

const sleep = ms => new Promise(ok => setTimeout(ok, ms));
async function until(fn, timeout = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeout) throw new Error('test timeout');
    await sleep(10);
  }
}
function setup() {
  const calls = [];
  let currentUrl = 'about:blank';
  let passField = false;
  let closed = false;
  const page = {
    url: () => currentUrl,
    isClosed: () => closed,
    goto: async url => { calls.push(['goto', url]); currentUrl = url; passField = url.endsWith('/login'); },
    locator: selector => ({
      isVisible: async () => selector.includes('password') ? passField : true,
      click: async () => { calls.push(['click', selector]); },
      fill: async val => { calls.push(['fill', selector, val]); },
      innerText: async () => 'Hello Example'
    }),
    screenshot: async () => Buffer.from('fakejpg')
  };
  const browser = { newContext: async () => ({ newPage: async () => page, pages: () => [page] }), close: async () => { closed = true; } };
  return { page, calls, browserFactory: async () => browser, loginDone: () => { currentUrl = 'http://localhost:3000/dashboard'; passField = false; } };
}

test('plan validation blocks remote URLs, cross-origin goto, and filling secrets', () => {
  assert.throws(() => validatePlan({ baseUrl: 'https://example.com' }), /localhost/);
  assert.throws(() => validatePlan({ baseUrl: 'http://localhost:3000', steps: [{ action: 'goto', path: 'https://other.com' }] }), /跨來源/);
  assert.throws(() => validatePlan({ baseUrl: 'http://localhost:3000', steps: [{ action: 'fill', selector: 'input[type=password]', value: 'secret' }] }), /敏感/);
  assert.equal(validatePlan({ baseUrl: 'http://localhost:3000' }).steps.length, 2);
  assert.equal(validatePlan({ baseUrl: 'https://example.com' }, { allowRemote: true }).origin, 'https://example.com');
});

test('automatic login takeover halts later steps, preserves same page and resumes', async () => {
  const fake = setup();
  const dir = await mkdtemp(join(tmpdir(), 'e2e-agent-test-'));
  const engine = new E2EEngine({ browserFactory: fake.browserFactory, artifactsDir: dir });
  await engine.start({ baseUrl:'http://localhost:3000', steps:[
    { action:'goto', path:'/login', name:'登入' },
    { action:'click', selector:'#next', name:'後續操作' }
  ] });
  await until(() => engine.state === 'manual');
  assert.equal(engine.status().results.length, 0);
  assert.equal(fake.calls.length, 1, 'manual stop must prevent further actions');
  assert.equal(await engine.preview(), null, 'preview must be disabled during login');
  await assert.rejects(engine.resume(), /尚未確認/);
  fake.loginDone();
  await engine.resume();
  await until(() => engine.state === 'completed');
  assert.equal(fake.calls.length, 2);
  assert.equal(engine.results.length, 2);
  assert.equal(engine.results[0].status, 'passed');
  assert.equal(JSON.parse(await readFile(join(dir, 'report.json'))).state, 'completed');
  await engine.stop();
  await rm(dir, { recursive: true, force: true });
});

test('explicit human takeover step waits for dashboard resume', async () => {
  const fake = setup();
  const engine = new E2EEngine({ browserFactory: fake.browserFactory });
  await engine.start({ baseUrl:'http://localhost:3000', steps:[
    { action:'goto', path:'/' },
    { action:'pauseForLogin' },
    { action:'assertText', selector:'h1', text:'Hello' }
  ] });
  await until(() => engine.state === 'manual');
  assert.equal(engine.results.length, 1);
  assert.deepEqual(await engine.preview(), null);
  await engine.resume();
  await until(() => engine.state === 'completed');
  assert.equal(engine.results.length, 3);
  await engine.stop();
});

test('stop during manual pause cancels pending automation', async () => {
  const fake = setup();
  const engine = new E2EEngine({ browserFactory: fake.browserFactory });
  await engine.start({ baseUrl:'http://localhost:3000', steps:[
    { action:'pauseForLogin' }, { action:'click', selector:'#must-not-run' }
  ] });
  await until(() => engine.state === 'manual');
  await engine.stop();
  await sleep(25);
  assert.equal(engine.state, 'stopped');
  assert.equal(fake.calls.length, 0);
});
