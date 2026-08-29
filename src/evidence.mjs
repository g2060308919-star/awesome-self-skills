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

/** @param {string} container @param {string} candidate */
function scopeContains(container, candidate) {
  const left = container.trim();
  const right = candidate.trim();
  return left === '*' || left === 'all' || left === right || right.startsWith(`${left}.`) || right.startsWith(`${left}/`);
}

/** @param {string} left @param {string} right */
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/** @param {Map<string, Record<string, unknown>>} claims */
function findE2Cycles(claims) {
  const visiting = new Set();
  const visited = new Set();
  const cyclic = new Set();

  /** @param {string} claimId @param {string[]} trail */
  function visit(claimId, trail) {
    const claim = claims.get(claimId);
    if (!claim || claim.level !== 'E2') return;
    if (visiting.has(claimId)) {
      const start = trail.indexOf(claimId);
      for (const member of trail.slice(start)) cyclic.add(member);
      cyclic.add(claimId);
      return;
    }
    if (visited.has(claimId)) return;
    visiting.add(claimId);
    for (const parentId of stringArray(claim.parent_claim_ids)) visit(parentId, [...trail, claimId]);
    visiting.delete(claimId);
    visited.add(claimId);
  }

  for (const claimId of claims.keys()) visit(claimId, []);
  return cyclic;
}

/** @param {string} expression @param {Map<string, number>} variables */
function evaluateFormula(expression, variables) {
  /** @type {string[]} */
  const tokens = [];
  let offset = 0;
  const tokenPattern = /\s*([A-Za-z_][A-Za-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/])/y;
  while (offset < expression.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(expression);
    if (!match) throw new Error('formula contains an unsupported token');
    tokens.push(match[1]);
    offset = tokenPattern.lastIndex;
  }
  if (tokens.length === 0) throw new Error('formula is empty');

  /** @type {string[]} */
  const output = [];
  /** @type {string[]} */
  const operators = [];
  const precedence = new Map([['+', 1], ['-', 1], ['*', 2], ['/', 2]]);
  let expectsOperand = true;
  for (const token of tokens) {
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || /^[A-Za-z_]/.test(token)) {
      if (!expectsOperand) throw new Error('formula is missing an operator');
      output.push(token);
      expectsOperand = false;
    } else if (token === '(') {
      if (!expectsOperand) throw new Error('formula is missing an operator before parenthesis');
      operators.push(token);
    } else if (token === ')') {
      if (expectsOperand) throw new Error('formula has an empty or incomplete parenthesis');
      while (operators.length > 0 && operators.at(-1) !== '(') output.push(/** @type {string} */ (operators.pop()));
      if (operators.pop() !== '(') throw new Error('formula has unmatched parenthesis');
      expectsOperand = false;
    } else {
      if (expectsOperand) throw new Error('formula has an operator without a left operand');
      while (operators.length > 0 && operators.at(-1) !== '('
        && /** @type {number} */ (precedence.get(/** @type {string} */ (operators.at(-1)))) >= /** @type {number} */ (precedence.get(token))) {
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

  /** @type {number[]} */
  const values = [];
  for (const token of output) {
    if (precedence.has(token)) {
      const right = values.pop();
      const left = values.pop();
      if (left === undefined || right === undefined) throw new Error('formula is incomplete');
      if (token === '+') values.push(left + right);
      if (token === '-') values.push(left - right);
      if (token === '*') values.push(left * right);
      if (token === '/') {
        if (right === 0) throw new Error('formula divides by zero');
        values.push(left / right);
      }
    } else if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      values.push(Number(token));
    } else {
      const value = variables.get(token);
      if (value === undefined) throw new Error(`formula input "${token}" is missing`);
      values.push(value);
    }
  }
  if (values.length !== 1 || !Number.isFinite(values[0])) throw new Error('formula did not produce one finite number');
  return values[0];
}

/** @param {number} value @param {number} precision @param {string} rule */
function roundValue(value, precision, rule) {
  const factor = 10 ** precision;
  const scaled = value * factor;
  let rounded;
  if (rule === 'floor') rounded = Math.floor(scaled);
  else if (rule === 'ceiling') rounded = Math.ceil(scaled);
  else if (rule === 'truncate') rounded = Math.trunc(scaled);
  else if (rule === 'half-even') {
    const lower = Math.floor(scaled);
    const fraction = scaled - lower;
    if (Math.abs(fraction - 0.5) < Number.EPSILON * Math.max(1, Math.abs(scaled))) rounded = lower % 2 === 0 ? lower : lower + 1;
    else rounded = Math.round(scaled);
  } else {
    rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON);
  }
  return (rounded / factor).toFixed(precision);
}

