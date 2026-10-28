import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const read = async path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const fileExists = async path => access(new URL(`../${path}`, import.meta.url));

test('repository contains required development and plugin files', async () => {
  const files = [
    'README.md', 'README.zh-TW.md', 'TESTING.md', 'SECURITY.md',
    'CONTRIBUTING.md', '.gitignore', '.github/workflows/ci.yml',
    'plugin.json', 'mcp.json', 'skills/run-e2e/SKILL.md',
    'src/engine.mjs', 'src/server.mjs', 'src/mcp.mjs',
    'src/workspace.mjs', 'tests/workspace.test.mjs', 'config/example.workspace.json'
  ];
  await Promise.all(files.map(fileExists));
});

test('manifest names match npm package and sensitive artifacts are gitignored', async () => {
  const pkg = JSON.parse(await read('package.json'));
  const plugin = JSON.parse(await read('plugin.json'));
  const mcp = JSON.parse(await read('mcp.json'));
  const gitignore = await read('.gitignore');
  assert.equal(pkg.name, plugin.name);
  assert.equal(pkg.version, plugin.version);
  assert.ok(Object.keys(mcp.mcpServers).length > 0);
  for (const pattern of ['node_modules/', 'artifacts/', 'playwright/.auth/', '.env', 'config/local.workspace.json']) {
    assert.ok(gitignore.split(/\r?\n/).includes(pattern), `missing ${pattern} in .gitignore`);
  }
});
