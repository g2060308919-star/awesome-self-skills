import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceByteDigest, createSourceProviderRegistry } from '../../src/source-canonicalization.mjs';

const moduleUrl = new URL('../../src/source-capture-audit.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {string} name @param {...any} args */
function call(name, ...args) { assert.equal(typeof api[name], 'function', name + ' is required'); return api[name](...args); }
const urlRegistry = createSourceProviderRegistry([{ provider: 'cooper', version: '1', hosts: ['cooper.example.test'], kind: 'cooper', query_order: 'sensitive' }]);
const prefix = '<span data-cooper-expiry="v1">临时链接将在 ';
const suffix = ' 小时后过期</span>';
function matchers() {
  return call('createExpiryMatcherRegistry', [{ provider: 'cooper', provider_contract_version: '1', matcher_version: 'cooper-expiry-1', prefix, suffix }]);
}
/** @param {string} content @param {any} [acquisition] */
function capture(content, acquisition = { provider: 'cooper', provider_contract_version: '1' }) {
  return call('canonicalizeAuditedSourceCapture', { stable_source_id: 'S-1', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: [] }, urlRegistry, acquisition, matchers());
}
/** @param {Uint8Array} bytes @param {any} audit */
function verifyAudit(bytes, audit) { return call('validateCaptureAudit', bytes, audit, urlRegistry, { provider: 'cooper', provider_contract_version: '1' }, matchers()); }

test('T11 expiry exact versioned machine template changes capture but not semantic identity', () => {
  const before = '🧪规则必须保留。'; const after = '\n余额不可为负。';
  const a = before + prefix + '1' + suffix + after;
  const b = before + prefix + '24' + suffix + after;
  const first = capture(a); const second = capture(b);
  assert.equal(first.status, 'canonical');
  assert.notEqual(first.capture_digest, second.capture_digest);
  assert.equal(first.semantic_digest, second.semantic_digest);
  assert.equal(first.semantic_projection.content, before + after);
  assert.deepEqual(first.capture_audit.semantic_exclusions[0], {
    capture_unit_id: 'capture_document', capture_locator: { start: Array.from(before).length, end: Array.from(before + prefix + '1' + suffix).length },
    capture_excerpt_digest: sourceByteDigest(new TextEncoder().encode(prefix + '1' + suffix)),
    reason_code: 'provider_expiry_banner', matcher_version: 'cooper-expiry-1'
  });
  assert.equal(first.capture_audit.capture_digest, first.capture_digest);
  assert.equal(second.capture_audit.capture_digest, second.capture_digest);
  assert.doesNotMatch(JSON.stringify(first), /临时链接将在|data-cooper-expiry|signature=/);
  assert.deepEqual(verifyAudit(new TextEncoder().encode(a), first.capture_audit), []);
});

for (const [name, content, provider] of /** @type {[string,string,any][]} */ ([
  ['same business wording', '临时链接将在 2 小时后过期，但业务规则保留该提示。', { provider: 'cooper', provider_contract_version: '1' }],
  ['non-Cooper provider', prefix + '2' + suffix, { provider: 'other', provider_contract_version: '1' }],
  ['unregistered contract version', prefix + '2' + suffix, { provider: 'cooper', provider_contract_version: '2' }],
  ['new template version', '<span data-cooper-expiry="v2">临时链接将在 2 小时后过期</span>', { provider: 'cooper', provider_contract_version: '1' }],
  ['keyword only', '<span data-cooper-expiry="v1">临时链接将在 sometime 小时后过期</span>', { provider: 'cooper', provider_contract_version: '1' }]
])) test('T11 expiry preserves ' + name, () => {
  const result = capture(content, provider);
  assert.equal(result.status, 'canonical');
  assert.equal(result.semantic_projection.content, content);
  assert.deepEqual(result.capture_audit.semantic_exclusions, []);
});

test('T11 capture retained/excluded Unicode scalar intervals are exact, ordered, disjoint and nonempty', () => {
  const content = '😀e\u0301\r\nA' + prefix + '2' + suffix + '終';
  const capturedBytes = new TextEncoder().encode(content);
  const result = capture(content);
  const unit = result.capture_audit.units[0];
  assert.equal(unit.capture_scalar_count, Array.from(content).length);
  assert.equal(unit.capture_unit_digest, sourceByteDigest(capturedBytes));
  assert.deepEqual(verifyAudit(capturedBytes, result.capture_audit), []);
  for (const mutate of [
    (/** @type {any} */ audit) => { audit.units[0].retained_spans[0].end -= 1; },
    (/** @type {any} */ audit) => { audit.units[0].retained_spans[0].end += 1; },
    (/** @type {any} */ audit) => { audit.units[0].retained_spans[0].end = audit.units[0].retained_spans[0].start; },
    (/** @type {any} */ audit) => { audit.semantic_exclusions[0].capture_excerpt_digest = 'sha256:' + '0'.repeat(64); },
    (/** @type {any} */ audit) => { audit.capture_digest = 'sha256:' + '0'.repeat(64); },
    (/** @type {any} */ audit) => { audit.semantic_exclusions[0].matcher_version = 'forged-matcher'; }
  ]) { const bad = structuredClone(result.capture_audit); mutate(bad); assert.notDeepEqual(verifyAudit(capturedBytes, bad), []); }
});

test('T11 audit verifier rejects a digest-correct but unauthorized exclusion of business text', () => {
  const content = '业务规则必须保留。' + prefix + '1' + suffix;
  const bytes = new TextEncoder().encode(content); const result = capture(content);
  const bad = structuredClone(result.capture_audit);
  bad.units[0].retained_spans = []; bad.units[0].semantic_scalar_count = 0;
  bad.semantic_exclusions[0].capture_locator = { start: 0, end: Array.from(content).length };
  bad.semantic_exclusions[0].capture_excerpt_digest = sourceByteDigest(bytes);
  assert.notDeepEqual(verifyAudit(bytes, bad), []);
});

test('T11 expiry mapping does not retain URL credentials or bypass malformed URL validation', () => {
  const content = '[图](https://cooper.example.test/doc?signature=CAPTURE_SECRET)\n' + prefix + '1' + suffix;
  const result = capture(content);
  assert.equal(result.status, 'canonical');
  assert.equal(result.semantic_projection.content, '[图](https://cooper.example.test/doc)\n');
  assert.doesNotMatch(JSON.stringify(result), /CAPTURE_SECRET|signature=|临时链接将在/);
  assert.equal(capture('[bad](https://cooper.example.test/%ZZ)' + prefix + '1' + suffix).status, 'source_diagnostic');
});
