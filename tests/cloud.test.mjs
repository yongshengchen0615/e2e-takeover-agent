import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BrowserbaseAdapter, createCloudEngine, cloudViewport } from '../src/cloud-browser.mjs';
import { createCloudDashboard, createBasicAuth } from '../src/cloud-server.mjs';
import { DEFAULT_WORKSPACE } from '../src/workspace.mjs';

test('cloud rejects non-allowlisted, private and non-HTTPS targets before opening browser', async () => {
  let launched = 0;
  const adapter = { connect: async () => { launched++; throw new Error('unexpected'); }, live: async () => '' };
  const engine = createCloudEngine({ adapter, allowedOrigins: ['https://staging.example.com'] });
  await assert.rejects(engine.start({ baseUrl: 'http://localhost:3000' }), /HTTPS/);
  await assert.rejects(engine.start({ baseUrl: 'https://evil.example.com' }), /允許/);
  await assert.rejects(engine.start({ baseUrl: 'https://127.0.0.1' }), /禁止/);
  assert.equal(launched, 0);
});

test('browserbase cloud adapter configures remote mobile viewport and short-lived debugger URL', async () => {
  const created = [];
  let debugArgs;
  const browser = { contexts: () => [{ pages: () => [], newPage: async () => ({}) }], close: async () => {} };
  const client = { sessions: {
    create: async data => { created.push(data); return { id: 'test-session', connectUrl: 'wss://browser.example/connect' }; },
    debug: async (id, options) => { debugArgs = [id, options]; return { debuggerFullscreenUrl: 'https://www.browserbase.com/live/temporary' }; }
  }};
  const chromium = { connectOverCDP: async endpoint => { assert.equal(endpoint, 'wss://browser.example/connect'); return browser; } };
  const adapter = new BrowserbaseAdapter({ client, chromium });
  const result = await adapter.connect({ device: 'mobile' });
  assert.equal(result.sessionId, 'test-session');
  assert.deepEqual(created[0].browserSettings.viewport, cloudViewport('mobile'));
  assert.equal(created[0].browserSettings.recordSession, false);
  assert.equal(created[0].browserSettings.logSession, false);
  assert.equal(await adapter.live('test-session'), 'https://www.browserbase.com/live/temporary');
  assert.deepEqual(debugArgs, ['test-session', { expiresIn: 120 }]);
});

test('cloud server requires authentication on status, config, preview and live debugger', async () => {
  const adapter = { connect: async () => { throw new Error('not started'); }, live: async () => '' };
  const engine = createCloudEngine({ adapter, allowedOrigins: ['https://staging.example.com'] });
  const directory = await mkdtemp(join(tmpdir(), 'e2e-cloud-'));
  const secret = 'only-for-tests-long-password-123456';
  const app = createCloudDashboard(engine, { port: 0, host: '127.0.0.1', username: 'admin', password: secret, workspaceFile: join(directory, 'workspace.json') });
  const url = await app.listen();
  const auth = { Authorization: 'Basic ' + Buffer.from('admin:' + secret).toString('base64') };
  try {
    const health = await fetch(url + '/healthz');
    assert.equal(health.status, 200);
    for (const endpoint of ['/', '/api/status', '/api/workspace', '/api/cloud/live', '/app.js', '/api/preview']) {
      assert.equal((await fetch(url + endpoint)).status, 401, endpoint);
    }
    const page = await fetch(url, { headers: auth });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /data-cloud="1"/);
    const token = html.match(/data-token="([0-9a-f]+)"/)?.[1];
    assert.ok(token);
    const forbidden = await fetch(url + '/api/start', { method: 'POST', headers: auth, body: '{}' });
    assert.equal(forbidden.status, 403);
    const injectedOrigin = await fetch(url + '/api/workspace', {
      method:'POST', headers: { ...auth, 'x-e2e-token': token, 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
      body: JSON.stringify(DEFAULT_WORKSPACE)
    });
    assert.equal(injectedOrigin.status, 403);
    const saved = await fetch(url + '/api/workspace', {
      method:'POST', headers: { ...auth, 'x-e2e-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify(DEFAULT_WORKSPACE)
    });
    assert.equal(saved.status, 200);
    assert.equal((await fetch(url + '/api/workspace', { headers: auth })).status, 200);
    const notReady = await fetch(url + '/api/cloud/live', { headers: auth });
    assert.equal(notReady.status, 409);
  } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
});

test('cloud Basic Auth only accepts configured account with timing-safe password', () => {
  const check = createBasicAuth('admin', 'this-is-a-long-test-password-123456');
  const encode = value => 'Basic ' + Buffer.from(value).toString('base64');
  assert.equal(check(encode('admin:this-is-a-long-test-password-123456')), true);
  assert.equal(check(encode('admin:wrong')), false);
  assert.equal(check(encode('other:this-is-a-long-test-password-123456')), false);
  assert.equal(check('Bearer abc'), false);
  assert.throws(() => createBasicAuth('admin','short'), /24/);
});
