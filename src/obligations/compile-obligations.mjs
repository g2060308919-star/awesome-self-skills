import behaviorViewsSchema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import testObligationsSchema from '../../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify } from '../canonical.mjs';
import { scopeContains } from '../decision-record.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../schema-validator.mjs';
import { auditInteractionMatrix } from '../views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../views/validate-views.mjs';
import { compile as compileDecision } from './decision.mjs';
import { compile as compileFlow } from './flow.mjs';
import { compile as compileInputDomain } from './input-domain.mjs';
import { compile as compileIntegration } from './integration.mjs';
import { compile as compileRole } from './role.mjs';
import {
  acceptedClaimClosure, acceptedOracleRelevance, compareCodePoints,
  createObligationRegistry, elementEvidenceRefs, isOracleEvidence
} from './registry.mjs';
import { compile as compileState } from './state.mjs';
import { compile as compileTiming } from './timing.mjs';

/** @typedef {{category: string, code: string, path: string, message: string}} Diagnostic */

export class ObligationCompilationError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('test-obligation compilation requires revision');
    this.name = 'ObligationCompilationError';
    this.status = 'need_revision';
    this.stage = 'test_obligations';
    this.diagnostics = diagnostics.map((item) => ({ ...item }));
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {unknown} value @returns {value is Record<string, unknown>[]} */
function isDenseObjectArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isObject(value[index])) return false;
  }
  return true;
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {unknown} value @returns {value is string} */
function isNonblankUnpadded(value) {
  return typeof value === 'string' && value.length > 0 && value.trim().length > 0 && value === value.trim();
}

/** @param {unknown} value @param {boolean} [nonempty] @returns {value is string[]} */
function isDenseUniqueStringArray(value, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) return false;
  const strings = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isNonblankUnpadded(value[index]) || strings.has(value[index])) return false;
    strings.add(value[index]);
  }
  return true;
}

/** @param {Record<string, unknown>} value @param {string[]} expected */
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort(compareCodePoints);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * JSON Schema validators commonly enumerate an array's present entries. Keep
 * holes visible before Task 4 gets a chance to normalize object arrays.
 * The iterative walk also avoids tying accepted artifact depth to call-stack
 * depth.
 * @param {Record<string, unknown>} artifact
 */
function sparseBehaviorDiagnostics(artifact) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Array<{value: unknown, path: string}>} */
  const pending = [{ value: artifact, path: '' }];
  const visited = new Set();
  while (pending.length > 0) {
    const current = /** @type {{value: unknown, path: string}} */ (pending.pop());
    const { value, path } = current;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const itemPath = `${path}/${index}`;
        if (!Object.hasOwn(value, index)) diagnostics.push(diagnostic(
          'schema', 'BEHAVIOR_ARRAY_SPARSE', itemPath,
          `behavior artifact array has a missing entry at index ${index}`
        ));
        else pending.push({ value: value[index], path: itemPath });
      }
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      pending.push({ value: child, path: `${path}/${pointerPart(key)}` });
    }
  }
  return diagnostics;
}

/** @param {Record<string, unknown>} artifact */
function interactionStringDiagnostics(artifact) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  for (const [index, candidate] of objectArray(artifact.interaction_candidates).entries()) {
    const candidateId = typeof candidate.candidate_id === 'string' ? candidate.candidate_id : String(index);
    const path = `/interaction_candidates/${pointerPart(candidateId)}`;
    let valid = isNonblankUnpadded(candidate.candidate_id)
      && isDenseUniqueStringArray(candidate.module_ids, true);
    if (candidate.disposition === 'formal-view') {
      valid = valid && isNonblankUnpadded(candidate.formal_view_id)
        && isDenseUniqueStringArray(candidate.source_claim_ids, true);
    } else if (candidate.disposition === 'blocker') {
      valid = valid && isNonblankUnpadded(candidate.blocker_root_issue_id);
    } else if (candidate.disposition === 'exploratory') {
      valid = valid && isNonblankUnpadded(candidate.exploratory_id);
    }
    if (!valid) diagnostics.push(diagnostic(
      'schema', 'INTERACTION_ROUTE_STRING_INVALID', path,
      'interaction route IDs and references must be dense, nonblank, and unpadded'
    ));
  }
  return diagnostics;
}

/** @param {Diagnostic[]} diagnostics */
function sortDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, item]) => item);
}

function defaultRegistry() {
  return createObligationRegistry()
    .registerObligationStrategy('flow', compileFlow)
    .registerObligationStrategy('decision', compileDecision)
    .registerObligationStrategy('state', compileState)
    .registerObligationStrategy('input-domain', compileInputDomain)
    .registerObligationStrategy('role', compileRole)
    .registerObligationStrategy('timing', compileTiming)
    .registerObligationStrategy('integration', compileIntegration);
}

/** @param {Diagnostic[]} diagnostics */
function assertNoDiagnostics(diagnostics) {
  if (diagnostics.length > 0) throw new ObligationCompilationError(sortDiagnostics(diagnostics));
}

