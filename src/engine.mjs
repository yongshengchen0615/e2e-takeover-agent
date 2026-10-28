import { EventEmitter } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateAcceptance, evaluateAcceptance } from './acceptance.mjs';

const allowedActions = new Set(['goto', 'click', 'fill', 'assertVisible', 'assertText', 'assertUrl', 'pauseForLogin']);
const MAX_STEPS = 80;
const sensitiveSelector = /password|passcode|otp|2fa|secret|token|credential|verification.code/i;
const safeError = err => String(err?.message ?? err).split('\n')[0].replace(/https?:\/\/\S+/g, '[URL 已隱藏]').slice(0, 200);

export function validatePlan(input, { allowRemote = process.env.E2E_ALLOW_REMOTE === '1' } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('測試計畫必須是 JSON 物件');
  let baseUrl;
  try { baseUrl = new URL(input.baseUrl); } catch { throw new Error('baseUrl 必須是有效網址'); }
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) throw new Error('只接受無內嵌帳密的 HTTP(S) 網址');
  if (!allowRemote && !['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname)) {
    throw new Error('預設僅允許 localhost；遠端測試需由使用者在自己的電腦設定 E2E_ALLOW_REMOTE=1');
  }
  const steps = input.steps ?? [
    { name: '開啟首頁', action: 'goto', path: '/' },
    { name: '首頁可見', action: 'assertVisible', selector: 'body' }
  ];
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > MAX_STEPS) throw new Error(`steps 必須為 1–${MAX_STEPS} 個步驟`);
  const clean = steps.map((s, i) => {
    if (!s || typeof s !== 'object' || !allowedActions.has(s.action)) throw new Error(`步驟 ${i + 1} 的 action 不支援`);
    const step = { action: s.action, name: typeof s.name === 'string' ? s.name.slice(0, 100) : `${i + 1}. ${s.action}` };
    const requireString = key => {
      if (typeof s[key] !== 'string' || !s[key] || s[key].length > 1500) throw new Error(`步驟 ${i + 1} 缺少有效的 ${key}`);
      step[key] = s[key];
    };
    if (s.action === 'goto') {
      requireString('path');
      const target = new URL(step.path, baseUrl);
      if (target.origin !== baseUrl.origin || target.username || target.password) throw new Error('禁止跨來源自動導向；第三方登入請使用人工接管');
    }
    if (['click', 'fill', 'assertVisible', 'assertText'].includes(s.action)) requireString('selector');
    if (s.action === 'fill') {
      requireString('value');
      if (sensitiveSelector.test(s.selector)) throw new Error('敏感資訊請透過人工接管輸入，不得使用 fill 填寫密碼／OTP／權杖');
    }
    if (s.action === 'assertText') requireString('text');
    if (s.action === 'assertUrl') requireString('path');
    return step;
  });
  let resumeWhen;
  if (input.resumeWhen !== undefined) {
    const rule = input.resumeWhen;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
        !Object.keys(rule).length || Object.keys(rule).some(k => !['path', 'selector'].includes(k))) {
      throw new Error('resumeWhen 僅接受 path 或 selector 作為登入成功條件');
    }
    resumeWhen = {};
    if (rule.path !== undefined) {
      if (typeof rule.path !== 'string' || !rule.path.startsWith('/') || rule.path.startsWith('//') || rule.path.length > 500) {
        throw new Error('resumeWhen.path 必須是站內絕對路徑');
      }
      const target = new URL(rule.path, baseUrl);
      if (target.origin !== baseUrl.origin) throw new Error('resumeWhen.path 不可跨來源');
      resumeWhen.path = target.pathname;
    }
    if (rule.selector !== undefined) {
      if (typeof rule.selector !== 'string' || !rule.selector.trim() || rule.selector.length > 300) {
        throw new Error('resumeWhen.selector 必須是有效 CSS selector');
      }
      resumeWhen.selector = rule.selector;
    }
  }
  const acceptance = validateAcceptance(input.acceptance, clean);
  return { baseUrl: baseUrl.toString(), origin: baseUrl.origin, steps: clean, resumeWhen, acceptance };
}

