export const LEGACY_V4_RUN_SCHEMA_VERSION = '4.0.0';
export const LEGACY_V4_RUN_COMPILER_VERSION = '0.5.0';
export const PREVIEW_REQUIRED_V4_RUN_SCHEMA_VERSION = '4.1.0';
export const PREVIEW_REQUIRED_V4_RUN_COMPILER_VERSION = '0.6.0';

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
export function isLegacyV4RunIdentity(value) {
  return record(value)
    && value.schema_version === LEGACY_V4_RUN_SCHEMA_VERSION
    && value.compiler_version === LEGACY_V4_RUN_COMPILER_VERSION;
}

/** @param {unknown} value */
export function isPreviewRequiredV4RunIdentity(value) {
  return record(value)
    && value.schema_version === PREVIEW_REQUIRED_V4_RUN_SCHEMA_VERSION
    && value.compiler_version === PREVIEW_REQUIRED_V4_RUN_COMPILER_VERSION;
}

/** @param {unknown} value */
export function isSupportedV4RunIdentity(value) {
  return isLegacyV4RunIdentity(value) || isPreviewRequiredV4RunIdentity(value);
}