/**
 * @param {Record<string, unknown>} claim
 * @param {Map<string, Record<string, unknown>>} rawClaims
 * @returns {{value: string} | {code: string, message: string}}
 */
function recomputeDerivedValue(claim, rawClaims) {
  const parameters = isObject(claim.parameters) ? claim.parameters : {};
  const ruleInput = isObject(claim.rule_input) ? claim.rule_input : {};
  if (claim.derivation_kind === 'formula') {
    const formula = typeof ruleInput.formula === 'string' ? ruleInput.formula : null;
    const inputs = objectArray(ruleInput.inputs);
    const unit = typeof ruleInput.unit === 'string' ? ruleInput.unit : typeof parameters.unit === 'string' ? parameters.unit : null;
    const precision = typeof ruleInput.precision === 'number' ? ruleInput.precision : parameters.precision;
    const rounding = typeof ruleInput.rounding === 'string' ? ruleInput.rounding : parameters.rounding;
    if (formula === null || inputs.length === 0 || unit === null || !Number.isInteger(precision) || /** @type {number} */ (precision) < 0
      || typeof rounding !== 'string' || !ROUNDING_RULES.has(rounding)) {
      return { code: 'E2_FORMULA_INPUT_INCOMPLETE', message: 'formula derivation requires formula, inputs, unit, precision, and a supported rounding rule' };
    }
    const variables = new Map();
    for (const input of inputs) {
      if (typeof input.name !== 'string' || (typeof input.value !== 'number' && typeof input.value !== 'string')) {
        return { code: 'E2_FORMULA_INPUT_INCOMPLETE', message: 'every formula input requires a name and numeric value' };
      }
      const numericValue = typeof input.value === 'number' ? input.value : Number(input.value);
      if (!Number.isFinite(numericValue)) return { code: 'E2_FORMULA_INPUT_INVALID', message: `formula input "${input.name}" is not numeric` };
      variables.set(input.name, numericValue);
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
    const sourceBacked = stringArray(claim.parent_claim_ids).some((parentId) => rawClaims.get(parentId)?.value === ruleInput.outcome);
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
      const value = rawClaims.get(parentId)?.value;
      if (typeof value !== 'string') return [];
      const match = /^\s*(.+?)\s*->\s*(.+?)\s*$/.exec(value);
      return match ? [[match[1], match[2]]] : [];
    });
    const graph = new Map();
    for (const [from, to] of edges) graph.set(from, [...(graph.get(from) ?? []), to]);
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

/**
 * Validate cross-artifact evidence references and the E3/E2/E1 gates.
 * @param {unknown} sourcePack
 * @param {unknown} evidenceClaims
 */
export function validateEvidenceGraph(sourcePack, evidenceClaims) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const artifact = isObject(evidenceClaims) ? evidenceClaims : {};
  const claims = objectArray(artifact.claims);
  const rawClaims = new Map(claims.flatMap((claim) => typeof claim.claim_id === 'string' ? [[claim.claim_id, claim]] : []));
  const sources = new Map(objectArray(pack.sources).flatMap((source) => typeof source.source_id === 'string' ? [[source.source_id, source]] : []));
  const locators = new Map(objectArray(pack.locators).flatMap((locator) => typeof locator.locator_id === 'string' ? [[locator.locator_id, locator]] : []));
  const decisions = new Map(objectArray(pack.decision_records).flatMap((decision) => typeof decision.decision_id === 'string' ? [[decision.decision_id, decision]] : []));
  const factLedger = objectArray(artifact.fact_ledger);
  const conflictedFactScopes = factLedger.filter((entry) => entry.status === 'conflicted').flatMap((entry) =>
    stringArray(entry.source_claim_ids).flatMap((claimId) => {
      const scope = rawClaims.get(claimId)?.scope;
      return typeof scope === 'string' ? [scope] : [];
    }));
  const policy = resolveSourcePolicy(pack);
  const cyclicClaims = findE2Cycles(rawClaims);
  /** @type {Map<string, Record<string, unknown>>} */
  const claimsById = new Map();
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [...policy.diagnostics];
  const validated = new Set();
  const validating = new Set();

  /** @param {Record<string, unknown>} claim @param {number} index */
  function validateLocatorReferences(claim, index) {
    let valid = true;
    for (const [locatorIndex, locatorId] of stringArray(claim.source_locator_ids).entries()) {
      const locator = locators.get(locatorId);
      if (!locator) {
        diagnostics.push(diagnostic('reference', 'SOURCE_LOCATOR_DANGLING', `/claims/${index}/source_locator_ids/${locatorIndex}`, `claim references unknown locator "${locatorId}"`));
        valid = false;
      }
    }
    return valid;
  }

  /** @param {string} claimId */
  function validateClaim(claimId) {
    if (validated.has(claimId)) return claimsById.has(claimId);
    if (validating.has(claimId)) return false;
    const claim = rawClaims.get(claimId);
    if (!claim) return false;
    const index = claims.indexOf(claim);
    validating.add(claimId);
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
      const decision = decisions.get(decisionId);
      if (!decision) {
        diagnostics.push(diagnostic('reference', 'DECISION_RECORD_DANGLING', `/claims/${index}/decision_id`, `claim references unknown Decision Record "${decisionId}"`));
        valid = false;
      } else {
        if (typeof decision.evidence_ref !== 'string' || !locators.has(decision.evidence_ref)) {
          diagnostics.push(diagnostic('reference', 'DECISION_EVIDENCE_DANGLING', `/claims/${index}/decision_id`, 'Decision Record must reference existing evidence'));
          valid = false;
        } else if (!stringArray(claim.source_locator_ids).includes(decision.evidence_ref)) {
          diagnostics.push(diagnostic('reference', 'DECISION_EVIDENCE_MISMATCH', `/claims/${index}/source_locator_ids`, 'Decision Record evidence must be included in the claim locator references'));
          valid = false;
        }
        const expectedLevel = decision.disposition === 'final' && decision.evidence_level === 'E3' ? 'E3'
          : decision.disposition === 'temporary' && decision.evidence_level === 'E1' ? 'E1' : null;
        if (expectedLevel === null || claim.level !== expectedLevel) {
          diagnostics.push(diagnostic('classification', 'DECISION_EVIDENCE_LEVEL_INVALID', `/claims/${index}/level`, 'Decision Record disposition and evidence level do not authorize this claim level'));
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
      for (const [parentIndex, parentId] of stringArray(claim.parent_claim_ids).entries()) {
        const parent = rawClaims.get(parentId);
        if (!parent) {
          diagnostics.push(diagnostic('reference', 'E2_PARENT_DANGLING', `/claims/${index}/parent_claim_ids/${parentIndex}`, `E2 references unknown parent "${parentId}"`));
          valid = false;
        } else if (parent.level !== 'E3' && parent.level !== 'E2') {
          diagnostics.push(diagnostic('classification', 'E2_PARENT_LEVEL_INVALID', `/claims/${index}/parent_claim_ids/${parentIndex}`, 'E2 parents must be E3 or E2'));
          valid = false;
        } else if (!cyclicClaims.has(claimId) && !validateClaim(parentId)) {
          diagnostics.push(diagnostic('classification', 'E2_CHAIN_NOT_GROUNDED', `/claims/${index}/parent_claim_ids/${parentIndex}`, 'every E2 chain must end at accepted E3 evidence'));
          valid = false;
        }
      }
      if (valid) {
        const recomputed = recomputeDerivedValue(claim, rawClaims);
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

    validating.delete(claimId);
    validated.add(claimId);
    if (valid) claimsById.set(claimId, claim);
    return valid;
  }

  for (const claim of claims) if (typeof claim.claim_id === 'string') validateClaim(claim.claim_id);

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

  diagnostics.sort((left, right) => {
    const leftKey = `${left.category}\0${left.code}\0${left.path}`;
    const rightKey = `${right.category}\0${right.code}\0${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return { claimsById, diagnostics };
}
