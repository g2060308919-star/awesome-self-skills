import assert from 'node:assert/strict';
import test from 'node:test';
import {compileCaseDocumentRevisionV4} from '../../src/v4-pipeline.mjs';
import {v4GeneralQualityFixture} from '../helpers/v4-general-quality-fixture.mjs';
test('AT-25: removing the only Case does not erase its required test point or produce formal coverage',()=>{
 const fixture=v4GeneralQualityFixture();
 const accepted=compileCaseDocumentRevisionV4(fixture.artifacts,fixture.system);
 assert.equal(accepted.status,'compiled');assert.equal(accepted.bundle.coverage.primary.covered_formal_test_point_count,1);
 fixture.artifacts.case_drafts.cases=[];
 const omitted=compileCaseDocumentRevisionV4(fixture.artifacts,fixture.system);
 assert.notEqual(omitted.status,'compiled');assert.ok(omitted.diagnostics.some((/** @type {any} */ d)=>d.code==='APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE'),JSON.stringify(omitted));
 assert.equal(accepted.obligations.formal_test_points.length,1);
});
