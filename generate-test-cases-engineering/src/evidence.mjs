import { normalizeScope, scopeContains, validateDecisionRecords } from './decision-record.mjs';
import { canonicalStringify, stableId } from './canonical.mjs';
import { resolveSourcePolicy, resolveSourcePolicyWithComposition } from './source-policy.mjs';
import { validateAssetClaims, validateV4SourceReviews, validateV4ClaimLocators } from './source-audit.mjs';
import { canonicalSourceSubject } from './source-subjects-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import evidenceSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };

/** @param {string[]} values */
function sortedUniqueStringsV4(values) {
  return [...new Set(values.map((value) => value.normalize('NFC'))) ].sort((left, right) => {
    const a = Array.from(left); const b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const delta = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0);
      if (delta !== 0) return delta;
    }
    return a.length - b.length;
  });
}

/**
 * Materialize accepted v4 Decisions into the Evidence/Fact candidate rather
 * than merely toggling clarification state. The original claim remains as an
 * auditable superseded record; every subject Fact points at the Decision Claim.
 * This is a pure candidate compiler so T10 can atomically commit it with Source,
 * checkpoint and clarification state.
 * @param {unknown} submittedEvidence
 * @param {unknown} submittedDecisions
 * @param {unknown} submittedBindings
 */
export function compileV4DecisionEvidenceOverlay(submittedEvidence, submittedDecisions, submittedBindings) {
  if (!isObject(submittedEvidence) || submittedEvidence.schema_version !== '4.0.0'
    || !Array.isArray(submittedEvidence.claims) || !Array.isArray(submittedEvidence.fact_ledger)
    || !Array.isArray(submittedDecisions) || !Array.isArray(submittedBindings)) {
    throw new TypeError('DECISION_EVIDENCE_INPUT_INVALID');
  }
  const evidence = structuredClone(submittedEvidence);
  const claims = /** @type {any[]} */ (evidence.claims);
  const facts = /** @type {any[]} */ (evidence.fact_ledger);
  const claimById = new Map(claims.map((claim) => [claim.claim_id, claim]));
  const bindings = /** @type {any[]} */ (submittedBindings);
  /** @type {any[]} */
  const audit = [];
  for (const rawDecision of submittedDecisions) {
    if (!isObject(rawDecision) || !isObject(rawDecision.target) || typeof rawDecision.decision_id !== 'string') {
      throw new TypeError('DECISION_EVIDENCE_DECISION_INVALID');
    }
    const decision = /** @type {any} */ (rawDecision);
    const matchingBindings = bindings.filter((binding) => isObject(binding)
      && binding.root_issue_id === decision.target.root_issue_id
      && binding.root_version_digest === decision.target.root_version_digest);
    if (matchingBindings.length !== 1) throw new TypeError('DECISION_EVIDENCE_BINDING_AMBIGUOUS');
    const binding = matchingBindings[0];
    if (typeof binding.source_locator_id !== 'string' || !binding.source_locator_id) {
      throw new TypeError('DECISION_EVIDENCE_LOCATOR_REQUIRED');
    }
    const subjectFactIds = new Set(stringArray(decision.subject_fact_ids));
    const subjectFacts = facts.filter((fact) => subjectFactIds.has(fact.fact_id));
    if (subjectFacts.length !== subjectFactIds.size) throw new TypeError('DECISION_EVIDENCE_FACT_UNKNOWN');
    if (subjectFacts.some((fact) => fact.status !== 'ambiguous' && fact.status !== 'conflicted')) {
      throw new TypeError('DECISION_EVIDENCE_FACT_NOT_AMBIGUOUS');
    }
    /** @type {Map<string, {priorClaimIds:string[],facts:any[]}>} */
    const factsByPriorClaimSet = new Map();
    for (const fact of subjectFacts) {
      const priorClaimIds = sortedUniqueStringsV4(Array.isArray(fact.claim_ids)
        ? stringArray(fact.claim_ids) : typeof fact.claim_id === 'string' ? [fact.claim_id] : []);
      if (priorClaimIds.length === 0) throw new TypeError('DECISION_EVIDENCE_CLAIM_UNKNOWN');
      const key = JSON.stringify(priorClaimIds);
      const grouped = factsByPriorClaimSet.get(key) ?? { priorClaimIds, facts: [] };
      grouped.facts.push(fact); factsByPriorClaimSet.set(key, grouped);
    }
    const supersessionOwners = new Set();
    for (const { priorClaimIds, facts: groupedFacts } of factsByPriorClaimSet.values()) {
      const priorClaims = priorClaimIds.map((claimId) => claimById.get(claimId));
      if (priorClaims.some((claim) => !claim)) throw new TypeError('DECISION_EVIDENCE_CLAIM_UNKNOWN');
      const priorClaim = /** @type {any} */ (priorClaims[0]);
      if (binding.field_path !== undefined && binding.field_path !== priorClaim.field_path) {
        throw new TypeError('DECISION_EVIDENCE_SUBJECT_INVALID');
      }
      const decisionClaimId = stableId('CLM', {
        decision_id: decision.decision_id,
        prior_claim_ids: priorClaimIds,
        root_issue_id: decision.target.root_issue_id,
        root_version_digest: decision.target.root_version_digest
      });
      const decisionClaim = {
        claim_id: decisionClaimId,
        claim_form: 'decision-record',
        level: decision.evidence_level,
        kind: 'requirement',
        scope: priorClaim.scope,
        value: decision.answer,
        source_locator_ids: [binding.source_locator_id],
        decision_id: decision.decision_id,
        authority: decision.authority,
        domain: priorClaim.domain ?? 'business',
        field_path: priorClaim.field_path,
        document_level_claim: false,
        subject_descriptor: structuredClone(priorClaim.subject_descriptor),
        semantic_value: decision.answer
      };
      if (!isObject(decisionClaim.subject_descriptor) || typeof decisionClaim.scope !== 'string'
        || typeof decisionClaim.field_path !== 'string') throw new TypeError('DECISION_EVIDENCE_SUBJECT_INVALID');
      for (const candidate of priorClaims) {
        const claim = /** @type {any} */ (candidate);
        if (supersessionOwners.has(claim.claim_id)) throw new TypeError('DECISION_EVIDENCE_SHARED_CLAIM_AMBIGUOUS');
        supersessionOwners.add(claim.claim_id);
        claim.superseded_by = decisionClaimId;
      }
      claims.push(decisionClaim); claimById.set(decisionClaimId, decisionClaim);
      for (const fact of groupedFacts) {
        fact.status = 'active';
        if (Array.isArray(fact.claim_ids)) fact.claim_ids = [decisionClaimId];
        else {
          fact.claim_id = decisionClaimId;
          fact.source_claim_ids = sortedUniqueStringsV4([...stringArray(fact.source_claim_ids), decisionClaimId]);
        }
      }
      audit.push({
        decision_id: decision.decision_id, root_issue_id: decision.target.root_issue_id,
        prior_claim_ids: priorClaimIds, decision_claim_id: decisionClaimId,
        completed_fact_ids: groupedFacts.map((fact) => fact.fact_id).sort()
      });
    }
  }
  return { evidence, audit };
}

