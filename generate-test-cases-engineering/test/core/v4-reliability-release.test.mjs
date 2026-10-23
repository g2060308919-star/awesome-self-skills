import assert from 'node:assert/strict';
import test from 'node:test';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

test('new reliability contract compiles the unchanged fully reviewed business case', () => {
  const fixture = v4GeneralQualityFixture('4.3.2');
  for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = '4.3.3';
  const result = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.schema_version, latestV4Contract().schema_version);
  assert.equal(result.bundle.compiler_version, latestV4Contract().compiler_version);
  const previous = v4GeneralQualityFixture('4.3.2');
  const old = compileCaseDocumentRevisionV4(previous.artifacts, previous.system);
  assert.equal(old.status, 'compiled');
  for (const key of ['cases', 'coverage', 'scope_manifest', 'result_kind']) {
    assert.deepEqual(result.bundle[key], old.bundle[key], key);
  }
});
