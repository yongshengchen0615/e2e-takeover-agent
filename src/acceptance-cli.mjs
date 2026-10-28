import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateAcceptance } from './acceptance.mjs';

const path = resolve(process.argv[2] ?? 'artifacts/report.json');
try {
  const report = JSON.parse(await readFile(path, 'utf8'));
  const qa = report?.acceptance;
  const required = qa?.criteria?.filter?.(c => c?.required === true) ?? [];
  const recomputed = qa?.criteria && Array.isArray(report?.results)
    ? evaluateAcceptance(qa, report.results, report.state) : null;
  const valid = report?.state === 'completed' &&
    Array.isArray(report?.results) && report.results.length > 0 &&
    report.results.every(r => r.status === 'passed') &&
    recomputed?.gate === 'passed' && recomputed?.accepted === true &&
    recomputed.criteria.every((c, i) => c.status === qa.criteria[i].status) &&
    qa?.method === 'QA / E2E' &&
    qa?.gate === 'passed' &&
    qa?.accepted === true &&
    Array.isArray(qa?.criteria) &&
    required.length > 0 &&
    required.every(c => c.status === 'passed' &&
      Array.isArray(c.evidence) && c.evidence.length > 0 &&
      c.evidence.every(e => e.status === 'passed'));
  if (!valid) throw new Error('QA / E2E 驗收未通過或證據不完整；禁止放行');
  process.stdout.write('QA / E2E 驗收 Gate: PASSED\n');
} catch (err) {
  process.stderr.write('QA / E2E Gate: FAILED — ' + String(err.message).slice(0,160) + '\n');
  process.exitCode = 1;
}
