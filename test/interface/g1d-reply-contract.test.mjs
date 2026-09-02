import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const replySchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/reply.schema.json'
), 'utf8'));

/** @type {Readonly<Record<string,string>>} */
const stageSchemas = Object.freeze({
  source_pack: 'source-pack.schema.json',
  evidence_claims: 'evidence-claims.schema.json',
  behavior_views: 'behavior-views.schema.json',
  case_drafts: 'case-drafts.schema.json'
});
const diagnostic = {
  category: 'schema', code: 'FIXTURE_INVALID', message: 'Fixture diagnostic.'
};

/** @param {string} stage @param {string} schemaRef */
function needArtifact(stage, schemaRef) {
  return {
    status: 'need_artifact', stage, schema_ref: schemaRef,
    scope: { source_revision: 0 }, diagnostics: []
  };
}

/** @param {string} stage @param {string} schemaRef */
function needRevision(stage, schemaRef) {
  return {
    status: 'need_revision', stage, schema_ref: schemaRef, source_revision: 0,
    artifact_path: '/private/run/staging/candidate.json',
    artifact_digest: 'a'.repeat(64), diagnostics: [diagnostic]
  };
}

test('schema integrity Reply accepts exactly the four writable stage and schema pairs', () => {
  for (const [stage, schemaRef] of Object.entries(stageSchemas)) {
    assert.deepEqual(
      validateAgainstSchema(needArtifact(stage, schemaRef), replySchema), [],
      `need_artifact ${stage}`
    );
    assert.deepEqual(
      validateAgainstSchema(needRevision(stage, schemaRef), replySchema), [],
      `need_revision ${stage}`
    );
  }
});

test('schema integrity Reply rejects compiler-derived and unknown writable stages', () => {
  const forbidden = [
    needArtifact('test_obligations', 'test-obligations.schema.json'),
    needRevision('test_obligations', 'test-obligations.schema.json'),
    needRevision('verification', 'case-drafts.schema.json'),
    needRevision('unknown_internal_stage', 'case-drafts.schema.json')
  ];
  for (const reply of forbidden) {
    assert.notDeepEqual(
      validateAgainstSchema(reply, replySchema), [],
      `${reply.status} must reject ${reply.stage}`
    );
  }
});

test('schema integrity Reply rejects every stage and schema_ref mismatch', () => {
  const pairs = Object.entries(stageSchemas);
  for (let index = 0; index < pairs.length; index += 1) {
    const [stage, schemaRef] = pairs[index];
    const wrongSchema = pairs[(index + 1) % pairs.length][1];
    assert.notEqual(wrongSchema, schemaRef);
    assert.notDeepEqual(
      validateAgainstSchema(needArtifact(stage, wrongSchema), replySchema), [],
      `need_artifact ${stage} must reject ${wrongSchema}`
    );
    assert.notDeepEqual(
      validateAgainstSchema(needRevision(stage, wrongSchema), replySchema), [],
      `need_revision ${stage} must reject ${wrongSchema}`
    );
  }
});

test('runner internal reply routing owns every mapped stage and fails closed otherwise', async () => {
  const { mapInternalRevision } = await import('../../src/reply-routing.mjs');
  const expected = {
    source_policy: 'source_pack', evidence_claims: 'evidence_claims',
    behavior_views: 'behavior_views', test_obligations: 'behavior_views',
    classification: 'case_drafts', case_drafts: 'case_drafts', coverage: 'case_drafts',
    verification: 'case_drafts', render_markdown: 'case_drafts',
    clarification: 'source_pack'
  };
  for (const [internalStage, agentStage] of Object.entries(expected)) {
    assert.deepEqual(mapInternalRevision({
      status: 'need_revision', stage: internalStage, source_revision: 3,
      diagnostics: [diagnostic]
    }), {
      kind: 'need_revision', stage: agentStage,
      schema_ref: stageSchemas[agentStage]
    }, internalStage);
  }
});

test('runner schema routing succeeds only when every diagnostic has one artifact owner', async () => {
  const { mapInternalRevision } = await import('../../src/reply-routing.mjs');
  assert.deepEqual(mapInternalRevision({
    status: 'need_revision', stage: 'schema', source_revision: 2,
    diagnostics: [
      { ...diagnostic, path: '/behavior_views/views/0' },
      { ...diagnostic, code: 'SECOND', path: '/behavior_views/interaction_matrix' }
    ]
  }), {
    kind: 'need_revision', stage: 'behavior_views',
    schema_ref: 'behavior-views.schema.json'
  });
  for (const diagnostics of [
    [{ ...diagnostic, path: '/' }],
    [
      { ...diagnostic, path: '/source_pack/sources/0' },
      { ...diagnostic, code: 'SECOND', path: '/case_drafts/cases/0' }
    ]
  ]) {
    assert.deepEqual(mapInternalRevision({
      status: 'need_revision', stage: 'schema', source_revision: 2, diagnostics
    }), { kind: 'fatal', code: 'RUNNER_PROTOCOL_VIOLATION' });
  }
});

test('runner core unknown and mixed internal routing becomes RUNNER_PROTOCOL_VIOLATION', async () => {
  const { mapInternalRevision } = await import('../../src/reply-routing.mjs');
  for (const stage of ['core', 'unknown', '', 'source_policy|coverage']) {
    assert.deepEqual(mapInternalRevision({
      status: 'need_revision', stage, source_revision: 0, diagnostics: [diagnostic]
    }), { kind: 'fatal', code: 'RUNNER_PROTOCOL_VIOLATION' }, stage);
  }
});
