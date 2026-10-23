import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import test from 'node:test';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { validateRevisionArtifactsV4 } from '../../src/revision-artifact-validation-v4.mjs';
import { commitRevisionTransactionV4, ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { appendRequest, withRun } from '../helpers/v4-revision-transaction-fixture.mjs';
import { safeDiagnosticsV4 } from '../../src/diagnostic-error-v4.mjs';

test('T10 nested oneOf reports the failing uniqueItems leaf as well as union mismatch', () => {
  const schema = { oneOf: [
    { type: 'object', required: ['affected_facts'], properties: { affected_facts: { type: 'array', uniqueItems: true } } },
    { type: 'object', required: ['other'], properties: { other: { type: 'string' } }, additionalProperties: false }
  ] };
  const diagnostics = validateAgainstSchema({ affected_facts: ['same', 'same'] }, schema);
  assert.ok(diagnostics.some((/** @type {any} */ d) => d.code === 'UNIQUE_ITEMS' && d.path === '/affected_facts/1'), JSON.stringify(diagnostics));
});

test('T10 actual serialized checkpoint digest mismatch retains the precise relation path', () => {
  const request = appendRequest('pre_case_pending', null, 0);
  request.artifacts.checkpoint.value.fact_ledger_digest = `sha256:${'f'.repeat(64)}`;
  assert.throws(() => validateRevisionArtifactsV4({ profile: 'pre_case_pending', revision: 0,
    run_id: request.artifacts.checkpoint.value.run_id,
    texts: Object.fromEntries(Object.entries(request.artifacts).map(([key, artifact]) => [key, `${canonicalStringify(artifact.value)}\n`]))
  }), (/** @type {any} */ error) => error.diagnostics?.some((/** @type {any} */ d) => d.path === '/checkpoint/fact_ledger_digest') === true);
});

test('T04/T10 preflight failure does not reserve a transaction or publish accepted state', async () => withRun(async directory => {
  const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
  const request = appendRequest('pre_case_pending', null, 0, { run_id: run.run_id });
  request.artifacts.checkpoint.value.fact_ledger_digest = `sha256:${'f'.repeat(64)}`;
  await assert.rejects(commitRevisionTransactionV4(directory, request), /REVISION_ARTIFACT_RELATION_INVALID/);
  const files = await readdir(directory, { recursive: true });
  assert.ok(!files.some((/** @type {any} */ file) => /accepted|checkpoint\.json|current\.json|pending/u.test(file)), JSON.stringify(files));
}));

test('T23 duplicate stable IDs never echo attacker-controlled identifier content', async () => {
  const { validateUniqueStableIds } = await import('../../src/schema-validator.mjs');
  const secret = 'https://host.invalid/file?token=secret#' + 'x'.repeat(4000);
  const result = validateUniqueStableIds({ fact_ledger: [{ fact_id: secret }, { fact_id: secret }] });
  assert.equal(result[0].path, '/fact_ledger/1/fact_id');
  assert.ok(JSON.stringify(result).length < 1500);
  assert.doesNotMatch(JSON.stringify(result), /secret|token=/);
});

test('T23 bounded diagnostics redact complete authorization credentials and signed URLs', () => {
  const result = safeDiagnosticsV4([{ category: 'reference', code: 'INVALID', path: '/claims/0',
    message: 'Unknown source "Authorization: Bearer private-token-123" https://host.invalid/file?token=hidden ' + 'x'.repeat(8000) }]);
  assert.doesNotMatch(JSON.stringify(result), /private-token-123|host\.invalid|token=hidden/);
  assert.equal(result[0].path, '/claims/0');
  assert.ok(result[0].message.length <= 512);
});
