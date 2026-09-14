import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';
import { validateCanonicalManifestRelations } from '../../src/contracts.mjs';
import { assertSupportedSchema, validateAgainstSchema } from '../../src/schema-validator.mjs';

const schema = JSON.parse(await readFile(new URL(
  '../../skill/generate-test-cases/scripts/schemas/current-pointer.schema.json', import.meta.url
), 'utf8'));
const sha = 'sha256:' + 'a'.repeat(64);
const caseRef = { run_id: 'RUN-case-document', revision: 4, manifest_digest: sha, bundle_digest: sha };
const common = {
  run_id: 'RUN-manifest', revision: 4, schema_version: '4.0.0', compiler_version: '0.5.0',
  authority: 'canonical', completed_at: '2026-09-09T00:00:00Z'
};
const counts = {
  delivered_cases: [1, 0, 0, 0],
  delivered_with_gaps: [1, 1, 1, 0],
  blocked_only: [0, 1, 1, 0],
  no_applicable_cases: [0, 0, 0, 1]
};

/** @param {keyof typeof counts} [kind] @returns {any} */
function caseDocument(kind = 'delivered_cases') {
  const [caseCount, blocked, closed, excluded] = counts[kind];
  return {
    ...common, delivery_intent: 'case_document', result_kind: kind,
    bundle: { path: 'output/r004/test-bundle.json', digest: sha },
    markdown: { path: 'output/r004/test-cases.md', digest: sha },
    execution_worksheet: { path: 'output/r004/execution-worksheet.csv', digest: sha, format: 'csv' },
    render_options: { include_audit_appendix: false },
    case_count: caseCount, blocked_root_count: blocked, closed_for_delivery_root_count: closed,
    not_applicable_count: excluded, exploratory_count: 0
  };
}

/** @param {'execution_ready'|'no_execution_selected'} [kind] @returns {any} */
function execution(kind = 'execution_ready') {
  const ids = kind === 'execution_ready' ? ['CASE-source-23', 'CASE-source-22'] : [];
  return {
    ...common, delivery_intent: 'execution_plan', result_kind: kind,
    case_document_ref: { ...caseRef },
    execution_plan_artifact: { path: 'output/r004/execution-plan.json', digest: sha },
    runner_projection: { case_ids: ids, case_ids_digest: 'sha256:' + digest(ids) },
    runner_ready: kind === 'execution_ready'
  };
}

/** Schema validation precedes this pure relation check; artifact/ledger I/O belongs to T12.
 * @param {any} manifest
 */
function relations(manifest) {
  return validateCanonicalManifestRelations(manifest);
}

/** @param {any} value @param {string} [label] */
function accepts(value, label = '') {
  assert.deepEqual(validateAgainstSchema(value, schema), [], label);
}
/** @param {any} value @param {string} [label] */
function rejects(value, label = '') {
  assert.ok(validateAgainstSchema(value, schema).length > 0, label);
}

test('T02 manifest schema uses the supported closed-schema dialect', () => {
  assert.doesNotThrow(() => assertSupportedSchema(schema));
});

for (const status of ['ready', 'document_only', 'stale']) {
  test('T02 manifest keeps the v3 ' + status + ' pointer readable and closed', () => {
    const value = status === 'stale' ? {
      status, run_instance_id: 'RUN-v3', active_source_revision: 5,
      reason: 'higher_revision_not_ready', previous_ready_revision: 4
    } : {
      status, run_instance_id: 'RUN-v3', source_revision: 4,
      bundle_path: 'output/r004/test-bundle.json', bundle_digest: 'b'.repeat(64), plan_digest: 'c'.repeat(64)
    };
    accepts(value);
    rejects({ ...value, delivery_intent: 'case_document' }, 'v3 cannot masquerade as a v4 manifest');
    rejects({ ...value, extra: true });
  });
}

for (const kind of /** @type {Array<keyof typeof counts>} */ (Object.keys(counts))) {
  test('T02 manifest accepts the minimal v4 Case Document ' + kind, () => accepts(caseDocument(kind)));
}
for (const kind of /** @type {const} */ (['execution_ready', 'no_execution_selected'])) {
  test('T02 manifest accepts the minimal v4 Execution ' + kind, () => accepts(execution(kind)));
}

