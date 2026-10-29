import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';
import {generate} from '../acceptance/local-generation.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const api=/** @type {any} */(await import(pathToFileURL(fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs',import.meta.url))).href));
test('AT-02/09/30: independent fresh current runs regenerate stable semantic IDs from the local source',async (/** @type {any} */ t)=>{
 const catalog=await mkdtemp(path.join(os.tmpdir(),'gtc-current-repeat-'));t.after(()=>rm(catalog,{recursive:true,force:true}));
 const a=await generate('minimal',path.join(catalog,'one')),b=await generate('minimal',path.join(catalog,'two'));
 assert.notEqual(a.run.run_id,b.run.run_id);
 assert.equal(a.reply.incomplete_reason.code,'INDEPENDENT_REVIEW_REQUIRED');
 assert.equal(a.reply.review_request.review_target_digest,b.reply.review_request.review_target_digest);
 for(const key of ['facts','fact_modules','modules','outcomes','formal_test_points','supporting_observations','ordering_registry'])assert.deepEqual(a.reply.case_context[key],b.reply.case_context[key],key);
 const checkpoint=await readFile(path.join(a.run.run_directory,'checkpoint.json'),'utf8');
 const replay=await api.advanceStrict(a.run.run_directory);
 assert.deepEqual(replay.case_context,a.reply.case_context);assert.equal(await readFile(path.join(a.run.run_directory,'checkpoint.json'),'utf8'),checkpoint);
 assert.deepEqual(a.reply.review_request.review_target_projection.cases,b.reply.review_request.review_target_projection.cases);
});
