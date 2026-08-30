import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import testObligationsSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

const CONTEXT_KEYS = [
  'schema_version', 'source_revision', 'compiler_version', 'lineage',
  'evidence_claims', 'obligations_artifact', 'classification', 'clarification',
  'limits', 'expert_recall_limits'
];
const CLASSIFICATION_KEYS = [
  'grounded', 'conditional', 'blocked', 'not_applicable', 'exploratory', 'diagnostics'
];
const CLARIFICATION_KEYS = [
  'action', 'source_revision', 'root_issues', 'pending_root_issues', 'state',
  'semantic_snapshot', 'interaction', 'diagnostics'
];
const DISPOSITIONS = new Set(['grounded', 'conditional', 'blocked', 'not_applicable']);
const RISKS = new Set(['critical', 'high', 'medium', 'low']);

export class BundleReconciliationError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('test-bundle reconciliation requires revision');
    this.name = 'BundleReconciliationError';
    this.status = 'need_revision';
    this.stage = 'coverage';
    this.diagnostics = finalizeDiagnostics(diagnostics);
  }
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(canonicalStringify(item), item);
  return [...unique.values()].sort((left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.message, right.message));
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {unknown} value @returns {string[]} */
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} path @param {Diagnostic[]} diagnostics @param {string} code */
function requireClosed(value, allowed, path, diagnostics, code) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value).sort(compareCodePoints)) if (!allowedKeys.has(key)) diagnostics.push(diagnostic(
    'schema', code, `${path}/${pointerPart(key)}`, 'property is outside the closed Task 10 contract'
  ));
  for (const key of allowed) if (!Object.hasOwn(value, key)) diagnostics.push(diagnostic(
    'schema', 'CONTEXT_PROPERTY_MISSING', `${path}/${pointerPart(key)}`, 'required Task 10 context property is missing'
  ));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [nonempty] */
function canonicalStrings(value, path, diagnostics, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    diagnostics.push(diagnostic('schema', 'STRING_ARRAY_INVALID', path, 'value must be a dense canonical string array'));
    return [];
  }
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || typeof value[index] !== 'string'
      || value[index].length === 0 || value[index] !== value[index].trim() || seen.has(value[index])) {
      diagnostics.push(diagnostic('schema', 'STRING_ARRAY_INVALID', `${path}/${index}`, 'value must be a dense unique nonpadded string array'));
      continue;
    }
    seen.add(value[index]);
    output.push(value[index]);
  }
  return output.sort(compareCodePoints);
}

