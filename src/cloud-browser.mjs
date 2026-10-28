import { E2EEngine, validatePlan } from './engine.mjs';
import { isIP } from 'node:net';

export function cloudViewport(device = 'desktop') {
  return device === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
}

export class BrowserbaseAdapter {
  constructor({ client, chromium } = {}) {
    this.client = client;
    this.chromium = chromium;
  }
  async ensure() {
    if (!this.client) {
      if (!process.env.BROWSERBASE_API_KEY) throw new Error('缺少 BROWSERBASE_API_KEY；尚未連線至雲端瀏覽器');
      const { default: Browserbase } = await import('@browserbasehq/sdk');
      this.client = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    }
    if (!this.chromium) this.chromium = (await import('playwright')).chromium;
  }
  async connect({ device = 'desktop' } = {}) {
    await this.ensure();
    const session = await this.client.sessions.create({
      ...(process.env.BROWSERBASE_PROJECT_ID ? { projectId: process.env.BROWSERBASE_PROJECT_ID } : {}),
      api_timeout: 900,
      browserSettings: {
        viewport: cloudViewport(device),
        os: device === 'mobile' ? 'mobile' : 'linux',
        recordSession: false,
        logSession: false,
        solveCaptchas: false
      }
    });
    let browser;
    try {
      browser = await this.chromium.connectOverCDP(session.connectUrl);
      const context = browser.contexts()[0];
      if (!context) throw new Error('雲端瀏覽器未回傳預設 context');
      const page = context.pages()[0] || await context.newPage();
      if (page.setViewportSize) await page.setViewportSize(cloudViewport(device));
      return { browser, context, page, sessionId: session.id };
    } catch (error) {
      if (browser) { try { await browser.close(); } catch { /* disconnected */ } }
      throw error;
    }
  }
  async live(sessionId) {
    if (!sessionId) throw new Error('沒有正在執行的雲端瀏覽器工作階段');
    await this.ensure();
    const result = await this.client.sessions.debug(sessionId, { expiresIn: 120 });
    const raw = result.debuggerFullscreenUrl;
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !(url.hostname === 'browserbase.com' || url.hostname.endsWith('.browserbase.com'))) {
      throw new Error('雲端瀏覽器回傳不受信任的即時網址');
    }
    return url.toString();
  }
}

function blockedHost(host) {
  const value = host.toLowerCase().replace(/^\[|\]$/g, '');
  return isIP(value) !== 0 || value === 'localhost' || value.endsWith('.localhost') ||
    value === '::1' || value === '0.0.0.0' ||
    /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) ||
    /^169\.254\./.test(value) || /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^fc[0-9a-f]{2}:/i.test(value) || /^fd[0-9a-f]{2}:/i.test(value) ||
    /^fe80:/i.test(value) || value.endsWith('.internal') ||
    value.endsWith('.local') || value.endsWith('.test') || value.endsWith('.invalid');
}
export function verifyCloudUrl(raw, allowedOrigins) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('請輸入有效的 HTTPS 網址'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('雲端模式只允許不含帳密的 HTTPS 網址');
  if (blockedHost(url.hostname)) throw new Error('禁止測試 localhost、私有或保留的網路位址');
  if (!Array.isArray(allowedOrigins) || !allowedOrigins.includes(url.origin)) throw new Error('此網站不在已授權的允許來源清單');
  if (url.hash) throw new Error('測試網址不可包含 # 片段');
  return url;
}
export function cloudAllowedOrigins(raw) {
  const values = (raw || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!values.length) throw new Error('雲端測試需先設定 E2E_ALLOWED_ORIGINS（逗號分隔的 HTTPS 網站來源）');
  return [...new Set(values.map(value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || blockedHost(url.hostname)) {
      throw new Error('E2E_ALLOWED_ORIGINS 只允許公網 HTTPS 網站來源，不含路徑');
    }
    return url.origin;
  }))];
}
export function createCloudEngine({ adapter = new BrowserbaseAdapter(), allowedOrigins } = {}) {
  const origins = allowedOrigins === undefined ? cloudAllowedOrigins(process.env.E2E_ALLOWED_ORIGINS) : allowedOrigins;
  const engine = new E2EEngine({
    allowRemote: true,
    sessionFactory: plan => adapter.connect({ device: plan.device })
  });
  const start = engine.start.bind(engine);
  engine.start = async input => {
    const clean = validatePlan(input, { allowRemote: true });
    verifyCloudUrl(clean.baseUrl, origins);
    return start(input);
  };
  engine.live = async () => {
    if (!engine.sessionId || ['idle','stopped','completed','failed'].includes(engine.state)) throw new Error('沒有可接管的雲端工作階段');
    return adapter.live(engine.sessionId);
  };
  engine.allowedOrigins = origins;
  return engine;
}