export class E2EEngine extends EventEmitter {
  constructor({ browserFactory, artifactsDir = resolve('artifacts'), allowRemote } = {}) {
    super();
    this.browserFactory = browserFactory ?? (async () => {
      const { chromium } = await import('playwright');
      return chromium.launch({ headless: false, slowMo: 120 });
    });
    this.allowRemote = allowRemote;
    this.artifactsDir = artifactsDir;
    this.state = 'idle';
    this.events = [];
    this.results = [];
    this.browser = null;
    this.context = null;
    this.page = null;
    this.pauseReason = null;
    this._resume = null;
    this._cancelled = false;
  }
  log(type, message) {
    const event = { at: new Date().toISOString(), type, message };
    this.events.push(event);
    if (this.events.length > 250) this.events.shift();
    this.emit('update', event);
  }
  status() {
    return { state: this.state, pauseReason: this.pauseReason, results: this.results, events: this.events, total: this.plan?.steps.length ?? 0,
      acceptance: evaluateAcceptance(this.plan?.acceptance, this.results, this.state) };
  }
  async start(planInput) {
    if (!['idle', 'completed', 'failed', 'stopped'].includes(this.state)) throw new Error('已有執行中的測試；請先結束');
    if (this.browser) await this.stop();
    this.plan = validatePlan(planInput, { allowRemote: this.allowRemote });
    this.results = [];
    this.events = [];
    this._cancelled = false;
    this.state = 'starting';
    this.log('info', '啟動可見瀏覽器，準備進行測試');
    try {
      this.browser = await this.browserFactory();
      this.context = await this.browser.newContext();
      this.page = await this.context.newPage();
      this.state = 'running';
      this.log('info', '測試開始');
      this.running = this.run().catch(err => {
        if (this._cancelled) return;
        this.state = 'failed';
        this.log('error', `測試執行失敗：${safeError(err)}`);
        return this.writeReport();
      });
      return this.status();
    } catch (err) {
      this.state = 'failed';
      this.log('error', '無法啟動瀏覽器；請確認已安裝 Chromium 且此裝置有圖形桌面');
      throw err;
    }
  }
  async needsLogin() {
    if (!this.page || this.page.isClosed?.()) return false;
    const pages = this.context.pages?.() ?? [this.page];
    for (const p of pages) {
      if (p.isClosed?.()) continue;
      const raw = p.url();
      if (!raw || raw === 'about:blank') continue;
      let url;
      try { url = new URL(raw); } catch { continue; }
      if (url.origin !== this.plan.origin) return true;
      if (/\/(login|log-in|sign-in|signin)(\/|$)/i.test(url.pathname)) return true;
      try { if (await p.locator('input[type="password"]').isVisible({ timeout: 800 })) return true; } catch { /* locator absent */ }
    }
    return false;
  }
  takeover(reason = '由使用者接管') {
    if (this.state !== 'running' && this.state !== 'manual') throw new Error('目前沒有可接管的測試');
    this.state = 'manual';
    this.pauseReason = reason;
    this.log('manual', `已交還瀏覽器控制權：${reason}。停止預覽截圖與後續自動操作`);
    return this.status();
  }
  async resume() {
    if (this.state !== 'manual') throw new Error('測試尚未進入人工接管狀態');
    if (await this.needsLogin()) throw new Error('尚未確認返回受測網站的登入後頁面，請先完成登入並返回原網站');
    if (this.plan.resumeWhen?.path && new URL(this.page.url()).pathname !== this.plan.resumeWhen.path) {
      throw new Error('尚未到達設定的登入後路徑，測試仍維持人工接管');
    }
    if (this.plan.resumeWhen?.selector && !(await this.page.locator(this.plan.resumeWhen.selector).isVisible())) {
      throw new Error('登入後指定元件尚未顯示，測試仍維持人工接管');
    }
    this.state = 'running';
    this.pauseReason = null;
    this.log('resume', '使用者已交還控制權；同一瀏覽器工作階段恢復測試');
    const cb = this._resume;
    this._resume = null;
    cb?.();
    return this.status();
  }
  async waitIfManual() {
    if (this._cancelled) throw new Error('測試已停止');
    if (this.state === 'manual') {
      await new Promise(ok => { this._resume = ok; });
    }
    if (this._cancelled) throw new Error('測試已停止');
  }
  async runStep(s) {
    switch (s.action) {
      case 'goto': await this.page.goto(new URL(s.path, this.plan.baseUrl).toString(), { waitUntil: 'domcontentloaded', timeout: 20000 }); break;
      case 'click': await this.page.locator(s.selector).click({ timeout: 8000 }); break;
      case 'fill': await this.page.locator(s.selector).fill(s.value, { timeout: 8000 }); break;
      case 'assertVisible': if (!(await this.page.locator(s.selector).isVisible())) throw new Error('指定元件不可見'); break;
      case 'assertText': {
        const content = await this.page.locator(s.selector).innerText({ timeout: 8000 });
        if (!content.includes(s.text)) throw new Error('指定元件文字不符合預期');
        break;
      }
      case 'assertUrl': {
        const expected = new URL(s.path, this.plan.baseUrl).toString();
        if (this.page.url() !== expected) throw new Error('目前網址與預期不同');
        break;
      }
      case 'pauseForLogin': this.takeover('此步驟要求人工登入'); await this.waitIfManual(); break;
    }
  }
  async run() {
    for (const step of this.plan.steps) {
      await this.waitIfManual();
      this.log('step', `執行：${step.name}`);
      const t0 = Date.now();
      try {
        await this.runStep(step);
        if (this._cancelled) return;
        // 在登入畫面或跨來源頁面停下；不記錄任何登入畫面截圖
        if (this.state !== 'manual' && await this.needsLogin()) this.takeover('偵測到登入頁面或第三方驗證流程');
        await this.waitIfManual();
        this.results.push({ name: step.name, status: 'passed', elapsedMs: Date.now() - t0 });
        this.log('pass', `通過：${step.name}`);
      } catch (err) {
        if (this._cancelled) return;
        this.results.push({ name: step.name, status: 'failed', elapsedMs: Date.now() - t0, error: safeError(err) });
        this.log('fail', `失敗：${step.name}`);
        this.state = 'failed';
        await this.writeReport();
        return;
      }
    }
    this.state = 'completed';
    this.log('done', '測試完成');
    await this.writeReport();
  }
  async preview() {
    if (this.state !== 'running' || !this.page || await this.needsLogin()) return null;
    try {
      if (this.state !== 'running') return null;
      return await this.page.screenshot({ type: 'jpeg', quality: 60, timeout: 1200 });
    } catch { return null; }
  }
  async writeReport() {
    try {
      await mkdir(this.artifactsDir, { recursive: true, mode: 0o700 });
      await writeFile(resolve(this.artifactsDir, 'report.json'), JSON.stringify({
        state: this.state, generatedAt: new Date().toISOString(), results: this.results,
        acceptance: this.status().acceptance
      }, null, 2), { mode: 0o600 });
    } catch { this.log('warn', '無法輸出本機報告檔'); }
  }
  async stop() {
    const wasActive = ['starting', 'running', 'manual'].includes(this.state);
    this._cancelled = true;
    const cb = this._resume;
    this._resume = null;
    cb?.();
    if (this.browser) { try { await this.browser.close(); } catch { /* already closed */ } }
    this.browser = null;
    this.page = null;
    this.context = null;
    this.state = 'stopped';
    this.pauseReason = null;
    this.log('stop', '測試已停止，瀏覽器已關閉');
    if (wasActive) await this.writeReport();
    return this.status();
  }
}
