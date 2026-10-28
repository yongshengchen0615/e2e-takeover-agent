import { createCloudEngine, verifyCloudUrl } from './cloud-browser.mjs';

export function quickPlans(input, allowedOrigins) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('請輸入管理端與用戶端網址');
  const adminUrl = (input.adminUrl || '').trim();
  const clientUrls = typeof input.clientUrls === 'string'
    ? input.clientUrls.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    : (Array.isArray(input.clientUrls) ? input.clientUrls : []);
  if (!adminUrl || !clientUrls.length || clientUrls.length > 8) throw new Error('需輸入管理端與 1–8 個用戶端網址');
  if (clientUrls.some(x => typeof x !== 'string')) throw new Error('用戶端網址格式錯誤');
  const targets = [
    { name: '管理端', raw: adminUrl, device: 'desktop' },
    ...clientUrls.map((raw, index) => ({ name: '用戶端 ' + (index + 1), raw, device: input.mobile === false ? 'desktop' : 'mobile' }))
  ];
  if (new Set(targets.map(t => t.raw)).size !== targets.length) throw new Error('請勿重複輸入相同的受測網址');
  return targets.map(target => {
    const url = verifyCloudUrl(target.raw, allowedOrigins);
    return {
      name: target.name,
      plan: {
        baseUrl: url.origin,
        device: target.device,
        steps: [
          { name: '開啟頁面', action: 'goto', path: url.pathname + url.search },
          ...(input.login === true ? [{ name: '人工 LINE／測試帳號登入', action: 'pauseForLogin' }] : []),
          { name: '確認頁面可見', action: 'assertVisible', selector: 'body' }
        ]
      }
    };
  });
}

export class CloudSuite {
  constructor({ engineFactory = () => createCloudEngine(), allowedOrigins } = {}) {
    this.engineFactory = engineFactory;
    this.allowedOrigins = allowedOrigins;
    this.state = 'idle';
    this.history = [];
    this.events = [];
    this.current = null;
    this.currentName = null;
    this.queue = [];
    this.cancelled = false;
    this.pauseReason = null;
  }
  status() {
    const s = this.current?.status();
    const current = this.current && ['running','manual','starting'].includes(s.state);
    return {
      state: this.state === 'running' && current ? s.state : this.state,
      pauseReason: current ? s.pauseReason : null,
      currentTarget: this.currentName,
      results: [...this.history, ...(current ? s.results.map(x => ({ ...x, target: this.currentName })) : [])],
      events: this.events.slice(-250),
      total: this.queue.reduce((acc, x) => acc + x.plan.steps.length, 0)
    };
  }
  async start(input) {
    if (['running','starting','manual'].includes(this.status().state)) throw new Error('已有執行中的測試');
    const origins = this.allowedOrigins ?? this.engineFactory().allowedOrigins;
    this.queue = quickPlans(input, origins); // validate ALL targets before using provider
    this.history = [];
    this.events = [];
    this.cancelled = false;
    this.state = 'running';
    this.current = null;
    this.currentName = null;
    this.worker = this.run();
    return this.status();
  }
  async run() {
    try {
      for (const item of this.queue) {
        if (this.cancelled) return;
        const engine = this.engineFactory();
        this.current = engine;
        this.currentName = item.name;
        engine.on('update', event => {
          this.events.push({ ...event, message: item.name + '：' + event.message });
          if (this.events.length > 250) this.events.shift();
        });
        await engine.start(item.plan);
        await engine.running;
        if (this.cancelled) return;
        this.history.push(...engine.results.map(result => ({ ...result, target: item.name })));
        if (engine.state !== 'completed') {
          this.state = 'failed';
          await engine.stop();
          this.current = null;
          return;
        }
        await engine.stop();
        this.current = null;
      }
      this.currentName = null;
      this.state = 'completed';
      this.events.push({ at: new Date().toISOString(), type: 'done', message: '管理端／用戶端測試全部完成' });
    } catch (error) {
      this.state = this.cancelled ? 'stopped' : 'failed';
      this.events.push({ at: new Date().toISOString(), type: 'fail', message: '雲端測試失敗：' + String(error?.message ?? error).replace(/https?:\/\/\S+/g,'[網址已隱藏]').slice(0, 150) });
      if (this.current) { try { await this.current.stop(); } catch { /* cleanup */ } }
      this.current = null;
    }
  }
  takeover(reason = '使用者接管登入') {
    if (!this.current) throw new Error('沒有正在執行的測試');
    return this.current.takeover(reason);
  }
  async resume() {
    if (!this.current) throw new Error('沒有暫停中的測試');
    return this.current.resume();
  }
  async preview() { return this.current?.preview() ?? null; }
  async live() {
    if (!this.current || this.current.state === 'starting') throw new Error('雲端瀏覽器尚未準備好');
    return this.current.live();
  }
  async stop() {
    this.cancelled = true;
    if (this.current) await this.current.stop();
    this.state = 'stopped';
    return this.status();
  }
}
