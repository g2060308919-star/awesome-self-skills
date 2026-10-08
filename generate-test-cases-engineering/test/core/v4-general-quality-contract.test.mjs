import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CANDIDATE_V4_CONTRACT,
  GENERAL_QUALITY_V4_CONTRACT,
  SOURCE_RELIABILITY_V4_CONTRACT,
  LEGACY_V4_CONTRACT,
  isGeneralQualityV4Contract,
  latestV4Contract,
  requireV4Contract,
  v4ContractForIdentity,
  v4ContractForSchema
} from '../../src/v4-contract.mjs';

test('4.3.1 source-reliability contract is latest while 4.3 remains exact', () => {
  assert.deepEqual(GENERAL_QUALITY_V4_CONTRACT, {
    schema_version: '4.3.0',
    compiler_version: '0.8.0',
    candidate: true,
    strict_semantic_delivery: true
  });
  assert.equal(latestV4Contract(), SOURCE_RELIABILITY_V4_CONTRACT);
  assert.deepEqual(SOURCE_RELIABILITY_V4_CONTRACT, {
    schema_version: '4.3.1', compiler_version: '0.8.1', candidate: true,
    strict_semantic_delivery: true
  });
  assert.equal(v4ContractForSchema('4.3.0'), GENERAL_QUALITY_V4_CONTRACT);
  assert.equal(v4ContractForIdentity({ schema_version: '4.3.0', compiler_version: '0.8.0' }), GENERAL_QUALITY_V4_CONTRACT);
  assert.equal(isGeneralQualityV4Contract(GENERAL_QUALITY_V4_CONTRACT), true);
  assert.equal(isGeneralQualityV4Contract(SOURCE_RELIABILITY_V4_CONTRACT), true);
  assert.equal(isGeneralQualityV4Contract({ schema_version: '4.3.0', compiler_version: '0.7.0' }), false);
});

test('4.0 and 4.2 remain exact supported pairs and mixed identities fail closed', () => {
  assert.equal(requireV4Contract(LEGACY_V4_CONTRACT), LEGACY_V4_CONTRACT);
  assert.equal(requireV4Contract(CANDIDATE_V4_CONTRACT), CANDIDATE_V4_CONTRACT);
  assert.equal(v4ContractForIdentity({ schema_version: '4.0.0', compiler_version: '0.7.0' }), null);
  assert.equal(v4ContractForIdentity({ schema_version: '4.2.0', compiler_version: '0.8.0' }), null);
  assert.equal(v4ContractForIdentity({ schema_version: '4.3.0', compiler_version: '0.5.0' }), null);
  assert.throws(
    () => requireV4Contract({ schema_version: '4.3.0', compiler_version: '0.7.0' }),
    /V4_CONTRACT_UNSUPPORTED/
  );
});
