// A fresh working directory contains only the built public package, local source
// documents, Agent-authored semantic scenarios, and the public generation driver.
// It deliberately stops at a real review request; no completion is fabricated.
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../..',import.meta.url));
const directory=await mkdtemp(path.join(os.tmpdir(),'gtc-portable-acceptance-'));
await mkdir(path.join(directory,'test/acceptance'),{recursive:true});
await cp(path.join(root,'skill/generate-test-cases'),path.join(directory,'package'),{recursive:true});
await cp(path.join(root,'test/fixtures/remediation'),path.join(directory,'test/fixtures/remediation'),{recursive:true});
await cp(path.join(root,'test/acceptance/local-generation.mjs'),path.join(directory,'test/acceptance/local-generation.mjs'));
const runner=path.join(directory,'package/scripts/test-compiler.mjs');
const catalog=path.join(directory,'acceptance');
for(const sample of ['minimal','comprehensive']){
 const result=spawnSync(process.execPath,['test/acceptance/local-generation.mjs',sample,catalog],{cwd:directory,env:{PATH:process.env.PATH,GTC_REMEDIATION_RUNNER:runner},encoding:'utf8',maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr);
 const run=JSON.parse(await readFile(path.join(catalog,sample+'-run.json'),'utf8'));
 console.log(JSON.stringify({sample,...run}));
}
await writeFile(path.join(root,'docs/remediation-2026-10-28/portable-workspace.json'),JSON.stringify({directory,runner,catalog,review_status:'pending_real_independent_review'},null,2));
