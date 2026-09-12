import { createHash, randomBytes, randomUUID } from 'node:crypto';

/** @type {{seed:string,sequence:number,clockSequence:number,crashPoint?:string}|null} */
let testProfile = null;

/** @param {string} seed @param {{crashPoint?:string}} [options] */
export function installV5DeterministicTestProfile(seed, options = {}) {
  if (typeof seed !== 'string' || seed.length === 0 || testProfile !== null) throw new Error('V5_TEST_PROFILE_INVALID');
  const previous = testProfile;
  testProfile = { seed, sequence: 0, clockSequence: 0, crashPoint: options.crashPoint };
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

export function runtimeV5Clock() {
  if (!testProfile) return Date.now();
  const seedMillis = Number.parseInt(createHash('sha256').update(`generate-test-cases/v5/fixture-clock\0${testProfile.seed}`).digest('hex').slice(0, 12), 16);
  return seedMillis + testProfile.clockSequence++;
}

/** @param {number} byteLength */
export function runtimeV5Entropy(byteLength) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 1) throw new Error('V5_ENTROPY_LENGTH_INVALID');
  if (!testProfile) return randomBytes(byteLength);
  const chunks = [];
  while (Buffer.concat(chunks).length < byteLength) chunks.push(createHash('sha256').update(`${testProfile.seed}\0entropy\0${testProfile.sequence += 1}`).digest());
  return Buffer.concat(chunks).subarray(0, byteLength);
}

export function currentV5TransactionServices() {
  return testProfile?.crashPoint ? { failAt: testProfile.crashPoint } : {};
}
