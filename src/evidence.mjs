import { scopeContains, validateDecisionRecords } from './decision-record.mjs';
import { resolveSourcePolicy } from './source-policy.mjs';

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
    if (formula === null || inputs.length === 0 || unit === null || unit.length === 0
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
    const graph = new Map();
    const nodes = new Set();
    for (const [from, to] of edges) {
      nodes.add(from);
      nodes.add(to);
      graph.set(from, [...(graph.get(from) ?? []), to]);
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
      pending.push(...(graph.get(current) ?? []));
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
  const conflictedFactScopes = factLedger.filter((entry) => entry.status === 'conflicted').flatMap((entry) =>
    stringArray(entry.source_claim_ids).flatMap((claimId) => {
      const scope = rawClaims.get(claimId)?.scope;
      return typeof scope === 'string' ? [scope] : [];
    }));
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
        const sharedValid = claim.level === 'E3' ? decisionValidation.validFinalDecisionIds.has(decisionId)
          : claim.level === 'E1' ? decisionValidation.validTemporaryDecisionIds.has(decisionId) : false;
        if (!sharedValid) valid = false;
        if (typeof decision.evidence_ref === 'string' && locators.has(decision.evidence_ref)
          && !stringArray(claim.source_locator_ids).includes(decision.evidence_ref)) {
          diagnostics.push(diagnostic('reference', 'DECISION_EVIDENCE_MISMATCH', `/claims/${index}/source_locator_ids`, 'Decision Record evidence must be included in the claim locator references'));
          valid = false;
        }
        if (claim.authority !== decision.authority_scope) {
          diagnostics.push(diagnostic('classification', 'DECISION_AUTHORITY_MISMATCH', `/claims/${index}/authority`, 'claim authority must match the Decision Record authority scope'));
          valid = false;
        }
        if (typeof claim.scope !== 'string' || typeof decision.authority_scope !== 'string' || !scopeContains(decision.authority_scope, claim.scope)) {
          diagnostics.push(diagnostic('classification', 'DECISION_AUTHORITY_SCOPE_MISMATCH', `/claims/${index}/scope`, 'Decision Record authority does not cover the claim scope'));
          valid = false;
        }
        if (typeof claim.scope !== 'string' || typeof decision.effective_scope !== 'string' || !scopeContains(decision.effective_scope, claim.scope)) {
          diagnostics.push(diagnostic('classification', 'DECISION_SCOPE_MISMATCH', `/claims/${index}/scope`, 'Decision Record does not cover the claim scope'));
          valid = false;
        }
        if (claim.value !== decision.answer) {
          diagnostics.push(diagnostic('classification', 'DECISION_VALUE_MISMATCH', `/claims/${index}/value`, 'claim value must equal the recorded answer'));
          valid = false;
        }
        const claimScope = typeof claim.scope === 'string' ? claim.scope : null;
        const overlapsUnresolvedConflict = claimScope !== null && (
          policy.conflicts.some((conflict) => scopesIntersect(conflict.scope, claimScope))
          || conflictedFactScopes.some((scope) => scopesIntersect(scope, claimScope))
        );
        if (claim.level === 'E1' && overlapsUnresolvedConflict) {
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

  for (const claimId of rawClaims.keys()) validateIteratively(claimId);

  factLedger.forEach((entry, entryIndex) => {
    if (typeof entry.claim_id === 'string' && !rawClaims.has(entry.claim_id)) diagnostics.push(diagnostic(
      'reference', 'FACT_CLAIM_DANGLING', `/fact_ledger/${entryIndex}/claim_id`, `fact references unknown claim "${entry.claim_id}"`
    ));
    stringArray(entry.source_claim_ids).forEach((claimId, sourceIndex) => {
      if (!rawClaims.has(claimId)) diagnostics.push(diagnostic(
        'reference', 'FACT_SOURCE_CLAIM_DANGLING', `/fact_ledger/${entryIndex}/source_claim_ids/${sourceIndex}`, `fact references unknown source claim "${claimId}"`
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
