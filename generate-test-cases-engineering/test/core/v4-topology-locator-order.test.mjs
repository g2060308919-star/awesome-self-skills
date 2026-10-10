import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalTopologyStructure } from '../../src/v4-system-context.mjs';

test('topology source projection is independent of locator array order', () => {
  const locators = [
    { locator_id: 'LOC-precise', source_id: 'SRC', unit_id: 'UNIT',
      range: { start: 2, end: 4 }, excerpt: '规则' },
    { locator_id: 'LOC-whole', source_id: 'SRC', unit_id: 'UNIT',
      range: { start: 0, end: 6 }, excerpt: '完整规则文本' }
  ];
  const pack = {
    sources: [{
      source_id: 'SRC', semantic_projection: { structure: [
        { unit_id: 'UNIT', type: 'text_block', text: '完整规则文本' }
      ] }
    }],
    source_reviews: [{ source_id: 'SRC', units: [{ unit_id: 'UNIT', classification: 'normative' }] }],
    locators
  };
  const forward = canonicalTopologyStructure(pack);
  const reversed = canonicalTopologyStructure({ ...pack, locators: [...locators].reverse() });
  assert.deepEqual(forward, reversed);
});
