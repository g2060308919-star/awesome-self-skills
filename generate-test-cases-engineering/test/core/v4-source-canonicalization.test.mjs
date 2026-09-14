import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digest, stableId } from '../../src/canonical.mjs';

// Missing APIs are asserted per test, not hidden by an import-time failure.
const moduleUrl = new URL('../../src/source-canonicalization.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {string} name @param {...any} args */
function call(name, ...args) {
  assert.equal(typeof api[name], 'function', name + ' must be implemented');
  return api[name](...args);
}
function registry() {
  return call('createSourceProviderRegistry', [
    { provider: 'cooper', version: '1', hosts: ['cooper.example.test', 'prd-assets.example.invalid'], kind: 'cooper', query_order: 'sensitive' },
    { provider: 'ordered-storage', version: '2', hosts: ['storage.example.test'], kind: 'other', query_order: 'insensitive' }
  ]);
}
/** @param {string} url */
const canonical = (url) => call('canonicalizeSourceUrl', url, registry());
/** @param {string|Uint8Array} content @param {any} [overrides] */
function capture(content, overrides = {}) {
  return call('canonicalizeSourceCapture', {
    stable_source_id: 'SOURCE-review', source_type: 'prd',
    capture_bytes: typeof content === 'string' ? new TextEncoder().encode(content) : content,
    assets: [], ...overrides
  }, registry());
}

test('T11 URL registry matches an exact trusted host and rejects ambiguous provider contracts', () => {
  assert.equal(canonical('https://cooper.example.test/doc').provider, 'cooper');
  assert.equal(canonical('https://cooper.example.test.evil.test/doc?token=DO_NOT_PERSIST').status, 'need_artifact');
  assert.throws(() => call('createSourceProviderRegistry', [
    { provider: 'a', version: '1', hosts: ['same.example.test'], kind: 'other', query_order: 'sensitive', credential_keys: [] },
    { provider: 'b', version: '1', hosts: ['same.example.test'], kind: 'other', query_order: 'sensitive', credential_keys: [] }
  ]), /SOURCE_PROVIDER_REGISTRY_INVALID/);
});

test('T11 Cooper removes every repeated case-insensitive and encoded frozen credential key', () => {
  const keys = ['x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-expires',
    'x-amz-signedheaders', 'x-amz-signature', 'x-amz-security-token', 'ossaccesskeyid',
    'signature', 'expires', 'security-token', 'x-oss-security-token'];
  const pairs = keys.flatMap((key) => [
    key.toUpperCase() + '=SECRET_ONE',
    key.replace(/^./u, (first) => '%' + first.charCodeAt(0).toString(16)) + '=SECRET_TWO'
  ]);
  const result = canonical('HTTPS://COOPER.EXAMPLE.TEST:443/a/%7e/b?business=22&' + pairs.join('&') + '#private-fragment');
  assert.equal(result.status, 'canonical');
  assert.equal(result.canonical_uri, 'https://cooper.example.test/a/~/b?business=22');
  assert.doesNotMatch(JSON.stringify(result), /SECRET_|private-fragment|x-amz-credential/iu);
});

for (const [left, right, equal] of [
  ['?id=1&id=2', '?id=2&id=1', false],
  ['?a=1&b=2', '?b=2&a=1', false],
  ['?a=1', '?a=2', false],
  ['?a=%7e', '?a=~', true],
  ['?value=a+b', '?value=a%20b', true],
  ['#one', '#two', true]
]) {
  test('T11 ordinary query identity ' + left + ' versus ' + right, () => {
    const a = canonical('https://unknown.example.test/a' + left);
    const b = canonical('https://unknown.example.test/a' + right);
    assert.equal(a.status, 'canonical');
    assert.equal(b.status, 'canonical');
    assert.equal(a.canonical_uri === b.canonical_uri, equal);
  });
}

test('T11 only a versioned insensitive provider may reorder ordinary query pairs', () => {
  const a = canonical('https://storage.example.test/a?b=2&a=1');
  const b = canonical('https://storage.example.test/a?a=1&b=2');
  assert.equal(a.canonical_uri, b.canonical_uri);
  assert.equal(a.provider_contract_version, '2');
  assert.notEqual(a.ordinary_query_digest, b.ordinary_query_digest, 'request context keeps original pair order even when semantic URL order is insensitive');
});

test('T11 non-Cooper provider contracts cannot grant arbitrary query-deletion authority', () => {
  assert.throws(() => call('createSourceProviderRegistry', [{
    provider: 'unsafe-config', version: '1', hosts: ['business.example.test'],
    kind: 'other', query_order: 'sensitive', credential_keys: ['businessFilter']
  }]), /SOURCE_PROVIDER_REGISTRY_INVALID/);

  const other = call('createSourceProviderRegistry', [{
    provider: 'ordinary-provider', version: '1', hosts: ['ordinary.example.test'],
    kind: 'other', query_order: 'sensitive'
  }]);
  const business = call('canonicalizeSourceUrl',
    'https://ordinary.example.test/list?businessFilter=taxi', other);
  assert.equal(business.status, 'canonical');
  assert.match(business.canonical_uri, /businessFilter=taxi/u);
  assert.equal(call('canonicalizeSourceUrl',
    'https://ordinary.example.test/list?signature=SECRET', other).status, 'need_artifact');
});

for (const key of ['signature', '%74oKeN', 'x-amz-unregistered', 'SIG', 'security-token', 'credential', 'accesskey', 'expires', 'x-oss-custom']) {
  test('T11 unknown credential key ' + key + ' is quarantined without query disclosure', () => {
    const result = canonical('https://unknown.example.test/a?id=PRIVATE_BUSINESS&' + key + '=VERY_PRIVATE_CREDENTIAL');
    assert.equal(result.status, 'need_artifact');
    assert.equal(result.reason_code, 'UNSUPPORTED_SIGNED_URL_PROVIDER');
    assert.equal(result.redacted_resource_ref, 'unknown.example.test/a');
    assert.match(result.ordinary_query_digest, /^sha256:[0-9a-f]{64}$/u);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_BUSINESS|VERY_PRIVATE_CREDENTIAL|\?|#/u);
    assert.equal(Object.hasOwn(result, 'canonical_uri'), false);
  });
}

test('T11 quarantine distinguishes ordinary values but ignores credential rotations', () => {
  const a = canonical('https://unknown.example.test/a?id=1&signature=ONE');
  const b = canonical('https://unknown.example.test/a?id=2&signature=TWO');
  const rotated = canonical('https://unknown.example.test/a?id=1&signature=TWO');
  assert.notEqual(a.ordinary_query_digest, b.ordinary_query_digest);
  assert.equal(a.ordinary_query_digest, rotated.ordinary_query_digest);
});

for (const url of ['https://cooper.example.test/a?token=PRIVATE_TOKEN',
  'https://name:PRIVATE_PASSWORD@unknown.example.test/a',
  'javascript:alert(1)', 'https://unknown.example.test/%zz', 'https://unknown.example.test/a?%FF=1']) {
  test('T11 unsupported credentials or malformed URI cannot become persistable content: ' + url.split('?')[0].replace('PRIVATE_PASSWORD', '<redacted>'), () => {
    const result = canonical(url);
    assert.notEqual(result.status, 'canonical');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TOKEN|PRIVATE_PASSWORD|alert/u);
  });
}

