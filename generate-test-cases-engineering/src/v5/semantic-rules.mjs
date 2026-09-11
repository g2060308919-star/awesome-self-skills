import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { sealV5Record } from './storage-records.mjs';

const RULE_KINDS = new Set(['locator', 'key_normalization', 'transform', 'value_normalization', 'null_policy', 'semantic_equivalence']);

/** @param {string} semanticRootDigest @param {{registry_digest:string,registered_rules:Array<Record<string,any>>,accepted_rule_contract_refs:Array<Record<string,any>>}} input */
export function createSemanticRuleIndex(semanticRootDigest, input) {
  const registered = [...input.registered_rules].sort((left, right) => left.rule_id.localeCompare(right.rule_id));
  const accepted = [...input.accepted_rule_contract_refs].sort((left, right) => left.contract_id.localeCompare(right.contract_id));
  if (registered.some((row) => !RULE_KINDS.has(row.rule_kind)) || new Set(registered.map((row) => row.rule_id)).size !== registered.length || new Set(accepted.map((row) => row.contract_id)).size !== accepted.length) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'Semantic rule index contains duplicates or unknown kinds.');
  return sealV5Record({ semantic_root_digest: semanticRootDigest, registry_digest: input.registry_digest, registered_rules: registered, accepted_rule_contract_refs: accepted }, 'index_digest');
}

/** @param {unknown} ref @param {string} expectedKind @param {Record<string,any>} index */
export function resolveSemanticRuleRef(ref, expectedKind, index) {
  if (!ref || typeof ref !== 'object' || !RULE_KINDS.has(expectedKind)) throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', 'Semantic rule reference is not typed.');
  const value = /** @type {Record<string,any>} */ (ref);
  if (value.source === 'closed_registry') {
    const row = /** @type {Array<Record<string, any>>} */ (index.registered_rules).find((item) => item.rule_id === value.rule_id);
    if (!row || value.registry_digest !== index.registry_digest || value.rule_kind !== expectedKind || canonicalV5Stringify(row) !== canonicalV5Stringify({ rule_id: value.rule_id, rule_kind: value.rule_kind, implementation_digest: value.implementation_digest })) throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', 'Closed Registry rule reference does not resolve exactly.');
    return structuredClone(value);
  }
  if (value.source === 'accepted_contract') {
    const row = /** @type {Array<Record<string, any>>} */ (index.accepted_rule_contract_refs).find((item) => item.contract_id === value.ref?.contract_id);
    if (!row || value.ref.contract_kind !== expectedKind || value.ref.semantic_root_digest !== index.semantic_root_digest || canonicalV5Stringify(row) !== canonicalV5Stringify(value.ref)) throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', 'Accepted semantic rule reference does not resolve in the current root.');
    return structuredClone(value);
  }
  throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', 'Bare semantic rule IDs are forbidden.');
}
