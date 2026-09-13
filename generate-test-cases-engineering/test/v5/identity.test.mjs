import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { canonicalStringify } from '../../src/canonical.mjs';
import { V5_STABLE_ID_ROWS, V5_STABLE_PROJECTION_FIELDS } from '../../src/v5/constants.mjs';
import { acceptArtifactEnvelope, stableV5Id } from '../../src/v5/identity.mjs';

/** @param {string} field */
function fieldValue(field) {
  if (field === 'locator') return { kind: 'inline_text', media_type: 'text/markdown', content: '# Requirement' };
  if (field.endsWith('_ids') || field.endsWith('_refs') || field === 'basis' || field === 'role_domain' || field === 'affected_refs') return [`${field}:a`, `${field}:b`];
  if (field === 'required' || field === 'order_sensitive') return true;
  if (field === 'source_span') return { start_scalar: 0, end_scalar: 4, excerpt_digest: `sha256:${'1'.repeat(64)}` };
  if (field === 'coordinate_slots') return { role_candidates: [], resource_candidates: [], action_candidates: [], context_candidates: [] };
  if (field === 'normalized_partition') return { kind: 'finite_members', members: [{ kind: 'string', value: 'b' }, { kind: 'string', value: 'a' }] };
  if (field === 'selection') return { kind: 'representative', members: [{ kind: 'string', value: 'a' }] };
  if (field === 'required') return true;
  return `${field}:value`;
}

test('all 28 v5 stable IDs use the frozen full-sha256 formula and prefix', () => {
  for (const [objectKind, prefix, projectionId] of V5_STABLE_ID_ROWS) {
    const fields = /** @type {Record<string, string[]>} */ (V5_STABLE_PROJECTION_FIELDS)[projectionId];
    const projection = Object.fromEntries(fields.map((field) => [field, fieldValue(field)]));
    const expectedHash = createHash('sha256').update(canonicalStringify({ profile_version: 1, object_kind: objectKind, projection })).digest('hex');
    assert.equal(stableV5Id(objectKind, projection), `${prefix}${expectedHash}`);
  }
});

test('stable identity canonicalizes set fields but retains complete locator content', () => {
  const left = {
    accepted_source_state_digest: `sha256:${'a'.repeat(64)}`,
    atom_signature: 'one outcome',
    required_observation_slot_digests: ['z', 'a'],
    candidate_ids: ['out5_b', 'out5_a']
  };
  const right = { ...left, required_observation_slot_digests: ['a', 'z'], candidate_ids: ['out5_a', 'out5_b'] };
  assert.equal(stableV5Id('outcome_dedup_group', left), stableV5Id('outcome_dedup_group', right));

  const source = { source_role: 'primary_prd', locator: { kind: 'inline_text', media_type: 'text/plain', content: 'A' }, required: true };
  assert.notEqual(stableV5Id('source_request', source), stableV5Id('source_request', { ...source, locator: { ...source.locator, content: 'B' } }));
});

test('accepted artifact envelopes are compiler-owned and bind canonical payload bytes', () => {
  const envelope = acceptArtifactEnvelope({
    artifactKind: 'evidence_claims',
    payload: { claims: [{ client_key: 'claim-a', statement: 'A' }] },
    runIdentity: { run_id: 'RUN-1', case_document_lineage_id: 'LINEAGE-1' },
    revision: 2,
    producerStage: 'requirements_analysis',
    inputDigests: [`sha256:${'a'.repeat(64)}`]
  });
  assert.equal(envelope.schema_version, '5.0.0');
  assert.equal(envelope.compiler_version, '0.6.0');
  assert.equal(envelope.payload_producer, 'agent');
  assert.equal(envelope.envelope_producer, 'compiler');
  assert.match(envelope.canonical_payload_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(envelope.envelope_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => acceptArtifactEnvelope({
    artifactKind: 'semantic_review_seed', payload: {}, runIdentity: { run_id: 'RUN-1', case_document_lineage_id: 'LINEAGE-1' }, revision: 1
  }), /COMPILER_OWNED_FIELD_SUBMITTED/u);
});