test('T11 source strict UTF8/BOM/LF/NFC normalization separates capture from semantic digest', () => {
  const a = capture('\ufeffCafe\u0301\r\n下一行\r末行');
  const b = capture('Café\n下一行\n末行');
  assert.equal(a.status, 'canonical');
  assert.notEqual(a.capture_digest, b.capture_digest);
  assert.equal(a.semantic_digest, b.semantic_digest);
  assert.equal(a.semantic_projection.content, 'Café\n下一行\n末行');
  assert.equal(a.semantic_digest, 'sha256:' + digest(a.semantic_projection));
  assert.equal(capture(new Uint8Array([0xc3, 0x28])).status, 'source_diagnostic');
});

test('T11 Markdown and HTML URL destinations normalize without retaining credentials', () => {
  const a = capture('[PRD](https://cooper.example.test/a?id=22&X-Amz-Credential=PRIVATE_ONE&signature=ONE)\n<img src="https://cooper.example.test/p.png?id=1&amp;signature=ONE">');
  const b = capture('[PRD](https://cooper.example.test/a?id=22&signature=TWO)\n<img src="https://cooper.example.test/p.png?id=1&amp;signature=TWO">');
  assert.equal(a.status, 'canonical');
  assert.equal(a.semantic_digest, b.semantic_digest);
  assert.doesNotMatch(JSON.stringify(a), /PRIVATE_ONE|X-Amz-Credential|signature=/iu);
  assert.match(a.semantic_projection.content, /id=22/u);
});