/** @param {Record<string, unknown>} graph */
function compilationInputs(graph) {
  const input = isObject(graph.obligationCompilation) ? graph.obligationCompilation : null;
  if (!input) throw new ObligationCompilationError([
    diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_REQUIRED', '/obligationCompilation', 'explicit obligation compilation input is required')
  ]);
  const expected = [
    'contextsByViewId', 'customObligations', 'factRoutes', 'notApplicableReviews', 'sourceRevision'
  ];
  const actual = Object.keys(input).sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_NOT_CLOSED', '/obligationCompilation', 'obligation compilation input has unknown or missing fields')
    ]);
  }
  if (!(input.contextsByViewId instanceof Map)
    || !isDenseObjectArray(input.customObligations) || !isDenseObjectArray(input.factRoutes)
    || !isDenseObjectArray(input.notApplicableReviews)
    || !Number.isInteger(input.sourceRevision) || /** @type {number} */ (input.sourceRevision) < 0) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID', '/obligationCompilation', 'contextsByViewId must be a Map and route/obligation inputs must be arrays')
    ]);
  }
  return {
    contextsByViewId: /** @type {Map<unknown, unknown>} */ (input.contextsByViewId),
    customObligations: input.customObligations,
    factRoutes: input.factRoutes,
    notApplicableReviews: input.notApplicableReviews,
    sourceRevision: /** @type {number} */ (input.sourceRevision)
  };
}

const FACT_FIELDS = ['claim_id', 'fact_id', 'source_claim_ids', 'status'];
const FACT_STATUSES = new Set(['active', 'conflicted', 'ambiguous', 'diagnostic']);

/**
 * Validate Task 3's accepted in-memory graph without coercing an invalid graph
 * into an empty formal denominator.
 * @param {Record<string, unknown>} graph
 * @param {ReturnType<typeof compilationInputs>} inputs
 * @param {Record<string, unknown>} artifact
 * @param {Diagnostic[]} diagnostics
 */
function validateEvidenceInputs(graph, inputs, artifact, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const claimsById = new Map();
  if (!(graph.claimsById instanceof Map)) {
    diagnostics.push(diagnostic(
      'schema', 'EVIDENCE_CLAIMS_MAP_REQUIRED', '/claimsById',
      'accepted evidence claimsById must be a Map'
    ));
  } else {
    for (const [key, claim] of graph.claimsById) {
      const path = `/claimsById/${String(key)}`;
      if (!isNonblankUnpadded(key) || !isObject(claim)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_CLAIM_ENTRY_INVALID', path, 'accepted claim entries require a nonblank unpadded Map key and object value'));
        continue;
      }
      if (!Object.hasOwn(claim, 'claim_id') || claim.claim_id !== key || !isNonblankUnpadded(claim.claim_id)) {
        diagnostics.push(diagnostic('reference', 'EVIDENCE_CLAIM_KEY_MISMATCH', `${path}/claim_id`, 'claim Map key must exactly match its own claim_id'));
        continue;
      }
      if (!isNonblankUnpadded(claim.scope)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_CLAIM_SCOPE_INVALID', `${path}/scope`, 'accepted claim scope must be nonblank and unpadded'));
        continue;
      }
      if (Object.hasOwn(claim, 'parent_claim_ids') && !isDenseUniqueStringArray(claim.parent_claim_ids)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_CLAIM_PARENTS_INVALID', `${path}/parent_claim_ids`, 'claim parent IDs must be a dense unique array of nonblank unpadded IDs'));
        continue;
      }
      claimsById.set(key, claim);
    }
  }
  for (const [claimId, claim] of claimsById) {
    for (const parentId of stringArray(claim.parent_claim_ids)) {
      if (!claimsById.has(parentId)) diagnostics.push(diagnostic(
        'reference', 'EVIDENCE_CLAIM_PARENT_DANGLING', `/claimsById/${claimId}/parent_claim_ids/${parentId}`,
        `accepted claim references missing parent "${parentId}"`
      ));
    }
  }

  /** @type {Record<string, unknown>[]} */
  const facts = [];
  if (!isDenseObjectArray(graph.factLedger)) {
    diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_LEDGER_INVALID', '/factLedger', 'factLedger must be a dense object array'));
  } else {
    const factIds = new Set();
    for (const fact of graph.factLedger) {
      const factId = typeof fact.fact_id === 'string' ? fact.fact_id : '';
      const path = `/factLedger/${factId || facts.length}`;
      let valid = true;
      if (!hasExactKeys(fact, FACT_FIELDS)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_NOT_CLOSED', path, 'fact entries must contain exactly fact_id, claim_id, status, and source_claim_ids'));
        valid = false;
      }
      if (!isNonblankUnpadded(factId) || !isNonblankUnpadded(fact.claim_id)
        || !FACT_STATUSES.has(String(fact.status)) || !isDenseUniqueStringArray(fact.source_claim_ids, true)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_FIELDS_INVALID', path, 'fact IDs, status, and source refs must satisfy the closed fact contract'));
        valid = false;
      }
      if (factIds.has(factId)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_ID_DUPLICATE', `/factLedger/${factId}/fact_id`, `fact_id "${factId}" must be unique`));
        valid = false;
      }
      factIds.add(factId);
      if (isNonblankUnpadded(fact.claim_id) && !claimsById.has(fact.claim_id)) {
        diagnostics.push(diagnostic('reference', 'EVIDENCE_FACT_CLAIM_DANGLING', `${path}/claim_id`, `fact references missing accepted claim "${fact.claim_id}"`));
        valid = false;
      }
      for (const claimId of stringArray(fact.source_claim_ids)) {
        if (!claimsById.has(claimId)) {
          diagnostics.push(diagnostic('reference', 'EVIDENCE_FACT_SOURCE_DANGLING', `${path}/source_claim_ids/${claimId}`, `fact references missing accepted source claim "${claimId}"`));
          valid = false;
        }
      }
      if (valid) facts.push(fact);
    }
  }
  if (inputs.sourceRevision !== artifact.source_revision) diagnostics.push(diagnostic(
    'reference', 'OBLIGATION_SOURCE_REVISION_MISMATCH', '/obligationCompilation/sourceRevision',
    `compilation source revision ${inputs.sourceRevision} does not match behavior revision ${String(artifact.source_revision)}`
  ));
  return { claimsById, facts };
}

