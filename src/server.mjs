import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { E2EEngine } from './engine.mjs';
import { listProfiles, createProfilePlan } from './profiles.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
};

async function getJson(req) {
  const chunks = [];
  let size = 0;
  for await (const piece of req) {
    size += piece.length;
    if (size > 160_000) throw new Error('JSON 請求內容超過限制');
    chunks.push(piece);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function json(res, code, data) {
  res.writeHead(code, { ...baseHeaders, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

export function createDashboard(engine = new E2EEngine(), { host = '127.0.0.1', port = 4317 } = {}) {
  const token = randomBytes(24).toString('hex');
  const server = createServer(async (req, res) => {
    try {
      const hostHeader = req.headers.host ?? '';
      const allowedHosts = [`127.0.0.1:${server.address()?.port}`, `localhost:${server.address()?.port}`];
      if (!allowedHosts.includes(hostHeader)) return json(res, 403, { error: '不允許的 Host' });
      const url = new URL(req.url, `http://${hostHeader}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const content = (await readFile(resolve(ROOT, 'src/dashboard.html'), 'utf8')).replace('__CSRF_TOKEN__', token);
        res.writeHead(200, { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(content);
      }
      if (req.method === 'GET' && ['/app.js', '/style.css'].includes(url.pathname)) {
        const filename = url.pathname === '/app.js' ? 'dashboard.js' : 'style.css';
        const content = await readFile(resolve(ROOT, `src/${filename}`));
        res.writeHead(200, { ...baseHeaders, 'Content-Type': filename.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
        return res.end(content);
      }
      if (req.method === 'GET' && url.pathname === '/api/profiles') return json(res, 200, { profiles: listProfiles() });
      if (req.method === 'GET' && url.pathname === '/api/profile') {
        return json(res, 200, { plan: createProfilePlan(url.searchParams.get('id')) });
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, engine.status());
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        const screenshot = await engine.preview();
        if (!screenshot || engine.state !== 'running') { res.writeHead(204, baseHeaders); return res.end(); }
        res.writeHead(200, { ...baseHeaders, 'Content-Type': 'image/jpeg' });
        return res.end(screenshot);
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (req.headers['x-e2e-token'] !== token) return json(res, 403, { error: '缺少本機操作授權' });
        const origin = req.headers.origin;
        if (origin && ![`http://127.0.0.1:${server.address()?.port}`, `http://localhost:${server.address()?.port}`].includes(origin)) {
          return json(res, 403, { error: '不允許的跨網站要求' });
        }
        let result;
        switch (url.pathname) {
          case '/api/start': result = await engine.start(await getJson(req)); break;
          case '/api/takeover': result = engine.takeover('使用者在控制面板主動接管'); break;
          case '/api/resume': result = await engine.resume(); break;
          case '/api/stop': result = await engine.stop(); break;
          default: return json(res, 404, { error: '無此端點' });
        }
        return json(res, 200, result);
      }
      return json(res, 404, { error: '找不到資源' });
    } catch (err) {
      return json(res, 400, { error: String(err.message).slice(0, 200) });
    }
  });
  return {
    engine,
    server,
    async listen() {
      await new Promise((ok, reject) => server.once('error', reject).listen(port, host, ok));
      return `http://${host}:${server.address().port}`;
    },
    async close() { await engine.stop(); await new Promise(ok => server.close(ok)); }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dashboard = createDashboard();
  dashboard.listen().then(url => {
    console.log(`\nE2E Takeover Agent — 本機測試儀表板：${url}\n`);
    console.log('操作：輸入 localhost 專案網址，點「開始測試」。登入時直接操作彈出的 Chromium 視窗。');
  }).catch(err => { console.error(err); process.exitCode = 1; });
  process.on('SIGINT', async () => { await dashboard.close(); process.exit(0); });
}
