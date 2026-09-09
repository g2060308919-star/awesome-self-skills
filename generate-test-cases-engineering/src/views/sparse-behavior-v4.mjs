import schema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import { canonicalStringify } from '../canonical.mjs';
import { canonicalIds, compareScalar } from '../not-applicable.mjs';
import { validateAgainstSchema } from '../schema-validator.mjs';

const text = { type: 'string', minLength: 1, pattern: '\\S' };
/** @param {Record<string,unknown>} properties */
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const sparseEvidenceContextSchema = closed({
  facts: { type: 'array', items: closed({ fact_id: text, module_id: text,
    acceptance_role: { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] }, condition_field: text }) },
  claims: { type: 'array', items: closed({ claim_id: text, level: { enum: ['E3', 'E2', 'E1'] }, supported: { type: 'boolean' },
    assertions: { type: 'array', minItems: 1, items: closed({ fact_id: text, field_path: text, value: {} }) } }) }
});
/** @param {string} code @param {string} path @param {string} message */
const diagnostic = (code, path, message) => ({ category: 'adapter_revision', code, path, message });
/** @param {any} value @param {string} pointer */
function at(value, pointer) {
  let target = value;
  for (const segment of pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (!target || typeof target !== 'object' || !Object.hasOwn(target, segment)) return { exists: false, value: undefined };
    target = target[segment];
  }
  return { exists: true, value: target };
}
/** Every source-bearing semantic field is explicit; no synthetic surfaces/bounds.
 * @param {any} element
 */
export function requiredBehaviorBindingsV4(element) {
  const paths = ['/business_outcome'];
  if (element.condition !== undefined) paths.push('/condition');
  if (element.expected !== undefined) paths.push('/expected');
  for (const [index, partition] of (element.partitions ?? []).entries()) {
    paths.push(`/partitions/${index}/expected`);
    if (partition.kind === 'enum') paths.push(`/partitions/${index}/value`);
    else for (const key of ['lower', 'upper', 'inclusive']) paths.push(`/partitions/${index}/bounds/${key}`);
  }
  for (const [index] of (element.surfaces ?? []).entries()) paths.push(`/surfaces/${index}/assertion`);
  for (const [index, effect] of (element.semantic_effects ?? []).entries()) {
    for (const key of ['kind', 'subject', 'before', 'after']) if (effect[key] !== undefined) paths.push(`/semantic_effects/${index}/${key}`);
  }
  return paths.sort(compareScalar);
}
/**
 * Context is the compiler's already verified, field-level Evidence assessment.
 * The caller must derive it from source/Evidence, never from these bindings.
 * Its assertion value binds both field identity and the reviewed current value.
 * @param {unknown} input @param {unknown} systemContext
 */
export function validateSparseBehaviorElementV4(input, systemContext) {
  const diagnostics = validateAgainstSchema(input, { $defs: schema.$defs, $ref: '#/$defs/v4Element' })
    .map(item => ({ ...item, category: 'adapter_revision' }));
  if (diagnostics.length) return diagnostics;
  if (validateAgainstSchema(systemContext, sparseEvidenceContextSchema).length) return [diagnostic('BEHAVIOR_EVIDENCE_CONTEXT_INVALID', '/', 'Sparse behavior requires compiler-owned Evidence context.')];
  const element = /** @type {any} */ (input); const context = /** @type {any} */ (systemContext);
  const facts = context.facts.filter((/** @type {any} */ item) => item.fact_id === element.fact_id);
  if (facts.length !== 1) diagnostics.push(diagnostic('BEHAVIOR_FACT_UNRESOLVED', '/fact_id', 'Each element must own one known atomic Fact; split independent Facts.'));
  const byClaim = new Map();
  for (const claim of context.claims) {
    if (byClaim.has(claim.claim_id)) diagnostics.push(diagnostic('BEHAVIOR_CLAIM_AMBIGUOUS', '/evidence_bindings', 'Claim IDs must resolve uniquely.'));
    byClaim.set(claim.claim_id, claim);
  }
  const required = new Set(requiredBehaviorBindingsV4(element));
  const seen = new Set();
  for (const [index, binding] of element.evidence_bindings.entries()) {
    const field = at(element, binding.field_path);
    if (seen.has(binding.field_path) || !required.has(binding.field_path) || !field.exists) {
      diagnostics.push(diagnostic('BEHAVIOR_BINDING_INVALID', `/evidence_bindings/${index}`, 'A binding must uniquely identify an existing semantic field.'));
    }
    seen.add(binding.field_path);
    for (const claimId of binding.claim_ids) {
      const claim = byClaim.get(claimId);
      if (!claim?.supported || !claim.assertions.some((/** @type {any} */ assertion) => assertion.fact_id === element.fact_id
        && assertion.field_path === binding.field_path && canonicalStringify(assertion.value) === canonicalStringify(field.value))) {
        diagnostics.push(diagnostic('BEHAVIOR_FIELD_UNSUPPORTED', binding.field_path, 'Every formal value and assertion requires a positive Claim for this exact Fact, field and value.'));
      }
    }
  }
  for (const path of required) {
    if (!seen.has(path)) diagnostics.push(diagnostic('BEHAVIOR_BINDING_MISSING', path, 'This semantic field requires a source-backed evidence binding.'));
    const value = at(element, path).value;
    if (typeof value === 'string' && (/^(?:N\/?A|not applicable)$/iu.test(value.trim()) || /PRD\s*(?:未定义|未提及)|(?:not defined|not specified)\s+(?:in|by)\s+(?:the\s+)?PRD/iu.test(value))) {
      diagnostics.push(diagnostic('BEHAVIOR_PLACEHOLDER_FORBIDDEN', path, 'Missing requirements or N/A placeholders cannot become formal business semantics.'));
    }
  }
  const partitions = new Set();
  for (const [index, partition] of (element.partitions ?? []).entries()) {
    if (partition.kind === 'range' && partition.bounds.lower > partition.bounds.upper) diagnostics.push(diagnostic('BEHAVIOR_RANGE_INVALID', `/partitions/${index}`, 'A range must have ordered source-backed bounds.'));
    const signature = canonicalStringify(partition.kind === 'enum' ? { kind: partition.kind, value: partition.value } : { kind: partition.kind, bounds: partition.bounds });
    if (partitions.has(signature)) diagnostics.push(diagnostic('BEHAVIOR_PARTITION_DUPLICATE', `/partitions/${index}`, 'A partition cannot declare two independent or conflicting results.'));
    partitions.add(signature);
  }
  for (const [index, effect] of (element.semantic_effects ?? []).entries()) {
    const bound = element.evidence_bindings.filter((/** @type {any} */ binding) => binding.field_path.startsWith(`/semantic_effects/${index}/`));
    const refs = canonicalIds(bound.flatMap((/** @type {any} */ binding) => binding.claim_ids));
    if (canonicalStringify(refs) !== canonicalStringify(canonicalIds(effect.claim_ids))) diagnostics.push(diagnostic('BEHAVIOR_EFFECT_EVIDENCE_MISMATCH', `/semantic_effects/${index}/claim_ids`, 'Effect Claim IDs must exactly summarize its field-level evidence.'));
  }
  return diagnostics;
}