const OBLIGATION_SET_FIELDS = [
  'source_claim_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities'
];
const OBLIGATION_FIELDS = [
  'kind', 'obligation_id', 'required_capabilities', 'required_oracle_refs',
  'risk', 'scope', 'source_claim_ids', 'view_element_refs'
];
const CONTEXT_FIELDS_BY_VIEW_TYPE = Object.freeze({
  flow: ['loopMaximumsByElementId', 'requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  decision: ['requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  state: ['requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  'input-domain': ['responsibilityBindings'],
  role: ['responsibilityBindings'],
  timing: ['responsibilityBindings', 'timingSpecialResponsibilitiesByElementId'],
  integration: ['integrationInvariantsByElementId', 'integrationSpecialResponsibilitiesByElementId', 'responsibilityBindings']
});
const ELEMENT_CONTEXT_FIELDS = new Set([
  'riskByElementId', 'requiredOracleRefsByElementId', 'requiredCapabilitiesByElementId',
  'loopMaximumsByElementId', 'timingSpecialResponsibilitiesByElementId',
  'integrationInvariantsByElementId', 'integrationSpecialResponsibilitiesByElementId'
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainRecord(value) {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {Array<[unknown, unknown]> | null} */
function ownEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (!isPlainRecord(value)) return null;
  return Object.entries(value);
}

/**
 * Validate the private per-view strategy contract before spreading it into a
 * compiler. This makes inherited values unusable and proves every element map
 * key belongs to the submitted view.
 * @param {string} viewId
 * @param {Record<string, unknown>} view
 * @param {Record<string, unknown>} context
 * @param {Diagnostic[]} diagnostics
 */
function validateViewContext(viewId, view, context, diagnostics) {
  const path = `/obligationCompilation/contextsByViewId/${pointerPart(viewId)}`;
  let valid = true;
  if (!isPlainRecord(context)) {
    diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_PROTOTYPE_FORBIDDEN', path,
      'per-view compilation context must be an own-property plain object'
    ));
    valid = false;
  }
  const elementIds = new Set(objectArray(view.elements).flatMap((element) => (
    isNonblankUnpadded(element.element_id) ? [String(element.element_id)] : []
  )));
  for (const field of ELEMENT_CONTEXT_FIELDS) {
    if (!Object.hasOwn(context, field)) continue;
    const entries = ownEntries(context[field]);
    const fieldPath = `${path}/${field}`;
    if (entries === null) {
      diagnostics.push(diagnostic(
        'schema', 'OBLIGATION_CONTEXT_MAP_PROTOTYPE_FORBIDDEN', fieldPath,
        `${field} must be a Map or an own-property plain object`
      ));
      valid = false;
      continue;
    }
    for (const [rawKey, entry] of entries) {
      if (!isNonblankUnpadded(rawKey) || !elementIds.has(String(rawKey))) {
        diagnostics.push(diagnostic(
          'reference', 'OBLIGATION_CONTEXT_ELEMENT_UNKNOWN', `${fieldPath}/${pointerPart(String(rawKey))}`,
          `${field} references an invalid or unknown element "${String(rawKey)}"`
        ));
        valid = false;
        continue;
      }
      if (field === 'riskByElementId' && !isNonblankUnpadded(entry)) {
        diagnostics.push(diagnostic('schema', 'OBLIGATION_CONTEXT_STRINGS_INVALID', fieldPath, 'context risk values must be nonblank and unpadded'));
        valid = false;
      }
      if ((field === 'requiredOracleRefsByElementId' || field === 'requiredCapabilitiesByElementId')
        && !isDenseUniqueStringArray(entry)) {
        diagnostics.push(diagnostic(
          'schema', 'OBLIGATION_CONTEXT_STRINGS_INVALID', fieldPath,
          `${field} values must be dense unique arrays of nonblank unpadded strings`
        ));
        valid = false;
      }
      if (field === 'loopMaximumsByElementId') {
        const definition = isPlainRecord(entry) ? entry : null;
        if (!definition || !hasExactKeys(definition, ['maximum', 'source_claim_ids'])
          || !Number.isInteger(definition.maximum) || Number(definition.maximum) <= 1
          || !isDenseUniqueStringArray(definition.source_claim_ids, true)) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_LOOP_INVALID', fieldPath,
            'loop maximums require exact maximum and dense nonblank source_claim_ids fields'
          ));
          valid = false;
        }
      }
      if (field === 'timingSpecialResponsibilitiesByElementId'
        || field === 'integrationSpecialResponsibilitiesByElementId') {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ['signal', 'type'])
          || !isNonblankUnpadded(item.signal) || !isNonblankUnpadded(item.type))) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_SPECIAL_INVALID', fieldPath,
            `${field} values must be dense closed signal/type objects with unpadded strings`
          ));
          valid = false;
        }
      }
      if (field === 'integrationInvariantsByElementId') {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ['invariant'])
          || !isNonblankUnpadded(item.invariant))) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_INVARIANT_INVALID', fieldPath,
            'integration invariant values must be dense closed objects with one unpadded invariant'
          ));
          valid = false;
        }
      }
    }
  }
  if (Object.hasOwn(context, 'responsibilityBindings') && !isDenseObjectArray(context.responsibilityBindings)) {
    diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_BINDINGS_INVALID', `${path}/responsibilityBindings`,
      'responsibilityBindings must be a dense object array'
    ));
    valid = false;
  }
  return valid;
}

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} viewsById @param {Map<string, Record<string, unknown>>} claimsById @param {Diagnostic[]} diagnostics */
function validateCustomObligations(inputs, viewsById, claimsById, diagnostics) {
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema({
    schema_version: '1.0.0',
    source_revision: 0,
    obligations: inputs.customObligations,
    fact_routes: [],
    interaction_routes: []
  }, testObligationsSchema)));
  /** @type {Map<Record<string, unknown>, string>} */
  const ownerBySeed = new Map();
  inputs.customObligations.forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : String(index);
    const path = `/obligationCompilation/customObligations/${obligationId}`;
    const keys = Object.keys(seed).sort(compareCodePoints);
    if (keys.length !== OBLIGATION_FIELDS.length || keys.some((key, keyIndex) => key !== OBLIGATION_FIELDS[keyIndex])) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_INPUT_NOT_CLOSED', path,
        'custom obligation must contain exactly the frozen eight obligation fields'
      ));
    }
    if (!/^obligation_[0-9a-f]{16}$/.test(obligationId)) diagnostics.push(diagnostic(
      'schema', 'CUSTOM_OBLIGATION_ID_INVALID', `${path}/obligation_id`,
      'custom obligation_id must use stable obligation_<16 lowercase hex> form'
    ));
    if (!isNonblankUnpadded(seed.scope)
      || !isDenseUniqueStringArray(seed.source_claim_ids, true)
      || !isDenseUniqueStringArray(seed.view_element_refs)
      || !isDenseUniqueStringArray(seed.required_oracle_refs)
      || !isDenseUniqueStringArray(seed.required_capabilities)) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_STRINGS_INVALID', path,
        'custom scope, refs, and capabilities must be dense, unique, nonblank, and unpadded'
      ));
    }
    const sourceIds = stringArray(seed.source_claim_ids);
    const oracleIds = stringArray(seed.required_oracle_refs);
    const sourceSet = new Set(sourceIds);
    for (const [field, claimId] of [
      ...sourceIds.map((id) => ['source_claim_ids', id]),
      ...oracleIds.map((id) => ['required_oracle_refs', id])
    ]) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        diagnostics.push(diagnostic(
          'reference', 'CUSTOM_OBLIGATION_CLAIM_DANGLING', `${path}/${field}`,
          `custom obligation references unknown accepted claim "${claimId}"`
        ));
        continue;
      }
      if (!isNonblankUnpadded(claim.scope) || !isNonblankUnpadded(seed.scope)
        || !scopeContains(String(claim.scope), String(seed.scope))) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_CLAIM_SCOPE_MISMATCH', `${path}/${field}`,
        `claim "${claimId}" does not cover custom obligation scope "${String(seed.scope)}"`
      ));
      if (field === 'source_claim_ids') {
        const acceptedSource = isOracleEvidence(claim)
          || (claim.level === 'E2' && claim.kind === 'model-element' && claim.derivation_target === 'model-element');
        if (!acceptedSource) diagnostics.push(diagnostic(
          'classification', 'CUSTOM_OBLIGATION_SOURCE_INVALID', `${path}/source_claim_ids`,
          `claim "${claimId}" is not accepted formal obligation evidence`
        ));
      } else if (!isOracleEvidence(claim)) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_ORACLE_INVALID', `${path}/required_oracle_refs`,
        `claim "${claimId}" is not eligible Oracle evidence`
      ));
    }
    for (const oracleId of oracleIds) {
      if (!sourceSet.has(oracleId)) diagnostics.push(diagnostic(
        'traceability', 'CUSTOM_OBLIGATION_ORACLE_NOT_SOURCED', `${path}/required_oracle_refs`,
        `Oracle claim "${oracleId}" must also appear in source_claim_ids`
      ));
    }

    /** @type {Array<{ref: string, closure: Set<string>}>} */
    const owners = [];
    for (const viewElementRef of stringArray(seed.view_element_refs)) {
      const separator = viewElementRef.indexOf('#');
      const viewId = separator > 0 && separator === viewElementRef.lastIndexOf('#') ? viewElementRef.slice(0, separator) : '';
      const elementId = separator > 0 && separator === viewElementRef.lastIndexOf('#') ? viewElementRef.slice(separator + 1) : '';
      const view = viewsById.get(viewId);
      const element = objectArray(view?.elements).find((item) => item.element_id === elementId);
      if (!isNonblankUnpadded(viewId) || !isNonblankUnpadded(elementId) || !element) {
        diagnostics.push(diagnostic(
        'reference', 'CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING', `${path}/view_element_refs`,
        `custom obligation references unknown view element "${viewElementRef}"`
        ));
        continue;
      }
      const closure = acceptedClaimClosure(claimsById, elementEvidenceRefs(element));
      if (closure === null || closure.size === 0) {
        diagnostics.push(diagnostic(
          'traceability', 'CUSTOM_OBLIGATION_OWNER_EVIDENCE_INVALID', `${path}/view_element_refs`,
          `view element "${viewElementRef}" has no valid accepted evidence closure`
        ));
        continue;
      }
      owners.push({ ref: viewElementRef, closure });
    }
    if (stringArray(seed.view_element_refs).length === 0) {
      const closure = acceptedClaimClosure(claimsById, sourceIds);
      if (closure !== null && closure.size > 0) owners.push({ ref: '', closure });
    }

    /** @param {string} claimId @param {Set<string>} closure */
    function isRelevant(claimId, closure) {
      if (closure.has(claimId)) return true;
      const relevance = acceptedOracleRelevance(claimsById, [claimId], closure);
      return relevance !== null && relevance.get(claimId) === true;
    }
    for (const owner of owners) {
      for (const claimId of sourceIds) {
        if (claimsById.has(claimId) && !isRelevant(claimId, owner.closure)) diagnostics.push(diagnostic(
          'traceability', 'CUSTOM_OBLIGATION_SOURCE_UNRELATED', `${path}/source_claim_ids`,
          `source claim "${claimId}" is unrelated to custom obligation owner "${owner.ref}"`
        ));
      }
      for (const claimId of oracleIds) {
        if (claimsById.has(claimId) && !isRelevant(claimId, owner.closure)) diagnostics.push(diagnostic(
          'traceability', 'CUSTOM_OBLIGATION_ORACLE_UNRELATED', `${path}/required_oracle_refs`,
          `Oracle claim "${claimId}" is unrelated to custom obligation owner "${owner.ref}"`
        ));
      }
    }
    const viewElementRefs = [...stringArray(seed.view_element_refs)].sort(compareCodePoints);
    ownerBySeed.set(seed, canonicalStringify({
      kind: seed.kind,
      risk: seed.risk,
      scope: seed.scope,
      view_element_refs: viewElementRefs,
      ...(viewElementRefs.length === 0 ? { source_claim_ids: [...sourceIds].sort(compareCodePoints) } : {})
    }));
  });
  return ownerBySeed;
}

