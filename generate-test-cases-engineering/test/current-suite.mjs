import {readdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const excluded=new Set(JSON.parse(await readFile('test-history/excluded-current-suite.json','utf8')).excluded.map((/** @type {any} */ e)=>e.file));
const selected=[];
for(const folder of ['core','golden','interface','recovery'])for(const name of await readdir('test/'+folder)){
 if(!name.endsWith('.test.mjs'))continue;
 if(!excluded.has('test/'+folder+'/'+name))selected.push('test/'+folder+'/'+name);
}
selected.push('test/repeatability/current-installed.repeat.mjs');
selected.sort();
const child=spawn(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...selected],{stdio:'inherit'});
child.on('exit',(/** @type {number} */ code)=>{process.exitCode=code??1;});
