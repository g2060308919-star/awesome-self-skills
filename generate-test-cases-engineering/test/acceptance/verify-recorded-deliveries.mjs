// Verify copied recorded deliveries through the published public package. This
// checks existing real review attestations; it never manufactures a new review.
import assert from 'node:assert/strict';
import {readFile,writeFile,cp,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
const api=/** @type {any} */(await import(pathToFileURL(fileURLToPath(new URL('../../../generate-test-cases/scripts/test-compiler.mjs',import.meta.url))).href));
const base=path.resolve('docs/remediation-2026-10-28/acceptance');
const results=[];
for(const variant of ['', 'portable'])for(const sample of ['minimal','comprehensive']){
 const catalog=path.join(base,variant),run=JSON.parse(await readFile(path.join(catalog,sample+'-run.json'),'utf8'));
 const directory=path.join(catalog,'runs',run.run_id);
 const att=JSON.parse(await readFile(path.join('test/fixtures/remediation',variant?'portable-review-attestations.json':'review-attestations.json'),'utf8')).attestations.find((/** @type {any} */ a)=>a.sample===sample);
 assert.equal(att.run_id,run.run_id);
 const body=await readFile(path.join('test/fixtures/remediation',path.basename(att.completion_file)),'utf8');
 assert.equal(createHash('sha256').update(body).digest('hex'),att.completion_bytes_sha256);
 const verified=await api.verifyCaseDocumentDeliveryV4(directory);
 assert.equal(verified.manifest.review_target_digest,att.review_target_digest);
 const bundle=JSON.parse(verified.artifacts.bundle);
 assert.equal(bundle.cases.length,sample==='minimal'?17:137);
 results.push({variant:variant||'original',sample,run_id:run.run_id,case_count:bundle.cases.length,review_target_digest:att.review_target_digest,verification:'passed',manifest:path.relative(process.cwd(),path.join(directory,'output/current.json'))});
 // Alter the CSV in an isolated copy, even forge its file digest. Canonical
 // projection comparison must still reject the tampered expected result.
 if(variant==='portable'&&sample==='comprehensive'){
  const temp=await mkdtemp(path.join(os.tmpdir(),'gtc-delivery-tamper-'));
  try{
   await cp(path.join(directory,'output'),path.join(temp,'output'),{recursive:true});
   const m=structuredClone(verified.manifest),csv=path.join(temp,m.execution_worksheet.path);
   const altered=(await readFile(csv,'utf8')).replace('草稿','伪造状态');
   await writeFile(csv,altered);m.execution_worksheet.digest='sha256:'+createHash('sha256').update(altered).digest('hex');
   const originalManifest=await readFile(path.join(directory,'output/current.json'),'utf8');
   await writeFile(path.join(temp,'output/current.json'),originalManifest.replace(verified.manifest.execution_worksheet.digest,m.execution_worksheet.digest));
   await assert.rejects(api.verifyCaseDocumentDeliveryV4(temp),/CANONICAL_ARTIFACT_INVALID/);
  }finally{await rm(temp,{recursive:true,force:true});}
 }
}
await writeFile('docs/remediation-2026-10-28/delivery-verification.json',JSON.stringify({results,tampered_projection_rejected:true},null,2));
console.log(JSON.stringify({verified:results.length,tampered_projection_rejected:true}));