/** @param {Record<string, unknown>} accumulator @param {Record<string, unknown>} seed */
function addObligationSets(accumulator, seed) {
  for (const field of OBLIGATION_SET_FIELDS) {
    const values = /** @type {Set<string>} */ (accumulator[field]);
    for (const value of stringArray(seed[field])) values.add(value);
  }
}

/** @param {Map<string, Record<string, unknown>>} byId */
function finishObligationMerge(byId) {
  return [...byId.values()].map((entry) => ({
    obligation_id: entry.obligation_id,
    kind: entry.kind,
    risk: entry.risk,
    scope: entry.scope,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [
      field, [.../** @type {Set<string>} */ (entry[field])].sort(compareCodePoints)
    ]))
  })).sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
}

/** @param {Record<string, unknown>} seed @param {string} [owner] */
function obligationAccumulator(seed, owner = '') {
  return {
    obligation_id: seed.obligation_id,
    kind: seed.kind,
    risk: seed.risk,
    scope: seed.scope,
    owner,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [field, new Set(stringArray(seed[field]))]))
  };
}

/** @param {Record<string, unknown>[]} seeds @param {Diagnostic[]} diagnostics */
function mergeSystemObligations(seeds, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  [...seeds].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : '';
    const path = `/obligations/${obligationId || index}`;
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed));
      return;
    }
    if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) {
      diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_SIGNATURE_CONFLICT', path,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}

/** @param {Record<string, unknown>[]} seeds @param {Map<Record<string, unknown>, string>} ownerBySeed @param {Set<string>} systemIds @param {Diagnostic[]} diagnostics */
function mergeCustomObligations(seeds, ownerBySeed, systemIds, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  const collisionIds = new Set();
  [...seeds].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : '';
    const path = `/obligationCompilation/customObligations/${obligationId || index}`;
    if (systemIds.has(obligationId)) {
      if (!collisionIds.has(obligationId)) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_SYSTEM_ID_COLLISION', `${path}/obligation_id`,
        `custom obligation ID "${obligationId}" collides with a system strategy obligation`
      ));
      collisionIds.add(obligationId);
      return;
    }
    const owner = ownerBySeed.get(seed) ?? '';
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed, owner));
      return;
    }
    if (existing.owner !== owner) {
      diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_OWNER_CONFLICT', path,
        `duplicate custom obligation ID "${obligationId}" has conflicting semantic owners`
      ));
      if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_SIGNATURE_CONFLICT', path,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}

