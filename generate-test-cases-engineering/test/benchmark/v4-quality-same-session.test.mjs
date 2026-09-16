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
  assert.equal(rows.length, 50);
  for (const version of ['B', 'C']) {
    for (const family of ['F01', 'F04', 'F07']) {
      for (const repeat of [1, 2, 3]) {
        assert.match(matrix, new RegExp(`\\| SS-${version}-${family}-${repeat} \\|`, 'u'));
      }
    }
    for (const variant of ['FINAL', 'TEMP', 'UNKNOWN', 'DEFER', 'DELIVERY', 'INVALID']) {
      assert.match(matrix, new RegExp(`\\| SS-${version}-F03-${variant} \\|`, 'u'));
    }
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
  assert.match(acceptance, /same_session_accepted/u);
  assert.match(acceptance, /不构成独立冷上下文证据/u);
  assert.match(acceptance, /未安装、未提交、未推送/u);
});

test('HTML report exposes the complete matrix and semantic result tables without an independence claim', async () => {
  const html = await text('report.html');
  assert.match(html, /<html lang="zh-CN">/u);
  assert.match(html, /同会话 V4 质量评测/u);
  assert.match(html, /SS-C-F08-MISSING/u);
  assert.match(html, /完整 Case 结果/u);
  assert.doesNotMatch(html, /独立冷上下文评测通过/u);
});
