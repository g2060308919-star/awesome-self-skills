import artifactSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { canonicalExclusionBasis, canonicalIds, notApplicableContextSchema, notApplicableRecordSchema, riskKinds, validateNotApplicable } from './not-applicable.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const text = { type: 'string', minLength: 1, pattern: '\\S' };
const ids = { type: 'array', minItems: 1, uniqueItems: true, items: text };
/** @param {Record<string,unknown>} properties */
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const subject = { module_id: text, risk_kind: { enum: [...riskKinds] }, acceptance_role: { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] } };
const contextSchema = { $defs: artifactSchema.$defs, ...closed({
  primary_module_ids: { ...ids, minItems: 0 },
  formal_test_points: { type: 'array', items: closed({ ...subject, formal_test_point_id: text, claim_ids: ids }) },
  semantic_gaps: { type: 'array', items: closed({ ...subject, semantic_gap_id: text, subject_fact_ids: ids, missing_aspect: text }) },
  exploratory: { type: 'array', items: closed({ ...subject, exploratory_id: text, policy_id: text, policy_version: text }) },
  not_applicable_records: { type: 'array', items: notApplicableRecordSchema },
  not_applicable_context: notApplicableContextSchema
}) };
/** @param {any} left @param {any} right */
const sameSubject = (left, right) => left.module_id === right.module_id && left.risk_kind === right.risk_kind && left.acceptance_role === right.acceptance_role;
/** @param {string[]} left @param {string[]} right */
const sameIds = (left, right) => canonicalStringify(canonicalIds(left)) === canonicalStringify(canonicalIds(right));

/**
 * Review completeness and exact target/basis linkage, never create fake formal
 * points from heuristic risks. Targets are already verified compiler outputs;
 * exploratory catalog/version provenance requires no invented evidence Claim.
 * @param {unknown} ledger @param {unknown} systemContext
 */
export function validateRiskReviewLedger(ledger, systemContext) {
  const diagnostics = validateAgainstSchema(ledger, { $defs: artifactSchema.$defs, type: 'array', items: { $ref: '#/$defs/riskReviewItem' } });
  if (diagnostics.length) return diagnostics;
  if (validateAgainstSchema(systemContext, contextSchema).length) return [{ category: 'quality_failure', code: 'RISK_CONTEXT_INVALID', path: '/', message: 'Risk review requires complete compiler-owned target context.' }];
  const context = /** @type {any} */ (systemContext);
  const items = /** @type {any[]} */ (ledger);
  /** @param {string} code @param {string} path @param {string} message */
  const add = (code, path, message) => diagnostics.push({ category: 'quality_failure', code, path, message });
  for (const moduleId of context.primary_module_ids) for (const riskKind of riskKinds) {
    const count = items.filter(item => item.module_id === moduleId && item.risk_kind === riskKind).length;
    if (count !== 1) add('RISK_REVIEW_INCOMPLETE', '/', `Primary module ${moduleId} must review ${riskKind} exactly once.`);
  }
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const key = canonicalStringify([item.module_id, item.risk_kind]);
    if (seen.has(key)) add('RISK_REVIEW_DUPLICATE', `/${index}`, 'A module/risk pair must have exactly one disposition.');
    seen.add(key);
    /** @param {any[]} collection @param {string} idField @param {string[]} refs @param {(target:any)=>boolean} matches */
    const requireTargets = (collection, idField, refs, matches) => {
      for (const id of refs) {
        const targets = collection.filter(target => target[idField] === id && matches(target));
        if (targets.length !== 1) add('RISK_TARGET_UNRESOLVED', `/${index}`, 'Risk result, subject, acceptance role and review basis must agree exactly.');
      }
    };
    if (item.status === 'formal') requireTargets(context.formal_test_points, 'formal_test_point_id', item.formal_test_point_ids,
      target => sameSubject(item, target) && item.review_basis.claim_ids.every((/** @type {string} */ id) => target.claim_ids.includes(id)));
    if (item.status === 'semantic_gap') requireTargets(context.semantic_gaps, 'semantic_gap_id', item.semantic_gap_ids,
      target => sameSubject(item, target) && sameIds(item.review_basis.subject_fact_ids, target.subject_fact_ids) && item.review_basis.missing_aspect === target.missing_aspect);
    if (item.status === 'exploratory') requireTargets(context.exploratory, 'exploratory_id', item.exploratory_ids,
      target => sameSubject(item, target) && item.review_basis.policy_id === target.policy_id && item.review_basis.policy_version === target.policy_version);
    if (item.status === 'not_applicable') requireTargets(context.not_applicable_records, 'not_applicable_record_id', item.not_applicable_record_ids,
      target => validateNotApplicable(target, context.not_applicable_context).length === 0 && target.subject.kind === 'risk'
        && sameSubject(item, { ...target.subject, acceptance_role: target.acceptance_role })
        && canonicalStringify(canonicalExclusionBasis(item.review_basis)) === canonicalStringify(target.basis));
  }
  return diagnostics;
}