/** @param {Record<string, unknown>} graph @param {Map<string, Record<string, unknown>>} viewsById @param {ReturnType<typeof compilationInputs>} inputs @param {Diagnostic[]} diagnostics */
function compileViewObligations(graph, viewsById, inputs, diagnostics) {
  const registry = defaultRegistry();
  const claimsById = graph.claimsById instanceof Map ? graph.claimsById : new Map();
  /** @type {Record<string, unknown>[]} */
  const seeds = [];
  for (const [viewId, view] of viewsById) {
    const submittedContext = inputs.contextsByViewId.get(viewId);
    if (!isObject(submittedContext)) {
      diagnostics.push(diagnostic('classification', 'OBLIGATION_CONTEXT_MISSING', `/obligationCompilation/contextsByViewId/${viewId}`, `view "${viewId}" has no isolated compilation context`));
      continue;
    }
    if (Object.hasOwn(submittedContext, 'claimsById') || Object.hasOwn(submittedContext, 'evidenceGraph')) {
      diagnostics.push(diagnostic('classification', 'OBLIGATION_CONTEXT_EVIDENCE_OVERRIDE', `/obligationCompilation/contextsByViewId/${viewId}`, 'view context cannot replace the accepted evidence graph'));
      continue;
    }
    const allowedFields = CONTEXT_FIELDS_BY_VIEW_TYPE[/** @type {keyof typeof CONTEXT_FIELDS_BY_VIEW_TYPE} */ (view.type)];
    const submittedFields = Object.keys(submittedContext).sort(compareCodePoints);
    if (!allowedFields || submittedFields.some((field) => !allowedFields.includes(field))) {
      diagnostics.push(diagnostic(
        'schema', 'OBLIGATION_CONTEXT_NOT_CLOSED', `/obligationCompilation/contextsByViewId/${viewId}`,
        `view "${viewId}" compilation context contains a field outside its ${String(view.type)} strategy contract`
      ));
      continue;
    }
    if (!validateViewContext(viewId, view, submittedContext, diagnostics)) continue;
    try {
      seeds.push(...registry.compile(view, { ...submittedContext, claimsById }));
    } catch (error) {
      diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_STRATEGY_REJECTED', `/views/${viewId}`,
        error instanceof Error ? error.message : 'obligation strategy rejected its input'
      ));
    }
  }
  for (const key of inputs.contextsByViewId.keys()) {
    if (!isNonblankUnpadded(key)) diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_VIEW_KEY_INVALID', `/obligationCompilation/contextsByViewId/${pointerPart(String(key))}`,
      'compilation context view keys must be nonblank and unpadded'
    ));
    else if (!viewsById.has(key)) diagnostics.push(diagnostic(
      'reference', 'OBLIGATION_CONTEXT_VIEW_UNKNOWN', `/obligationCompilation/contextsByViewId/${pointerPart(key)}`,
      `compilation context references unknown view "${key}"`
    ));
  }
  return seeds;
}

