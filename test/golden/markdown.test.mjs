import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../src/canonical.mjs';
import { buildBundle } from '../../src/coverage.mjs';
import { renderMarkdown } from '../../src/render-markdown.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @param {string} relative */
const loadJson = async (relative) => JSON.parse(await readFile(path.join(repositoryRoot, relative), 'utf8'));

test('markdown is a byte-stable mechanical projection of the hand-reviewed canonical golden', async () => {
  const context = await loadJson('test/fixtures/journeys/final-critical-gaps.json');
  const expectedBundle = await loadJson('test/golden/final-critical-gaps.json');
  const expectedMarkdown = await readFile(path.join(repositoryRoot, 'test/golden/final-critical-gaps.md'), 'utf8');
  const bundle = buildBundle(context);

  assert.equal(canonicalStringify(bundle), canonicalStringify(expectedBundle));
  assert.equal(renderMarkdown(bundle), expectedMarkdown);
  assert.equal(renderMarkdown(bundle), renderMarkdown(structuredClone(bundle)));
});

test('renderer rejects bundle-external free text and never treats Markdown as evidence', async () => {
  const bundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
  const injected = structuredClone(bundle);
  injected.executive_summary = 'UNTRUSTED FREE TEXT';
  assert.throws(() => renderMarkdown(injected), (/** @type {any} */ error) => {
    assert.equal(error.status, 'need_revision');
    assert.equal(error.stage, 'render_markdown');
    return true;
  });
  assert.equal(Reflect.apply(renderMarkdown, null, [bundle, 'UNTRUSTED FREE TEXT']).includes('UNTRUSTED FREE TEXT'), false);
  assert.equal(renderMarkdown(bundle).includes('Markdown evidence'), false);
});