for (const content of ['[broken](https://cooper.example.test/a?signature=SECRET',
  '<img src="https://cooper.example.test/a?signature=SECRET>',
  '[bad](https://cooper.example.test/%zz)']) {
  test('T11 malformed Markdown/HTML URL returns a redacted source diagnostic', () => {
    const result = capture(content);
    assert.equal(result.status, 'source_diagnostic');
    assert.doesNotMatch(JSON.stringify(result), /SECRET|signature=/iu);
  });
}

test('T11 unknown signed source content never returns a partial accepted projection', () => {
  const result = capture('Business rule. [source](https://unknown.example.test/a?id=HIDDEN_QUERY&token=HIDDEN_TOKEN)');
  assert.equal(result.status, 'need_artifact');
  assert.equal(Object.hasOwn(result, 'semantic_projection'), false);
  assert.doesNotMatch(JSON.stringify(result), /HIDDEN_QUERY|HIDDEN_TOKEN|\?/u);
});

test('T11 the supplied signed-source fixtures have equal semantic identity across run metadata', async () => {
  const root = new URL('../fixtures/v4/bend-review-platform/', import.meta.url);
  const a = capture(await readFile(new URL('signed-source-a.md', root)), { run_id: 'RUN-one', revision: 1, captured_at: 'yesterday', file_path: '/private/one' });
  const b = capture(await readFile(new URL('signed-source-b.md', root)), { run_id: 'RUN-two', revision: 9, captured_at: 'today', file_path: '/private/two' });
  assert.equal(a.status, 'canonical');
  assert.equal(b.status, 'canonical');
  assert.notEqual(a.capture_digest, b.capture_digest);
  assert.equal(a.semantic_digest, b.semantic_digest);
  assert.deepEqual(a.semantic_projection, b.semantic_projection);
  assert.equal(stableId('fact', { subject: 'source22', source: a.semantic_digest }),
    stableId('fact', { subject: 'source22', source: b.semantic_digest }));
  assert.equal(stableId('case', { outcome: 'source22-label', source: a.semantic_digest }),
    stableId('case', { outcome: 'source22-label', source: b.semantic_digest }));
  assert.doesNotMatch(JSON.stringify(a.semantic_projection), /RUN-one|yesterday|private\/one/u);
});

test('T11 assets use actual byte digests, sorted canonical identities and no retrieval paths', () => {
  const a = { retrieval_uri: 'https://cooper.example.test/z.png?signature=ONE', bytes: new TextEncoder().encode('image-a'), local_path: '/private/image-a' };
  const b = { retrieval_uri: 'https://cooper.example.test/a.png?signature=TWO', bytes: new TextEncoder().encode('image-b') };
  const first = capture('A business rule.', { assets: [a, b, a] });
  const reordered = capture('A business rule.', { assets: [b, a] });
  assert.equal(first.status, 'canonical');
  assert.equal(first.semantic_projection.assets.length, 2);
  assert.equal(first.semantic_digest, reordered.semantic_digest);
  const changed = capture('A business rule.', { assets: [{ ...a, bytes: new TextEncoder().encode('new-image') }, b] });
  assert.notEqual(first.semantic_digest, changed.semantic_digest);
  assert.doesNotMatch(JSON.stringify(first), /signature|private\/image|image-a|image-b/iu);
});

for (const attribute of [
  'srcset="https&colon;//unknown.example.test/image?token=SECRET_ATTR 1x"',
  'data-url="h&#116;tps://unknown.example.test/image?token=SECRET_ATTR"'
]) test('T11 unsupported HTML URL attributes fail closed instead of persisting entity-obscured credentials: ' + attribute.split('=')[0], () => {
  const result = capture('<img ' + attribute + '>');
  assert.equal(result.status, 'source_diagnostic');
  assert.doesNotMatch(JSON.stringify(result), /SECRET_ATTR|token=|unknown\.example/);
});

test('T11 standard single-URL HTML attributes use the same provider-aware credential policy', () => {
  const first = capture('<video poster="https&colon;//cooper.example.test/poster?signature=ONE"></video>');
  const second = capture('<video poster="https://cooper.example.test/poster?signature=TWO"></video>');
  assert.equal(first.status, 'canonical');
  assert.equal(first.semantic_digest, second.semantic_digest);
  assert.equal(first.semantic_projection.content, '<video poster="https://cooper.example.test/poster"></video>');
});
