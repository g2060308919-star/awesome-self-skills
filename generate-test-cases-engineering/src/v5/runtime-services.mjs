import { createHash, randomUUID } from 'node:crypto';

/** @type {{seed:string,sequence:number,crashPoint?:string}|null} */
let testProfile = null;

/** @param {string} seed @param {{crashPoint?:string}} [options] */
export function installV5DeterministicTestProfile(seed, options = {}) {
  if (typeof seed !== 'string' || seed.length === 0 || testProfile !== null) throw new Error('V5_TEST_PROFILE_INVALID');
  const previous = testProfile;
  testProfile = { seed, sequence: 0, crashPoint: options.crashPoint };
  return () => { testProfile = previous; };
}

export function runtimeV5Uuid() {
  if (!testProfile) return randomUUID();
  const hex = createHash('sha256').update(`${testProfile.seed}\0${testProfile.sequence += 1}`).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export function runtimeV5ActionKeyring() {
  if (testProfile) return { current: { key_id: 'fixture-v1', key: createHash('sha256').update(`generate-test-cases/v5/fixture-key\0${testProfile.seed}`).digest() }, retained: [] };
  const encoded = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY;
  const keyId = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID ?? 'default';
  const key = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  return { current: { key_id: keyId, key }, retained: [] };
}

export function currentV5TransactionServices() {
  return testProfile?.crashPoint ? { failAt: testProfile.crashPoint } : {};
}
