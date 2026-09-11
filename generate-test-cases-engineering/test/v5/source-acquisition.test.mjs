import assert from 'node:assert/strict';
import test from 'node:test';

import { applySourceBatch, deriveSourceRequests, validateSourceBootstrap } from '../../src/v5/source-acquisition.mjs';

/** @param {number} index @param {boolean} required */
function seed(index, required) {
  return { source_request_client_key: `seed-${index}`, source_role: index === 0 ? 'primary_prd' : 'reference', locator: { kind: 'inline_text', media_type: 'text/markdown', content: `Requirement ${index}` }, required };
}

test('source requests are stable, set-based, required-first, and batched at 16', () => {
  const bootstrap = validateSourceBootstrap({ source_request_seeds: Array.from({ length: 19 }, (_, index) => seed(index, index % 3 !== 0)) });
  const requests = deriveSourceRequests(bootstrap);
  assert.equal(new Set(requests.map((request) => request.request_id)).size, 19);
  assert.ok(requests.every((request) => /^srq5_[0-9a-f]{64}$/u.test(request.request_id)));
  assert.deepEqual(requests, [...requests].sort((left, right) => Number(right.required) - Number(left.required) || left.request_id.localeCompare(right.request_id)));
  assert.equal(requests.slice(0, 16).length, 16);

  const reordered = validateSourceBootstrap({ source_request_seeds: [...bootstrap.source_request_seeds].reverse() });
  assert.deepEqual(deriveSourceRequests(reordered), requests);
});

test('bootstrap rejects empty, all-optional, duplicate semantic seeds, and unsafe locators', () => {
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [] }), /RUN_ARGUMENT_INVALID/u);
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [seed(1, false)] }), /RUN_ARGUMENT_INVALID/u);
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [seed(1, true), { ...seed(1, true), source_request_client_key: 'different' }] }), /RUN_ARGUMENT_INVALID/u);
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [{ ...seed(1, true), locator: { kind: 'https_url', url: 'http://example.test' } }] }), /RUN_ARGUMENT_INVALID/u);
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [{ ...seed(1, true), locator: { kind: 'inline_text', media_type: 'text/plain', content: ' \n ' } }] }), /RUN_ARGUMENT_INVALID/u);
  assert.throws(() => validateSourceBootstrap({ source_request_seeds: [{ ...seed(1, true), locator: { kind: 'https_url', url: 'https://user@example.test/path' } }] }), /RUN_ARGUMENT_INVALID/u);
  const canonical = validateSourceBootstrap({ source_request_seeds: [{ ...seed(1, true), locator: { kind: 'https_url', url: 'HTTPS://EXAMPLE.TEST:443/A%2fb?q=X#Keep' } }] });
  assert.equal(canonical.source_request_seeds[0].locator.url, 'https://example.test/A%2fb?q=X#Keep');
});

test('source batch requires the complete advertised set and exact disposition/payload bindings', () => {
  const requests = deriveSourceRequests(validateSourceBootstrap({ source_request_seeds: [seed(1, true), seed(2, false)] }));
  assert.throws(() => applySourceBatch(requests, { request_ids: [requests[0].request_id], request_dispositions: [], source_payload: { kind: 'all_skipped_optional' } }), /SCHEMA_VALIDATION_FAILED/u);
  assert.throws(() => applySourceBatch(requests, { request_ids: requests.map((request) => request.request_id), request_dispositions: requests.map((request) => ({ request_id: request.request_id, outcome: 'skipped_optional', skip_reason: 'not needed' })), source_payload: { kind: 'all_skipped_optional' } }), /SCHEMA_VALIDATION_FAILED/u);

  const result = applySourceBatch(requests, {
    request_ids: requests.map((request) => request.request_id),
    request_dispositions: requests.map((request, index) => request.required
      ? { request_id: request.request_id, outcome: 'fulfilled', source_client_keys: [`source-${index}`] }
      : { request_id: request.request_id, outcome: 'skipped_optional', skip_reason: 'reference unavailable' }),
    source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'source-0', media_type: 'text/markdown', content: '# Accepted' }] } }
  });
  assert.equal(result.sourcePack?.sources.length, 1);
  assert.equal(result.dispositions.length, 2);
});

test('source objects may serve multiple requests but orphan objects and long skip reasons are rejected', () => {
  const requests = deriveSourceRequests(validateSourceBootstrap({ source_request_seeds: [seed(1, true), seed(2, true)] }));
  const shared = applySourceBatch(requests, {
    request_ids: requests.map((request) => request.request_id),
    request_dispositions: requests.map((request) => ({ request_id: request.request_id, outcome: 'fulfilled', source_client_keys: ['shared'] })),
    source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'shared', media_type: 'text/plain', content: 'one source' }] } }
  });
  assert.equal(shared.sourcePack?.sources.length, 1);
  assert.throws(() => applySourceBatch(requests, {
    request_ids: requests.map((request) => request.request_id),
    request_dispositions: requests.map((request) => ({ request_id: request.request_id, outcome: 'fulfilled', source_client_keys: ['shared'] })),
    source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'shared', media_type: 'text/plain', content: 'used' }, { source_client_key: 'orphan', media_type: 'text/plain', content: 'unused' }] } }
  }), /SCHEMA_VALIDATION_FAILED/u);
  const optional = deriveSourceRequests(validateSourceBootstrap({ source_request_seeds: [seed(1, true), seed(2, false)] }))[1];
  assert.throws(() => applySourceBatch([optional], {
    request_ids: [optional.request_id],
    request_dispositions: [{ request_id: optional.request_id, outcome: 'skipped_optional', skip_reason: 'x'.repeat(257) }],
    source_payload: { kind: 'all_skipped_optional' }
  }), /SCHEMA_VALIDATION_FAILED/u);
});