/** v4 source boundary: strict source/locator/review/composition checks precede the
 * existing E3/E2/E1 ancestry/oracle gates. Registry is separate compiler state.
 * This does not acquire bytes or validate a durable run; the runner owns that I/O.
 * @param {any} pack @param {any} artifact @param {object} subjectRegistry
 */
export function validateV4EvidenceSourceBoundary(pack, artifact, subjectRegistry) {
  /** @type {any[]} */ const diagnostics = validateAgainstSchema(artifact, evidenceSchema);
  if (artifact?.schema_version !== '4.0.0') diagnostics.push(diagnostic('schema', 'V4_EVIDENCE_REQUIRED', '/schema_version', 'The v4 source boundary requires v4 evidence.'));
  if (diagnostics.length) return { claimsById: new Map(), diagnostics, source_conflicts: [], composition_audit: [] };
  const direct = artifact.claims.filter((/** @type {any} */ claim) => claim.claim_form === 'direct');
  diagnostics.push(...validateV4SourceReviews(pack), ...validateV4ClaimLocators(pack, direct));
  // Unit reviews replace v3 span reviews, not their no-silent-loss guarantee.
  for (const review of pack.source_reviews ?? []) {
    const source = (pack.sources ?? []).find((/** @type {any} */ item) => item.source_id === review.source_id);
    for (const reviewed of review.units ?? []) {
      if (!['normative', 'uncertain'].includes(reviewed.classification)) continue;
      const unit = source?.semantic_projection?.structure?.find((/** @type {any} */ item) => item.unit_id === reviewed.unit_id);
      if (!unit || typeof unit.text !== 'string') continue;
      const characters = Array.from(unit.text);
      const covered = new Set();
      for (const claim of direct.filter((/** @type {any} */ item) => item.source_id === source.source_id)) for (const id of claim.source_locator_ids) {
        const loc = (pack.locators ?? []).find((/** @type {any} */ item) => item.locator_id === id && item.unit_id === unit.unit_id);
        if (!loc) continue;
        const range = loc.type === 'text_block_range' ? loc.range : loc.type === 'user_statement' ? loc.answer_span : { start: 0, end: characters.length };
        if (!range || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end)) continue;
        for (let position = Math.max(0, range.start); position < Math.min(characters.length, range.end); position += 1) covered.add(position);
      }
      if (characters.some((character, index) => character.trim() && !covered.has(index))) {
        diagnostics.push(diagnostic('traceability', 'SOURCE_UNIT_UNCLAIMED', '/source_reviews/' + review.source_id, 'Every normative or uncertain retained unit must be represented by precise Claim locators.'));
      }
    }
  }
  const canonicalSubjects = new Map();
  for (const [index, claim] of artifact.claims.entries()) {
    if (claim.kind !== 'requirement') continue;
    try {
      const canonical = canonicalSourceSubject(claim.subject_descriptor, subjectRegistry);
      if (canonical.subject_descriptor.field_path !== claim.field_path) throw new TypeError('SOURCE_SUBJECT_INVALID');
      canonicalSubjects.set(claim.claim_id, canonical);
    } catch { diagnostics.push(diagnostic('traceability', 'SOURCE_SUBJECT_INVALID', '/claims/' + index, 'The Claim must bind a registered canonical semantic subject.')); }
    if (claim.claim_form === 'direct') {
      const review = (pack.source_reviews ?? []).find((/** @type {any} */ item) => item.source_id === claim.source_id);
      const normative = claim.source_locator_ids.every((/** @type {string} */ id) => {
        const locator = (pack.locators ?? []).find((/** @type {any} */ item) => item.locator_id === id);
        return locator && review?.units?.some((/** @type {any} */ item) => item.unit_id === locator.unit_id && item.classification === 'normative');
      });
      if (!normative) diagnostics.push(diagnostic('classification', 'SOURCE_UNIT_NOT_NORMATIVE', '/claims/' + index, 'Normative evidence must come from normative reviewed units.'));
    }
  }
  if (diagnostics.length) return { claimsById: new Map(), diagnostics, source_conflicts: [], composition_audit: [] };
  const policy = resolveSourcePolicyWithComposition(pack, artifact.claims, subjectRegistry);
  const effective = new Set(policy.effective_claim_ids);
  const selected = artifact.claims.filter((/** @type {any} */ claim) => claim.claim_form !== 'direct' || claim.kind !== 'requirement' || effective.has(claim.claim_id));
  // v4 unit reviews were verified above; legacy span accounting must not consume
  // this differently shaped ledger. All other ancestry and authority gates remain.
  const graph = validateEvidenceGraph({ ...pack, source_reviews: [] }, { ...artifact, claims: selected });
  const claimsById = new Map([...graph.claimsById].map(([id, claim]) => [id, { ...claim, ...(canonicalSubjects.get(id) ?? {}) }]));
  const factDiagnostics = [];
  for (const [index, fact] of artifact.fact_ledger.entries()) {
    const factPath = `/fact_ledger/${index}`;
    const subjects = fact.claim_ids.map((/** @type {string} */ claimId) => {
      if (!claimsById.has(claimId)) {
        factDiagnostics.push(diagnostic('reference', 'FACT_CLAIM_DANGLING', `${factPath}/claim_ids`, `fact references an unaccepted Claim "${claimId}"`));
        return null;
      }
      return canonicalSubjects.get(claimId)?.subject_descriptor ?? null;
    }).filter(Boolean);
    const subjectModules = [...new Set(subjects.map((/** @type {any} */ subject) => subject.module_id))].sort(compareStrings);
    const submittedModules = [...fact.module_refs].sort(compareStrings);
    if (canonicalStringify(subjectModules) !== canonicalStringify(submittedModules)) {
      factDiagnostics.push(diagnostic('traceability', 'FACT_MODULE_SUBJECT_MISMATCH', `${factPath}/module_refs`, 'Fact modules must equal the modules of its accepted canonical Claim subjects.'));
    }
    if (subjects.some((/** @type {any} */ subject) => subject.field_path !== fact.field_path)) {
      factDiagnostics.push(diagnostic('traceability', 'FACT_FIELD_SUBJECT_MISMATCH', `${factPath}/field_path`, 'Fact field path must equal every accepted canonical Claim subject path.'));
    }
  }
  const combinedDiagnostics = [...policy.diagnostics, ...graph.diagnostics, ...factDiagnostics];
  return { claimsById: combinedDiagnostics.length ? new Map() : claimsById, diagnostics: combinedDiagnostics,
    source_conflicts: policy.conflicts, composition_audit: policy.composition_audit };
}