/** @param {Record<string, unknown>[]} facts @param {Map<string, Record<string, unknown>>} claimsById */
function formalFacts(facts, claimsById) {
  return facts.filter((fact) => {
    const claim = typeof fact.claim_id === 'string' ? claimsById.get(fact.claim_id) : undefined;
    return fact.status !== 'diagnostic' && (claim?.kind === 'requirement' || claim?.kind === 'assumption');
  });
}

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} factsById @param {Map<string, Record<string, unknown>>} claimsById @param {Diagnostic[]} diagnostics */
function terminalFactRoutes(inputs, factsById, claimsById, diagnostics) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const reviewsByFactId = new Map();
  /** @type {Set<Record<string, unknown>>} */
  const validReviews = new Set();
  for (const review of [...inputs.notApplicableReviews].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof review.fact_id === 'string' ? review.fact_id : '';
    const path = `/obligationCompilation/notApplicableReviews/${factId || 'invalid'}`;
    const group = reviewsByFactId.get(factId) ?? [];
    group.push(review);
    reviewsByFactId.set(factId, group);
    let valid = true;
    if (!hasExactKeys(review, ['claim_id', 'fact_id', 'support_review'])
      || !isNonblankUnpadded(factId) || !isNonblankUnpadded(review.claim_id)
      || review.support_review !== 'supported') {
      diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_REVIEW_INVALID', path,
        'NotApplicable review must contain exact nonblank fact/claim IDs and support_review "supported"'
      ));
      valid = false;
    }
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic('reference', 'NOT_APPLICABLE_REVIEW_UNKNOWN', `${path}/fact_id`, `NotApplicable review references unknown formal fact "${factId}"`));
      valid = false;
    }
    if (valid) validReviews.add(review);
  }
  for (const [factId, reviews] of reviewsByFactId) {
    if (reviews.length > 1) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_REVIEW_MULTIPLE', `/obligationCompilation/notApplicableReviews/${factId}`,
      `formal fact "${factId}" has more than one NotApplicable review`
    ));
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const routesByFactId = new Map();
  for (const route of [...inputs.factRoutes].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof route.fact_id === 'string' ? route.fact_id : '';
    const group = routesByFactId.get(factId) ?? [];
    group.push(route);
    routesByFactId.set(factId, group);
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const routes = new Map();
  const notApplicableFactIds = new Set();
  for (const [factId, submittedRoutes] of [...routesByFactId].sort(([left], [right]) => compareCodePoints(left, right))) {
    const path = `/obligationCompilation/factRoutes/${factId || 'invalid'}`;
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic('reference', 'FACT_ROUTE_UNKNOWN', `${path}/fact_id`, `route references unknown formal fact "${factId}"`));
    }
    if (submittedRoutes.length > 1) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MULTIPLE', path, `formal fact "${factId}" has more than one explicit route`));
    }
    /** @type {Map<Record<string, unknown>, Record<string, unknown>>} */
    const normalizedByRoute = new Map();
    for (const route of submittedRoutes) {
      const routeType = route.route_type;
      if (routeType === 'exploratory') {
        diagnostics.push(diagnostic('classification', 'FORMAL_FACT_EXPLORATORY_FORBIDDEN', path, 'a formal fact cannot route directly to Exploratory'));
        continue;
      }
      if (routeType === 'blocked') {
        if (!hasExactKeys(route, ['blocker_root_issue_id', 'fact_id', 'route_type'])
          || !isNonblankUnpadded(route.blocker_root_issue_id)) {
          diagnostics.push(diagnostic('classification', 'FACT_BLOCKED_ROUTE_INVALID', path, 'Blocked route must contain one nonblank unpadded blocker_root_issue_id'));
          continue;
        }
        normalizedByRoute.set(route, { fact_id: factId, route_type: 'blocked', blocker_root_issue_id: route.blocker_root_issue_id });
        continue;
      }
      if (routeType === 'not_applicable') {
        notApplicableFactIds.add(factId);
        const claimId = typeof route.not_applicable_claim_id === 'string' ? route.not_applicable_claim_id : '';
        if (!hasExactKeys(route, ['fact_id', 'not_applicable_claim_id', 'route_type']) || !isNonblankUnpadded(claimId)) {
          diagnostics.push(diagnostic('classification', 'FACT_NOT_APPLICABLE_ROUTE_INVALID', path, 'NotApplicable route must contain one nonblank unpadded exclusion claim ID'));
          continue;
        }
        normalizedByRoute.set(route, { fact_id: factId, route_type: 'not_applicable', not_applicable_claim_id: claimId });
        continue;
      }
      diagnostics.push(diagnostic('classification', 'FACT_ROUTE_TYPE_INVALID', `${path}/route_type`, 'explicit fact route must be Blocked or NotApplicable'));
    }
    if (submittedRoutes.length !== 1 || !factsById.has(factId)) continue;
    const route = submittedRoutes[0];
    const normalized = normalizedByRoute.get(route);
    if (!normalized) continue;
    if (normalized.route_type === 'blocked') {
      routes.set(factId, normalized);
      continue;
    }
    const reviews = reviewsByFactId.get(factId) ?? [];
    if (reviews.length === 0) {
      diagnostics.push(diagnostic('traceability', 'NOT_APPLICABLE_REVIEW_MISSING', `/obligationCompilation/notApplicableReviews/${factId}`, `formal fact "${factId}" has no supported NotApplicable review`));
      continue;
    }
    if (reviews.length !== 1 || !validReviews.has(reviews[0])) continue;
    const review = reviews[0];
    const exclusionId = String(normalized.not_applicable_claim_id);
    const exclusion = claimsById.get(exclusionId);
    if (!exclusion) {
      diagnostics.push(diagnostic('reference', 'NOT_APPLICABLE_CLAIM_DANGLING', `${path}/not_applicable_claim_id`, `NotApplicable route references unknown claim "${exclusionId}"`));
      continue;
    }
    if (review.claim_id !== exclusionId) {
      diagnostics.push(diagnostic('traceability', 'NOT_APPLICABLE_REVIEW_MISMATCH', `/obligationCompilation/notApplicableReviews/${factId}/claim_id`, 'NotApplicable review must name the route exclusion claim'));
      continue;
    }
    if (exclusion.level !== 'E3' && exclusion.level !== 'E2') {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_CLAIM_LEVEL_INVALID', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion requires accepted E3 or E2 evidence'));
      continue;
    }
    const fact = /** @type {Record<string, unknown>} */ (factsById.get(factId));
    const factClaimIds = new Set([String(fact.claim_id), ...stringArray(fact.source_claim_ids)]);
    if (factClaimIds.has(exclusionId)) {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion must be independent from the fact claim and its sources'));
      continue;
    }
    const primaryClaim = claimsById.get(String(fact.claim_id));
    if (!primaryClaim || !isNonblankUnpadded(exclusion.scope) || !isNonblankUnpadded(primaryClaim.scope)
      || !scopeContains(String(exclusion.scope), String(primaryClaim.scope))) {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_SCOPE_MISMATCH', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion scope must cover the primary fact scope'));
      continue;
    }
    routes.set(factId, normalized);
  }
  for (const factId of [...reviewsByFactId.keys()].sort(compareCodePoints)) {
    if (factsById.has(factId) && !notApplicableFactIds.has(factId)) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_REVIEW_ORPHAN', `/obligationCompilation/notApplicableReviews/${factId}`,
      `NotApplicable review for fact "${factId}" has no NotApplicable route`
    ));
  }
  return routes;
}

