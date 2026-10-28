import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

export const DEFAULT_WORKSPACE = Object.freeze({
  targets: [
    { id: 'admin', name: '管理端', kind: 'admin', baseUrl: 'http://localhost:3000', startPath: '/admin', device: 'desktop' },
    { id: 'client-web', name: '用戶端 A（網頁）', kind: 'client', baseUrl: 'http://localhost:3001', startPath: '/', device: 'desktop' },
    { id: 'client-mobile', name: '用戶端 B（手機）', kind: 'client', baseUrl: 'http://localhost:3002', startPath: '/', device: 'mobile' }
  ],
  accounts: [
    { id: 'admin-qa', name: '管理端測試帳號', method: 'test_account', username: 'admin-qa@example.test', targetIds: ['admin'] },
    { id: 'client-qa', name: '用戶端測試帳號', method: 'test_account', username: 'client-qa@example.test', targetIds: ['client-web', 'client-mobile'] },
    { id: 'client-line', name: 'LINE 測試登入', method: 'line', username: '', targetIds: ['client-web', 'client-mobile'] }
  ]
});

const idRe = /^[a-z0-9][a-z0-9-]{0,39}$/;
const allowedKind = new Set(['admin', 'client']);
const allowedMethod = new Set(['line', 'test_account']);
const allowedDevice = new Set(['desktop', 'mobile']);
const keysMatch = (obj, allowed) => Object.keys(obj).every(key => allowed.includes(key));
const text = (value, limit = 120) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function validateWorkspace(input) {
  if (!isObj(input) || !keysMatch(input, ['targets', 'accounts'])) throw new Error('設定格式錯誤');
  if (!Array.isArray(input.targets) || input.targets.length < 1 || input.targets.length > 20) throw new Error('須設定 1–20 個管理端／用戶端');
  if (!Array.isArray(input.accounts) || input.accounts.length > 50) throw new Error('最多可設定 50 個測試身分');
  const ids = new Set();
  const targets = input.targets.map((t, i) => {
    if (!isObj(t) || !keysMatch(t, ['id','name','kind','baseUrl','startPath','device'])) throw new Error(`目標 ${i + 1} 的欄位不正確`);
    if (!idRe.test(t.id ?? '') || ids.has(t.id)) throw new Error('目標 ID 不合法或重複');
    ids.add(t.id);
    if (!text(t.name) || !allowedKind.has(t.kind) || !allowedDevice.has(t.device)) throw new Error('目標名稱／類型／裝置不合法');
    let url;
    try { url = new URL(t.baseUrl); } catch { throw new Error('目標網址無效'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('目標只能使用無帳密的 HTTP(S) 網址');
    if (!text(t.startPath, 250) || !t.startPath.startsWith('/') || t.startPath.startsWith('//')) throw new Error('目標起始路徑須以 / 開頭');
    const entry = new URL(t.startPath, url);
    if (entry.origin !== url.origin) throw new Error('起始路徑不得跨網域');
    return { id: t.id, name: t.name, kind: t.kind, baseUrl: url.toString(), startPath: t.startPath, device: t.device };
  });
  const accountIds = new Set();
  const accounts = input.accounts.map((a, i) => {
    if (!isObj(a) || !keysMatch(a, ['id','name','method','username','targetIds'])) throw new Error(`測試身分 ${i + 1} 含不允許的欄位（禁止儲存密碼）`);
    if (!idRe.test(a.id ?? '') || accountIds.has(a.id)) throw new Error('測試身分 ID 不合法或重複');
    accountIds.add(a.id);
    if (!text(a.name) || !allowedMethod.has(a.method) || typeof a.username !== 'string' || a.username.length > 200) throw new Error('身分名稱／登入方式／帳號不合法');
    if (a.method === 'test_account' && !a.username.trim()) throw new Error('測試帳號須提供帳號名稱（不可提供密碼）');
    if (!Array.isArray(a.targetIds) || !a.targetIds.length || a.targetIds.length > 20 || new Set(a.targetIds).size !== a.targetIds.length || a.targetIds.some(id => !ids.has(id))) throw new Error('身分指定的用戶端不合法');
    return { id: a.id, name: a.name, method: a.method, username: a.username, targetIds: [...a.targetIds] };
  });
  return { targets, accounts };
}

export function buildProfilePlan(workspaceInput, { targetId, accountId = '', steps } = {}) {
  const workspace = validateWorkspace(workspaceInput);
  const target = workspace.targets.find(t => t.id === targetId);
  if (!target) throw new Error('找不到選取的測試目標');
  const account = accountId ? workspace.accounts.find(a => a.id === accountId) : null;
  if (accountId && (!account || !account.targetIds.includes(targetId))) throw new Error('測試身分不適用此目標');
  const selected = steps === undefined ? [
    { name: '開啟受測網站', action: 'goto', path: target.startPath },
    { name: '確認網站畫面可見', action: 'assertVisible', selector: 'body' }
  ] : steps;
  if (!Array.isArray(selected)) throw new Error('測試步驟必須為陣列');
  const planned = selected.map(step => ({ ...step }));
  if (account && !planned.some(step => step.action === 'pauseForLogin')) {
    const afterFirstGoto = planned.findIndex(step => step.action === 'goto');
    planned.splice(afterFirstGoto + 1, 0, { name: account.method === 'line' ? '人工完成 LINE 登入' : '人工輸入測試帳號密碼', action: 'pauseForLogin' });
  }
  return { baseUrl: target.baseUrl, device: target.device, steps: planned };
}

export const WORKSPACE_FILE = resolve('config/local.workspace.json');
export async function loadWorkspace(file = WORKSPACE_FILE) {
  try { return validateWorkspace(JSON.parse(await readFile(file, 'utf8'))); }
  catch (err) { if (err.code === 'ENOENT') return validateWorkspace(DEFAULT_WORKSPACE); throw err; }
}
export async function saveWorkspace(value, file = WORKSPACE_FILE) {
  const clean = validateWorkspace(value);
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(clean, null, 2) + '\n', { mode: 0o600 });
  return clean;
}
