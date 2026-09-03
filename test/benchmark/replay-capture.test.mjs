import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyCaptureTranscript } from '../../benchmark/replay-capture.mjs';
import { buildJourney, runInstalledRevision } from '../helpers/run-journey.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runnerPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs');
const replySchemaPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas/reply.schema.json');
const bundleSchemaPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-bundle.schema.json');
const artifactDigests = {
  compiler: 'a'.repeat(64), schema: 'b'.repeat(64), schema_manifest: 'c'.repeat(64),
  skill: 'd'.repeat(64), bundle: 'e'.repeat(64)
};

/** @param {any} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {any} reply @param {string} runDirectory */
function normalizeReply(reply, runDirectory) {
  const normalized = structuredClone(reply);
  for (const key of ['artifact_path', 'bundle_path', 'markdown_path']) {
    if (typeof normalized[key] === 'string') {
      normalized[key] = path.relative(runDirectory, normalized[key]).split(path.sep).join('/');
    }
  }
  return normalized;
}

async function genuineTranscript() {
  const revision = buildJourney('all-e3');
  const sourceBytes = revision.source_pack.sources[0].content;
  const sourceDigest = sha256(sourceBytes);
  revision.source_pack.sources[0].content_digest = sourceDigest;
  revision.source_pack.sources[0].version = '1'.repeat(40);
  revision.source_pack.sources[0].authority = 'public-repository:example/project';
  revision.source_pack.source_policy.rules[0].authority = 'public-repository:example/project';
  for (const locator of revision.source_pack.locators) locator.content_digest = sourceDigest;
  const capture = {
    capture_id: 'capture-genuine-1', case_id: 'case-genuine', system: 'generate-test-cases',
    repeat: 1, session_id: 'session-genuine-1', source_sha256: sourceDigest,
    task_sha256: 'f'.repeat(64), runtime_revision: '1'.repeat(40), artifact_digests: artifactDigests
  };
  const run = await runInstalledRevision(revision);
  const stages = ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'];
  const transcript = {
    schema_version: '1.0.0', ...capture,
    events: stages.map((stage, index) => ({
      stage,
      artifact: revision[stage],
      reply: normalizeReply(run.replies[index], run.runDirectory)
    }))
  };
  await rm(run.runDirectory, { recursive: true, force: true });
  return {
    capture,
    transcript,
    sourceContract: {
      source_id: revision.source_pack.sources[0].source_id,
      repository: 'example/project',
      commit: '1'.repeat(40),
      source_sha256: sourceDigest
    }
  };
}

test('capture verifier reproduces retained submissions, replies, final bundle, and recovery', async () => {
  const { capture, transcript, sourceContract } = await genuineTranscript();
  const transcriptBytes = new TextEncoder().encode(`${JSON.stringify(transcript)}\n`);

  const result = await verifyCaptureTranscript({
    transcriptBytes, expected: capture, candidateRoot: repositoryRoot, runnerPath,
    replySchemaPath, bundleSchemaPath, taskContract: { scope: '*' }, sourceContract
  });

  assert.equal(result.transcript_sha256, sha256(transcriptBytes));
  assert.equal(result.final_bundle_sha256, result.replay_bundle_sha256);
  assert.match(result.reply_sequence_sha256, /^[a-f0-9]{64}$/u);
});

test('capture verifier rejects a recorded reply that the runner cannot reproduce', async () => {
  const { capture, transcript, sourceContract } = await genuineTranscript();
  /** @type {any} */ (transcript.events.at(-1)).reply.bundle_digest = '0'.repeat(64);

  await assert.rejects(
    verifyCaptureTranscript({
      transcriptBytes: new TextEncoder().encode(`${JSON.stringify(transcript)}\n`),
      expected: capture, candidateRoot: repositoryRoot, runnerPath,
      replySchemaPath, bundleSchemaPath, taskContract: { scope: '*' }, sourceContract
    }),
    /Recorded runner reply mismatch/u
  );
});

test('capture verifier rejects a matching PRD used only as a decoy source', async () => {
  const { capture, transcript, sourceContract } = await genuineTranscript();
  const primary = transcript.events[0].artifact.sources[0];
  primary.content = 'Synthetic requirements unrelated to the retained PRD.';
  primary.content_digest = sha256(primary.content);
  transcript.events[0].artifact.sources.push({
    source_id: sourceContract.source_id,
    kind: 'prd', version: sourceContract.commit,
    status: 'effective', authority: `public-repository:${sourceContract.repository}`,
    content: 'Frozen journey requirements.', content_digest: sourceContract.source_sha256,
    scope: '*'
  });

  await assert.rejects(
    verifyCaptureTranscript({
      transcriptBytes: new TextEncoder().encode(`${JSON.stringify(transcript)}\n`),
      expected: capture, candidateRoot: repositoryRoot, runnerPath,
      replySchemaPath, bundleSchemaPath, taskContract: { scope: '*' }, sourceContract
    }),
    /not exactly bound/u
  );
});
