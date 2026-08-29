import { scopeContains } from '../decision-record.mjs';
import {
  assertViewType, buildObligationSeed, claimsByIdFrom, elementEvidenceRefs,
  finishObligationSeeds, isObject, objectArray, sortedStrings
} from './registry.mjs';

const SPECIAL_TYPES = new Set(['timeout', 'retry']);

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

/** @param {unknown} context @param {string} elementId */
function specialResponsibilities(context, elementId) {
  if (!isObject(context)) return [];
  return objectArray(keyedValue(context.timingSpecialResponsibilitiesByElementId, elementId));
}

/**
 * Give an evidence-backed special responsibility an independent Oracle mapping
 * while retaining the real validated view element as its only view reference.
 * @param {unknown} context
 * @param {Record<string, unknown>} element
 * @param {Record<string, unknown>} special
 */
function specialInput(context, element, special) {
  if (!isObject(context)) throw new TypeError('obligation compilation context must be an object');
  const baseId = String(element.element_id);
  const signal = String(special.signal);
  const syntheticId = `${baseId}::${String(special.type)}:${signal}`;
  const sourceClaimIds = sortedStrings(special.source_claim_ids, true);
  const oracleRefs = sortedStrings(special.required_oracle_refs, true);
  const primaryElement = {
    ...element,
    element_id: syntheticId,
    source_claim_ids: sortedStrings([...elementEvidenceRefs(element), ...sourceClaimIds], true),
    model_refs: []
  };
  const specialContext = {
    ...context,
    riskByElementId: new Map([[syntheticId, keyedValue(context.riskByElementId, baseId)]]),
    requiredOracleRefsByElementId: new Map([[syntheticId, oracleRefs]]),
    requiredCapabilitiesByElementId: new Map([[
      syntheticId, keyedValue(context.requiredCapabilitiesByElementId, baseId)
    ]])
  };
  return { primaryElement, specialContext, sourceClaimIds };
}

/**
 * Compile before/equal/after threshold semantics and only explicitly evidenced
 * timeout/retry signals. No concrete neighboring time value is invented.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'timing');
  const elements = objectArray(view.elements).filter((element) => element.kind === 'timing-rule');
  const claimsById = claimsByIdFrom(context);
  /** @type {import('./registry.mjs').ObligationSeed[]} */
  const seeds = [];

  for (const element of elements) {
    for (const relation of ['before', 'equal', 'after']) {
      seeds.push(buildObligationSeed({
        view, primaryElement: element, supportingElements: [element], context,
        identity: {
          kind: 'timing', responsibility: 'threshold', scope: view.scope,
          timing_event: element.timing_event, threshold: element.threshold,
          threshold_relation: relation
        }
      }));
    }

    for (const special of specialResponsibilities(context, String(element.element_id))) {
      if (typeof special.type !== 'string' || !SPECIAL_TYPES.has(special.type)
        || typeof special.signal !== 'string'
        || special.signal.length === 0) continue;
      const sourceClaimIds = sortedStrings(special.source_claim_ids, true);
      if (sourceClaimIds.length === 0 || sourceClaimIds.some((claimId) => {
        const claim = claimsById.get(claimId);
        return !claim || !isAcceptedSignal(claim, String(view.scope));
      })) continue;
      const { primaryElement, specialContext } = specialInput(context, element, special);
      seeds.push(buildObligationSeed({
        view, primaryElement, supportingElements: [element], context: specialContext,
        extraSourceClaimIds: sourceClaimIds,
        identity: {
          kind: 'timing', responsibility: special.type, scope: view.scope,
          timing_event: element.timing_event, threshold: element.threshold, signal: special.signal
        }
      }));
    }
  }
  return finishObligationSeeds(seeds, 'timing');
}
