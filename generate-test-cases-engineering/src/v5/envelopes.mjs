import { createHash } from 'node:crypto';

import { canonicalV5Stringify, canonicalizeV5Value } from './canonical-v5.mjs';
import { V5_COMPILER_VERSION, V5_SCHEMA_VERSION } from './constants.mjs';
import { V5ProtocolError } from './errors.mjs';

const AGENT_ARTIFACT_KINDS = new Set(['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']);

/** @param {unknown} value */
function sha256(value) {
  return `sha256:${createHash('sha256').update(canonicalV5Stringify(value)).digest('hex')}`;
}

/**
 * @param {{artifactKind:string,payload:unknown,runIdentity:{run_id:string,case_document_lineage_id:string},revision:number,producerStage?:string,inputDigests?:string[]}} input
 */
export function acceptArtifactEnvelope(input) {
  if (!AGENT_ARTIFACT_KINDS.has(input.artifactKind)) throw new V5ProtocolError('COMPILER_OWNED_FIELD_SUBMITTED', 'Only the four Agent-owned artifact kinds may be accepted.');
  if (!input.runIdentity || typeof input.runIdentity.run_id !== 'string' || typeof input.runIdentity.case_document_lineage_id !== 'string' || !Number.isSafeInteger(input.revision) || input.revision < 1) {
    throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Accepted artifact envelope input is invalid.');
  }
  const payload = canonicalizeV5Value(structuredClone(input.payload));
  const inputDigests = [...new Set(input.inputDigests ?? [])].sort();
  const base = {
    kind: 'accepted_artifact_envelope',
    artifact_kind: input.artifactKind,
    schema_version: V5_SCHEMA_VERSION,
    compiler_version: V5_COMPILER_VERSION,
    payload_producer: 'agent',
    envelope_producer: 'compiler',
    producer_stage: input.producerStage ?? 'unknown',
    producer_run_id: input.runIdentity.run_id,
    case_document_lineage_id: input.runIdentity.case_document_lineage_id,
    accepted_revision: input.revision,
    input_digests: inputDigests,
    canonical_payload_digest: sha256(payload),
    payload
  };
  return { ...base, envelope_digest: sha256(base) };
}
