const ASSERTIONS = new Set(['assertVisible', 'assertPresent', 'assertText', 'assertUrl']);
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{1,39}$/;

export function validateAcceptance(input, steps) {
  if (input === undefined) return undefined;
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(k => !['method', 'criteria'].includes(k))) {
    throw new Error('acceptance 必須包含 QA / E2E 驗收方式與 criteria');
  }
  if (input.method !== 'QA / E2E') throw new Error('目前只支援 QA / E2E 驗收方式');
  if (!Array.isArray(input.criteria) || input.criteria.length < 1 || input.criteria.length > 30) {
    throw new Error('驗收條件需有 1–30 個 criteria');
  }
  const stepByName = new Map();
  for (const step of steps) {
    if (stepByName.has(step.name)) throw new Error('啟用 QA / E2E 時，測試步驟名稱不可重複');
    stepByName.set(step.name, step);
  }
  const ids = new Set();
  const criteria = input.criteria.map((item, i) => {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(k => !['id', 'title', 'stepNames', 'required'].includes(k))) {
      throw new Error(`第 ${i + 1} 項驗收條件欄位不合法`);
    }
    if (typeof item.id !== 'string' || !ID_RE.test(item.id) || ids.has(item.id)) {
      throw new Error('驗收條件 id 必須合法且唯一');
    }
    ids.add(item.id);
    if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 100) {
      throw new Error('驗收條件 title 不合法');
    }
    if (item.required !== undefined && typeof item.required !== 'boolean') {
      throw new Error('驗收條件 required 必須是布林值');
    }
    if (!Array.isArray(item.stepNames) || item.stepNames.length < 1 || item.stepNames.length > 20 ||
        item.stepNames.some(n => typeof n !== 'string' || !stepByName.has(n)) ||
        new Set(item.stepNames).size !== item.stepNames.length) {
      throw new Error('驗收條件 stepNames 必須引用不重複且存在的測試步驟');
    }
    if (!item.stepNames.some(n => ASSERTIONS.has(stepByName.get(n).action))) {
      throw new Error('每個 QA / E2E 驗收條件至少需要一個斷言步驟');
    }
    return { id: item.id, title: item.title.trim(), required: item.required !== false, stepNames: [...item.stepNames] };
  });
  if (!criteria.some(c => c.required)) throw new Error('QA / E2E 至少需要一項必要驗收條件');
  return { method: 'QA / E2E', criteria };
}

export function evaluateAcceptance(acceptance, stepResults, runState) {
  if (!acceptance) return null;
  const byName = new Map(stepResults.map(r => [r.name, r]));
  const criteria = acceptance.criteria.map(c => {
    const evidence = c.stepNames.map(name => {
      const r = byName.get(name);
      return r
        ? { name, status: r.status, elapsedMs: r.elapsedMs, ...(r.error ? { error: r.error } : {}) }
        : { name, status: 'not_run' };
    });
    let status = 'not_run';
    if (evidence.some(s => s.status === 'failed')) status = 'failed';
    else if (evidence.every(s => s.status === 'passed')) status = 'passed';
    else if (runState === 'manual' || runState === 'stopped') status = 'blocked';
    return { ...c, status, evidence };
  });
  let gate = 'in_progress';
  if (runState === 'idle') gate = 'not_run';
  else if (runState === 'failed' || criteria.some(c => c.required && c.status === 'failed')) gate = 'failed';
  else if (runState === 'manual' || runState === 'stopped') gate = 'blocked';
  else if (runState === 'completed') gate = criteria.every(c => !c.required || c.status === 'passed') ? 'passed' : 'incomplete';
  const summary = { passed: 0, failed: 0, blocked: 0, not_run: 0 };
  for (const c of criteria) summary[c.status]++;
  return { method: acceptance.method, gate, accepted: gate === 'passed', summary, criteria };
}
