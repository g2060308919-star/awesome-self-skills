import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../src/canonical.mjs';
import { buildBundle } from '../../src/coverage.mjs';
import { BundleRenderError, renderMarkdown } from '../../src/render-markdown.mjs';

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

test('renderer snapshots own data without executing submitted getters or iterators', async () => {
  const getterBundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
  let getterReads = 0;
  Object.defineProperty(getterBundle, 'source_revision', {
    enumerable: true,
    get() { getterReads += 1; return 4; }
  });
  assert.throws(() => renderMarkdown(getterBundle), (/** @type {any} */ error) => {
    assert.equal(error instanceof BundleRenderError, true);
    assert.equal(error.status, 'need_revision');
    assert.equal(error.stage, 'render_markdown');
    assert.equal(error.diagnostics.some((/** @type {any} */ item) => item.code === 'ACCESSOR_NOT_ALLOWED'), true);
    return true;
  });
  assert.equal(getterReads, 0);

  const iteratorBundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
  let iteratorCalls = 0;
  Object.defineProperty(iteratorBundle.grounded, Symbol.iterator, {
    value() { iteratorCalls += 1; return [][Symbol.iterator](); }
  });
  assert.throws(() => renderMarkdown(iteratorBundle), (/** @type {any} */ error) => {
    assert.equal(error instanceof BundleRenderError, true);
    assert.equal(error.status, 'need_revision');
    assert.equal(error.stage, 'render_markdown');
    return true;
  });
  assert.equal(iteratorCalls, 0);

  const methodBundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
  let methodCalls = 0;
  Object.defineProperty(methodBundle.grounded, 'entries', {
    value() { methodCalls += 1; return [][Symbol.iterator](); }
  });
  assert.throws(() => renderMarkdown(methodBundle), (/** @type {any} */ error) => {
    assert.equal(error instanceof BundleRenderError, true);
    assert.equal(error.diagnostics.some((/** @type {any} */ item) => item.code === 'ARRAY_NAMED_PROPERTY_INVALID'), true);
    return true;
  });
  assert.equal(methodCalls, 0);

  const revoked = Proxy.revocable(iteratorBundle, {});
  revoked.revoke();
  assert.throws(() => renderMarkdown(revoked.proxy), (/** @type {any} */ error) => {
    assert.equal(error instanceof BundleRenderError, true);
    assert.equal(error.stage, 'render_markdown');
    return true;
  });
});

test('renderer uses captured array traversal intrinsics after snapshot validation', async () => {
  const bundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, 'entries');
  let reads = 0;
  try {
    Object.defineProperty(Array.prototype, 'entries', {
      configurable: true,
      get() { reads += 1; return descriptor?.value; }
    });
    assert.equal(renderMarkdown(bundle).startsWith('# Test Case Bundle\n'), true);
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, 'entries', descriptor);
  }
  assert.equal(reads, 0);
});

test('renderer projection has no direct mutable Array prototype or iterator traversal', async () => {
  const source = await readFile(new URL('../../src/render-markdown.mjs', import.meta.url), 'utf8');
  assert.equal(/\.(?:map|join|push|pop|at|entries)\(/u.test(source), false);
  assert.equal(/for\s*\(const\s+[^)]*\s+of\s+/u.test(source), false);
});

test('renderer diagnostics reserve one canonical truncation marker on real overflow', async () => {
  /** @param {boolean} reversed */
  const diagnosticsFor = async (reversed) => {
    const bundle = buildBundle(await loadJson('test/fixtures/journeys/final-critical-gaps.json'));
    const keys = Array.from({ length: 300 }, (_, index) => `accessor_${String(index).padStart(3, '0')}`);
    if (reversed) keys.reverse();
    let reads = 0;
    for (const key of keys) Object.defineProperty(bundle, key, {
      enumerable: true,
      get() { reads += 1; return 'must not read'; }
    });
    try {
      renderMarkdown(bundle);
    } catch (error) {
      assert.equal(error instanceof BundleRenderError, true);
      assert.equal(reads, 0);
      return /** @type {any} */ (error).diagnostics;
    }
    assert.fail('expected render revision');
  };
  const forward = await diagnosticsFor(false);
  const reverse = await diagnosticsFor(true);
  assert.equal(forward.length, 256);
  assert.equal(forward.filter((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED').length, 1);
  assert.equal(canonicalStringify(forward), canonicalStringify(reverse));
  assert.deepEqual(forward, [...forward].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right))));
});