export const E2_TARGETS = Object.freeze({
  formula: Object.freeze(['test-data', 'expected-value']),
  'decision-table-instance': Object.freeze(['expected-value', 'model-element']),
  'boundary-representative': Object.freeze(['test-data']),
  'enumeration-complement': Object.freeze(['test-data', 'model-element']),
  'graph-reachability': Object.freeze(['model-element'])
});

const NORMATIVE_SOURCE_KINDS = new Set([
  'prd', 'acceptance-criteria', 'interaction-spec', 'interface-contract',
  'formal-rule', 'review-record', 'decision-record'
]);
const EFFECTIVE_SOURCE_STATUSES = new Set(['approved', 'effective']);
const ROUNDING_RULES = new Set(['half-up', 'half-even', 'floor', 'ceiling', 'truncate']);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {string} left @param {string} right */
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/** @param {bigint} value */
function absoluteBigInt(value) {
  return value < 0n ? -value : value;
}

/** @param {bigint} left @param {bigint} right */
function greatestCommonDivisor(left, right) {
  let a = absoluteBigInt(left);
  let b = absoluteBigInt(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

/** @typedef {{numerator: bigint, denominator: bigint}} Rational */

/** @param {bigint} numerator @param {bigint} denominator @returns {Rational} */
function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error('formula divides by zero');
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: sign * denominator / divisor };
}

/** @param {string} value @returns {Rational} */
function parseDecimal(value) {
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(value.trim());
  if (!match) throw new Error(`formula value "${value}" is not an exact decimal`);
  const fraction = match[3] ?? match[4] ?? '';
  const integer = match[2] ?? '0';
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/, '');
  const exponent = Number(match[5] ?? '0');
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 10000) throw new Error('formula exponent is out of range');
  const scale = fraction.length - exponent;
  let numerator = BigInt(digits);
  let denominator = 1n;
  if (scale >= 0) denominator = 10n ** BigInt(scale);
  else numerator *= 10n ** BigInt(-scale);
  if (match[1] === '-') numerator = -numerator;
  return rational(numerator, denominator);
}

