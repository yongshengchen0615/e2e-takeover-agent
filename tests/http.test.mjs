import test from 'node:test';
import assert from 'node:assert/strict';
import { createDashboard } from '../src/server.mjs';
import { E2EEngine } from '../src/engine.mjs';

test('dashboard binds loopback and requires CSRF token for state changes', async () => {
  const app = createDashboard(new E2EEngine(), { port: 0 });
  const url = await app.listen();
  try {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /E2E Takeover Agent/);
    const token = html.match(/data-token="([0-9a-f]+)"/)?.[1];
    assert.ok(token);
    const forbidden = await fetch(`${url}/api/stop`, { method:'POST' });
    assert.equal(forbidden.status, 403);
    const badOrigin = await fetch(`${url}/api/stop`, { method:'POST', headers: { 'x-e2e-token': token, Origin:'https://evil.test' } });
    assert.equal(badOrigin.status, 403);
    const ok = await fetch(`${url}/api/stop`, { method:'POST', headers: { 'x-e2e-token': token } });
    assert.equal(ok.status, 200);
  } finally { await app.close(); }
});

test('dashboard can save and load multiple targets with CSRF protection', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { DEFAULT_WORKSPACE } = await import('../src/workspace.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'e2e-http-config-'));
  const app = createDashboard(new E2EEngine(), { port: 0, workspaceFile: join(dir, 'config.json') });
  const url = await app.listen();
  try {
    const page = await (await fetch(url)).text();
    const token = page.match(/data-token="([0-9a-f]+)"/)?.[1];
    const blocked = await fetch(url + '/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(DEFAULT_WORKSPACE) });
    assert.equal(blocked.status, 403);
    const stored = await fetch(url + '/api/workspace', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-e2e-token': token },
      body: JSON.stringify(DEFAULT_WORKSPACE)
    });
    assert.equal(stored.status, 200);
    const loaded = await (await fetch(url + '/api/workspace')).json();
    assert.equal(loaded.targets.length, 3);
    assert.equal(loaded.accounts.find(a => a.method === 'line').id, 'client-line');
  } finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
});
