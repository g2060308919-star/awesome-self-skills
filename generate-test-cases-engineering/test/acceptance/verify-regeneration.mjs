// Regenerate through the public bundle and compare with the actual reviewed
// content. This does not attest a new review or deliver the temporary runs.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generate } from './local-generation.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'gtc-reviewed-regeneration-'));
const recorded = path.resolve('docs/remediation-2026-10-28/acceptance');
try {
  for (const sample of ['minimal', 'comprehensive']) {
    const { reply } = await generate(sample, temporary);
    const oldRun = JSON.parse(await readFile(path.join(recorded, `${sample}-run.json`), 'utf8'));
    const oldReply = JSON.parse(await readFile(path.join(recorded, 'runs', oldRun.run_id, 'reply-case_drafts.json'), 'utf8'));
    assert.equal(reply.incomplete_reason.code, 'INDEPENDENT_REVIEW_REQUIRED');
    assert.deepEqual(reply.review_request.review_target_projection, oldReply.review_request.review_target_projection);
    assert.equal(reply.review_request.review_target_digest, oldReply.review_request.review_target_digest);
    console.log(JSON.stringify({sample, reviewed_projection_identical: true,
      review_target_digest: reply.review_request.review_target_digest,
      fresh_run_status: 'pending_independent_review', new_review_attested: false}));
  }
} finally {
  await rm(temporary, {recursive: true, force: true});
}
