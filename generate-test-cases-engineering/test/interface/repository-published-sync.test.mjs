import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const engineeringRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const builtSkill = path.join(engineeringRoot, 'skill/generate-test-cases');
const publishedSkill = path.resolve(engineeringRoot, '../generate-test-cases');

/** @param {string} root @param {string} [relative] @returns {Promise<string[]>} */
async function files(root, relative = '') {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((/** @type {any} */ left, /** @type {any} */ right) => (
    left.name.localeCompare(right.name, 'en')
  ))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...await files(root, child));
    else if (entry.isFile()) result.push(child);
  }
  return result;
}

test('repository-published Skill is byte-identical to the engineering build shape', async () => {
  const builtFiles = await files(builtSkill);
  const publishedFiles = await files(publishedSkill);
  assert.deepEqual(publishedFiles, builtFiles, 'published Skill file inventory is stale');
  for (const relative of builtFiles) assert.deepEqual(
    await readFile(path.join(publishedSkill, relative)),
    await readFile(path.join(builtSkill, relative)),
    `published Skill is stale at ${relative}`
  );
});
