import assert from 'node:assert/strict';
import test from 'node:test';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

test('current contract repeats the same reviewed business compilation deterministically', () => {
  const fixture = v4GeneralQualityFixture('4.3.3');
  for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = '4.3.3';
  const result = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.schema_version, latestV4Contract().schema_version);
  assert.equal(result.bundle.compiler_version, latestV4Contract().compiler_version);
  const repeated = v4GeneralQualityFixture('4.3.3');
  const repeat = compileCaseDocumentRevisionV4(repeated.artifacts, repeated.system);
  assert.equal(repeat.status, 'compiled');
  for (const key of ['cases', 'coverage', 'scope_manifest', 'result_kind']) {
    assert.deepEqual(result.bundle[key], repeat.bundle[key], key);
  }
});
