/** @typedef {'source_pack'|'evidence_claims'|'behavior_views'|'case_drafts'} AgentStage */
/** @typedef {{kind:'fatal',code:'RUNNER_PROTOCOL_VIOLATION'}|{kind:'need_revision',stage:AgentStage,schema_ref:string}} RevisionRoute */

/** @type {Readonly<Record<AgentStage,string>>} */
export const AGENT_STAGE_SCHEMA = Object.freeze({
  source_pack: 'source-pack.schema.json',
  evidence_claims: 'evidence-claims.schema.json',
  behavior_views: 'behavior-views.schema.json',
  case_drafts: 'case-drafts.schema.json'
});

/** @type {Readonly<Record<string,AgentStage>>} */
const INTERNAL_STAGE_OWNER = Object.freeze({
  source_policy: 'source_pack',
  evidence_claims: 'evidence_claims',
  behavior_views: 'behavior_views',
  test_obligations: 'behavior_views',
  classification: 'case_drafts',
  case_drafts: 'case_drafts',
  coverage: 'case_drafts',
  verification: 'case_drafts',
  render_markdown: 'case_drafts',
  clarification: 'source_pack'
});

/** @type {Readonly<Record<string,AgentStage>>} */
const POINTER_OWNER = Object.freeze({
  source_pack: 'source_pack',
  evidence_claims: 'evidence_claims',
  behavior_views: 'behavior_views',
  case_drafts: 'case_drafts'
});

/** @type {Readonly<{kind:'fatal',code:'RUNNER_PROTOCOL_VIOLATION'}>} */
const PROTOCOL_VIOLATION = Object.freeze({
  kind: 'fatal', code: 'RUNNER_PROTOCOL_VIOLATION'
});

/** @param {string} pointer @returns {AgentStage|null} */
function diagnosticOwner(pointer) {
  if (!pointer.startsWith('/')) return null;
  const separator = pointer.indexOf('/', 1);
  const root = separator === -1 ? pointer.slice(1) : pointer.slice(1, separator);
  return POINTER_OWNER[root] ?? null;
}

/**
 * Map a pure-core internal revision result to the only four Agent-writable
 * artifacts. Any unowned or ambiguous internal diagnostic fails closed.
 * @param {unknown} result
 * @returns {RevisionRoute}
 */
export function mapInternalRevision(result) {
  if (!result || typeof result !== 'object') return PROTOCOL_VIOLATION;
  const record = /** @type {Record<string, unknown>} */ (result);
  if (record.status !== 'need_revision' || typeof record.stage !== 'string'
    || !Array.isArray(record.diagnostics) || record.diagnostics.length === 0) {
    return PROTOCOL_VIOLATION;
  }
  /** @type {AgentStage|null|undefined} */
  let stage;
  if (record.stage === 'schema') {
    /** @type {AgentStage|null} */
    let owner = null;
    for (const item of record.diagnostics) {
      if (!item || typeof item !== 'object') return PROTOCOL_VIOLATION;
      const path = /** @type {Record<string, unknown>} */ (item).path;
      if (typeof path !== 'string') return PROTOCOL_VIOLATION;
      const candidate = diagnosticOwner(path);
      if (!candidate || (owner && owner !== candidate)) return PROTOCOL_VIOLATION;
      owner = candidate;
    }
    stage = owner;
  } else stage = INTERNAL_STAGE_OWNER[record.stage];
  if (!stage) return PROTOCOL_VIOLATION;
  return {
    kind: 'need_revision', stage,
    schema_ref: AGENT_STAGE_SCHEMA[stage]
  };
}
