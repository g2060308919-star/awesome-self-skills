import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generate} from './local-generation.mjs';
const fixtures=fileURLToPath(new URL('../fixtures/remediation/',import.meta.url));
const catalog=path.resolve(process.argv[2]??'docs/remediation-2026-10-28/acceptance/adversarial');
const rows=JSON.parse(await readFile(path.join(fixtures,'minimal-scenarios.json'),'utf8'));
const original=await readFile(path.join(fixtures,'minimal.md'),'utf8');
const content=original.replace('保存失败时保留弹窗和输入内容，允许再次保存。','');
assert.notEqual(content,original);
await mkdir(catalog,{recursive:true});
await writeFile(path.join(catalog,'AT20-source.md'),content);
const at20=await generate('minimal',path.join(catalog,'AT20'),{content,rows:rows.filter((/** @type {any} */ r)=>r.key!=='failure'),expectClarification:true,prepare(/** @type {any} */ fixture){
 // Agent-authored gap based on the missing rule. No default recovery is invented.
 const e=fixture.evidencePayload,claims=fixture.refs(['合法时新增一条草稿记录并关闭弹窗。']);
 e.fact_ledger.push({fact_id:'FACT-failure-unknown',statement:'保存失败后的弹窗、输入内容和再次保存行为未定义',status:'ambiguous',acceptance_role:'primary_acceptance',claim_ids:claims,module_refs:['configuration'],field_path:'/rule'});
 e.acceptance_role_assignments.push({entity_kind:'fact',entity_id:'FACT-failure-unknown',scope_ref:'configuration',acceptance_role:'primary_acceptance',parent_entity_ids:[],role_basis_claim_ids:claims});
 e.semantic_gaps.push({category:'semantic_gap',code:'SAVE_FAILURE_UNDEFINED',subject_fact_ids:['FACT-failure-unknown'],missing_aspect:'failure_recovery',scope_ref:'configuration',question:'保存请求失败时弹窗和已填名称如何处理，是否允许再次保存？',why_needed:'本地材料只规定成功结果，失败后的可观察行为没有定义。',decision_impact:'无法确定失败场景的预期与恢复步骤。',unresolved_outcome:'失败恢复用例无法确定。',answer_options:['说明失败后的弹窗、输入与重试规则','当前无法确定'],risk_level:'high',source_claim_ids:claims,discovery_phase:'pre_case',affected_test_point_ids:[],acceptance_impact:{classification:'critical',criteria:['makes_required_result_undecidable'],rationale:'保存失败是所验收保存行为的未决结果，不能猜测弹窗、输入与重试规则。'}});
}});
const incorrect=structuredClone(rows);
for(const [key,expected] of [['readonly-create','允许只读用户保存并新增一条记录'],['name-ten','十个字母不提交并提示“名称最多9个字母”'],['name-one','新增一条生效中记录并关闭弹窗'],['failure','失败后关闭弹窗并清空名称，不能再次保存']]){
 const row=incorrect.find((/** @type {any} */ r)=>r.key===key);row.expected=expected;row.oracles=[{after:row.steps.length-1,expected}];
}
const at22=await generate('minimal',path.join(catalog,'AT22'),{rows:incorrect});
const at23=await generate('minimal',path.join(catalog,'AT23'),{rows:rows.filter((/** @type {any} */ r)=>r.key!=='cancel')});
await writeFile(path.join(catalog,'runs.json'),JSON.stringify({AT20:at20.run,AT22:at22.run,AT23:at23.run},null,2));
console.log(JSON.stringify({AT20:at20.run,AT22:at22.run,AT23:at23.run}));