test('T02 Case Document result kinds constrain Case, Blocked, closed and NotApplicable counts', () => {
  const invalid = [
    { ...caseDocument(), case_count: 0 },
    { ...caseDocument(), blocked_root_count: 1 },
    { ...caseDocument(), closed_for_delivery_root_count: 1 },
    { ...caseDocument('delivered_with_gaps'), case_count: 0 },
    { ...caseDocument('delivered_with_gaps'), blocked_root_count: 0 },
    { ...caseDocument('delivered_with_gaps'), closed_for_delivery_root_count: 0 },
    { ...caseDocument('blocked_only'), case_count: 1 },
    { ...caseDocument('blocked_only'), blocked_root_count: 0 },
    { ...caseDocument('blocked_only'), closed_for_delivery_root_count: 0 },
    { ...caseDocument('no_applicable_cases'), case_count: 1 },
    { ...caseDocument('no_applicable_cases'), blocked_root_count: 1 },
    { ...caseDocument('no_applicable_cases'), closed_for_delivery_root_count: 1 },
    { ...caseDocument('no_applicable_cases'), not_applicable_count: 0 }
  ];
  for (const value of invalid) rejects(value, JSON.stringify(value));
  for (const key of ['case_count', 'blocked_root_count', 'closed_for_delivery_root_count', 'not_applicable_count', 'exploratory_count']) {
    for (const value of [-1, 0.5, '1', null]) rejects({ ...caseDocument(), [key]: value }, key);
  }
});

test('T02 Execution result kinds constrain readiness and empty versus nonempty runner IDs', () => {
  for (const kind of /** @type {const} */ (['execution_ready', 'no_execution_selected'])) {
    const value = execution(kind);
    rejects({ ...value, runner_ready: !value.runner_ready }, kind + ': incorrect readiness');
    rejects({ ...value, runner_projection: {
      case_ids: kind === 'execution_ready' ? [] : ['CASE-source-22'],
      case_ids_digest: 'sha256:' + digest(kind === 'execution_ready' ? [] : ['CASE-source-22'])
    } }, kind + ': incorrect selection');
  }
  rejects({ ...execution(), runner_projection: { case_ids: ['CASE-a', 'CASE-a'], case_ids_digest: sha } }, 'duplicate runner IDs');
  rejects({ ...execution(), runner_projection: { case_ids: [''], case_ids_digest: sha } }, 'empty runner ID');
  rejects({ ...execution('no_execution_selected'), runner_projection: { case_ids: [], case_ids_digest: sha } }, 'empty projection has one exact digest');
});

test('T02 v4 manifest rejects missing common and branch fields', () => {
  for (const valid of [caseDocument(), execution()]) {
    for (const key of Object.keys(valid)) {
      const value = { ...valid };
      delete value[key];
      rejects(value, valid.delivery_intent + ' missing ' + key);
    }
  }
});

test('T02 v4 manifests reject unknown, legacy and cross-branch result kinds', () => {
  for (const value of [caseDocument(), execution()]) {
    rejects({ ...value, result_kind: 'completed' });
    rejects({ ...value, result_kind: 'cancelled' });
    rejects({ ...value, delivery_intent: 'combined' });
    rejects({ ...value, schema_version: '3.0.0' });
    rejects({ ...value, compiler_version: '0.4.0' });
    rejects({ ...value, authority: 'legacy_read_only' });
  }
  rejects({ ...caseDocument(), result_kind: 'execution_ready' });
  rejects({ ...execution(), result_kind: 'delivered_cases' });
});

test('T02 v4 manifest discriminator rejects every cross-branch field including null', () => {
  const document = caseDocument();
  const plan = execution();
  const shared = new Set([...Object.keys(common), 'delivery_intent', 'result_kind']);
  for (const [target, other] of [[document, plan], [plan, document]]) {
    for (const key of Object.keys(other).filter((key) => !shared.has(key))) {
      rejects({ ...target, [key]: other[key] }, target.delivery_intent + ' with ' + key);
      rejects({ ...target, [key]: null }, target.delivery_intent + ' with null ' + key);
    }
    rejects({ ...target, status: 'ready' });
    rejects({ ...target, arbitrary: true });
  }
});

