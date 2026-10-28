import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { CloudSuite } from './cloud-suite.mjs';
import { cloudAllowedOrigins, createCloudEngine } from './cloud-browser.mjs';
import { loadWorkspace, saveWorkspace } from './workspace.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const headers = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
function json(res, code, value, extra = {}) {
  res.writeHead(code, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(JSON.stringify(value));
}
async function getJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64000) throw new Error('要求內容超過限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
export function createBasicAuth(username, password) {
  if (!username || typeof username !== 'string' || username.includes(':')) throw new Error('請設定 CLOUD_ADMIN_USER');
  if (typeof password !== 'string' || password.length < 24) throw new Error('CLOUD_ADMIN_PASSWORD 至少需要 24 個字元');
  const expected = createHash('sha256').update(username + ':' + password).digest();
  return header => {
    if (typeof header !== 'string' || !header.startsWith('Basic ') || header.length > 1000) return false;
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const actual = createHash('sha256').update(decoded).digest();
      return timingSafeEqual(actual, expected);
    } catch { return false; }
  };
}
export function createCloudDashboard(engine, {
  host = '0.0.0.0', port = 10000, username = process.env.CLOUD_ADMIN_USER,
  password = process.env.CLOUD_ADMIN_PASSWORD,
  publicOrigin = process.env.PUBLIC_BASE_URL,
  workspaceFile
} = {}) {
  const authenticate = createBasicAuth(username, password);
  const origin = publicOrigin ? new URL(publicOrigin) : null;
  if (origin && (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash)) throw new Error('PUBLIC_BASE_URL 必須是 HTTPS 網站來源');
  const csrf = randomBytes(32).toString('hex');
  const failedAuth = new Map();
  const server = createServer(async (req, res) => {
    try {
      const hostHeader = req.headers.host ?? '';
      if (origin && hostHeader.toLowerCase() !== origin.host.toLowerCase()) return json(res, 403, { error: '不允許的 Host' });
      const reqOrigin = origin?.origin ?? 'http://' + hostHeader;
      const url = new URL(req.url, reqOrigin);
      if (url.pathname === '/healthz' && req.method === 'GET') return json(res, 200, { ok: true });
      const ip = req.socket.remoteAddress ?? 'unknown';
      const attempted = failedAuth.get(ip);
      if (attempted && attempted.until > Date.now() && attempted.count >= 20) return json(res, 429, { error: '登入嘗試過多' });
      if (!authenticate(req.headers.authorization)) {
        const current = failedAuth.get(ip);
        const fresh = !current || current.until <= Date.now();
        failedAuth.set(ip, { count: (fresh ? 0 : current.count) + 1, until: Date.now() + 60_000 });
        return json(res, 401, { error: '需要管理者登入' }, { 'WWW-Authenticate': 'Basic realm="Cloud E2E Console", charset="UTF-8"' });
      }
      failedAuth.delete(ip);
      if (req.method === 'GET' && url.pathname === '/') {
        const html = (await readFile(resolve(ROOT, 'src/cloud-dashboard.html'), 'utf8'))
          .replace('__CSRF_TOKEN__', csrf);
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (req.method === 'GET' && ['/app.js','/style.css'].includes(url.pathname)) {
        const file = url.pathname === '/app.js' ? 'cloud-dashboard.js' : 'style.css';
        const content = await readFile(resolve(ROOT, 'src/' + file));
        res.writeHead(200, { ...headers, 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });
        return res.end(content);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') return json(res, 200, engine.status());
      if (req.method === 'GET' && url.pathname === '/api/workspace') return json(res, 200, await loadWorkspace(workspaceFile));
      if (req.method === 'GET' && url.pathname === '/api/cloud/live') {
        try { return json(res, 200, { url: await engine.live() }); }
        catch { return json(res, 409, { error: '目前沒有可用的即時雲端瀏覽器' }); }
      }
      if (req.method === 'GET' && url.pathname === '/api/preview') {
        const screenshot = await engine.preview();
        if (!screenshot || engine.status().state !== 'running') {
          res.writeHead(204, headers); return res.end();
        }
        res.writeHead(200, { ...headers, 'Content-Type': 'image/jpeg' });
        return res.end(screenshot);
      }
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (req.headers['x-e2e-token'] !== csrf) return json(res, 403, { error: '缺少操作授權' });
        if (req.headers.origin && req.headers.origin !== reqOrigin) return json(res, 403, { error: '禁止跨網站操作' });
        let result;
        switch (url.pathname) {
          case '/api/quick-start': result = await engine.start(await getJson(req)); break;
          case '/api/takeover': result = engine.takeover('使用者接管雲端瀏覽器'); break;
          case '/api/resume': result = await engine.resume(); break;
          case '/api/stop': result = await engine.stop(); break;
          case '/api/workspace': result = await saveWorkspace(await getJson(req), workspaceFile); break;
          default: return json(res, 404, { error: '找不到資源' });
        }
        return json(res, 200, result);
      }
      return json(res, 404, { error: '找不到資源' });
    } catch (err) {
      return json(res, 400, { error: String(err?.message ?? err).replace(/https?:\/\/\S+/g, '[網址已隱藏]').slice(0, 180) });
    }
  });
  return {
    engine, server,
    async listen() {
      await new Promise((ok, reject) => { server.once('error', reject); server.listen(port, host, ok); });
      return origin?.origin ?? 'http://' + host + ':' + server.address().port;
    },
    async close() { await engine.stop(); await new Promise(ok => server.close(ok)); }
  };
}
export function createProductionCloudApp() {
  if (!process.env.PUBLIC_BASE_URL) throw new Error('缺少 PUBLIC_BASE_URL：須提供正式的 HTTPS 控制台網域');
  const allowedOrigins = cloudAllowedOrigins(process.env.E2E_ALLOWED_ORIGINS);
  const engine = new CloudSuite({
    allowedOrigins,
    engineFactory: () => createCloudEngine({ allowedOrigins })
  });
  return createCloudDashboard(engine, { host: '0.0.0.0', port: Number(process.env.PORT || 10000) });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let app;
  try {
    app = createProductionCloudApp();
    app.listen().then(url => console.log('Cloud E2E Console listening at ' + url))
      .catch(err => { console.error(err.message); process.exitCode = 1; });
  } catch (err) { console.error(err.message); process.exitCode = 1; }
  process.on('SIGTERM', async () => { if (app) await app.close(); process.exit(0); });
}
