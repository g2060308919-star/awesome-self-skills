import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  deriveCandidateBinding,
  verifyCandidateEvidenceBytes
} from '../../benchmark/candidate-binding.mjs';
import { materializeCandidateRuntime } from '../../benchmark/candidate-runtime.mjs';

const execFileAsync = promisify(execFile);

async function nestedRepository() {
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), 'nested-candidate-repository-'));
  const projectRoot = path.join(repositoryRoot, 'tools/generate-test-cases');
  const files = {
    'src/compiler.mjs': 'export const version = 1;\n',
    'skill/generate-test-cases/scripts/schemas/input.json': '{"type":"object"}\n',
    'skill/generate-test-cases/scripts/schemas/reply.schema.json': '{"type":"object"}\n',
    'skill/generate-test-cases/scripts/schemas/test-bundle.schema.json': '{"type":"object"}\n',
    'skill/generate-test-cases/scripts/schema-manifest.json': '{"version":"1"}\n',
    'skill/generate-test-cases/SKILL.md': '# Candidate\n',
    'skill/generate-test-cases/scripts/test-compiler.mjs': 'export const advanceStrict = true;\n',
    'benchmark/v1/manifest.json': '{"candidate":"nested-fixture"}\n'
  };
  for (const [relativePath, contents] of Object.entries(files)) {
    const filename = path.join(projectRoot, relativePath);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents);
  }
  await execFileAsync('git', ['init', '--quiet'], { cwd: repositoryRoot });
  await execFileAsync('git', ['add', '.'], { cwd: repositoryRoot });
  await execFileAsync('git', [
    '-c', 'user.name=Nested Project Test', '-c', 'user.email=nested@example.invalid',
    'commit', '--quiet', '-m', 'nested fixture'
  ], { cwd: repositoryRoot });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot });
  return { repositoryRoot, projectRoot, revision: stdout.trim(), files };
}

test('candidate binding reads a project below the Git top-level without weakening clean-tree binding', async (/** @type {any} */ context) => {
  const fixture = await nestedRepository();
  context.after(async () => rm(fixture.repositoryRoot, { recursive: true, force: true }));
  const manifestPath = path.join(fixture.projectRoot, 'benchmark/v1/manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifestDigest = createHash('sha256').update(manifestBytes).digest('hex');

  const binding = await deriveCandidateBinding(manifestPath, manifestDigest, fixture.projectRoot);

  assert.equal(binding.final_candidate_sha, fixture.revision);
  assert.equal(binding.worktree_clean, true);
  assert.match(binding.bundle_sha256, /^[a-f0-9]{64}$/u);
  await assert.doesNotReject(verifyCandidateEvidenceBytes(
    fixture.projectRoot, fixture.revision, manifestPath, manifestBytes
  ));
});

test('candidate runtime materializes the nested project paths from the immutable Git tree', async (/** @type {any} */ context) => {
  const fixture = await nestedRepository();
  context.after(async () => rm(fixture.repositoryRoot, { recursive: true, force: true }));

  const runtime = await materializeCandidateRuntime(fixture.projectRoot, fixture.revision);
  context.after(runtime.cleanup);

  assert.equal(
    await readFile(runtime.runnerPath, 'utf8'),
    fixture.files['skill/generate-test-cases/scripts/test-compiler.mjs']
  );
});
