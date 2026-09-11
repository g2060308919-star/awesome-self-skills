import { createHash } from 'node:crypto';

import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';

/** @param {string|any} value */
export function rawBytesDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {unknown} value */
export function canonicalObjectDigest(value) {
  return rawBytesDigest(canonicalV5Stringify(value));
}

/** @param {Record<string, any>} payload @param {string} digestField @returns {Record<string,any>} */
export function sealV5Record(payload, digestField) {
  if (Object.hasOwn(payload, digestField)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', `Caller must not submit compiler-owned ${digestField}.`);
  return { ...payload, [digestField]: canonicalObjectDigest(payload) };
}

/** @param {Record<string, any>} record @param {string} digestField @returns {Record<string,any>} */
export function verifyV5Record(record, digestField) {
  const declared = record[digestField];
  if (typeof declared !== 'string') throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', `${digestField} is missing.`);
  const { [digestField]: ignored, ...payload } = record;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', `${digestField} does not match record bytes.`);
  return record;
}

/** @param {'create'|'advance'} operation @param {unknown} payload */
export function actionDigestV5(operation, payload) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/idempotency-action', format_version: 1, operation, payload });
}
