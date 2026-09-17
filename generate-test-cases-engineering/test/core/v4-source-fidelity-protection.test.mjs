import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry } from '../../src/source-capture-audit.mjs';
import { createSourceProviderRegistry } from '../../src/source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';

test('AT01-AT03 audited source projection conserves AND, OR, exception, and table meaning', () => {
  const content = [
    '# 审批规则',
    '',
    '当 A AND (B OR C) 时允许提交，EXCEPT 已冻结账户。',
    '',
    '| 角色 | 允许结果 |',
    '| --- | --- |',
    '| 管理员 | 通过 |',
    '| 访客 | 拒绝 |'
  ].join('\n');
  const audited = canonicalizeAuditedSourceCapture({
    stable_source_id: 'SRC-rules', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: []
  }, createSourceProviderRegistry([]), {}, createExpiryMatcherRegistry([]));
  assert.equal(audited.status, 'canonical');
  const units = compileCanonicalSourceStructure('SRC-rules', audited.semantic_projection.content);
  assert.match(audited.semantic_projection.content, /A AND \(B OR C\).*EXCEPT/u);
  assert.equal(units.filter((unit) => unit.type === 'table_cell').length, 6);
  assert.deepEqual(
    units.filter((unit) => unit.type === 'table_cell').map((unit) => unit.text),
    ['角色', '允许结果', '管理员', '通过', '访客', '拒绝']
  );
});

test('AT01 readable channel loss remains a technical acquisition limitation, not fabricated business meaning', () => {
  const content = '# 规则\n\n![关键流程](https://assets.test/flow.png)';
  const audited = canonicalizeAuditedSourceCapture({
    stable_source_id: 'SRC-image', source_type: 'prd',
    capture_bytes: new TextEncoder().encode(content), assets: []
  }, createSourceProviderRegistry([]), {}, createExpiryMatcherRegistry([]));
  assert.equal(audited.status, 'canonical');
  assert.match(audited.semantic_projection.content, /关键流程/u);
  assert.equal(Object.hasOwn(audited.semantic_projection, 'semantic_gap'), false);
});
