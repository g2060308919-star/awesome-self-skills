import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const runnerPath = path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/test-compiler.mjs'
);
const unsupportedRuntimePreloadPath = path.join(
  repositoryRoot,
  'test/fixtures/unsupported-node-runtime.cjs'
);
const groundedRevisionPath = path.join(
  repositoryRoot,
  'test/fixtures/recovery/grounded-revision.json'
);
const integrationFixturePath = path.join(
  repositoryRoot,
  'test/fixtures/views/integration-obligations.json'
);

/**
 * @param {string} runDirectory
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{code: number | null, stdout: string, stderr: string}>}
 */
function runCompiler(runDirectory, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, runDirectory], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env }
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number | null} */ code) => resolve({ code, stdout, stderr }));
  });
}

/** @param {string} stdout */
function parseSingleJsonValue(stdout) {
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, 'stdout must contain exactly one JSON value');
  return JSON.parse(lines[0]);
}

const emptyRunReply = {
  status: 'need_artifact',
  stage: 'source_pack',
  schema_ref: 'source-pack.schema.json',
  scope: { source_revision: 0 },
  diagnostics: []
};

test('empty run returns the source-pack artifact request', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const result = await runCompiler(runDirectory);

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(parseSingleJsonValue(result.stdout), emptyRunReply);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('installed runner accepts the requested source pack after an initial empty invocation', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const initial = await runCompiler(runDirectory);
    assert.deepEqual(parseSingleJsonValue(initial.stdout), emptyRunReply);

    const revision = JSON.parse(await readFile(groundedRevisionPath, 'utf8'));
    await mkdir(path.join(runDirectory, 'staging'));
    await writeFile(
      path.join(runDirectory, 'staging/source-pack.json'),
      `${JSON.stringify(revision.source_pack)}\n`,
      'utf8'
    );
    const advanced = await runCompiler(runDirectory);

    assert.equal(advanced.code, 0, advanced.stderr);
    assert.deepEqual(parseSingleJsonValue(advanced.stdout), {
      status: 'need_artifact', stage: 'evidence_claims',
      schema_ref: 'evidence-claims.schema.json',
      scope: { source_revision: 0 }, diagnostics: []
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('installed runner rejects an empty responsibility view without accepting or deriving it', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-empty-view-'));
  const behaviorViews = JSON.parse(await readFile(integrationFixturePath, 'utf8'));
  behaviorViews.source_revision = 0;
  const view = behaviorViews.views[0];
  view.elements = [];
  const sourceDigest = 'd'.repeat(64);
  const sourcePack = {
    schema_version: '1.0.0', source_revision: 0, run_scope: view.scope,
    sources: [{
      source_id: 'source_integration', kind: 'prd', version: '1', status: 'effective',
      authority: 'owner', content: 'Integration contract requirements',
      content_digest: sourceDigest, scope: view.scope
    }],
    locators: [{
      locator_id: 'locator_integration', source_id: 'source_integration', type: 'text-range',
      text_range: { start: 0, end: 33 }, content_digest: sourceDigest,
      extraction_integrity: 'verified'
    }],
    source_policy: { rules: [{
      rule_id: 'rule_integration', source_ids: ['source_integration'], scope: view.scope,
      authority: 'owner', status: 'effective'
    }] },
    decision_records: [], clarification_events: []
  };
  const evidenceClaims = {
    schema_version: '1.0.0', source_revision: 0,
    claims: view.source_claim_ids.map((/** @type {string} */ claimId) => ({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: view.scope, value: claimId, source_locator_ids: ['locator_integration'],
      source_id: 'source_integration'
    })),
    fact_ledger: view.source_claim_ids.map((/** @type {string} */ claimId) => ({
      fact_id: `fact_${claimId.slice('claim_'.length)}`, claim_id: claimId,
      status: 'active', source_claim_ids: [claimId]
    }))
  };
  try {
    await mkdir(path.join(runDirectory, 'staging'));
    for (const [file, artifact] of [
      ['source-pack.json', sourcePack],
      ['evidence-claims.json', evidenceClaims],
      ['behavior-views.json', behaviorViews]
    ]) {
      await writeFile(path.join(runDirectory, 'staging', file), `${JSON.stringify(artifact)}\n`, 'utf8');
      const result = await runCompiler(runDirectory);
      if (file !== 'behavior-views.json') assert.equal(result.code, 0, result.stderr);
      else {
        const reply = parseSingleJsonValue(result.stdout);
        assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
        assert.equal(reply.stage, 'behavior_views');
        assert.equal(reply.diagnostics.some((/** @type {any} */ item) =>
          item.code === 'OBLIGATION_CONTEXT_NOT_CLOSED'), true, JSON.stringify(reply));
      }
    }
    await assert.rejects(readFile(path.join(runDirectory, 'accepted/r000/behavior-views.json')));
    await assert.rejects(readFile(path.join(runDirectory, 'derived/r000/test-obligations.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('installed runner rejects a normative claim disguised as a diagnostic Fact', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-diagnostic-fact-'));
  const revision = JSON.parse(await readFile(groundedRevisionPath, 'utf8'));
  revision.evidence_claims.fact_ledger[0].status = 'diagnostic';
  try {
    await mkdir(path.join(runDirectory, 'staging'));
    await writeFile(
      path.join(runDirectory, 'staging/source-pack.json'),
      `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
    );
    assert.equal((await runCompiler(runDirectory)).code, 0);
    await writeFile(
      path.join(runDirectory, 'staging/evidence-claims.json'),
      `${JSON.stringify(revision.evidence_claims)}\n`, 'utf8'
    );
    const result = await runCompiler(runDirectory);
    const reply = parseSingleJsonValue(result.stdout);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'evidence_claims');
    assert.equal(reply.diagnostics.some((/** @type {any} */ item) =>
      item.code === 'NORMATIVE_CLAIM_LEDGER_INVALID'), true, JSON.stringify(reply));
    await assert.rejects(readFile(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('installed runner rejects normative ownership laundered through a non-normative Fact', async () => {
  for (const primaryKind of ['description', 'diagnostic']) {
    for (const status of ['ambiguous', 'conflicted']) {
      const runDirectory = await mkdtemp(path.join(os.tmpdir(), `test-compiler-${primaryKind}-${status}-`));
      const revision = JSON.parse(await readFile(groundedRevisionPath, 'utf8'));
      revision.evidence_claims.claims.push({
        ...structuredClone(revision.evidence_claims.claims[0]),
        claim_id: 'claim_context', kind: primaryKind, value: 'checkout context'
      });
      Object.assign(revision.evidence_claims.fact_ledger[0], {
        claim_id: 'claim_context', status,
        source_claim_ids: ['claim_context', 'claim_checkout']
      });
      try {
        await mkdir(path.join(runDirectory, 'staging'));
        await writeFile(
          path.join(runDirectory, 'staging/source-pack.json'),
          `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
        );
        assert.equal((await runCompiler(runDirectory)).code, 0);
        await writeFile(
          path.join(runDirectory, 'staging/evidence-claims.json'),
          `${JSON.stringify(revision.evidence_claims)}\n`, 'utf8'
        );
        const result = await runCompiler(runDirectory);
        const reply = parseSingleJsonValue(result.stdout);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(reply.status, 'need_revision', JSON.stringify({ primaryKind, status, reply }));
        assert.equal(reply.stage, 'evidence_claims');
        assert.equal(reply.diagnostics.some((/** @type {any} */ item) =>
          item.code === 'NORMATIVE_CLAIM_UNLEDGERED'), true,
        JSON.stringify({ primaryKind, status, reply }));
        await assert.rejects(readFile(path.join(runDirectory, 'accepted/r000/evidence-claims.json')));
      } finally {
        await rm(runDirectory, { recursive: true, force: true });
      }
    }
  }
});

test('absolute run directory is required and a relative path does not write files', async () => {
  const relativeRunDirectory = 'relative-test-compiler-run';
  const result = await runCompiler(relativeRunDirectory);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(parseSingleJsonValue(result.stdout).status, 'fatal');
  await assert.rejects(readdir(path.join(repositoryRoot, relativeRunDirectory)));
});

test('unsupported runtime returns a fatal JSON reply', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const result = await runCompiler(runDirectory, {
      env: { NODE_OPTIONS: `--require ${unsupportedRuntimePreloadPath}` }
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(parseSingleJsonValue(result.stdout).status, 'fatal');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