/** @param {unknown} submittedContext */
function normalizeContext(submittedContext) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  if (!isRecord(submittedContext)) throw new BundleReconciliationError([
    diagnostic('schema', 'CONTEXT_INVALID', '/', 'Task 10 context must be a closed own-data record')
  ]);
  requireClosed(submittedContext, CONTEXT_KEYS, '', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  if (submittedContext.schema_version !== '1.0.0') diagnostics.push(diagnostic(
    'schema', 'SCHEMA_VERSION_INVALID', '/schema_version', 'Task 10 requires schema version 1.0.0'
  ));
  if (!Number.isSafeInteger(submittedContext.source_revision) || Number(submittedContext.source_revision) < 0) diagnostics.push(diagnostic(
    'schema', 'SOURCE_REVISION_INVALID', '/source_revision', 'source revision must be a nonnegative safe integer'
  ));
  if (typeof submittedContext.compiler_version !== 'string' || submittedContext.compiler_version.trim().length === 0
    || submittedContext.compiler_version !== submittedContext.compiler_version.trim()) diagnostics.push(diagnostic(
    'schema', 'COMPILER_VERSION_INVALID', '/compiler_version', 'compiler version must be nonblank and nonpadded'
  ));
  const lineage = isRecord(submittedContext.lineage) ? submittedContext.lineage : {};
  requireClosed(lineage, ['source_digest', 'case_draft_digest'], '/lineage', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  for (const key of ['source_digest', 'case_draft_digest']) if (
    typeof lineage[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(lineage[key])
  ) diagnostics.push(diagnostic('schema', 'LINEAGE_DIGEST_INVALID', `/lineage/${key}`, 'lineage digest must be lowercase SHA-256 hexadecimal'));

  const obligations = isRecord(submittedContext.obligations_artifact) ? submittedContext.obligations_artifact : {};
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema(obligations, testObligationsSchema)));
  const evidenceClaims = isRecord(submittedContext.evidence_claims) ? submittedContext.evidence_claims : {};
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema(evidenceClaims, evidenceClaimsSchema)));
  const classification = isRecord(submittedContext.classification) ? submittedContext.classification : {};
  requireClosed(classification, CLASSIFICATION_KEYS, '/classification', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  const clarification = isRecord(submittedContext.clarification) ? submittedContext.clarification : {};
  requireClosed(clarification, CLARIFICATION_KEYS, '/clarification', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  const revision = Number(submittedContext.source_revision);
  if (evidenceClaims.source_revision !== revision || obligations.source_revision !== revision || clarification.source_revision !== revision) diagnostics.push(diagnostic(
    'traceability', 'SOURCE_REVISION_MISMATCH', '/source_revision', 'Task 7, Task 9, and Task 10 must identify one source revision'
  ));
  if (clarification.action !== 'deliver') diagnostics.push(diagnostic(
    'classification', 'CLARIFICATION_NOT_DELIVERABLE', '/clarification/action', 'coverage may run only after clarification chooses delivery'
  ));
  if (!Array.isArray(classification.diagnostics) || classification.diagnostics.length > 0
    || !Array.isArray(clarification.diagnostics) || clarification.diagnostics.length > 0) diagnostics.push(diagnostic(
    'classification', 'UPSTREAM_DIAGNOSTICS_UNRESOLVED', '/', 'coverage cannot reconcile an upstream result with diagnostics'
  ));
  const limits = canonicalStrings(submittedContext.limits, '/limits', diagnostics, true);
  const expertLimits = canonicalStrings(submittedContext.expert_recall_limits, '/expert_recall_limits', diagnostics, true);
  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  return {
    sourceRevision: revision,
    compilerVersion: String(submittedContext.compiler_version),
    lineage: { source_digest: String(lineage.source_digest), case_draft_digest: String(lineage.case_draft_digest) },
    evidenceClaims,
    obligations,
    classification,
    clarification,
    limits,
    expertLimits
  };
}

/** @param {Record<string, unknown>} caseDraft */
function caseExpectations(caseDraft) {
  const expectations = [];
  for (const step of records(caseDraft.steps)) for (const expectation of records(step.expectations)) expectations.push(expectation);
  return expectations;
}

/** @param {string[]} left @param {string[]} right */
function sameStrings(left, right) {
  return canonicalStringify([...left].sort(compareCodePoints)) === canonicalStringify([...right].sort(compareCodePoints));
}

/**
 * @param {Record<string, unknown>} caseDraft
 * @param {string} lane
 * @param {Map<string, Record<string, unknown>>} obligationsById
 * @param {Map<string, Record<string, unknown>>} routesByFact
 * @param {Map<string, Record<string, unknown>>} pointsById
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Diagnostic[]} diagnostics
 */
function validateCaseTraceability(caseDraft, lane, obligationsById, routesByFact, pointsById, claimsById, diagnostics) {
  const caseId = typeof caseDraft.case_id === 'string' ? caseDraft.case_id : 'invalid';
  const path = `/${lane}/${pointerPart(caseId)}`;
  const factIds = strings(caseDraft.fact_ids);
  const obligationIds = strings(caseDraft.obligation_ids);
  const evidenceRefs = new Set(strings(caseDraft.evidence_refs));
  for (const obligationId of obligationIds) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) diagnostics.push(diagnostic(
      'reference', 'CASE_OBLIGATION_UNKNOWN', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case references an unknown formal Test Point'
    ));
    else {
      const point = pointsById.get(obligationId);
      if (point?.classification !== lane) diagnostics.push(diagnostic(
        'traceability', 'CASE_DISPOSITION_MISMATCH', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case lane and final formal disposition must match'
      ));
      for (const ref of [...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)]) if (!evidenceRefs.has(ref)) diagnostics.push(diagnostic(
        'traceability', 'CASE_ORACLE_TRACE_MISSING', `${path}/evidence_refs/${pointerPart(ref)}`, 'Case must retain each linked Test Point source and Oracle reference'
      ));
    }
  }
  for (const factId of factIds) {
    const route = routesByFact.get(factId);
    if (!route) diagnostics.push(diagnostic(
      'reference', 'CASE_FACT_UNKNOWN', `${path}/fact_ids/${pointerPart(factId)}`, 'Case references an unknown requirement fact'
    ));
    else if (route.route_type !== 'obligations'
      || !strings(route.obligation_ids).some((obligationId) => obligationIds.includes(obligationId))) diagnostics.push(diagnostic(
      'traceability', 'CASE_FACT_TRACE_MISSING', `${path}/fact_ids/${pointerPart(factId)}`, 'Case fact must route to one of the Case formal Test Points'
    ));
  }
  const expectations = caseExpectations(caseDraft);
  const expectationIds = strings(expectations.map((item) => item.expectation_id));
  const signature = isRecord(caseDraft.execution_signature) ? caseDraft.execution_signature : {};
  const submittedOracleIds = strings(signature.oracle_refs);
  if (expectations.length < obligationIds.length || expectationIds.length !== expectations.length
    || new Set(expectationIds).size !== expectationIds.length || !sameStrings(expectationIds, submittedOracleIds)) diagnostics.push(diagnostic(
    'traceability', 'CASE_ORACLE_TRACE_MISSING', `${path}/execution_signature/oracle_refs`,
    'every covered Test Point requires a distinct independently locatable expectation Oracle'
  ));
  const ancestorsByExpectation = new Map();
  for (const expectation of expectations) {
    const expectationId = String(expectation.expectation_id ?? '');
    const evidenceRef = String(expectation.evidence_ref ?? '');
    const ancestors = new Set();
    const pending = [evidenceRef];
    while (pending.length > 0) {
      const claimId = /** @type {string} */ (pending.pop());
      if (ancestors.has(claimId)) continue;
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      ancestors.add(claimId);
      for (const parentId of strings(claim.parent_claim_ids)) pending.push(parentId);
    }
    ancestorsByExpectation.set(expectationId, ancestors);
  }
  const edges = new Map();
  for (const obligationId of obligationIds) {
    const oracleRoots = strings(obligationsById.get(obligationId)?.required_oracle_refs);
    const candidates = expectationIds.filter((expectationId) => oracleRoots.length > 0
      && oracleRoots.every((root) => ancestorsByExpectation.get(expectationId)?.has(root)));
    edges.set(obligationId, candidates.sort(compareCodePoints));
  }
  const expectationOwner = new Map();
  /** @param {string} obligationId @param {Set<string>} seen */
  function assignExpectation(obligationId, seen) {
    for (const expectationId of edges.get(obligationId) ?? []) {
      if (seen.has(expectationId)) continue;
      seen.add(expectationId);
      const owner = expectationOwner.get(expectationId);
      if (!owner || assignExpectation(owner, seen)) {
        expectationOwner.set(expectationId, obligationId);
        return true;
      }
    }
    return false;
  }
  let owned = 0;
  for (const obligationId of [...obligationIds].sort(compareCodePoints)) {
    if (assignExpectation(obligationId, new Set())) owned += 1;
  }
  if (owned !== obligationIds.length) diagnostics.push(diagnostic(
    'traceability', 'CASE_ORACLE_OWNERSHIP_INCOMPLETE', `${path}/steps`,
    'every linked Test Point must own one distinct concrete expectation covering all required Oracles through accepted ancestry'
  ));
  if (Object.hasOwn(signature, 'test_point_ids') && !sameStrings(strings(signature.test_point_ids), obligationIds)) diagnostics.push(diagnostic(
    'traceability', 'CASE_TEST_POINT_TRACE_MISMATCH', `${path}/execution_signature/test_point_ids`, 'Case signature Test Point associations must be exact'
  ));
}

