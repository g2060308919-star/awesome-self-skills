import { scopeContains } from '../decision-record.mjs';
import {
  assertViewType, buildObligationSeed, claimsByIdFrom, elementEvidenceRefs,
  finishObligationSeeds, isObject, objectArray, sortedStrings
} from './registry.mjs';

const CORE_RESPONSIBILITIES = [
  'request', 'response', 'persistence', 'event', 'callback', 'compensation'
];
const SPECIAL_TYPES = new Set([
  'contract-compatibility', 'concurrency', 'idempotency', 'security-abuse'
]);

/** @param {unknown} container @param {string} key */
function keyedValue(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject(container) ? container[key] : undefined;
}

/** @param {Record<string, unknown>} claim @param {string} scope */
function isAcceptedSignal(claim, scope) {
  const accepted = (claim.level === 'E3' && claim.kind === 'requirement')
    || (claim.level === 'E1' && claim.kind === 'assumption')
    || (claim.level === 'E2' && claim.kind === 'model-element');
  return accepted && typeof claim.scope === 'string' && scopeContains(claim.scope, scope);
}

/** @param {unknown} context @param {string} property @param {string} elementId */
function declarations(context, property, elementId) {
  if (!isObject(context)) return [];
  return objectArray(keyedValue(context[property], elementId));
}

/**
 * @param {unknown} context
 * @param {Record<string, unknown>} element
 * @param {string} discriminator
 * @param {string[]} sourceClaimIds
 * @param {string[]} oracleRefs
 */
function independentContext(context, element, discriminator, sourceClaimIds, oracleRefs) {
  if (!isObject(context)) throw new TypeError('obligation compilation context must be an object');
  const baseId = String(element.element_id);
  const syntheticId = `${baseId}::${discriminator}`;
  return {
    primaryElement: {
      ...element,
      element_id: syntheticId,
      source_claim_ids: sortedStrings([...elementEvidenceRefs(element), ...sourceClaimIds], true),
      model_refs: []
    },
    context: {
      ...context,
      riskByElementId: new Map([[syntheticId, keyedValue(context.riskByElementId, baseId)]]),
      requiredOracleRefsByElementId: new Map([[syntheticId, oracleRefs]]),
      requiredCapabilitiesByElementId: new Map([[
        syntheticId, keyedValue(context.requiredCapabilitiesByElementId, baseId)
      ]])
    }
  };
}

/**
 * Return a normalized declaration only when every cited signal is accepted and
 * covers the integration view. Risk without such a signal remains non-formal.
 * @param {Record<string, unknown>} declaration
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {string} scope
 */
function acceptedDeclaration(declaration, claimsById, scope) {
  const sourceClaimIds = sortedStrings(declaration.source_claim_ids, true);
  if (sourceClaimIds.length === 0 || sourceClaimIds.some((claimId) => {
    const claim = claimsById.get(claimId);
    return !claim || !isAcceptedSignal(claim, scope);
  })) return null;
  return {
    sourceClaimIds,
    oracleRefs: sortedStrings(declaration.required_oracle_refs, true)
  };
}

/**
 * Compile each distinct integration surface plus explicitly evidenced invariants
 * and approved special signals. Oracles remain independently mapped per signal.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'integration');
  const elements = objectArray(view.elements).filter((element) => element.kind === 'integration-contract');
  const claimsById = claimsByIdFrom(context);
  /** @type {import('./registry.mjs').ObligationSeed[]} */
  const seeds = [];

  for (const element of elements) {
    const contractElementId = element.element_id;
    for (const responsibility of CORE_RESPONSIBILITIES) {
      seeds.push(buildObligationSeed({
        view, primaryElement: element, supportingElements: [element], context,
        identity: {
          kind: 'integration', responsibility, scope: view.scope,
          contract_element_id: contractElementId,
          [responsibility]: element[responsibility]
        }
      }));
    }
    for (const sideEffect of objectArray(element.side_effects)) {
      seeds.push(buildObligationSeed({
        view, primaryElement: element, supportingElements: [element], context,
        identity: {
          kind: 'integration', responsibility: 'side-effect', scope: view.scope,
          contract_element_id: contractElementId,
          side_effect: sideEffect
        }
      }));
    }

    const elementId = String(element.element_id);
    for (const invariant of declarations(context, 'integrationInvariantsByElementId', elementId)) {
      if (typeof invariant.invariant !== 'string' || invariant.invariant.length === 0) continue;
      const accepted = acceptedDeclaration(invariant, claimsById, String(view.scope));
      if (!accepted) continue;
      const independent = independentContext(
        context, element, `invariant:${invariant.invariant}`, accepted.sourceClaimIds, accepted.oracleRefs
      );
      seeds.push(buildObligationSeed({
        view, primaryElement: independent.primaryElement, supportingElements: [element],
        context: independent.context, extraSourceClaimIds: accepted.sourceClaimIds,
        identity: {
          kind: 'integration', responsibility: 'invariant', scope: view.scope,
          contract_element_id: contractElementId,
          invariant: invariant.invariant
        }
      }));
    }

    for (const special of declarations(context, 'integrationSpecialResponsibilitiesByElementId', elementId)) {
      if (typeof special.type !== 'string' || !SPECIAL_TYPES.has(special.type)
        || typeof special.signal !== 'string'
        || special.signal.length === 0) continue;
      const accepted = acceptedDeclaration(special, claimsById, String(view.scope));
      if (!accepted) continue;
      const independent = independentContext(
        context, element, `${String(special.type)}:${special.signal}`,
        accepted.sourceClaimIds, accepted.oracleRefs
      );
      seeds.push(buildObligationSeed({
        view, primaryElement: independent.primaryElement, supportingElements: [element],
        context: independent.context, extraSourceClaimIds: accepted.sourceClaimIds,
        identity: {
          kind: 'integration', responsibility: special.type, scope: view.scope,
          contract_element_id: contractElementId, signal: special.signal
        }
      }));
    }
  }
  return finishObligationSeeds(seeds, 'integration');
}
