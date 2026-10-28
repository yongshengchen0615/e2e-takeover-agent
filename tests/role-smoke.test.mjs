import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

test('headless role runner refuses authenticated or unapproved remote testing', () => {
  const exec = (profile, env) => spawnSync(process.execPath, [resolve('src/run-role-smoke.mjs'), profile], {
    encoding:'utf8',
    env:{...process.env, ...env}
  });
  const invalid=exec('admin-auth',{E2E_ALLOW_REMOTE:'1'});
  assert.equal(invalid.status,2);
  assert.match(invalid.stderr,/只允許唯讀/);
  const lackingOptIn=exec('client-structure',{E2E_ALLOW_REMOTE:'0'});
  assert.equal(lackingOptIn.status,2);
  assert.match(lackingOptIn.stderr,/E2E_ALLOW_REMOTE/);
});
