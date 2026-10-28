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
    assert.match(html, /id="preset"/);
    assert.match(html, /id="loadPreset"/);
    assert.match(html, /id="device"/);
    const devices=await fetch(`${url}/api/devices`);
    assert.equal(devices.status,200);
    assert.equal((await devices.json()).devices.length,4);
    const presets=await fetch(`${url}/api/profiles`);
    assert.equal(presets.status,200);
    const profileListing=await presets.json();
    assert.ok(profileListing.profiles.some(p=>p.id==='admin-structure'));
    assert.ok(profileListing.profiles.some(p=>p.id==='client-member-auth'));
    const selected=await fetch(`${url}/api/profile?id=admin-structure`);
    assert.equal(selected.status,200);
    assert.equal((await selected.json()).plan.audience,'admin');
    const bad=await fetch(`${url}/api/profile?id=../../secret`);
    assert.equal(bad.status,400);
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
