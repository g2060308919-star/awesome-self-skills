import assert from 'node:assert/strict';
import test from 'node:test';
import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { digest } from '../../src/canonical.mjs';
import { createArtifactRequest, createArtifactResumeRef, createProvideArtifactEvent } from '../../src/source-events.mjs';
import { canonicalizeSourceUrl, createSourceProviderRegistry, sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const replies = /** @type {any} */ (await import('../../src/stop-replies-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));
/** @param {string} value */
const bytes = value => new TextEncoder().encode(value);
/** @param {unknown} value */
const hash = value => 'sha256:' + digest(value);
const registry = createSourceProviderRegistry([{ provider: 'known', version: '1', hosts: ['known.example.test'], kind: 'other', query_order: 'sensitive' }]);

function state(reasonCode = 'UNSUPPORTED_SIGNED_URL_PROVIDER') {
  const parsed = canonicalizeSourceUrl(reasonCode === 'UNSUPPORTED_SIGNED_URL_PROVIDER'
    ? 'https://unknown.example.test/file?id=7&signature=TOP_SECRET'
    : 'https://known.example.test/file?id=7', registry);
  const context = {
    run_id: 'RUN-source', committed_revision: 2, stable_source_id: 'SRC-prd',
    structural_locator: { kind: 'image', image_index: 1 }, url_ordinal: 0,
    reason_code: reasonCode
  };
  const request = createArtifactRequest(context, parsed);
  const checkpoint = bytes('{"revision":2}\n');
  const resume = createArtifactResumeRef({ run_id: context.run_id, committed_revision: 2,
    checkpoint_bytes: checkpoint, artifact_requests: [request] });
  return { context, request, resume };
}

test('v4 source failures become a complete schema-valid need_artifact reply without credential echo', () => {
  assert.equal(typeof replies.createNeedArtifactReplyV4, 'function');
  for (const code of ['SOURCE_ASSET_UNAVAILABLE', 'UNSUPPORTED_SIGNED_URL_PROVIDER']) {
    const value = state(code);
    const reply = replies.createNeedArtifactReplyV4({
      run_id: value.context.run_id, artifact_requests: [value.request], resume_ref: value.resume,
      produced_artifacts: [], non_blocking_diagnostics: []
    });
    assert.deepEqual(validateAgainstSchema(reply, { $ref: '#/$defs/needArtifactReply', $defs: replySchema.$defs }), []);
    assert.equal(reply.status, 'need_artifact');
    assert.deepEqual(reply.available_actions, ['provide_artifact', 'cancel_run']);
    assert.deepEqual(reply.user_next_steps.map((/** @type {any} */ item) => item.action), ['provide_artifact', 'cancel_run']);
    assert.doesNotMatch(JSON.stringify(reply), /TOP_SECRET|signature=|id=7|https:\/\/unknown/);
  }
});

test('v4 need_artifact reply alone plus safe input can construct the advertised provide_artifact event', () => {
  const value = state();
  const reply = replies.createNeedArtifactReplyV4({ run_id: 'RUN-source', artifact_requests: [value.request],
    resume_ref: value.resume, produced_artifacts: [], non_blocking_diagnostics: [] });
  const content = bytes('safe upload');
  const event = createProvideArtifactEvent(reply.artifact_requests[0], reply.resume_ref, {
    kind: 'safe_upload_ref', upload_id: 'UPLOAD-7', media_type: 'image/png',
    byte_length: content.length, content_digest: sourceByteDigest(content)
  }, registry);
  assert.equal(event.event_type, 'provide_artifact');
});

test('v4 need_artifact reply fails closed for stale/tampered refs and missing user recovery fields', () => {
  const value = state();
  assert.throws(() => replies.createNeedArtifactReplyV4({ run_id: 'RUN-other', artifact_requests: [value.request],
    resume_ref: value.resume, produced_artifacts: [], non_blocking_diagnostics: [] }), /NEED_ARTIFACT/);
  assert.throws(() => replies.createNeedArtifactReplyV4({ run_id: 'RUN-source', artifact_requests: [{ ...value.request, request_version_digest: hash('forged') }],
    resume_ref: value.resume, produced_artifacts: [], non_blocking_diagnostics: [] }), /NEED_ARTIFACT/);
  const valid = replies.createNeedArtifactReplyV4({ run_id: 'RUN-source', artifact_requests: [value.request],
    resume_ref: value.resume, produced_artifacts: [], non_blocking_diagnostics: [] });
  for (const key of ['artifact_requests', 'resume_ref', 'incomplete_reason', 'user_next_steps', 'recovery', 'available_actions']) {
    const broken = structuredClone(valid); delete broken[key];
    assert.notDeepEqual(validateAgainstSchema(broken, { $ref: '#/$defs/needArtifactReply', $defs: replySchema.$defs }), []);
  }
});