test('T02 v4 manifest nested artifact, ref, render and runner records are closed and complete', () => {
  for (const valid of [caseDocument(), execution()]) {
    for (const [key, record] of Object.entries(valid)) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
      rejects({ ...valid, [key]: { ...record, extra: true } }, key + ' extra');
      rejects({ ...valid, [key]: null }, key + ' null');
      for (const field of Object.keys(record)) {
        const incomplete = { ...record };
        delete incomplete[field];
        rejects({ ...valid, [key]: incomplete }, key + ' missing ' + field);
      }
    }
  }
  rejects({ ...caseDocument(), execution_worksheet: { ...caseDocument().execution_worksheet, format: 'xlsx' } });
  rejects({ ...caseDocument(), render_options: { include_audit_appendix: 'false' } });
  accepts({ ...caseDocument(), render_options: { include_audit_appendix: true } });
});

test('T02 v4 digest shape consistently requires a lowercase sha256-prefixed digest', () => {
  for (const bad of ['', 'a'.repeat(64), 'sha256:' + 'A'.repeat(64), 'sha256:abc', null]) {
    for (const field of ['bundle', 'markdown', 'execution_worksheet']) {
      const value = caseDocument();
      value[field].digest = bad;
      rejects(value, field);
    }
    const value = execution();
    value.execution_plan_artifact.digest = bad;
    rejects(value, 'execution plan digest');
    for (const field of ['manifest_digest', 'bundle_digest']) {
      rejects({ ...execution(), case_document_ref: { ...caseRef, [field]: bad } }, field);
    }
    rejects({ ...execution(), runner_projection: { ...execution().runner_projection, case_ids_digest: bad } }, 'runner digest');
  }
});

test('T02 manifest pure relations accept all six matching result variants without rewriting inputs', () => {
  for (const value of [...Object.keys(counts).map((kind) => caseDocument(/** @type {keyof typeof counts} */ (kind))), execution(), execution('no_execution_selected')]) {
    const before = JSON.stringify(value);
    accepts(value);
    assert.deepEqual(relations(value), []);
    assert.equal(JSON.stringify(value), before);
  }
  assert.deepEqual(relations({ status: 'document_only' }), [], 'v3 replay does not acquire v4 semantics');
});

for (const kind of /** @type {const} */ (['delivered_with_gaps', 'blocked_only'])) {
  test('T02 manifest pure relations require exact gap closure equality for ' + kind, () => {
    const value = { ...caseDocument(kind), blocked_root_count: 3, closed_for_delivery_root_count: 3 };
    assert.deepEqual(relations(value), []);
    for (const count of [1, 2, 4]) {
      const invalid = { ...value, closed_for_delivery_root_count: count };
      accepts(invalid, 'standard Schema cannot compare two arbitrary field values');
      assert.ok(relations(invalid).some((/** @type {any} */ item) => item.code === 'MANIFEST_GAP_COUNT_MISMATCH'));
    }
  });
}

test('T02 manifest pure relations recompute runner digest and preserve canonical business order', () => {
  const value = execution();
  assert.deepEqual(relations(value), []);
  for (const invalid of [
    { ...value, runner_projection: { ...value.runner_projection, case_ids_digest: sha } },
    { ...value, runner_projection: { ...value.runner_projection, case_ids: [...value.runner_projection.case_ids].reverse() } }
  ]) {
    assert.ok(relations(invalid).some((/** @type {any} */ item) => item.code === 'MANIFEST_RUNNER_DIGEST_MISMATCH'));
  }
  assert.deepEqual(relations(execution('no_execution_selected')), []);
  assert.ok(relations({ ...execution('no_execution_selected'), runner_projection: { case_ids: [], case_ids_digest: sha } })
    .some((/** @type {any} */ item) => item.code === 'MANIFEST_RUNNER_DIGEST_MISMATCH'));
});

test('T02 manifest pure relations reject result and runner readiness disagreement', () => {
  for (const kind of /** @type {const} */ (['execution_ready', 'no_execution_selected'])) {
    const value = execution(kind);
    assert.ok(relations({ ...value, runner_ready: !value.runner_ready })
      .some((/** @type {any} */ item) => item.code === 'MANIFEST_RUNNER_READINESS_MISMATCH'));
    const ids = kind === 'execution_ready' ? [] : ['CASE-selected'];
    assert.ok(relations({ ...value, runner_projection: { case_ids: ids, case_ids_digest: 'sha256:' + digest(ids) } })
      .some((/** @type {any} */ item) => item.code === 'MANIFEST_RUNNER_READINESS_MISMATCH'));
  }
});
