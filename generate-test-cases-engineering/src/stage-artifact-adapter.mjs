import path from 'node:path';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { loadSchemaRegistry } from './schema-registry.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { AGENT_STAGE_SCHEMA } from './reply-routing.mjs';
import { readPendingEvidenceRepairPreparation, readStagePreparationState, withClarificationState } from './advance-v4.mjs';
import { latestV4Contract, v4ContractForIdentity } from './v4-contract.mjs';
import { validateV4SourcePackBeforeStaging } from './source-preparation-v4.mjs';
import { loadSourceAcquisitionCompilerStateV4 } from './source-acquisition-v4.mjs';
import { deriveV4AuthoringSystemContext } from './v4-system-context.mjs';
import { compileCaseAuthoringContext, compilePreCaseArtifactsV4, validateCaseDraftCandidate } from './v4-pipeline.mjs';

const directory = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))),
  typeof __SCHEMA_DIRECTORY__ === 'string' ? __SCHEMA_DIRECTORY__ : '../skill/generate-test-cases/scripts/schemas');
/** @param {any[]} diagnostics */
const invalid = diagnostics => ({ status: 'invalid', diagnostics: diagnostics.map(d => ({
  code: d.code ?? 'ARTIFACT_INVALID', path: d.path ?? '/', message: d.message ?? 'Candidate is invalid.',
  ...(d.category ? { category: d.category } : {})
})) });
/** @param {string} code @param {string} field @param {string} message */
const fail = (code, field, message) => invalid([{ code, path: field, message }]);
/** Read-only convenience layer. The runner alone accepts and publishes artifacts.
 * @param {string} runDirectory @param {any} reply @param {any} input @returns {Promise<any>} */
export async function prepareStageArtifact(runDirectory, reply, input) {
  try {
    if (typeof runDirectory !== 'string' || !path.isAbsolute(runDirectory)) return fail('RUN_DIRECTORY_INVALID', '/', 'An absolute run directory is required.');
    const replyErrors = validateAgainstSchema(reply, replySchema);
    if (replyErrors.length) return invalid(replyErrors);
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).length !== 2 || !Object.hasOwn(input, 'stage') || !Object.hasOwn(input, 'payload')) return fail('STAGE_INPUT_INVALID', '/', 'Expected exactly stage and payload.');
    const stage = /** @type {keyof typeof AGENT_STAGE_SCHEMA} */ (input.stage);
    if (reply.status !== 'need_revision' || reply.stage !== stage || reply.schema_ref !== AGENT_STAGE_SCHEMA[stage]
      || !reply.user_next_steps?.some((/** @type {any} */ a) => ['write_stage_artifact', 'revise_artifact'].includes(a.action))) {
      return fail('STAGE_NOT_WRITABLE', '/stage', 'This reply does not authorize writing this stage.');
    }
    const registry = await loadSchemaRegistry(directory,
      typeof __SCHEMA_MANIFEST_DIGEST__ === 'string' ? __SCHEMA_MANIFEST_DIGEST__ : undefined);
    const state = await readStagePreparationState(runDirectory, registry);
    const repair = stage === 'evidence_claims'
      && (reply.source_revision ?? reply.scope?.source_revision) === state.revision + 1
      ? await readPendingEvidenceRepairPreparation(runDirectory, registry, state, reply) : null;
    const candidateRevision = repair?.revision ?? state.revision;
    if (!v4ContractForIdentity(state.identity) || state.identity.schema_version !== latestV4Contract().schema_version
      || state.cancelled || (!repair && (state.nextStage !== stage || state.checkpoint?.clarification_state?.presentation))
      || reply.run_id !== state.identity.run_instance_id
      || (reply.source_revision ?? reply.scope?.source_revision) !== candidateRevision) {
      return fail('STAGE_NOT_WRITABLE', '/stage', 'The accepted run no longer permits this stage; obtain the current runner reply.');
    }
    const payload = input.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('STAGE_INPUT_INVALID', '/payload', 'Payload must be an object.');
    for (const key of ['schema_version', 'source_revision', ...(stage === 'source_pack' ? ['run_instance_id'] : []), ...(stage === 'case_drafts' ? ['case_context_digest'] : [])]) {
      if (Object.hasOwn(payload, key)) return fail('RESERVED_FIELD', `/payload/${key}`, 'This field is filled by the compiler.');
    }
    if (stage === 'case_drafts' && (state.context?.status !== 'authoring'
      || canonicalStringify(reply.case_context) !== canonicalStringify(state.context.context))) {
      return fail('CASE_CONTEXT_INVALID', '/case_context', 'Context differs from the current accepted upstream basis. Recheck semantics using a fresh reply.');
    }
    const artifact = { ...structuredClone(payload), schema_version: latestV4Contract().schema_version,
      source_revision: candidateRevision,
      ...(stage === 'source_pack' ? { run_instance_id: state.identity.run_instance_id } : {}),
      ...(stage === 'case_drafts' ? { case_context_digest: state.context.context.context_digest } : {}) };
    const errors = [...validateAgainstSchema(artifact, registry.schemas.get(AGENT_STAGE_SCHEMA[stage])), ...validateUniqueStableIds(artifact)];
    if (errors.length) return invalid(errors);
    if (stage === 'source_pack') {
      const checked = validateV4SourcePackBeforeStaging(artifact);
      if (checked.status !== 'valid') return invalid(checked.diagnostics);
    } else {
      const artifacts = { ...state.artifacts, ...(repair ? { source_pack: repair.source } : {}), [stage]: artifact };
      const system = withClarificationState(deriveV4AuthoringSystemContext(artifacts.source_pack,
        artifacts.evidence_claims, await loadSourceAcquisitionCompilerStateV4(runDirectory, artifacts.source_pack, { read_only: true })),
      state.checkpoint, artifacts.source_pack.decision_records);
      if (stage === 'evidence_claims') {
        const checked = compilePreCaseArtifactsV4({source_pack: artifacts.source_pack, evidence_claims: artifacts.evidence_claims}, system);
        if (!['pre_case', 'need_user_answers'].includes(checked.status)) return invalid(checked.diagnostics?.length ? checked.diagnostics : [{code:'SOURCE_PREREQUISITE_INVALID', message:'Source prerequisites are not valid.'}]);
      } else {
        const checked = compileCaseAuthoringContext({ source_pack: artifacts.source_pack,
          evidence_claims: artifacts.evidence_claims, behavior_views: artifacts.behavior_views }, system);
        if (checked.status !== 'authoring') return invalid(checked.diagnostics?.length ? checked.diagnostics : [{code:'UPSTREAM_NOT_READY',message:'Resolve the prerequisite through the runner.'}]);
        if (stage === 'case_drafts') {
          const cases = validateCaseDraftCandidate(artifact, checked, system);
          if (cases.status !== 'candidate_valid') return invalid(cases.diagnostics);
        }
      }
    }
    return { status: 'prepared', stage, artifact };
  } catch (error) {
    return fail('STAGE_PREPARATION_FAILED', '/', error instanceof Error ? error.message : 'Read-only preparation failed; accepted artifacts were not changed.');
  }
}
