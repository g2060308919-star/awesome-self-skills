import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';

const moduleUrl = new URL('../../src/source-locators-v4.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {string} name @param {...any} args */
function call(name, ...args) { assert.equal(typeof api[name], 'function', name + ' is required'); return api[name](...args); }
/** @param {string} value */
const textDigest = value => sourceByteDigest(new TextEncoder().encode(value));
/** @param {string} content @returns {any} */
function source(content) {
  const semantic_projection = { stable_source_id: 'S1', source_type: 'prd', content, structure: call('compileCanonicalSourceStructure', 'S1', content), assets: [] };
  return { source_id: 'S1', domain: 'business', semantic_projection, semantic_digest: 'sha256:' + digest(semantic_projection) };
}
/** @param {any} src @param {number} [start] @param {number} [end] */
function locator(src, start = 0, end = Array.from(src.semantic_projection.structure[0].text).length) {
  const unit = src.semantic_projection.structure[0];
  const excerpt = Array.from(unit.text).slice(start, end).join('');
  return { locator_id: 'L1', source_id: 'S1', semantic_digest: src.semantic_digest, type: 'text_block_range',
    unit_id: unit.unit_id, section_id: unit.section_id, range: { start, end }, excerpt, excerpt_digest: textDigest(excerpt), domain: 'business', field_path: '/status' };
}
/** @param {any} src @param {any} [overrides] */
function claim(src, overrides = {}) { return { claim_id: 'C1', claim_form: 'direct', source_id: src.source_id, source_locator_ids: ['L1'], domain: 'business', field_path: '/status', document_level_claim: false, ...overrides }; }
/** @param {any} src @param {any[]} [locators] @param {any[]} [claims] */
function validate(src, locators = [locator(src)], claims = [claim(src)]) { return call('validateV4ClaimLocators', { sources: [src], locators }, claims); }

test('T11 exact paragraph locator succeeds while a 7245-character whole-source shared locator fails', () => {
  const src = source('状态为启用。\n\n' + 'x'.repeat(7236));
  assert.equal(src.semantic_projection.structure.length, 2);
  assert.deepEqual(validate(src), []);
  const broad = { ...locator(src), range: { start: 0, end: 7245 }, excerpt: src.semantic_projection.content, excerpt_digest: textDigest(src.semantic_projection.content) };
  assert.notDeepEqual(validate(src, [broad], [claim(src), claim(src, { claim_id: 'C2' })]), []);
});

test('T11 HTML heading and paragraph are separate canonical units, never the document-level exception', () => {
  const src = source('<h1>Heading</h1>\n<p>Rule</p>');
  assert.deepEqual(src.semantic_projection.structure.map((/** @type {any} */ unit) => unit.type), ['heading', 'text_block']);
  assert.deepEqual(src.semantic_projection.structure.map((/** @type {any} */ unit) => unit.text), ['Heading', 'Rule']);
  assert.notDeepEqual(validate(src, [locator(src)], [claim(src, { document_level_claim: true })]), []);
});

test('T11 HTML structural boundaries respect quoted delimiters, inline tags, entities and table cells', () => {
  const src = source('<div><p title="a > b">A &amp; <strong>B</strong></p><table><tr><th>Name</th><th>Value</th></tr><tr><td>A|B</td><td>&#x1f600;</td></tr></table><ul><li>One</li><li>Two</li></ul></div>');
  assert.deepEqual(src.semantic_projection.structure.map((/** @type {any} */ unit) => [unit.type, unit.text]), [
    ['text_block', 'A & B'], ['table_cell', 'Name'], ['table_cell', 'Value'], ['table_cell', 'A|B'], ['table_cell', '😀'], ['list', 'One'], ['list', 'Two']
  ]);
  const cells = src.semantic_projection.structure.filter((/** @type {any} */ unit) => unit.type === 'table_cell');
  assert.deepEqual(cells.map((/** @type {any} */ unit) => [unit.row, unit.column]), [[0, 0], [0, 1], [1, 0], [1, 1]]);
});

test('T11 Markdown escaped and code-span pipes are not structural table boundaries', () => {
  const src = source('| Name | Value |\n| --- | --- |\n| A\\|B | `x|y` |');
  assert.deepEqual(src.semantic_projection.structure.map((/** @type {any} */ unit) => unit.text), ['Name', 'Value', 'A\\|B', '`x|y`']);
  assert.deepEqual(source('&lt;h1&gt;Literal&lt;/h1&gt;').semantic_projection.structure.map((/** @type {any} */ unit) => unit.type), ['text_block']);
});

test('T11 Markdown tables without decorative outside pipes still compile to precise cells', () => {
  for (const prefix of ['', '<p>Intro</p>\n\n']) {
    const src = source(prefix + 'Name | Value\n--- | ---\nA\\|B | `x|y`');
    const cells = src.semantic_projection.structure.filter((/** @type {any} */ unit) => unit.type === 'table_cell');
    assert.deepEqual(cells.map((/** @type {any} */ unit) => unit.text), ['Name', 'Value', 'A\\|B', '`x|y`']);
  }
});

test('T11 malformed HTML and ambiguous table spans fail closed instead of erasing or merging structure', () => {
  for (const content of ['<p>Rule</div>', '<table><tr><td colspan="2">Merged</td></tr></table>', '<p title="broken>Rule</p>']) {
    assert.throws(() => source(content), /SOURCE_STRUCTURE_/);
  }
});

test('T11 mixed Markdown/HTML preserves authored structural boundaries', () => {
  const mixed = source('# Heading\n<span>Rule</span>');
  assert.deepEqual(mixed.semantic_projection.structure.map((/** @type {any} */ unit) => unit.type), ['heading', 'text_block']);
  assert.notDeepEqual(validate(mixed, [locator(mixed)], [claim(mixed, { document_level_claim: true })]), []);
});

test('T11 nested HTML lists preserve every child unit', () => {
  const lists = source('<ul><li>Parent<ul><li>Child</li></ul></li></ul>');
  assert.deepEqual(lists.semantic_projection.structure.map((/** @type {any} */ unit) => unit.text), ['Parent', 'Child']);
});

for (const [name, content, valid] of /** @type {[string,string,boolean][]} */ ([
  ['512 Unicode scalar', 'a'.repeat(512), true], ['513 Unicode scalar', 'a'.repeat(513), false],
  ['2048 UTF8 bytes', '😀'.repeat(512), true], ['2049 UTF8 bytes', '😀'.repeat(512) + 'a', false],
  ['heading and text', '# Heading\nRule', false], ['list structure', '- Rule', false],
  ['code structure', '```\nRule\n```', false], ['second paragraph', 'Rule.\n\nOther.', false]
])) test('T11 document-level six predicates: ' + name, () => {
  const src = source(content);
  const result = validate(src, [locator(src)], [claim(src, { document_level_claim: true })]);
  assert.equal(result.length === 0, valid, JSON.stringify(result));
});

test('T11 document-level exception requires one atomic claim, an entire block and explicit opt-in', () => {
  const src = source('Single rule.');
  assert.deepEqual(validate(src, [locator(src)], [claim(src, { document_level_claim: true })]), []);
  assert.notDeepEqual(validate(src, [locator(src)], [claim(src)]), []);
  assert.notDeepEqual(validate(src, [locator(src)], [claim(src, { document_level_claim: true }), claim(src, { claim_id: 'C2', document_level_claim: true })]), []);
  assert.notDeepEqual(validate(src, [locator(src, 0, 6)], [claim(src, { document_level_claim: true })]), []);
  assert.notDeepEqual(validate(src, [locator(src)], [claim(src), claim(src, { claim_id: 'C2' })]), []);
});

test('T11 a non-normative clarification unit does not invalidate an existing document-level claim', () => {
  const src = source('Single rule.');
  const originalUnit = src.semantic_projection.structure[0];
  const reply = '答复：确定结果';
  src.semantic_projection.structure.push({
    unit_id: 'U-reply', type: 'user_statement', text: reply,
    presentation_id: 'PRES-reply', message_digest: textDigest(reply),
    answer_span: { start: 3, end: Array.from(reply).length }
  });
  src.semantic_digest = `sha256:${digest(src.semantic_projection)}`;
  const originalLocator = { ...locator(src), semantic_digest: src.semantic_digest };
  originalLocator.unit_id = originalUnit.unit_id;
  originalLocator.section_id = originalUnit.section_id;
  originalLocator.range = { start: 0, end: Array.from(originalUnit.text).length };
  originalLocator.excerpt = originalUnit.text;
  originalLocator.excerpt_digest = textDigest(originalUnit.text);
  const pack = {
    sources: [src], locators: [originalLocator],
    source_reviews: [{
      source_id: src.source_id, semantic_digest: src.semantic_digest,
      units: [
        {
          unit_id: originalUnit.unit_id, content_digest: textDigest(originalUnit.text),
          classification: 'normative'
        },
        { unit_id: 'U-reply', content_digest: textDigest(reply), classification: 'non_normative' }
      ]
    }]
  };
  assert.deepEqual(call(
    'validateV4ClaimLocators', pack,
    [claim(src, { document_level_claim: true })]
  ), []);
});

test('T11 adjacent block locators require an explicit role for each component', () => {
  const src = source('Condition.\n\nExpected result.');
  const first = locator(src);
  const unit = src.semantic_projection.structure[1];
  const second = { ...first, locator_id: 'L2', unit_id: unit.unit_id, section_id: unit.section_id,
    range: { start: 0, end: Array.from(unit.text).length }, excerpt: unit.text, excerpt_digest: textDigest(unit.text) };
  const combined = claim(src, { source_locator_ids: ['L1', 'L2'], locator_roles: [{ locator_id: 'L1', role: 'condition' }, { locator_id: 'L2', role: 'expected result' }] });
  assert.deepEqual(validate(src, [first, second], [combined]), []);
  delete combined.locator_roles;
  assert.notDeepEqual(validate(src, [first, second], [combined]), []);
});

test('T11 locator checks Unicode scalar coordinates, excerpt digest, domain and field path', () => {
  const src = source('😀状态为启用。'); const good = locator(src, 1, 3);
  assert.equal(good.excerpt, '状态'); assert.deepEqual(validate(src, [good]), []);
  for (const patch of [
    { range: { start: -1, end: 3 } }, { excerpt: 'other' }, { excerpt_digest: textDigest('other') },
    { semantic_digest: 'sha256:' + '0'.repeat(64) }, { domain: 'execution_binding' }, { field_path: '/different' },
    { section_id: 'other' }, { extra: true }
  ]) assert.notDeepEqual(validate(src, [{ ...good, ...patch }]), []);
});

test('T11 canonical projection remains closed even when an extra field is included in a recomputed digest', () => {
  const src = source('Rule.\n\nOther.'); const loc = locator(src);
  /** @type {any} */ (src.semantic_projection).extra = true;
  src.semantic_digest = 'sha256:' + digest(src.semantic_projection);
  assert.notDeepEqual(validate(src, [{ ...loc, semantic_digest: src.semantic_digest }]), []);
});

test('T11 canonical per-unit review conserves every retained unit and binds its digest', () => {
  const src = source('# 背景\n说明\n\n规则一。\n\n规则二。');
  const review = { source_id: 'S1', semantic_digest: src.semantic_digest, units: src.semantic_projection.structure.map((/** @type {any} */ unit, /** @type {number} */ index) => ({ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: index < 2 ? 'non_normative' : 'normative' })) };
  assert.deepEqual(call('validateV4SourceReviews', { sources: [src], source_reviews: [review] }), []);
  for (const mutate of [
    (/** @type {any} */ item) => { item.units.pop(); },
    (/** @type {any} */ item) => { item.units.push(item.units[0]); },
    (/** @type {any} */ item) => { item.semantic_digest = 'sha256:' + '0'.repeat(64); },
    (/** @type {any} */ item) => { item.units[0].content_digest = textDigest('wrong'); },
    (/** @type {any} */ item) => { item.spans = [{ start: 0, end: src.semantic_projection.content.length, classification: 'normative' }]; }
  ]) { const bad = structuredClone(review); mutate(bad); assert.notDeepEqual(call('validateV4SourceReviews', { sources: [src], source_reviews: [bad] }), []); }
});

test('T11 table-cell locator binds table row/column and exact cell text', () => {
  const src = source('|字段|规则|\n|---|---|\n|status|启用|');
  const unit = src.semantic_projection.structure.find((/** @type {any} */ item) => item.type === 'table_cell' && item.text === '启用');
  assert.ok(unit);
  const cell = { locator_id: 'L1', source_id: 'S1', semantic_digest: src.semantic_digest, type: 'table_cell', unit_id: unit.unit_id,
    table_id: unit.table_id, row: unit.row, column: unit.column, excerpt: unit.text, excerpt_digest: textDigest(unit.text), domain: 'business', field_path: '/status' };
  assert.deepEqual(validate(src, [cell]), []);
  assert.notDeepEqual(validate(src, [{ ...cell, column: cell.column + 1 }]), []);
});

test('T11 image-region and user-statement locators bind typed immutable coordinates', () => {
  for (const type of ['image_region', 'user_statement']) {
    const src = source('');
    const identity = type === 'image_region'
      ? { asset_digest: textDigest('image bytes'), page_id: 'page1', image_id: 'image1', rect: { x: 0, y: 0, width: 10, height: 20 } }
      : { presentation_id: 'P1', message_digest: textDigest('User reply'), answer_span: { start: 0, end: 10 } };
    const unit = { unit_id: 'U1', type, text: 'User reply', ...identity };
    if (type === 'image_region') src.semantic_projection.assets = [{ canonical_uri: 'https://images.example.test/1.png', asset_digest: identity.asset_digest }];
    src.semantic_projection.structure = [unit]; src.semantic_digest = 'sha256:' + digest(src.semantic_projection);
    const loc = { locator_id: 'L1', source_id: 'S1', semantic_digest: src.semantic_digest, type, unit_id: 'U1', ...identity,
      excerpt: unit.text, excerpt_digest: textDigest(unit.text), domain: 'business', field_path: '/status' };
    assert.deepEqual(validate(src, [loc]), []);
    assert.notDeepEqual(validate(src, [{ ...loc, ...(type === 'image_region' ? { asset_digest: textDigest('other') } : { presentation_id: 'other' }) }]), []);
    if (type === 'image_region') {
      src.semantic_projection.assets = []; src.semantic_digest = 'sha256:' + digest(src.semantic_projection);
      assert.notDeepEqual(validate(src, [{ ...loc, semantic_digest: src.semantic_digest }]), []);
    }
  }
});

test('T11 an image markup reference is not a reviewed image-region Oracle', () => {
  const src = source('![button](https://images.example.test/button.png)\n\nOther rule.');
  assert.notDeepEqual(validate(src, [locator(src)], [claim(src, { document_level_claim: false })]), []);
});

test('T11 a review for a foreign source cannot hide outside the per-source conservation loop', () => {
  const src = source('Rule.'); const unit = src.semantic_projection.structure[0];
  const review = { source_id: 'S1', semantic_digest: src.semantic_digest, units: [{ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: 'normative' }] };
  assert.notDeepEqual(call('validateV4SourceReviews', { sources: [src], source_reviews: [review, { ...review, source_id: 'foreign' }] }), []);
});
