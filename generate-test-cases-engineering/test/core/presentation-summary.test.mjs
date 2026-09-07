import assert from 'node:assert/strict';
import test from 'node:test';
import { groupRiskCounts } from '../../src/presentation-summary.mjs';

test('presentation risk counts deduplicate shared Case and direct formal responsibilities', () => {
  const obligations = [
    { obligation_id: 'A', risk: 'critical' }, { obligation_id: 'B', risk: 'high' },
    { obligation_id: 'C', risk: 'medium' }, { obligation_id: 'D', risk: 'low' }
  ];
  const plan = { items: [
    { item_kind: 'case', item_id: 'case-1', related_obligation_ids: ['A', 'B'] },
    { item_kind: 'case', item_id: 'case-2', related_obligation_ids: ['B', 'C'] }
  ] };
  const group = { item_refs: [
    { item_kind: 'case', item_id: 'case-1' }, { item_kind: 'case', item_id: 'case-2' },
    { item_kind: 'formal_test_point', item_id: 'B' }, { item_kind: 'formal_test_point', item_id: 'D' },
    { item_kind: 'exploratory', item_id: 'suggestion' }
  ] };
  assert.deepEqual(groupRiskCounts(group, obligations, plan), { critical: 1, high: 1, medium: 1, low: 1 });
  assert.deepEqual(groupRiskCounts({ item_refs: [group.item_refs[2]] }, obligations), { critical: 0, high: 1, medium: 0, low: 0 });
  assert.deepEqual(groupRiskCounts({ item_refs: [group.item_refs[4]] }, obligations, plan), { critical: 0, high: 0, medium: 0, low: 0 });
});

test('presentation risk projection fails closed for missing formal bindings and invalid risks', () => {
  assert.throws(() => groupRiskCounts({ item_refs: [{ item_kind: 'case', item_id: 'missing' }] }, [], { items: [] }));
  assert.throws(() => groupRiskCounts({ item_refs: [{ item_kind: 'case', item_id: 'empty' }] }, [], {
    items: [{ item_kind: 'case', item_id: 'empty', related_obligation_ids: [] }]
  }));
  assert.throws(() => groupRiskCounts({ item_refs: [{ item_kind: 'formal_test_point', item_id: 'missing' }] }, []));
  assert.throws(() => groupRiskCounts({ item_refs: [{ item_kind: 'formal_test_point', item_id: 'A' }] }, [
    { obligation_id: 'A', risk: 'urgent' }
  ]));
});