/** @param {Record<string, unknown>[]} roots @param {Record<string, unknown>[]} ledger @param {string} obligationId @param {string} reason */
function rootsForObligation(roots, ledger, obligationId, reason) {
  const matches = roots.filter((root) => strings(root.affected_obligation_ids).includes(obligationId)
    && strings(root.reasons).includes(reason));
  if (matches.length > 0) return matches;
  return ledger.filter((root) => strings(root.affected_obligation_ids).includes(obligationId)
    && strings(root.reasons).includes(reason));
}

/**
 * Build the sole canonical delivery artifact from accepted Task 7–9 output.
 * Invalid accounting is represented by BundleReconciliationError diagnostics,
 * never by a partial bundle or an uncovered pseudo-lane.
 * @param {unknown} context
 */
export function buildBundle(context) {
  const normalized = normalizeContext(context);
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const obligations = records(normalized.obligations.obligations);
  const factRoutes = records(normalized.obligations.fact_routes);
  const obligationsById = new Map();
  const claimsById = new Map();
  for (const claim of records(normalized.evidenceClaims.claims)) {
    const claimId = String(claim.claim_id ?? '');
    if (claimsById.has(claimId)) diagnostics.push(diagnostic(
      'reference', 'EVIDENCE_CLAIM_DUPLICATE', `/evidence_claims/claims/${pointerPart(claimId)}`, 'accepted claim IDs must be unique'
    ));
    else claimsById.set(claimId, claim);
  }
  for (const obligation of obligations) {
    const id = String(obligation.obligation_id ?? '');
    if (obligationsById.has(id)) diagnostics.push(diagnostic('coverage', 'FORMAL_TEST_POINT_DUPLICATE', `/obligations/${pointerPart(id)}`, 'formal Test Point IDs must be unique'));
    else obligationsById.set(id, obligation);
  }
  const routesByFact = new Map();
  for (const route of factRoutes) {
    const factId = String(route.fact_id ?? '');
    if (routesByFact.has(factId)) diagnostics.push(diagnostic('coverage', 'REQUIREMENT_FACT_DUPLICATE', `/fact_routes/${pointerPart(factId)}`, 'requirement facts must have exactly one route'));
    else routesByFact.set(factId, route);
    if (route.route_type === 'obligations') for (const obligationId of strings(route.obligation_ids)) {
      if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
        'reference', 'FACT_ROUTE_OBLIGATION_UNKNOWN', `/fact_routes/${pointerPart(factId)}/obligation_ids/${pointerPart(obligationId)}`,
        'requirement fact route references an unknown formal Test Point'
      ));
    }
  }

  const semantics = isRecord(normalized.clarification.semantic_snapshot)
    ? normalized.clarification.semantic_snapshot : {};
  const points = records(semantics.formal_test_points);
  const pointsById = new Map();
  for (const [index, point] of points.entries()) {
    const obligationId = typeof point.obligation_id === 'string' ? point.obligation_id : '';
    const classification = typeof point.classification === 'string' ? point.classification : '';
    if (pointsById.has(obligationId)) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_TEST_POINT_DUPLICATE', `/clarification/semantic_snapshot/formal_test_points/${index}/obligation_id`, 'formal Test Point must have exactly one disposition'
    ));
    else pointsById.set(obligationId, point);
    if (!DISPOSITIONS.has(classification)) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_DISPOSITION_INVALID', `/clarification/semantic_snapshot/formal_test_points/${index}/classification`, 'formal Test Point disposition is outside the frozen four lanes'
    ));
    const reason = point.blocked_reason;
    if (classification === 'blocked' && (typeof reason !== 'string' || reason.trim().length === 0
      || reason === 'uncovered' || reason === 'not-evaluated')) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_REASON_INVALID', `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`, 'Blocked formal Test Point requires a concrete root reason'
    ));
    if (classification !== 'blocked' && reason !== null) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_REASON_UNEXPECTED', `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`, 'only Blocked formal Test Points may carry a reason'
    ));
  }
  for (const obligationId of obligationsById.keys()) if (!pointsById.has(obligationId)) diagnostics.push(diagnostic(
    'coverage', 'FORMAL_TEST_POINT_DISPOSITION_MISSING', `/formal/${pointerPart(obligationId)}`, 'every formal Test Point requires exactly one final disposition'
  ));
  for (const obligationId of pointsById.keys()) if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
    'reference', 'FORMAL_TEST_POINT_UNKNOWN', `/formal/${pointerPart(obligationId)}`, 'final disposition references an unknown formal Test Point'
  ));
  const delivery = isRecord(semantics.delivery_sections) ? semantics.delivery_sections : {};
  for (const lane of ['grounded', 'conditional', 'blocked']) {
    const expected = points.filter((point) => point.classification === lane).map((point) => String(point.obligation_id));
    if (!sameStrings(strings(delivery[lane]), expected)) diagnostics.push(diagnostic(
      'traceability', 'CLARIFICATION_LANE_MISMATCH', `/clarification/semantic_snapshot/delivery_sections/${lane}`,
      'Task 9 delivery lane must exactly project its formal Test Point dispositions'
    ));
  }
  const deliveryCoverage = isRecord(delivery.coverage) ? delivery.coverage : {};
  if (semantics.coverage_denominator !== points.length || deliveryCoverage.formal_denominator !== points.length) diagnostics.push(diagnostic(
    'coverage', 'CLARIFICATION_DENOMINATOR_MISMATCH', '/clarification/semantic_snapshot/coverage_denominator',
    'Task 9 semantic denominator must exactly account for its formal Test Point snapshot'
  ));

  /** @type {Map<string, Set<string>>} */
  const baseLanesByObligation = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const casesById = new Map();
  /** @type {Record<string, unknown>[]} */
  const grounded = [];
  /** @type {Record<string, unknown>[]} */
  const conditional = [];
  for (const lane of ['grounded', 'conditional']) for (const caseDraft of records(normalized.classification[lane])) {
    const caseId = String(caseDraft.case_id ?? '');
    if (casesById.has(caseId)) diagnostics.push(diagnostic('traceability', 'CASE_ID_DUPLICATE', `/classification/${lane}/${pointerPart(caseId)}`, 'executable Case IDs must be unique across lanes'));
    else casesById.set(caseId, caseDraft);
    const obligationIds = strings(caseDraft.obligation_ids);
    for (const obligationId of obligationIds) {
      const lanes = baseLanesByObligation.get(obligationId) ?? new Set();
      lanes.add(lane);
      baseLanesByObligation.set(obligationId, lanes);
    }
    const finalLanes = new Set(obligationIds.map((id) => String(pointsById.get(id)?.classification ?? 'unknown')));
    if (finalLanes.size === 1 && finalLanes.has(lane)) {
      validateCaseTraceability(caseDraft, lane, obligationsById, routesByFact, pointsById, claimsById, diagnostics);
      (lane === 'grounded' ? grounded : conditional).push(structuredClone(caseDraft));
    } else if (!(finalLanes.size === 1 && finalLanes.has('blocked'))) diagnostics.push(diagnostic(
      'traceability', 'CASE_DISPOSITION_MISMATCH', `/classification/${lane}/${pointerPart(caseId)}`, 'one Case cannot cross final executable and blocked dispositions'
    ));
  }
  for (const [obligationId, lanes] of baseLanesByObligation) if (lanes.size > 1) diagnostics.push(diagnostic(
    'coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/formal/${pointerPart(obligationId)}`, 'one formal Test Point cannot enter multiple executable lanes'
  ));

  const blockedInput = records(normalized.classification.blocked);
  const blockedInputById = new Map();
  for (const item of blockedInput) {
    const id = String(item.obligation_id ?? '');
    if (blockedInputById.has(id)) diagnostics.push(diagnostic('coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/classification/blocked/${pointerPart(id)}`, 'Blocked disposition must be unique'));
    else blockedInputById.set(id, item);
    if (pointsById.get(id)?.classification !== 'blocked') diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_DISPOSITION_MISMATCH', `/classification/blocked/${pointerPart(id)}`, 'upstream Blocked disposition must remain Blocked'
    ));
  }
  const roots = records(normalized.clarification.root_issues);
  const state = isRecord(normalized.clarification.state) ? normalized.clarification.state : {};
  const ledger = records(state.root_snapshot_ledger);
  /** @type {Record<string, unknown>[]} */
  const blocked = [];
  for (const point of points.filter((item) => item.classification === 'blocked')) {
    const obligationId = String(point.obligation_id);
    const reason = String(point.blocked_reason);
    const obligation = obligationsById.get(obligationId);
    const projectedFromCase = baseLanesByObligation.has(obligationId);
    const task8Blocker = blockedInputById.get(obligationId);
    if (!projectedFromCase && !task8Blocker) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_DISPOSITION_MISSING', `/classification/blocked/${pointerPart(obligationId)}`,
      'final Blocked Test Point must trace to a Task 8 blocker or an executable Case gated by Task 9'
    ));
    if (projectedFromCase && task8Blocker) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/formal/${pointerPart(obligationId)}`,
      'final Blocked Test Point cannot retain both a Task 8 blocker and an executable Case projection'
    ));
    if (task8Blocker && (task8Blocker.reason !== reason || task8Blocker.risk !== obligation?.risk)) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_DISPOSITION_MISMATCH', `/classification/blocked/${pointerPart(obligationId)}`,
      'Task 8 and final Blocked reason and risk must agree'
    ));
    const candidates = rootsForObligation(roots, ledger, obligationId, reason);
    if (candidates.length !== 1) {
      diagnostics.push(diagnostic(
        'traceability', 'BLOCKED_ROOT_TRACE_INVALID', `/blocked/${pointerPart(obligationId)}`,
        `Blocked formal Test Point requires exactly one root issue; found ${candidates.length}`
      ));
      continue;
    }
    const root = candidates[0];
    const semanticRefs = strings(root.semantic_refs);
    const missingType = typeof root.missing_type === 'string' ? root.missing_type : '';
    const question = typeof root.question === 'string' ? root.question : '';
    const risk = typeof obligation?.risk === 'string' ? obligation.risk : '';
    if (semanticRefs.length === 0 || missingType.trim().length === 0 || question.trim().length === 0 || !RISKS.has(risk)) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_RECOVERY_INCOMPLETE', `/blocked/${pointerPart(obligationId)}/recovery`, 'Blocked root must provide missing type, material references, question, and formal risk'
    ));
    blocked.push({
      obligation_id: obligationId,
      root_issue_id: String(root.root_issue_id ?? ''),
      reason,
      recovery: {
        missing_type: missingType,
        required_material: [...semanticRefs].sort(compareCodePoints).join(', '),
        question
      },
      risk
    });
  }

  const naInput = records(normalized.classification.not_applicable);
  const naById = new Map();
  for (const item of naInput) {
    const obligationId = String(item.obligation_id ?? '');
    if (naById.has(obligationId)) diagnostics.push(diagnostic('coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/classification/not_applicable/${pointerPart(obligationId)}`, 'NotApplicable disposition must be unique'));
    else naById.set(obligationId, item);
    if (pointsById.get(obligationId)?.classification !== 'not_applicable') diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_DISPOSITION_MISMATCH', `/classification/not_applicable/${pointerPart(obligationId)}`, 'NotApplicable disposition must match final formal semantics'
    ));
  }
  for (const point of points) {
    const id = String(point.obligation_id);
    if ((point.classification === 'grounded' || point.classification === 'conditional')
      && !(baseLanesByObligation.get(id)?.has(point.classification))) diagnostics.push(diagnostic(
      'traceability', 'FORMAL_CASE_TRACE_MISSING', `/formal/${pointerPart(id)}`, 'every executable formal Test Point must reference a Case in its final lane'
    ));
    if (point.classification === 'not_applicable' && !naById.has(id)) diagnostics.push(diagnostic(
      'coverage', 'NOT_APPLICABLE_DISPOSITION_MISSING', `/formal/${pointerPart(id)}`, 'NotApplicable formal Test Point requires its verified exclusion record'
    ));
  }
  const notApplicable = [...naById.values()].map((item) => ({
    obligation_id: String(item.obligation_id),
    exclusion_claim_id: String(item.exclusion_claim_id),
    scope: String(item.scope),
    support_review: String(item.support_review)
  })).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));

  const exploratoryIds = strings(delivery.exploratory);
  const exploratoryInput = records(normalized.classification.exploratory);
  const exploratory = exploratoryInput.map((item) => ({
    exploratory_id: String(item.exploratory_id ?? ''),
    title: String(item.title ?? ''),
    scope: String(item.scope ?? ''),
    risk: String(item.risk ?? ''),
    reason: `Risk hypothesis outside formal Test Point coverage; evidence: ${strings(item.source_claim_ids).sort(compareCodePoints).join(', ')}`
  })).sort((left, right) => compareCodePoints(left.exploratory_id, right.exploratory_id));
  if (!sameStrings(exploratoryIds, exploratory.map((item) => item.exploratory_id))) diagnostics.push(diagnostic(
    'traceability', 'EXPLORATORY_LANE_MISMATCH', '/exploratory', 'Task 8 and Task 9 Exploratory identities must match exactly'
  ));

  const executableCases = [...grounded, ...conditional];
  const traceByFact = new Map();
  for (const caseDraft of executableCases) for (const factId of strings(caseDraft.fact_ids)) {
    const linked = traceByFact.get(factId) ?? new Set();
    for (const obligationId of strings(caseDraft.obligation_ids)) linked.add(obligationId);
    traceByFact.set(factId, linked);
  }
  const requirementEntries = [];
  for (const route of factRoutes) {
    const factId = String(route.fact_id);
    let status = 'blocked';
    if (route.route_type === 'not_applicable') status = 'not_applicable';
    else if (route.route_type === 'obligations') {
      const obligationIds = strings(route.obligation_ids);
      const dispositions = obligationIds.map((id) => String(pointsById.get(id)?.classification ?? 'unknown'));
      const linked = traceByFact.get(factId) ?? new Set();
      if (obligationIds.some((id, index) => (dispositions[index] === 'grounded' || dispositions[index] === 'conditional') && linked.has(id))) status = 'covered';
      else if (dispositions.every((item) => item === 'not_applicable')) status = 'not_applicable';
      else if (dispositions.some((item) => item === 'grounded' || item === 'conditional')) diagnostics.push(diagnostic(
        'traceability', 'REQUIREMENT_CASE_TRACE_MISSING', `/coverage/requirements/${pointerPart(factId)}`, 'an executable fact route requires a reverse Case association'
      ));
    }
    requirementEntries.push({ fact_id: factId, status });
  }
  requirementEntries.sort((left, right) => compareCodePoints(left.fact_id, right.fact_id));

  const formalEntries = points.map((point) => ({
    obligation_id: String(point.obligation_id), status: String(point.classification)
  })).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const executableEntries = [];
  for (const caseDraft of grounded) for (const obligationId of strings(caseDraft.obligation_ids)) executableEntries.push({
    obligation_id: obligationId, case_id: String(caseDraft.case_id)
  });
  executableEntries.sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id)
    || compareCodePoints(left.case_id, right.case_id));
  const applicable = formalEntries.filter((item) => item.status !== 'not_applicable');
  const covered = applicable.filter((item) => item.status === 'grounded' || item.status === 'conditional');
  const groundedIds = new Set(formalEntries.filter((item) => item.status === 'grounded').map((item) => item.obligation_id));
  const highBlocked = blocked.some((item) => item.risk === 'critical' || item.risk === 'high');
  const deliveryStatus = applicable.length === 0
    ? 'no_applicable_formal_test_points'
    : executableCases.length === 0 && blocked.length > 0
      ? 'no_deterministic_cases'
      : executableCases.length > 0 && highBlocked
        ? 'critical_gaps'
        : executableCases.length > 0
          ? 'executable_subset_ready'
          : '';
  if (!deliveryStatus) diagnostics.push(diagnostic(
    'coverage', 'FINAL_STATUS_UNRESOLVED', '/quality/delivery_status', 'formal dispositions do not resolve to one frozen delivery status'
  ));

  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  const bundle = {
    schema_version: '1.0.0',
    source_revision: normalized.sourceRevision,
    grounded: grounded.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id))),
    conditional: conditional.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id))),
    blocked: blocked.sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id))),
    exploratory,
    coverage: {
      requirements: { total: requirementEntries.length, accounted: requirementEntries.length, entries: requirementEntries },
      formal: { total: formalEntries.length, covered: covered.length, entries: formalEntries },
      executable: { total: groundedIds.size, grounded: groundedIds.size, entries: executableEntries },
      expert_recall: { status: 'benchmark_only', limits: normalized.expertLimits },
      not_applicable: notApplicable
    },
    quality: {
      delivery_status: deliveryStatus,
      compiler_version: normalized.compilerVersion,
      schema_version: '1.0.0',
      lineage: normalized.lineage,
      limits: normalized.limits
    }
  };
  const canonicalBundle = JSON.parse(canonicalStringify(bundle));
  const outputDiagnostics = [
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(canonicalBundle, testBundleSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(canonicalBundle))
  ];
  if (outputDiagnostics.length > 0) throw new BundleReconciliationError(outputDiagnostics);
  return canonicalBundle;
}
