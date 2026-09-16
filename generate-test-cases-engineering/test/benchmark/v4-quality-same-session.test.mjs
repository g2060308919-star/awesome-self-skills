import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const engineeringRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidenceRoot = path.join(engineeringRoot, 'benchmark/v4-quality/same-session-v1');

/** @param {string} name */
async function text(name) {
  return readFile(path.join(evidenceRoot, name), 'utf8');
}

/** @param {string|Uint8Array} value */
const sha256 = value => createHash('sha256').update(value).digest('hex');

test('same-session evidence manifest binds every retained report byte', async () => {
  const manifest = JSON.parse(await text('manifest.json'));
  const actual = (await readdir(evidenceRoot))
    .filter((/** @type {string} */ name) => name !== 'manifest.json').sort();
  assert.deepEqual(manifest.files.map((/** @type {any} */ item) => item.path), actual);
  assert.equal(manifest.mode, 'user_approved_same_session_oracle_aware');
  assert.equal(manifest.candidate_commit, '6f42f19f59d3d3bdb619041af2ccb80bd902fd9d');
  assert.equal(manifest.candidate_runtime_tree_digest,
    'sha256:28549e6a31b7502455c5d7fbcb52522e91de1dc4d58749b3581ed1310c540d1b');
  assert.equal(manifest.baseline_runtime_tree_digest,
    'sha256:26342d8600f8e4ba641a2d9e95b843b700709cf4be4a7fed67886c0a0b8f382b');
  assert.equal(manifest.row_evidence_kind, 'reviewer_authored_matrix_observation');
  assert.equal(manifest.raw_transcripts_retained, false);
  assert.equal(manifest.release_eligible, false);
  assert.equal(manifest.model_context.model_family, 'GPT-5');
  assert.equal(manifest.model_context.deployment_id, null);
  assert.equal(manifest.model_context.reasoning_effort, null);
  for (const item of manifest.files) {
    assert.equal(sha256(await readFile(path.join(evidenceRoot, item.path))), item.sha256, item.path);
  }
});

test('user-approved protocol records same-session and oracle-aware limitations without claiming isolation', async () => {
  const protocol = await text('protocol.md');
  assert.match(protocol, /用户明确同意/u);
  assert.match(protocol, /同一任务会话/u);
  assert.match(protocol, /已经读取.*acceptance-oracle/u);
  assert.match(protocol, /不得描述为.*独立|不得.*冷上下文/u);
});

test('paired matrix retains every same-session pass for both versions and all required repeats', async () => {
  const matrix = await text('matrix.md');
  const rows = matrix.match(/^\| SS-[BC]-[^\n]+$/gmu) ?? [];
  assert.equal(rows.length, 52);
  const runIds = rows.map((/** @type {string} */ row) => row.split('|')[1].trim());
  assert.equal(new Set(runIds).size, runIds.length);
  for (const version of ['B', 'C']) {
    for (const family of ['F01', 'F04', 'F07']) {
      for (const repeat of [1, 2, 3]) {
        assert.match(matrix, new RegExp(`\\| SS-${version}-${family}-${repeat} \\|`, 'u'));
      }
    }
    for (const variant of ['FINAL', 'TEMP', 'UNKNOWN', 'DEFER', 'DELIVERY', 'PARTIAL', 'INVALID']) {
      assert.match(matrix, new RegExp(`\\| SS-${version}-F03-${variant} \\|`, 'u'));
    }
  }
  const partialRows = rows.filter((/** @type {string} */ row) => row.includes('-F03-PARTIAL |'));
  assert.equal(partialRows.length, 2);
  for (const row of partialRows) {
    assert.match(row, /只回答另一个独立项/u);
    assert.match(row, /整个时间边界问题.*pending/u);
    assert.doesNotMatch(row, /72 小时/u);
  }
  assert.doesNotMatch(
    rows.filter((/** @type {string} */ row) => row.includes('| candidate |')).join('\n'),
    /\| 失败 \|/u
  );
});

test('raw-input generation record covers every family and preserves the required semantic discriminators', async () => {
  const generated = await text('generated-results.md');
  for (const family of ['F01', 'F02-AND', 'F02-OR', 'F03', 'F04', 'F05', 'F06-UI', 'F06-INTERFACE', 'F06-MISSING', 'F07', 'F07-OFFLINE', 'F07-UNREADABLE', 'F08', 'F08-MISSING']) {
    assert.match(generated, new RegExp(`data-family="${family}"`, 'u'), family);
  }
  for (const marker of [
    '本用例创建的同一公告', '非匹配类别记录不出现', '先开始记录请求',
    '不要求读者手动刷新', '不采纳自动置顶', '80.00', '不可访问附件未标记为已查看'
  ]) assert.match(generated, new RegExp(marker, 'u'), marker);
  assert.match(generated, /partial \| 只回答同批次的另一个独立项.*整个时间边界问题保持 pending/u);
  assert.doesNotMatch(generated, /partial \|[^\n]*72 小时/u);
});

test('A23 same-session review rejects four exact defect classes and accepts the valid control', async () => {
  const review = await text('a23-review.md');
  for (const defect of ['缺少目标终点', '中途换对象', '合并独立结果', '示例升级为规则']) {
    assert.match(review, new RegExp(`${defect}.*拒绝`, 'su'), defect);
  }
  assert.match(review, /正确候选.*接受/su);
});

test('acceptance record maps A01-A24 and limits the conclusion to the approved same-session protocol', async () => {
  const acceptance = await text('acceptance.md');
  for (let index = 1; index <= 24; index += 1) {
    assert.match(acceptance, new RegExp(`\\| A${String(index).padStart(2, '0')} \\|`, 'u'));
  }
  assert.match(acceptance, /implementation_candidate_reviewed/u);
  assert.match(acceptance, /same_session_reviewed/u);
  assert.doesNotMatch(acceptance, /same_session_accepted/u);
  assert.match(acceptance, /不构成独立冷上下文证据/u);
  assert.match(acceptance, /没有逐行原始模型 transcript/u);
});

test('HTML report exposes the complete matrix and semantic result tables without an independence claim', async () => {
  const html = await text('report.html');
  assert.match(html, /<html lang="zh-CN">/u);
  assert.match(html, /同会话 V4 质量评测/u);
  assert.match(html, /SS-C-F08-MISSING/u);
  assert.match(html, /完整 Case 结果/u);
  assert.doesNotMatch(html, /独立冷上下文评测通过/u);
});
