import artifactSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

export const riskKinds = Object.freeze([...artifactSchema.$defs.riskReviewBase.properties.risk_kind.enum]);
const text = { type: 'string', minLength: 1, pattern: '\\S' };
const role = { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] };
/** @param {Record<string,unknown>} properties */
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
/** @param {string} name */
const contract = name => ({ $defs: artifactSchema.$defs, $ref: `#/$defs/${name}` });
export const notApplicableSubjectSchema = contract('notApplicableSubject');
export const exclusionBasisSchema = contract('exclusionBasis');
const justification = {
  subject: notApplicableSubjectSchema, acceptance_role: role,
  reason_code: { enum: ['out_of_scope', 'inapplicable_condition', 'superseded_requirement'] }, basis: exclusionBasisSchema
};
const intentSchema = { $defs: artifactSchema.$defs, ...closed({ ...justification, reason: text }) };
export const notApplicableRecordSchema = contract('notApplicableRecord');
export const notApplicableContextSchema = { $defs: artifactSchema.$defs, ...closed({
  subjects: { type: 'array', items: closed({ subject: notApplicableSubjectSchema, acceptance_role: role }) },
  verified_bases: { type: 'array', items: closed(justification) }
}) };

/** Unicode scalar ordering, not UTF-16 code-unit or locale ordering.
 * @param {string} left @param {string} right
 */
export function compareScalar(left, right) {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0);
  const b = Array.from(right, character => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
/** @param {string[]} values */
export const canonicalIds = values => [...new Set(values.map(value => value.normalize('NFC')))].sort(compareScalar);
/** @param {any} input @returns {any} */
function normalize(input) {
  if (typeof input === 'string') return input.normalize('NFC');
  if (Array.isArray(input)) return input.map(normalize);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, normalize(value)]));
  return input;
}
/** Canonicalize only the closed evidence/scope-decision union; no free-form basis.
 * @param {any} input
 */
export function canonicalExclusionBasis(input) {
  const basis = normalize(input);
  if (basis && typeof basis === 'object' && !Array.isArray(basis)) {
    for (const key of ['claim_ids', 'decision_ids']) if (Array.isArray(basis[key]) && basis[key].every((/** @type {unknown} */ id) => typeof id === 'string')) {
      basis[key] = canonicalIds(basis[key]);
    }
  }
  if (validateAgainstSchema(basis, exclusionBasisSchema).length) throw new TypeError('NOT_APPLICABLE_BASIS_INVALID');
  return basis;
}
/** @param {any} input */
function canonicalIntent(input) {
  const request = normalize(input);
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new TypeError('NOT_APPLICABLE_INTENT_INVALID');
  request.basis = canonicalExclusionBasis(request.basis);
  if (validateAgainstSchema(request, intentSchema).length) throw new TypeError('NOT_APPLICABLE_INTENT_INVALID');
  return request;
}
/**
 * verified_bases is compiler-owned Evidence/Decision validation output, not a
 * fifth Agent artifact: every tuple attests the exact subject, role and exclusion
 * reason. The Evidence/Decision pipeline must establish its validity first.
 * @param {unknown} input @param {unknown} systemContext
 */
export function compileNotApplicable(input, systemContext) {
  const request = canonicalIntent(input);
  const context = normalize(systemContext);
  if (context && Array.isArray(context.verified_bases)) for (const entry of context.verified_bases) {
    if (entry && typeof entry === 'object') entry.basis = canonicalExclusionBasis(entry.basis);
  }
  if (validateAgainstSchema(context, notApplicableContextSchema).length) throw new TypeError('NOT_APPLICABLE_CONTEXT_INVALID');
  const subject = { subject: request.subject, acceptance_role: request.acceptance_role };
  if (context.subjects.filter((/** @type {any} */ item) => canonicalStringify(item) === canonicalStringify(subject)).length !== 1) {
    throw new TypeError('NOT_APPLICABLE_SUBJECT_UNRESOLVED');
  }
  const { reason, ...identity } = request;
  if (!context.verified_bases.some((/** @type {any} */ item) => canonicalStringify(item) === canonicalStringify(identity))) {
    throw new TypeError('NOT_APPLICABLE_BASIS_UNVERIFIED');
  }
  return { not_applicable_record_id: `NA-${digest(identity)}`, ...request };
}
/** Verify persisted record integrity independently before Coverage excludes it.
 * @param {unknown} record @param {unknown} systemContext
 */
export function validateNotApplicable(record, systemContext) {
  const errors = validateAgainstSchema(record, notApplicableRecordSchema);
  if (errors.length) return errors;
  const { not_applicable_record_id, ...request } = /** @type {any} */ (record);
  try {
    const expected = compileNotApplicable(request, systemContext);
    if (canonicalStringify(expected) !== canonicalStringify(record)) return [{ category: 'quality_failure', code: 'NOT_APPLICABLE_RECORD_MISMATCH', path: '/', message: 'NotApplicable record must match its canonical compiler-derived identity and basis.' }];
    return [];
  } catch (error) {
    return [{ category: 'quality_failure', code: error instanceof Error ? error.message : 'NOT_APPLICABLE_INVALID', path: '/', message: 'NotApplicable subject, role and verified basis must all resolve.' }];
  }
}
