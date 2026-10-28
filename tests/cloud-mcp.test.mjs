import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const adminUrl = 'https://integrated-marketing-platform--memberwebsocket-dev-netlify.netlify.app/admin/?business=test';
const adminOrigin = new URL(adminUrl).origin;

test('plugin default MCP entry is cloud rather than localhost runner', async () => {
  const manifest = JSON.parse(await readFile('mcp.json', 'utf8'));
  const command = manifest.mcpServers['e2e-takeover'];
  assert.deepEqual(command.args, ['$' + '{PLUGIN_ROOT}/src/cloud-mcp.mjs']);
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.match(pkg.scripts.mcp, /cloud-mcp\.mjs/);
  assert.match(pkg.scripts['mcp:local'], /src\/mcp\.mjs/);
});

test('default cloud MCP returns cloud-credential guidance, never local E2E_ALLOW_REMOTE error', async () => {
  const child = spawn(process.execPath, [resolve('src/cloud-mcp.mjs')], {
    cwd: resolve('.'), stdio: ['pipe','pipe','pipe'],
    env: {
      ...process.env,
      BROWSERBASE_API_KEY: '',
      BROWSERBASE_PROJECT_ID: '',
      E2E_ALLOW_REMOTE: '',
      E2E_ALLOWED_ORIGINS: adminOrigin,
      PUBLIC_BASE_URL: 'https://cloud-qa.example.com'
    }
  });
  const lines = createInterface({ input: child.stdout });
  const responses = new Map();
  lines.on('line', text => {
    const reply = JSON.parse(text);
    const waiting = responses.get(reply.id);
    if (waiting) { responses.delete(reply.id); waiting(reply); }
  });
  let id = 0;
  function rpc(method, params = {}) {
    const requestId = ++id;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error('Cloud MCP response timeout')), 5000);
      responses.set(requestId, response => { clearTimeout(timeout); accept(response); });
      child.stdin.write(JSON.stringify({ jsonrpc:'2.0', id:requestId, method, params }) + '\n');
    });
  }
  try {
    const initialized = await rpc('initialize', { protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{name:'test',version:'1'} });
    assert.equal(initialized.result.serverInfo.name, 'e2e-takeover-agent-cloud');
    const tools = await rpc('tools/list');
    const listed = tools.result.tools.map(t => t.name);
    for (const tool of ['e2e_start','e2e_quick_start','e2e_live','e2e_resume','e2e_stop']) assert.ok(listed.includes(tool), tool);
    const dash = await rpc('tools/call',{name:'e2e_open_dashboard',arguments:{}});
    const open = JSON.parse(dash.result.content[0].text);
    assert.equal(open.dashboardUrl, 'https://cloud-qa.example.com');
    const start = await rpc('tools/call', { name:'e2e_start', arguments:{ baseUrl:adminUrl } });
    assert.equal(start.result.isError, true);
    const message = start.result.content[0].text;
    assert.match(message, /BROWSERBASE_API_KEY/);
    assert.doesNotMatch(message, /E2E_ALLOW_REMOTE|localhost/);
    const status = await rpc('tools/call', { name:'e2e_status', arguments:{} });
    assert.match(status.result.content[0].text, /idle/);
  } finally { child.kill('SIGTERM'); lines.close(); }
});

test('cloud entry allows explicit HTTPS admin target with path+query without local allowRemote flag', async () => {
  const { verifyCloudUrl } = await import('../src/cloud-browser.mjs');
  const { validatePlan } = await import('../src/engine.mjs');
  const target = verifyCloudUrl(adminUrl, [adminOrigin]);
  const plan = validatePlan({
    baseUrl: target.origin,
    steps: [{ action: 'goto', path:target.pathname + target.search }]
  }, { allowRemote:true });
  assert.equal(new URL(plan.steps[0].path, plan.baseUrl).href, adminUrl);
});
