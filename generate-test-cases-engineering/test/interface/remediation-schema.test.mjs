import assert from 'node:assert/strict';
import test from 'node:test';
import {readdir,readFile} from 'node:fs/promises';
const directory=new URL('../../skill/generate-test-cases/scripts/schemas/',import.meta.url);
async function registry(){return new Map(await Promise.all((await readdir(directory)).filter((/** @type {string} */ n)=>n.endsWith('.schema.json')).map(async (/** @type {string} */ n)=>[n,JSON.parse(await readFile(new URL(n,directory),'utf8'))])));}
test('AT-12: build rejects dangling references and divergence of external and embedded context contracts',async()=>{
 const api=await import('../../build/verify-schema-contracts.mjs');
 const schemas=await registry();assert.doesNotThrow(()=>api.verifySchemaContracts(schemas));
 for(const [file,mutate] of /** @type {[string,(s:any)=>void][]} */([
  ['source-pack.schema.json',s=>delete s.$defs.v4ExecutionContext],
  ['case-context.schema.json',s=>s.properties.facts.items.$ref='#/$defs/missing'],
  ['reply.schema.json',s=>s.$defs.caseContext.properties.run_id.minLength=2],
  ['case-context.schema.json',s=>s.$defs.e_v4Fact.required.pop()],
 ])){
  const changed=structuredClone(schemas);mutate(changed.get(file));assert.throws(()=>api.verifySchemaContracts(changed),/SCHEMA_CONTRACT/);
 }
});
test('AT-14: schema boundary rejects versionless historical delivery pointers',async()=>{
 const {validateAgainstSchema}=await import('../../src/schema-validator.mjs');
 const schemas=await registry();
 const historical={status:'ready',run_instance_id:'RUN-old',source_revision:0,bundle_path:'output/r000/test-bundle.json',bundle_digest:'a'.repeat(64),plan_digest:'b'.repeat(64)};
 assert.ok(validateAgainstSchema(historical,schemas.get('current-pointer.schema.json')).length);
});
