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