/** @param {Rational} left @param {Rational} right @param {string} operator @returns {Rational} */
function applyBinary(left, right, operator) {
  if (operator === '+') return rational(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
  if (operator === '-') return rational(left.numerator * right.denominator - right.numerator * left.denominator, left.denominator * right.denominator);
  if (operator === '*') return rational(left.numerator * right.numerator, left.denominator * right.denominator);
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

/** @param {string} expression @param {Map<string, Rational>} variables @returns {Rational} */
function evaluateFormula(expression, variables) {
  const trimmed = expression.trim();
  if (trimmed.length === 0) throw new Error('formula is empty');
  /** @type {string[]} */
  const tokens = [];
  let offset = 0;
  const tokenPattern = /(?:[A-Za-z_][A-Za-z0-9_]*|(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|[()+\-*/])/y;
  while (offset < trimmed.length) {
    while (/\s/.test(trimmed[offset] ?? '')) offset += 1;
    if (offset >= trimmed.length) break;
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(trimmed);
    if (!match) throw new Error('formula contains an unsupported token');
    tokens.push(match[0]);
    offset = tokenPattern.lastIndex;
  }

  /** @type {string[]} */
  const output = [];
  /** @type {string[]} */
  const operators = [];
  const precedence = new Map([['+', 1], ['-', 1], ['*', 2], ['/', 2], ['u+', 3], ['u-', 3]]);
  const rightAssociative = new Set(['u+', 'u-']);
  let expectsOperand = true;
  for (const rawToken of tokens) {
    if (/^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(rawToken) || /^[A-Za-z_]/.test(rawToken)) {
      if (!expectsOperand) throw new Error('formula is missing an operator');
      output.push(rawToken);
      expectsOperand = false;
    } else if (rawToken === '(') {
      if (!expectsOperand) throw new Error('formula is missing an operator before parenthesis');
      operators.push(rawToken);
    } else if (rawToken === ')') {
      if (expectsOperand) throw new Error('formula has an empty or incomplete parenthesis');
      while (operators.length > 0 && operators.at(-1) !== '(') output.push(/** @type {string} */ (operators.pop()));
      if (operators.pop() !== '(') throw new Error('formula has unmatched parenthesis');
      expectsOperand = false;
    } else {
      const token = expectsOperand && (rawToken === '+' || rawToken === '-') ? `u${rawToken}` : rawToken;
      if (expectsOperand && token !== 'u+' && token !== 'u-') throw new Error('formula has an operator without a left operand');
      const tokenPrecedence = /** @type {number} */ (precedence.get(token));
      while (operators.length > 0 && operators.at(-1) !== '(') {
        const top = /** @type {string} */ (operators.at(-1));
        const topPrecedence = /** @type {number} */ (precedence.get(top));
        if (topPrecedence < tokenPrecedence || (topPrecedence === tokenPrecedence && rightAssociative.has(token))) break;
        output.push(/** @type {string} */ (operators.pop()));
      }
      operators.push(token);
      expectsOperand = true;
    }
  }
  if (expectsOperand) throw new Error('formula ends with an operator');
  while (operators.length > 0) {
    const operator = /** @type {string} */ (operators.pop());
    if (operator === '(') throw new Error('formula has unmatched parenthesis');
    output.push(operator);
  }

  /** @type {Rational[]} */
  const values = [];
  for (const token of output) {
    if (token === 'u+' || token === 'u-') {
      const value = values.pop();
      if (!value) throw new Error('formula is incomplete');
      values.push(token === 'u-' ? { numerator: -value.numerator, denominator: value.denominator } : value);
    } else if (precedence.has(token)) {
      const right = values.pop();
      const left = values.pop();
      if (!left || !right) throw new Error('formula is incomplete');
      values.push(applyBinary(left, right, token));
    } else if (/^(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)$/.test(token)) {
      values.push(parseDecimal(token));
    } else {
      const value = variables.get(token);
      if (!value) throw new Error(`formula input "${token}" is missing`);
      values.push(value);
    }
  }
  if (values.length !== 1) throw new Error('formula did not produce one number');
  return values[0];
}

/** @param {Rational} value @param {number} precision @param {string} rule */
function roundValue(value, precision, rule) {
  const scale = 10n ** BigInt(precision);
  const negative = value.numerator < 0n;
  const scaledNumerator = absoluteBigInt(value.numerator) * scale;
  let magnitude = scaledNumerator / value.denominator;
  const remainder = scaledNumerator % value.denominator;
  if (remainder !== 0n) {
    if (rule === 'floor' && negative) magnitude += 1n;
    else if (rule === 'ceiling' && !negative) magnitude += 1n;
    else if (rule === 'half-up' && remainder * 2n >= value.denominator) magnitude += 1n;
    else if (rule === 'half-even') {
      const doubled = remainder * 2n;
      if (doubled > value.denominator || (doubled === value.denominator && magnitude % 2n !== 0n)) magnitude += 1n;
    }
  }
  const signed = negative && magnitude !== 0n ? -magnitude : magnitude;
  const absolute = absoluteBigInt(signed).toString().padStart(precision + 1, '0');
  if (precision === 0) return `${signed < 0n ? '-' : ''}${absolute}`;
  return `${signed < 0n ? '-' : ''}${absolute.slice(0, -precision)}.${absolute.slice(-precision)}`;
}

/**
 * @param {Record<string, unknown>} claim
 * @param {Map<string, Record<string, unknown>>} acceptedClaims
 * @returns {{value: string} | {code: string, message: string}}
 */
function recomputeDerivedValue(claim, acceptedClaims) {
  const parameters = isObject(claim.parameters) ? claim.parameters : {};
  const ruleInput = isObject(claim.rule_input) ? claim.rule_input : {};
  if (claim.derivation_kind === 'formula') {
    for (const field of ['unit', 'precision', 'rounding']) {
      if (field in parameters && field in ruleInput && parameters[field] !== ruleInput[field]) {
        return { code: 'E2_FORMULA_METADATA_MISMATCH', message: `formula ${field} disagrees between parameters and rule input` };
      }
    }
    const formula = typeof ruleInput.formula === 'string' ? ruleInput.formula : null;
    const inputs = objectArray(ruleInput.inputs);
    const unit = typeof ruleInput.unit === 'string' ? ruleInput.unit : typeof parameters.unit === 'string' ? parameters.unit : null;
    const precision = typeof ruleInput.precision === 'number' ? ruleInput.precision : parameters.precision;
    const rounding = typeof ruleInput.rounding === 'string' ? ruleInput.rounding : parameters.rounding;
    if (formula === null || inputs.length === 0 || unit === null || unit.trim().length === 0
      || !Number.isInteger(precision) || /** @type {number} */ (precision) < 0 || /** @type {number} */ (precision) > 1000
      || typeof rounding !== 'string' || !ROUNDING_RULES.has(rounding)) {
      return { code: 'E2_FORMULA_INPUT_INCOMPLETE', message: 'formula derivation requires formula, inputs, unit, precision, and a supported rounding rule' };
    }
    /** @type {Map<string, Rational>} */
    const variables = new Map();
    for (const input of inputs) {
      if (typeof input.name !== 'string' || input.name.length === 0 || (typeof input.value !== 'number' && typeof input.value !== 'string')) {
        return { code: 'E2_FORMULA_INPUT_INCOMPLETE', message: 'every formula input requires a name and numeric value' };
      }
      if ('unit' in input && (typeof input.unit !== 'string' || input.unit.trim().length === 0)) {
        return { code: 'E2_FORMULA_INPUT_INCOMPLETE', message: 'an optional formula input unit must be nonblank when present' };
      }
      // This deterministic gate validates field presence only. Unit compatibility and
      // dimensional analysis remain semantic/model-review responsibilities.
      if (variables.has(input.name)) return { code: 'E2_FORMULA_VARIABLE_DUPLICATE', message: `formula input "${input.name}" is duplicated` };
      try {
        const serialized = typeof input.value === 'number' ? String(input.value) : input.value;
        variables.set(input.name, parseDecimal(serialized));
      } catch (error) {
        return { code: 'E2_FORMULA_INPUT_INVALID', message: error instanceof Error ? error.message : `formula input "${input.name}" is invalid` };
      }
    }
    try {
      return { value: roundValue(evaluateFormula(formula, variables), /** @type {number} */ (precision), rounding) };
    } catch (error) {
      return { code: 'E2_FORMULA_INVALID', message: error instanceof Error ? error.message : 'formula cannot be evaluated' };
    }
  }
  if (claim.derivation_kind === 'decision-table-instance') {
    if (typeof ruleInput.outcome !== 'string' || ruleInput.outcome.length === 0) {
      return { code: 'E2_OUTCOME_REQUIRED', message: 'decision-table derivation requires an explicit outcome' };
    }
    const sourceBacked = stringArray(claim.parent_claim_ids).some((parentId) => acceptedClaims.get(parentId)?.value === ruleInput.outcome);
    if (!sourceBacked) return { code: 'E2_OUTCOME_NOT_SOURCE_BACKED', message: 'decision-table outcome must equal an explicit parent claim value' };
    return { value: ruleInput.outcome };
  }
  if (claim.derivation_kind === 'boundary-representative') {
    const lower = ruleInput.lower;
    const upper = ruleInput.upper;
    if (typeof lower !== 'number' || !Number.isFinite(lower) || typeof upper !== 'number' || !Number.isFinite(upper) || lower > upper) {
      return { code: 'E2_BOUNDARY_INPUT_INVALID', message: 'boundary derivation requires finite ordered lower and upper bounds' };
    }
    const submitted = typeof claim.value === 'string' ? Number(claim.value) : Number.NaN;
    if (!Number.isFinite(submitted) || (submitted !== lower && submitted !== upper)) {
      return { code: 'E2_VALUE_MISMATCH', message: 'submitted boundary value is not one of the declared bounds' };
    }
    return { value: String(submitted) };
  }
  if (claim.derivation_kind === 'enumeration-complement') {
    if (ruleInput.closed_world !== true) return { code: 'E2_CLOSED_WORLD_REQUIRED', message: 'enumeration complement requires closed_world=true' };
    const enumerated = stringArray(ruleInput.enumerated_values);
    if (enumerated.length === 0) return { code: 'E2_ENUMERATION_INPUT_INVALID', message: 'enumeration complement requires declared values' };
    if (typeof claim.value !== 'string' || enumerated.includes(claim.value)) {
      return { code: 'E2_VALUE_MISMATCH', message: 'submitted complement value must be outside the closed enumeration' };
    }
    return { value: claim.value };
  }
  if (claim.derivation_kind === 'graph-reachability') {
    if (typeof ruleInput.from !== 'string' || typeof ruleInput.to !== 'string') {
      return { code: 'E2_GRAPH_INPUT_INVALID', message: 'graph reachability requires from and to nodes' };
    }
    const edges = stringArray(claim.parent_claim_ids).flatMap((parentId) => {
      const value = acceptedClaims.get(parentId)?.value;
      if (typeof value !== 'string') return [];
      const match = /^\s*(.+?)\s*->\s*(.+?)\s*$/.exec(value);
      return match ? [[match[1], match[2]]] : [];
    });
    /** @type {Map<string, string[]>} */
    const graph = new Map();
    const nodes = new Set();
    for (const [from, to] of edges) {
      nodes.add(from);
      nodes.add(to);
      const neighbors = graph.get(from);
      if (neighbors) neighbors.push(to);
      else graph.set(from, [to]);
    }
    if (!nodes.has(ruleInput.from) || !nodes.has(ruleInput.to)) {
      return { code: 'E2_GRAPH_NODE_UNKNOWN', message: 'graph reachability endpoints must exist in the parent edge graph' };
    }
    const pending = [ruleInput.from];
    const visited = new Set();
    let reachable = false;
    while (pending.length > 0) {
      const current = pending.pop();
      if (current === ruleInput.to) { reachable = true; break; }
      if (current === undefined || visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of graph.get(current) ?? []) pending.push(neighbor);
    }
    if (!reachable) return { code: 'E2_GRAPH_NOT_REACHABLE', message: 'parent claims do not establish graph reachability' };
    return { value: `${ruleInput.from}->${ruleInput.to}` };
  }
  return { code: 'E2_DERIVATION_KIND_INVALID', message: 'derivation kind is not allowed' };
}

/** @param {Map<string, Record<string, unknown>>} claims */
function findE2Cycles(claims) {
  const state = new Map();
  const cyclic = new Set();
  const parentsById = new Map([...claims].flatMap(([claimId, claim]) => claim.level === 'E2'
    ? [[claimId, stringArray(claim.parent_claim_ids).filter((id) => claims.get(id)?.level === 'E2')]] : []));
  for (const [start, startClaim] of claims) {
    if (startClaim.level !== 'E2' || (state.get(start) ?? 0) !== 0) continue;
    /** @type {Array<{id: string, next: number}>} */
    const stack = [{ id: start, next: 0 }];
    const pathPosition = new Map([[start, 0]]);
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = /** @type {{id: string, next: number}} */ (stack.at(-1));
      const parents = parentsById.get(frame.id) ?? [];
      if (frame.next >= parents.length) {
        state.set(frame.id, 2);
        pathPosition.delete(frame.id);
        stack.pop();
        continue;
      }
      const next = parents[frame.next];
      frame.next += 1;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        state.set(next, 1);
        pathPosition.set(next, stack.length);
        stack.push({ id: next, next: 0 });
      } else if (nextState === 1) {
        const cycleStart = pathPosition.get(next);
        if (cycleStart !== undefined) {
          for (let index = cycleStart; index < stack.length; index += 1) cyclic.add(stack[index].id);
        }
      }
    }
  }
  return cyclic;
}

/**
 * Validate cross-artifact evidence references and the E3/E2/E1 gates.
 * JS proves structured scope/provenance ancestry; semantic support remains an independent review gate.
 * @param {unknown} sourcePack
 * @param {unknown} evidenceClaims
 */
export function validateEvidenceGraph(sourcePack, evidenceClaims) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const artifact = isObject(evidenceClaims) ? evidenceClaims : {};
  const claims = objectArray(artifact.claims);
  /** @type {Map<string, Record<string, unknown>>} */
  const rawClaims = new Map();
  const claimIndexById = new Map();
  claims.forEach((claim, index) => {
    if (typeof claim.claim_id === 'string') {
      rawClaims.set(claim.claim_id, claim);
      claimIndexById.set(claim.claim_id, index);
    }
  });
  const sources = new Map(objectArray(pack.sources).flatMap((source) => typeof source.source_id === 'string' ? [[source.source_id, source]] : []));
  const locators = new Map(objectArray(pack.locators).flatMap((locator) => typeof locator.locator_id === 'string' ? [[locator.locator_id, locator]] : []));
  const decisionValidation = validateDecisionRecords(pack);
  const factLedger = objectArray(artifact.fact_ledger);
  /** @type {Array<{root_issue_id: string, scope: string}>} */
  let factConflicts = [];
  const policy = resolveSourcePolicy(pack);
  const cyclicClaims = findE2Cycles(rawClaims);
  /** @type {Map<string, Record<string, unknown>>} */
  const acceptedClaims = new Map();
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [...policy.diagnostics];
  const validated = new Set();

  /** @param {Record<string, unknown>} claim @param {number} index */
  function validateLocatorReferences(claim, index) {
    let valid = true;
    for (const [locatorIndex, locatorId] of stringArray(claim.source_locator_ids).entries()) {
      const locator = locators.get(locatorId);
      if (!locator) {
        diagnostics.push(diagnostic('reference', 'SOURCE_LOCATOR_DANGLING', `/claims/${index}/source_locator_ids/${locatorIndex}`, `claim references unknown locator "${locatorId}"`));
        valid = false;
      } else if (typeof locator.source_id !== 'string' || !sources.has(locator.source_id)) {
        valid = false;
      }
    }
    return valid;
  }

  /** @param {string} claimId */
  function evaluateClaim(claimId) {
    const claim = rawClaims.get(claimId);
    if (!claim || validated.has(claimId)) return;
    const index = claimIndexById.get(claimId) ?? 0;
    let valid = validateLocatorReferences(claim, index);

    if (claim.level === 'E0') {
      diagnostics.push(diagnostic('classification', 'E0_NOT_EVIDENCE', `/claims/${index}/level`, 'E0 is a risk hypothesis and cannot enter the evidence graph'));
      valid = false;
    } else if (claim.claim_form === 'direct') {
      const sourceId = typeof claim.source_id === 'string' ? claim.source_id : '';
      const source = sources.get(sourceId);
      if (!source) {
        diagnostics.push(diagnostic('reference', 'SOURCE_DANGLING', `/claims/${index}/source_id`, `claim references unknown source "${sourceId}"`));
        valid = false;
      } else {
        if (claim.level !== 'E3') {
          diagnostics.push(diagnostic('classification', 'DIRECT_CLAIM_LEVEL_INVALID', `/claims/${index}/level`, 'a direct authoritative claim must be E3'));
          valid = false;
        }
        if (!NORMATIVE_SOURCE_KINDS.has(/** @type {string} */ (source.kind))) {
          diagnostics.push(diagnostic('classification', 'SOURCE_KIND_NOT_NORMATIVE', `/claims/${index}/source_id`, 'current behavior and historical defects cannot supply normative E3 evidence'));
          valid = false;
        }
        if (!EFFECTIVE_SOURCE_STATUSES.has(/** @type {string} */ (source.status))) {
          diagnostics.push(diagnostic('classification', 'SOURCE_NOT_EFFECTIVE', `/claims/${index}/source_id`, 'only approved or effective sources can supply E3 evidence'));
          valid = false;
        }
        const sourceLocators = stringArray(claim.source_locator_ids).map((locatorId) => locators.get(locatorId)).filter(Boolean);
        if (sourceLocators.some((locator) => locator?.source_id !== sourceId)) {
          diagnostics.push(diagnostic('reference', 'LOCATOR_SOURCE_MISMATCH', `/claims/${index}/source_locator_ids`, 'every direct-claim locator must belong to its source'));
          valid = false;
        }
        if (sourceLocators.some((locator) => locator?.extraction_integrity === 'uncertain')) {
          diagnostics.push(diagnostic('classification', 'E3_EXTRACTION_UNCERTAIN', `/claims/${index}/source_locator_ids`, 'uncertain extraction cannot become E3'));
          valid = false;
        }
        const scope = typeof claim.scope === 'string' ? claim.scope : '';
        const sourceEffective = policy.effectiveClaims.some((effective) => {
          if (effective.claim_form !== 'source-policy' || !stringArray(effective.source_ids).includes(sourceId)
            || !scopeContains(effective.scope, scope)) return false;
          const excludedScopes = 'excluded_scopes' in effective ? stringArray(effective.excluded_scopes) : [];
          return !excludedScopes.some((excluded) => scopesIntersect(excluded, scope));
        });
        if (!sourceEffective) {
          diagnostics.push(diagnostic('classification', 'SOURCE_POLICY_NOT_EFFECTIVE', `/claims/${index}/source_id`, 'source is not effective for the claim scope'));
          valid = false;
        }
      }
    } else if (claim.claim_form === 'decision-record') {
      const decisionId = typeof claim.decision_id === 'string' ? claim.decision_id : '';
      const decision = decisionValidation.decisionsById.get(decisionId);
      if (!decision) {
        diagnostics.push(diagnostic('reference', 'DECISION_RECORD_DANGLING', `/claims/${index}/decision_id`, `claim references unknown Decision Record "${decisionId}"`));
        valid = false;
      } else {
        const v4Decision = isObject(decision.target) && isObject(decision.answer_origin);
        const disposition = v4Decision ? decision.resolution : decision.disposition;
        const evidenceDisposition = disposition === 'final' || disposition === 'temporary';
        const expectedClaimLevel = disposition === 'final' ? 'E3' : disposition === 'temporary' ? 'E1' : null;
        if (!evidenceDisposition) {
          diagnostics.push(diagnostic(
            'classification',
            'DECISION_DISPOSITION_NOT_EVIDENCE',
            `/claims/${index}/decision_id`,
            'unknown and deferred Decision Records cannot supply evidence'
          ));
          valid = false;
        } else if (claim.level !== expectedClaimLevel) {
          diagnostics.push(diagnostic(
            'classification',
            'DECISION_CLAIM_LEVEL_MISMATCH',
            `/claims/${index}/level`,
            `${disposition} Decision Record requires a ${expectedClaimLevel} claim`
          ));
          valid = false;
        }
        const sharedValid = disposition === 'final' ? decisionValidation.validFinalDecisionIds.has(decisionId)
          : disposition === 'temporary' ? decisionValidation.validTemporaryDecisionIds.has(decisionId) : false;
        if (!sharedValid) valid = false;
        const decisionLocatorIds = v4Decision ? [...locators].filter(([, locator]) => {
          const origin = /** @type {Record<string, unknown>} */ (decision.answer_origin);
          const span = isObject(origin.answer_span) ? origin.answer_span : {};
          return locator.type === 'user_statement' && locator.presentation_id === origin.presentation_id
            && locator.message_digest === origin.message_digest && isObject(locator.answer_span)
            && locator.answer_span.start === span.start_scalar && locator.answer_span.end === span.end_scalar;
        }).map(([id]) => id) : typeof decision.evidence_ref === 'string' ? [decision.evidence_ref] : [];
        if (decisionLocatorIds.some((locatorId) => locators.has(locatorId)
          && !stringArray(claim.source_locator_ids).includes(locatorId))) {
          diagnostics.push(diagnostic('reference', 'DECISION_EVIDENCE_MISMATCH', `/claims/${index}/source_locator_ids`, 'Decision Record evidence must be included in the claim locator references'));
          valid = false;
        }
        const decisionAuthority = v4Decision ? decision.authority : decision.authority_scope;
        if (typeof claim.authority !== 'string' || typeof decisionAuthority !== 'string'
          || normalizeScope(claim.authority) !== normalizeScope(decisionAuthority)) {
          diagnostics.push(diagnostic('classification', 'DECISION_AUTHORITY_MISMATCH', `/claims/${index}/authority`, 'claim authority must match the Decision Record authority scope'));
          valid = false;
        }
        if (!v4Decision && (typeof claim.scope !== 'string' || typeof decision.authority_scope !== 'string' || !scopeContains(decision.authority_scope, claim.scope))) {
          diagnostics.push(diagnostic('classification', 'DECISION_AUTHORITY_SCOPE_MISMATCH', `/claims/${index}/scope`, 'Decision Record authority does not cover the claim scope'));
          valid = false;
        }
        if (!v4Decision && (typeof claim.scope !== 'string' || typeof decision.effective_scope !== 'string' || !scopeContains(decision.effective_scope, claim.scope))) {
          diagnostics.push(diagnostic('classification', 'DECISION_SCOPE_MISMATCH', `/claims/${index}/scope`, 'Decision Record does not cover the claim scope'));
          valid = false;
        }
        if (claim.value !== decision.answer) {
          diagnostics.push(diagnostic('classification', 'DECISION_VALUE_MISMATCH', `/claims/${index}/value`, 'claim value must equal the recorded answer'));
          valid = false;
        }
        const claimScope = typeof claim.scope === 'string' ? claim.scope : null;
        const decisionRootIds = new Set(v4Decision && typeof decision.target.root_issue_id === 'string'
          ? [decision.target.root_issue_id] : stringArray(decision.root_issue_ids));
        const namesOverlappingConflict = claimScope !== null && (
          policy.conflicts.some((conflict) => scopesIntersect(conflict.scope, claimScope) && decisionRootIds.has(conflict.root_issue_id))
          || factConflicts.some((conflict) => scopesIntersect(conflict.scope, claimScope) && decisionRootIds.has(conflict.root_issue_id))
        );
        if (disposition === 'temporary' && sharedValid && claim.level === 'E1' && namesOverlappingConflict) {
          diagnostics.push(diagnostic('classification', 'E1_CANNOT_OVERRIDE_CONFLICT', `/claims/${index}`, 'temporary evidence cannot override an unresolved E3/E2 source conflict'));
          valid = false;
        }
      }
    } else if (claim.claim_form === 'derived' && claim.level === 'E2') {
      if (cyclicClaims.has(claimId)) {
        diagnostics.push(diagnostic('classification', 'E2_CYCLE', `/claims/${index}/parent_claim_ids`, 'E2 derivation graph must be acyclic'));
        valid = false;
      }
      const derivationKind = typeof claim.derivation_kind === 'string' ? claim.derivation_kind : '';
      const target = typeof claim.derivation_target === 'string' ? claim.derivation_target : '';
      const allowedTargets = E2_TARGETS[/** @type {keyof typeof E2_TARGETS} */ (derivationKind)];
      if (!allowedTargets || !allowedTargets.includes(target)) {
        diagnostics.push(diagnostic('classification', 'E2_TARGET_NOT_ALLOWED', `/claims/${index}/derivation_target`, 'derivation kind cannot produce the requested target'));
        valid = false;
      }
      if (claim.kind !== claim.derivation_target) {
        diagnostics.push(diagnostic('classification', 'E2_KIND_TARGET_MISMATCH', `/claims/${index}/kind`, 'derived claim kind must equal its derivation target'));
        valid = false;
      }
      const parentLocatorIds = new Set();
      for (const [parentIndex, parentId] of stringArray(claim.parent_claim_ids).entries()) {
        const parent = rawClaims.get(parentId);
        if (!parent) {
          diagnostics.push(diagnostic('reference', 'E2_PARENT_DANGLING', `/claims/${index}/parent_claim_ids/${parentIndex}`, `E2 references unknown parent "${parentId}"`));
          valid = false;
        } else if (parent.level !== 'E3' && parent.level !== 'E2') {
          diagnostics.push(diagnostic('classification', 'E2_PARENT_LEVEL_INVALID', `/claims/${index}/parent_claim_ids/${parentIndex}`, 'E2 parents must be E3 or E2'));
          valid = false;
        } else if (!acceptedClaims.has(parentId)) {
          diagnostics.push(diagnostic('classification', 'E2_CHAIN_NOT_GROUNDED', `/claims/${index}/parent_claim_ids/${parentIndex}`, 'every E2 chain must end at accepted E3 evidence'));
          valid = false;
        } else {
          const acceptedParent = /** @type {Record<string, unknown>} */ (acceptedClaims.get(parentId));
          if (typeof acceptedParent.scope !== 'string' || typeof claim.scope !== 'string' || !scopeContains(acceptedParent.scope, claim.scope)) {
            diagnostics.push(diagnostic('classification', 'E2_PARENT_SCOPE_MISMATCH', `/claims/${index}/parent_claim_ids/${parentIndex}`, 'every accepted parent scope must contain the derived claim scope'));
            valid = false;
          }
          for (const locatorId of stringArray(acceptedParent.source_locator_ids)) parentLocatorIds.add(locatorId);
        }
      }
      for (const locatorId of stringArray(claim.source_locator_ids)) {
        if (!parentLocatorIds.has(locatorId)) {
          diagnostics.push(diagnostic('classification', 'E2_PROVENANCE_ANCHOR_NOT_IN_PARENTS', `/claims/${index}/source_locator_ids`, 'derived provenance anchors must be inherited from accepted parents'));
          valid = false;
          break;
        }
      }
      if (valid) {
        const recomputed = recomputeDerivedValue(claim, acceptedClaims);
        if ('code' in recomputed) {
          diagnostics.push(diagnostic('classification', recomputed.code, `/claims/${index}/rule_input`, recomputed.message));
          valid = false;
        } else if (claim.value !== recomputed.value) {
          diagnostics.push(diagnostic('classification', 'E2_VALUE_MISMATCH', `/claims/${index}/value`, 'submitted E2 value does not equal the recomputed value'));
          valid = false;
        }
      }
    } else {
      diagnostics.push(diagnostic('classification', 'EVIDENCE_FORM_INVALID', `/claims/${index}`, 'claim form and evidence level are not permitted'));
      valid = false;
    }

    validated.add(claimId);
    if (valid) acceptedClaims.set(claimId, claim);
  }

  /** @param {string} rootId */
  function validateIteratively(rootId) {
    /** @type {Array<{id: string, expanded: boolean}>} */
    const stack = [{ id: rootId, expanded: false }];
    while (stack.length > 0) {
      const frame = /** @type {{id: string, expanded: boolean}} */ (stack.pop());
      if (validated.has(frame.id) || !rawClaims.has(frame.id)) continue;
      const claim = /** @type {Record<string, unknown>} */ (rawClaims.get(frame.id));
      if (!frame.expanded && claim.claim_form === 'derived' && claim.level === 'E2' && !cyclicClaims.has(frame.id)) {
        stack.push({ id: frame.id, expanded: true });
        const parents = stringArray(claim.parent_claim_ids);
        for (let index = parents.length - 1; index >= 0; index -= 1) {
          const parentId = parents[index];
          const parent = rawClaims.get(parentId);
          if (parent && (parent.level === 'E3' || parent.level === 'E2') && !validated.has(parentId)) {
            stack.push({ id: parentId, expanded: false });
          }
        }
      } else {
        evaluateClaim(frame.id);
      }
    }
  }

  // Higher evidence is closed first. Only accepted E3/E2 claims can establish a
  // fact-conflict root against which a temporary E1 Decision is evaluated.
  for (const [claimId, claim] of rawClaims) {
    if (claim.level === 'E3' || claim.level === 'E2') validateIteratively(claimId);
  }

  factConflicts = factLedger.filter((entry) => entry.status === 'conflicted').flatMap((entry) => {
    const primaryId = typeof entry.claim_id === 'string' ? entry.claim_id : '';
    const primary = acceptedClaims.get(primaryId);
    const sourceClaimIds = [...new Set(stringArray(entry.source_claim_ids))].sort();
    const acceptedSources = sourceClaimIds.map((claimId) => acceptedClaims.get(claimId));
    /** @param {Record<string, unknown> | undefined} claim */
    const isHigher = (claim) => claim?.level === 'E3' || claim?.level === 'E2';
    if (!isHigher(primary) || sourceClaimIds.length < 2
      || acceptedSources.some((claim) => !isHigher(claim))) return [];
    const scope = typeof primary?.scope === 'string' ? normalizeScope(primary.scope) : '';
    if (scope.length === 0) return [];
    return [{
      root_issue_id: stableId('root', {
        missing_type: 'fact-conflict',
        fact_id: typeof entry.fact_id === 'string' ? entry.fact_id : '',
        source_claim_ids: sourceClaimIds,
        scope
      }),
      scope
    }];
  });

  for (const claimId of rawClaims.keys()) validateIteratively(claimId);

  /** @type {Map<string, Array<{start:number,end:number}>>} */
  const directRangesBySource = new Map();
  for (const claim of acceptedClaims.values()) {
    if (claim.claim_form !== 'direct' || typeof claim.source_id !== 'string') continue;
    for (const locatorId of stringArray(claim.source_locator_ids)) {
      const locator = locators.get(locatorId);
      if (!locator || locator.source_id !== claim.source_id || locator.type !== 'text-range'
        || !isObject(locator.text_range)) continue;
      const start = locator.text_range.start;
      const end = locator.text_range.end;
      if (typeof start !== 'number' || typeof end !== 'number') continue;
      const ranges = directRangesBySource.get(claim.source_id) ?? [];
      ranges.push({ start, end });
      directRangesBySource.set(claim.source_id, ranges);
    }
  }
  for (const [sourceId, ranges] of directRangesBySource) {
    ranges.sort((left, right) => left.start - right.start || left.end - right.end);
    /** @type {Array<{start:number,end:number}>} */
    const merged = [];
    for (const range of ranges) {
      const previous = merged[merged.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else merged.push({ ...range });
    }
    directRangesBySource.set(sourceId, merged);
  }

  diagnostics.push(...validateAssetClaims(pack, acceptedClaims));
  objectArray(pack.source_reviews).forEach((review, reviewIndex) => {
    if (typeof review.source_id !== 'string') return;
    const reviewSourceId = review.source_id;
    const ranges = directRangesBySource.get(reviewSourceId) ?? [];
    objectArray(review.spans).forEach((span, spanIndex) => {
      if (span.classification !== 'normative' && span.classification !== 'uncertain') return;
      if (typeof span.start !== 'number' || typeof span.end !== 'number') return;
      const content = String(sources.get(reviewSourceId)?.content ?? '');
      let cursor = span.start;
      let represented = true;
      let lower = 0;
      let upper = ranges.length;
      while (lower < upper) {
        const middle = lower + Math.floor((upper - lower) / 2);
        if (ranges[middle].end <= span.start) lower = middle + 1;
        else upper = middle;
      }
      for (let rangeIndex = lower; rangeIndex < ranges.length; rangeIndex += 1) {
        const range = ranges[rangeIndex];
        if (range.start >= span.end) break;
        const nextStart = Math.max(span.start, range.start);
        if (nextStart > cursor && content.slice(cursor, Math.min(nextStart, span.end)).trim().length > 0) {
          represented = false;
          break;
        }
        cursor = Math.max(cursor, Math.min(span.end, range.end));
        if (cursor >= span.end) break;
      }
      if (represented && cursor < span.end && content.slice(cursor, span.end).trim().length > 0) represented = false;
      if (!represented) diagnostics.push(diagnostic(
        'traceability', 'SOURCE_REVIEW_SPAN_UNCLAIMED',
        `/source_reviews/${reviewIndex}/spans/${spanIndex}`,
        `${span.classification} source text must be represented by an accepted direct Claim locator`
      ));
    });
  });

  factLedger.forEach((entry, entryIndex) => {
    if (typeof entry.claim_id === 'string') {
      if (!rawClaims.has(entry.claim_id)) diagnostics.push(diagnostic(
        'reference', 'FACT_CLAIM_DANGLING', `/fact_ledger/${entryIndex}/claim_id`, `fact references unknown claim "${entry.claim_id}"`
      ));
      else if (!acceptedClaims.has(entry.claim_id)) diagnostics.push(diagnostic(
        'classification', 'FACT_CLAIM_NOT_ACCEPTED', `/fact_ledger/${entryIndex}/claim_id`, `fact references rejected claim "${entry.claim_id}"`
      ));
    }
    stringArray(entry.source_claim_ids).forEach((claimId, sourceIndex) => {
      if (!rawClaims.has(claimId)) diagnostics.push(diagnostic(
        'reference', 'FACT_SOURCE_CLAIM_DANGLING', `/fact_ledger/${entryIndex}/source_claim_ids/${sourceIndex}`, `fact references unknown source claim "${claimId}"`
      ));
      else if (!acceptedClaims.has(claimId)) diagnostics.push(diagnostic(
        'classification', 'FACT_SOURCE_CLAIM_NOT_ACCEPTED', `/fact_ledger/${entryIndex}/source_claim_ids/${sourceIndex}`, `fact references rejected source claim "${claimId}"`
      ));
    });
  });

  const uniqueDiagnostics = new Map();
  for (const item of diagnostics) uniqueDiagnostics.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  const sortedDiagnostics = [...uniqueDiagnostics.values()].sort((left, right) =>
    compareStrings(`${left.category}\0${left.code}\0${left.path}`, `${right.category}\0${right.code}\0${right.path}`));
  const claimsById = new Map([...acceptedClaims].sort(([left], [right]) => compareStrings(left, right)));
  return { claimsById, diagnostics: sortedDiagnostics };
}