/** @param {Diagnostic} item @param {Set<string>} terminalFactIds */
function isResolvedTask4FactDiagnostic(item, terminalFactIds) {
  if (item.code !== 'NORMATIVE_FACT_UNMODELED' && item.code !== 'OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED') return false;
  const prefix = '/facts/';
  return item.path.startsWith(prefix) && terminalFactIds.has(item.path.slice(prefix.length));
}

/**
 * Build the evidence-to-obligation join once. A modeled fact then visits only
 * the selected view/evidence buckets instead of rescanning the full ledger.
 * @param {Record<string, unknown>[]} obligations
 */
function indexObligationsByViewAndClaim(obligations) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const index = new Map();
  for (const obligation of obligations) {
    if (!isNonblankUnpadded(obligation.obligation_id)) continue;
    const viewIds = new Set(stringArray(obligation.view_element_refs).flatMap((ref) => {
      const separator = ref.indexOf('#');
      return separator > 0 ? [ref.slice(0, separator)] : [];
    }));
    for (const viewId of viewIds) {
      let claims = index.get(viewId);
      if (!claims) {
        claims = new Map();
        index.set(viewId, claims);
      }
      for (const claimId of stringArray(obligation.source_claim_ids)) {
        let obligationIds = claims.get(claimId);
        if (!obligationIds) {
          obligationIds = new Set();
          claims.set(claimId, obligationIds);
        }
        obligationIds.add(String(obligation.obligation_id));
      }
    }
  }
  return index;
}

/** @param {Record<string, unknown>[]} facts @param {Record<string, unknown>[]} obligations @param {Record<string, unknown>[]} viewRoutes @param {Map<string, Record<string, unknown>>} terminalRoutes @param {Diagnostic[]} diagnostics */
function reconcileFactRoutes(facts, obligations, viewRoutes, terminalRoutes, diagnostics) {
  const viewsByFact = new Map(viewRoutes.flatMap((route) => typeof route.fact_id === 'string'
    ? [[route.fact_id, new Set(stringArray(route.view_ids))]] : []));
  const obligationIndex = indexObligationsByViewAndClaim(obligations);
  const routes = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const terminal = terminalRoutes.get(factId);
    const viewIds = viewsByFact.get(factId);
    if (terminal && viewIds) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MULTIPLE', `/fact_routes/${factId}`, `formal fact "${factId}" is both modeled and terminally routed`));
      continue;
    }
    if (terminal) {
      routes.push({ ...terminal });
      continue;
    }
    if (!viewIds) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MISSING', `/fact_routes/${factId}`, `formal fact "${factId}" has no explicit route`));
      continue;
    }
    const claimIds = new Set([String(fact.claim_id), ...stringArray(fact.source_claim_ids)]);
    const obligationIds = new Set();
    for (const viewId of viewIds) {
      const claims = obligationIndex.get(viewId);
      if (!claims) continue;
      for (const claimId of claimIds) {
        for (const obligationId of claims.get(claimId) ?? []) obligationIds.add(obligationId);
      }
    }
    if (obligationIds.size === 0) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_OBLIGATION_MISSING', `/fact_routes/${factId}`, `modeled fact "${factId}" produced no formal obligation`));
      continue;
    }
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [...obligationIds].sort(compareCodePoints) });
  }
  return routes.sort((left, right) => compareCodePoints(String(left.fact_id), String(right.fact_id)));
}

