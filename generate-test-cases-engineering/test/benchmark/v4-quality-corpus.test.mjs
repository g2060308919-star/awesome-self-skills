import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const engineeringRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusRoot = path.join(engineeringRoot, 'benchmark/v4-quality/v1');
const manifest = JSON.parse(await readFile(path.join(corpusRoot, 'manifest.json'), 'utf8'));

/** @param {Uint8Array|string} value */
const sha256 = value => createHash('sha256').update(value).digest('hex');

/** @param {string} directory @param {string} [prefix] */
async function filesBelow(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (/** @type {any} */ entry) => {
    const relative = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? filesBelow(path.join(directory, entry.name), relative)
      : [relative];
  }));
  return nested.flat().sort();
}

test('A24 corpus manifest freezes every protocol, raw source, image, oracle, and review fixture byte', async () => {
  assert.equal(manifest.version, '1.0.0');
  assert.equal(manifest.direct_baseline_commit, '3464c670c8cb185f3803ecc767219af7a20a2c6d');
  assert.equal(manifest.original_v4_reference_commit, 'b9fad4c35acbd37c9531417fae136cd18f9e0afa');
  const listed = manifest.files.map((/** @type {any} */ item) => item.path);
  assert.deepEqual([...listed].sort(), listed, 'manifest file order must be canonical');
  assert.equal(new Set(listed).size, listed.length);
  assert.deepEqual(
    (await filesBelow(corpusRoot)).filter(file => file !== 'manifest.json'), listed
  );
  for (const item of manifest.files) {
    assert.match(item.sha256, /^[0-9a-f]{64}$/u, item.path);
    assert.equal(sha256(await readFile(path.join(corpusRoot, item.path))), item.sha256, item.path);
  }
});

test('A24 matrix freezes three independent contexts for F01/F03/F04/F07 and at least one for every family', () => {
  assert.deepEqual(manifest.independent_runs_per_version, {
    F01: 3, F02_AND: 1, F02_OR: 1, F03: 3, F04: 3, F05: 1,
    F06_UI: 1, F06_INTERFACE: 1, F06_MISSING_RULE: 1, F07: 3,
    F07_OFFLINE: 1, F07_UNREADABLE: 1, F08: 1, F08_MISSING_PARAMETER: 1
  });
  for (const family of ['F01', 'F03', 'F04', 'F07']) {
    assert.ok(manifest.independent_runs_per_version[family] >= 3, family);
  }
});

test('A01–A16 initial generation sources contain no prefilled semantic artifact or Case authority', async () => {
  const initialInputs = manifest.files.filter((/** @type {any} */ item) =>
    item.path.startsWith('inputs/')
      && item.path.endsWith('.md')
      && !item.path.endsWith('F03-answer-scripts.md'));
  const forbidden = /\bsource_pack\b|\bevidence_claims\b|\bbehavior_views\b|\bcase_drafts\b|\bfact_id\b|\bcase_id\b|\bprimary_test_point_id\b/iu;
  for (const item of initialInputs) {
    const contents = await readFile(path.join(corpusRoot, item.path), 'utf8');
    assert.doesNotMatch(contents, forbidden, item.path);
  }
});

test('A15 F07 supplies an inspectable reference image and terminal comment pagination', async () => {
  const image = await readFile(path.join(corpusRoot, 'inputs/F07-announcement-path.png'));
  const first = await readFile(path.join(corpusRoot, 'inputs/F07-comments-page-1.md'), 'utf8');
  const last = await readFile(path.join(corpusRoot, 'inputs/F07-comments-page-2.md'), 'utf8');
  assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 1200);
  assert.match(first, /线程 C-102（续页有回复）[\s\S]*下一页：有/u);
  assert.match(last, /线程 C-102 的回复[\s\S]*末页：是/u);
  assert.match(last, /不要求读者手动刷新/u);
});

test('A23 review corpus isolates every required semantic defect and a valid control', async () => {
  const required = {
    'review-candidates/F08-wrong-missing-terminal.md': /缺少目标终点/u,
    'review-candidates/F08-wrong-object-switch.md': /中途换对象/u,
    'review-candidates/F08-wrong-merged-results.md': /合并独立结果/u,
    'review-candidates/F08-wrong-example-authority.md': /示例升级为规则/u,
    'review-candidates/F08-correct-candidate.md': /expected to survive review/u
  };
  for (const [relative, marker] of Object.entries(required)) {
    const contents = await readFile(path.join(corpusRoot, relative), 'utf8');
    assert.match(contents, marker, relative);
  }
});

test('A23/A24 record stays explicitly unverified until independent retained runs exist', async () => {
  const record = await readFile(path.join(corpusRoot, 'acceptance-record.md'), 'utf8');
  assert.match(record, /A23 independent candidate review \| `not_run`/u);
  assert.match(record, /A24 before\/after comparison \| `not_run`/u);
  assert.match(record, /release_eligible=false/u);
  assert.match(record, /must not be changed to pass until the retained evidence exists/u);
});
