import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { sealV5Record } from './storage-records.mjs';

/** @param {{key_id:string,key:any}} keyRecord */
function validateKey(keyRecord) {
  if (!keyRecord || !/^[A-Za-z0-9_-]{1,64}$/u.test(keyRecord.key_id) || !Buffer.isBuffer(keyRecord.key) || keyRecord.key.length < 32) throw new V5ProtocolError('ACTION_TOKEN_KEY_UNAVAILABLE', 'Action-token key is unavailable.');
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} capability */
function selectorPreimage(checkpoint, capability) {
  return {
    namespace: 'generate-test-cases/v5/action-selector', format_version: 1,
    run_id: checkpoint.run_id, run_lifecycle: checkpoint.run_lifecycle,
    stage: checkpoint.stage, obligation: checkpoint.obligation, fsm_cell_id: checkpoint.fsm_cell_id,
    current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest,
    semantic_root_digest: checkpoint.semantic_root_digest ?? null,
    presentation_digest: checkpoint.presentation_digest ?? null,
    preview_digest: checkpoint.preview_digest ?? null,
    capability
  };
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} capability @param {{key_id:string,key:any}} keyRecord */
function tokenFor(checkpoint, capability, keyRecord) {
  validateKey(keyRecord);
  const derived = Buffer.from(hkdfSync('sha256', keyRecord.key, Buffer.from(checkpoint.run_id), Buffer.from('generate-test-cases/v5/action-token/v1'), 32));
  const mac = createHmac('sha256', derived).update(canonicalV5Stringify(selectorPreimage(checkpoint, capability))).digest('base64url');
  derived.fill(0);
  return `v5a.${keyRecord.key_id}.${mac}`;
}

/** @param {Record<string, any>} checkpoint @param {Array<Record<string, any>>} capabilities @param {{current:{key_id:string,key:any},retained?:Array<{key_id:string,key:any}>}} keyring @returns {{selectors:Array<Record<string,any>>,sidecar:Record<string,any>}} */
export function issueSelectors(checkpoint, capabilities, keyring) {
  validateKey(keyring.current);
  const selectors = capabilities.map((capability) => ({ capability: structuredClone(capability), action_token: tokenFor(checkpoint, capability, keyring.current) }));
  const sidecarBase = {
    kind: 'v5_selector_sidecar', schema_version: '5.0.0', run_id: checkpoint.run_id,
    checkpoint_digest: checkpoint.checkpoint_digest,
    selectors: selectors.map((selector) => ({ capability: selector.capability, key_id: keyring.current.key_id, token_digest: `sha256:${createHash('sha256').update(selector.action_token).digest('hex')}` }))
  };
  return { selectors, sidecar: sealV5Record(sidecarBase, 'selector_sidecar_digest') };
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} capability @param {string} token @param {{current:{key_id:string,key:any},retained?:Array<{key_id:string,key:any}>}} keyring */
export function verifySelector(checkpoint, capability, token, keyring) {
  if (typeof token !== 'string') throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action token is invalid.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v5a') throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action token is invalid.');
  const keys = [keyring.current, ...(keyring.retained ?? [])];
  const keyRecord = keys.find((entry) => entry.key_id === parts[1]);
  if (!keyRecord) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action token key is not retained.');
  const expected = Buffer.from(tokenFor(checkpoint, capability, keyRecord));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action token does not bind the current checkpoint and capability.');
  return true;
}
