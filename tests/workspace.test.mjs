import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_WORKSPACE, validateWorkspace, buildProfilePlan, saveWorkspace, loadWorkspace } from '../src/workspace.mjs';

test('default workspace includes management and multiple independent client targets', () => {
  const value = validateWorkspace(DEFAULT_WORKSPACE);
  assert.equal(value.targets.filter(t => t.kind === 'admin').length, 1);
  assert.ok(value.targets.filter(t => t.kind === 'client').length >= 2);
  assert.ok(value.accounts.some(a => a.method === 'line'));
  assert.ok(value.accounts.some(a => a.method === 'test_account'));
});

test('profiles resolve target URLs and insert an explicit human login pause', () => {
  const line = buildProfilePlan(DEFAULT_WORKSPACE, { targetId: 'client-mobile', accountId: 'client-line' });
  assert.equal(line.baseUrl, 'http://localhost:3002/');
  assert.equal(line.device, 'mobile');
  assert.deepEqual(line.steps.map(s => s.action), ['goto', 'pauseForLogin', 'assertVisible']);
  const admin = buildProfilePlan(DEFAULT_WORKSPACE, { targetId: 'admin', accountId: 'admin-qa' });
  assert.equal(admin.steps[0].path, '/admin');
  assert.match(admin.steps[1].name, /測試帳號/);
  const anonymous = buildProfilePlan(DEFAULT_WORKSPACE, { targetId: 'client-web' });
  assert.equal(anonymous.steps.some(s => s.action === 'pauseForLogin'), false);
});

test('rejects mixed target accounts, password fields and unsafe target URLs', () => {
  assert.throws(() => buildProfilePlan(DEFAULT_WORKSPACE, { targetId: 'admin', accountId: 'client-line' }), /不適用/);
  const withSecret = structuredClone(DEFAULT_WORKSPACE);
  withSecret.accounts[0].password = 'do not store';
  assert.throws(() => validateWorkspace(withSecret), /禁止儲存密碼/);
  const withUrl = structuredClone(DEFAULT_WORKSPACE);
  withUrl.targets[0].baseUrl = 'https://user:pass@staging.example.com';
  assert.throws(() => validateWorkspace(withUrl), /無帳密/);
  const withDuplicate = structuredClone(DEFAULT_WORKSPACE);
  withDuplicate.targets[1].id = 'admin';
  assert.throws(() => validateWorkspace(withDuplicate), /重複/);
});

test('local workspace is saved and reloaded without secrets', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'e2e-workspace-'));
  try {
    const file = join(folder, 'workspace.json');
    await saveWorkspace(DEFAULT_WORKSPACE, file);
    assert.deepEqual(await loadWorkspace(file), validateWorkspace(DEFAULT_WORKSPACE));
    assert.doesNotMatch(await readFile(file, 'utf8'), /"password"/);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('custom assertions without navigation still visit selected endpoint before login', () => {
  const plan = buildProfilePlan(DEFAULT_WORKSPACE, {
    targetId: 'admin', accountId: 'admin-qa',
    steps: [{ action: 'assertVisible', selector: 'body' }]
  });
  assert.deepEqual(plan.steps.map(s => s.action), ['goto', 'pauseForLogin', 'assertVisible']);
  assert.equal(plan.steps[0].path, '/admin');
});
