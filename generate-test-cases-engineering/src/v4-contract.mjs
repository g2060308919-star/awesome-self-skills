export const LEGACY_V4_CONTRACT = Object.freeze({
  schema_version: '4.0.0', compiler_version: '0.5.0', candidate: false
});

export const CANDIDATE_V4_CONTRACT = Object.freeze({
  schema_version: '4.2.0', compiler_version: '0.7.0', candidate: true
});

export const GENERAL_QUALITY_V4_CONTRACT = Object.freeze({
  schema_version: '4.3.0', compiler_version: '0.8.0', candidate: true,
  strict_semantic_delivery: true
});

const CONTRACTS = Object.freeze([
  LEGACY_V4_CONTRACT, CANDIDATE_V4_CONTRACT, GENERAL_QUALITY_V4_CONTRACT
]);

export function latestV4Contract() {
  return GENERAL_QUALITY_V4_CONTRACT;
}

/** @param {unknown} schemaVersion */
export function v4ContractForSchema(schemaVersion) {
  return CONTRACTS.find(item => item.schema_version === schemaVersion) ?? null;
}

/** @param {unknown} value */
export function v4ContractForIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const identity = /** @type {Record<string, unknown>} */ (value);
  return CONTRACTS.find(item => item.schema_version === identity.schema_version
    && item.compiler_version === identity.compiler_version) ?? null;
}

/** @param {unknown} schemaVersion */
export function isV4SchemaVersion(schemaVersion) {
  return v4ContractForSchema(schemaVersion) !== null;
}

/** @param {unknown} value */
export function isCandidateV4Contract(value) {
  return v4ContractForIdentity(value)?.candidate === true;
}

/** @param {unknown} schemaVersion */
export function isCandidateV4SchemaVersion(schemaVersion) {
  return v4ContractForSchema(schemaVersion)?.candidate === true;
}

/** @param {unknown} value */
export function isGeneralQualityV4Contract(value) {
  return v4ContractForIdentity(value) === GENERAL_QUALITY_V4_CONTRACT;
}

/** @param {unknown} value */
export function requireV4Contract(value) {
  const contract = v4ContractForIdentity(value);
  if (!contract) throw new TypeError('V4_CONTRACT_UNSUPPORTED');
  return contract;
}
