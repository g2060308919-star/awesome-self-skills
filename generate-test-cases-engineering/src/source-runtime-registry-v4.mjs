import { createExpiryMatcherRegistry } from './source-capture-audit.mjs';
import { createSourceProviderRegistry } from './source-canonicalization.mjs';

/**
 * Compiler-owned source runtime contracts. These values are deliberately not
 * accepted from Source Pack or any other Agent-writable artifact.
 *
 * The fixture hosts exercise the same exact-host rules used by the production
 * runner without giving an Adapter authority to add query-deletion keys.
 */
const PROVIDER_CONTRACTS_V1 = Object.freeze([Object.freeze({
  provider: 'cooper', version: '1',
  hosts: Object.freeze(['cooper.test', 'cooper.example.test', 'prd-assets.example.invalid']),
  kind: 'cooper', query_order: 'sensitive'
})]);

const EXPIRY_MATCHERS_V1 = Object.freeze([Object.freeze({
  provider: 'cooper', provider_contract_version: '1',
  matcher_version: 'cooper-expiry-v1',
  prefix: '<span data-cooper-expiry="v1">临时链接将在 ',
  suffix: ' 小时后过期</span>'
})]);

export const SOURCE_RUNTIME_REGISTRY_VERSION_V4 = 'source-runtime-v1';

/** Return fresh opaque registries backed only by the frozen compiler table. */
export function createCompilerSourceRuntimeV4() {
  return {
    registry_version: SOURCE_RUNTIME_REGISTRY_VERSION_V4,
    provider_registry: createSourceProviderRegistry([...PROVIDER_CONTRACTS_V1]),
    expiry_registry: createExpiryMatcherRegistry([...EXPIRY_MATCHERS_V1])
  };
}
