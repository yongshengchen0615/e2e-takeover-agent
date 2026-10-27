import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

test('MCP stdio handshake, tool enumeration and dashboard access', async () => {
  const child = spawn(process.execPath, [resolve('src/mcp.mjs')], { cwd: resolve('.'), stdio:['pipe','pipe','pipe'] });
  const lines = createInterface({ input: child.stdout });
  const responses = new Map();
  lines.on('line', raw => { const m = JSON.parse(raw); const waiter = responses.get(m.id); if (waiter) { responses.delete(m.id); waiter(m); } });
  let counter = 0;
  function rpc(method, params = {}) {
    const id = ++counter;
    return new Promise((ok, reject) => {
      const timer = setTimeout(() => reject(new Error('MCP response timeout')), 3000);
      responses.set(id, m => { clearTimeout(timer); ok(m); });
      child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id, method, params }) + '\n');
    });
  }
  try {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo:{name:'test', version:'1'} });
    assert.equal(init.result.serverInfo.name, 'e2e-takeover-agent');
    child.stdin.write(JSON.stringify({ jsonrpc:'2.0', method:'notifications/initialized' }) + '\n');
    const tools = await rpc('tools/list');
    assert.ok(tools.result.tools.some(t => t.name === 'e2e_resume'));
    const opened = await rpc('tools/call', { name:'e2e_open_dashboard', arguments:{} });
    const obj = JSON.parse(opened.result.content[0].text);
    assert.match(obj.dashboardUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
    const status = await fetch(`${obj.dashboardUrl}/api/status`);
    assert.equal(status.status, 200);
  } finally { child.kill('SIGTERM'); lines.close(); }
});