/** @param {Record<string, unknown>[]} candidates */
function reconcileInteractionRoutes(candidates) {
  return candidates.map((candidate) => candidate.disposition === 'formal-view'
    ? { candidate_id: candidate.candidate_id, route_type: 'formal-view', formal_view_id: candidate.formal_view_id }
    : candidate.disposition === 'blocker'
      ? { candidate_id: candidate.candidate_id, route_type: 'blocked', blocker_root_issue_id: candidate.blocker_root_issue_id }
      : { candidate_id: candidate.candidate_id, route_type: 'exploratory', exploratory_id: candidate.exploratory_id })
    .sort((left, right) => compareCodePoints(String(left.candidate_id), String(right.candidate_id)));
}

/**
 * Prove the two formal denominators are closed before schema validation. The
 * frozen schema checks route shape; this check owns identity cardinality.
 * @param {Record<string, unknown>[]} expected
 * @param {Record<string, unknown>[]} routes
 * @param {string} expectedField
 * @param {string} routeField
 * @param {string} label
 * @param {Diagnostic[]} diagnostics
 */
function validateRouteIdentity(expected, routes, expectedField, routeField, label, diagnostics) {
  const expectedIds = new Set(expected.flatMap((item) => (
    isNonblankUnpadded(item[expectedField]) ? [String(item[expectedField])] : []
  )));
  const counts = new Map();
  for (const route of routes) {
    const routeId = isNonblankUnpadded(route[routeField]) ? String(route[routeField]) : '';
    if (!expectedIds.has(routeId)) diagnostics.push(diagnostic(
      'reference', `${label}_ROUTE_IDENTITY_UNKNOWN`, `/${routeField}/${pointerPart(routeId || 'invalid')}`,
      `${label} route references an identity outside the formal denominator`
    ));
    counts.set(routeId, (counts.get(routeId) ?? 0) + 1);
  }
  for (const expectedId of [...expectedIds].sort(compareCodePoints)) {
    const count = counts.get(expectedId) ?? 0;
    if (count !== 1) diagnostics.push(diagnostic(
      'traceability', `${label}_ROUTE_IDENTITY_NOT_EXACT`, `/${routeField}/${pointerPart(expectedId)}`,
      `${label} identity "${expectedId}" must have exactly one explicit route; found ${count}`
    ));
  }
}

/**
 * Compile the frozen formal Test Point artifact from accepted Task 3 evidence
 * and the submitted Task 4 behavior artifact.
 * @param {unknown} evidenceGraph
 * @param {unknown} behaviorViews
 */
export function compileObligations(evidenceGraph, behaviorViews) {
  const graph = isObject(evidenceGraph) ? evidenceGraph : {};
  const artifact = isObject(behaviorViews) ? behaviorViews : {};
  const structuralDiagnostics = [
    ...sparseBehaviorDiagnostics(artifact),
    ...interactionStringDiagnostics(artifact),
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, behaviorViewsSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact))
  ];
  const inputs = compilationInputs(graph);
  const viewValidation = validateBehaviorViews(graph, artifact);
  const interactionAudit = auditInteractionMatrix(artifact);
  const diagnostics = [...structuralDiagnostics];
  const evidence = validateEvidenceInputs(graph, inputs, artifact, diagnostics);
  const facts = formalFacts(evidence.facts, evidence.claimsById);
  const factsById = new Map(facts.flatMap((fact) => typeof fact.fact_id === 'string' ? [[fact.fact_id, fact]] : []));
  const claimsById = evidence.claimsById;
  const terminalRoutes = terminalFactRoutes(inputs, factsById, claimsById, diagnostics);
  diagnostics.push(
    .../** @type {Diagnostic[]} */ (viewValidation.diagnostics)
      .filter((item) => !isResolvedTask4FactDiagnostic(item, new Set(terminalRoutes.keys()))),
    .../** @type {Diagnostic[]} */ (interactionAudit.diagnostics)
  );
  const customOwnerBySeed = validateCustomObligations(inputs, viewValidation.viewsById, claimsById, diagnostics);
  assertNoDiagnostics(diagnostics);

  const strategySeeds = compileViewObligations(graph, viewValidation.viewsById, inputs, diagnostics);
  const systemObligations = mergeSystemObligations(strategySeeds, diagnostics);
  const customObligations = mergeCustomObligations(
    inputs.customObligations, customOwnerBySeed,
    new Set(systemObligations.map((obligation) => String(obligation.obligation_id))), diagnostics
  );
  const obligations = [...systemObligations, ...customObligations]
    .sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
  const factRoutes = reconcileFactRoutes(
    facts, obligations, /** @type {Record<string, unknown>[]} */ (viewValidation.factRoutes), terminalRoutes, diagnostics
  );
  const interactionRoutes = reconcileInteractionRoutes(
    /** @type {Record<string, unknown>[]} */ (interactionAudit.candidates)
  );
  validateRouteIdentity(facts, factRoutes, 'fact_id', 'fact_id', 'FACT', diagnostics);
  validateRouteIdentity(
    /** @type {Record<string, unknown>[]} */ (interactionAudit.candidates), interactionRoutes,
    'candidate_id', 'candidate_id', 'INTERACTION', diagnostics
  );

  const compiled = {
    schema_version: '1.0.0',
    source_revision: typeof artifact.source_revision === 'number' ? artifact.source_revision : -1,
    obligations,
    fact_routes: factRoutes,
    interaction_routes: interactionRoutes
  };
  diagnostics.push(
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(compiled, testObligationsSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(compiled))
  );
  assertNoDiagnostics(diagnostics);
  return compiled;
}
