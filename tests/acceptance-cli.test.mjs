import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const pathToCli = resolve('src/acceptance-cli.mjs');
const run = path => spawnSync(process.execPath, [pathToCli, path], { encoding:'utf8' });

test('acceptance:check blocks missing, failed and falsified QA/E2E results, passes full evidence', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'e2e-gate-'));
  const path=join(folder,'report.json');
  try {
    assert.notEqual(run(path).status,0, 'missing report must fail closed');
    const valid={ state:'completed', results:[{name:'首頁可見',status:'passed',elapsedMs:3}], acceptance: {
      method:'QA / E2E', gate:'passed', accepted:true, criteria:[
        {id:'QA-001',required:true,status:'passed',evidence:[{name:'首頁可見',status:'passed'}]}
      ]
    }};
    await writeFile(path,JSON.stringify(valid));
    assert.equal(run(path).status,0, 'full verified acceptance report should pass');
    for (const bad of [
      {...valid,state:'manual'},
      {...valid,results:[{name:'首頁可見',status:'failed'}]},
      {...valid,acceptance:{...valid.acceptance,gate:'blocked'}},
      {...valid,acceptance:{...valid.acceptance,accepted:false}},
      {...valid,acceptance:{...valid.acceptance,criteria:[]}},
      {...valid,acceptance:{...valid.acceptance,criteria:[{...valid.acceptance.criteria[0],evidence:[{name:'首頁可見',status:'not_run'}]}]}}
    ]) {
      await writeFile(path,JSON.stringify(bad));
      assert.notEqual(run(path).status,0,'failed or incomplete evidence must be rejected');
    }
  } finally { await rm(folder,{recursive:true,force:true}); }
});
