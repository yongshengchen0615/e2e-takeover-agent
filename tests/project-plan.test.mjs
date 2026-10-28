import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validatePlan } from '../src/engine.mjs';

test('MemberWebsocket smoke profile is valid, remote opt-in, and read-only', async () => {
  const raw = await readFile(new URL('../config/memberwebsocket-dev.smoke.json', import.meta.url), 'utf8');
  const profile = JSON.parse(raw);
  assert.throws(() => validatePlan(profile, { allowRemote: false }), /localhost/);
  const plan = validatePlan(profile, { allowRemote: true });
  assert.equal(plan.origin, 'https://memberwebsocket-dev-netlify.netlify.app');
  assert.ok(plan.steps.length >= 5);
  assert.ok(plan.steps.every(step => ['goto', 'assertVisible', 'assertText', 'assertUrl'].includes(step.action)));
  assert.ok(plan.steps.every(step => step.action !== 'goto' || new URL(step.path, plan.baseUrl).origin === plan.origin));
});
