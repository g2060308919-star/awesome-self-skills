import path from 'node:path';
import { assertNoSecrets } from './redaction.mjs';
import { validateBrowserSession } from './browser-session.mjs';
import { validateProxyPolicy } from './proxy-authorization.mjs';
function requireValue(ok,message) { if(!ok) { const error=new Error(message); error.code='RUN_CONSISTENCY'; throw error; } }
const text=value=>typeof value==='string' && value.trim().length>0;
function keys(event,fields) { const allowed=new Set(['type','sequence','at',...fields]); requireValue(Object.keys(event).every(key=>allowed.has(key)),`${event.type} 包含未知字段`); }
function safePaths(value) {
 if(!value || typeof value!=='object') return;
 for(const [key,item] of Object.entries(value)) {
  if(/(?:^|_)path$/.test(key) && typeof item==='string') requireValue(!path.isAbsolute(item) && !item.split(/[\\/]/).includes('..') && !item.includes('\\'),'新增事实的路径必须是 Run 内相对路径');
  safePaths(item);
 }
}
function refs(log,values,label,{empty=false,types}={}) {
 requireValue(Array.isArray(values) && (empty || values.length>0) && new Set(values).size===values.length,`${label} 缺少无重复依据引用`);
 return values.map(ref=>{ const fact=(log.events??[]).find(item=>item.sequence===ref); requireValue(Number.isInteger(ref) && fact && (!types || types.includes(fact.type)),`${label} 引用不存在或类型不符`); return fact; });
}
function checkpointIds(cases) { return new Set(cases.cases.flatMap(c=>c.steps.flatMap(s=>s.expected.map(o=>`${c.case_id}/${s.step_id}/${o.oracle_id}`)))); }
function scope(cases,ids) { const all=checkpointIds(cases); requireValue(Array.isArray(ids) && ids.length>0 && new Set(ids).size===ids.length && ids.every(id=>all.has(id)),'事实需要有效原检查点范围'); }
function evidenceRefs(log,event) {
 if(event.evidence_refs===undefined) return;
 requireValue(Array.isArray(event.evidence_refs) && new Set(event.evidence_refs).size===event.evidence_refs.length,'evidence_refs 必须是无重复数组');
 const known=new Map((log.events??[]).flatMap(item=>item.evidence??[]).map(item=>[item.evidence_id,item]));
 for(const id of event.evidence_refs) requireValue(known.has(id) && (event.checkpoint_ids??[]).some(cp=>known.get(id).checkpoint_ids.includes(cp)),'新增事实引用未登记或范围不符的证据');
}
export function reduceActions(events) {
 const actions=new Map();
 for(const event of events??[]) {
  if(!event.action_id) continue;
  const previous=actions.get(event.action_id);
  if(event.type==='action_planned') actions.set(event.action_id,{action_id:event.action_id,state:'unissued',side_effect:event.side_effect===true,replay_allowed:true,last_event:event});
  if(event.type==='action_dispatched') actions.set(event.action_id,{action_id:event.action_id,state:'dispatched_unknown',side_effect:event.side_effect===true,replay_allowed:false,last_event:event});
  if(['effect_observed','action_confirmed'].includes(event.type) && previous) {
   const state=event.outcome??'confirmed_success';
   actions.set(event.action_id,{...previous,state,replay_allowed:state==='not_submitted',last_event:event});
  }
 }
 return actions;
}
export function validateExecutionFact(cases,log,event) {
 const events=log.events??[];
 requireValue(!["activity_start", "activity_end", "activity_complete", "retake_link"].includes(event.type), "旧活动计时或跨 Run 补测事件不受支持；当前任务不迁移旧流程");
 if(['checkpoint_result','checkpoint_started'].includes(event.type)) {
  requireValue(!events.some(item=>item.type==='checkpoint_result' && item.checkpoint_id===event.checkpoint_id && (item.status??'completed')==='completed'),'原检查点已终结，不可覆盖；请追加补充尝试');
 }
 if(event.type==='browser_session') return validateBrowserSession(log,event);
 if(event.type==='proxy_policy') return validateProxyPolicy(log,event);
 if(['action_planned','action_dispatched','action_confirmed'].includes(event.type)) requireValue(text(event.action_id), '动作必须有非空 action_id，未知写入不可遗漏');
 if(['action_planned','action_dispatched','action_confirmed','effect_observed'].includes(event.type) && event.action_id) {
  const previous=reduceActions(events).get(event.action_id);
  if(['action_planned','action_dispatched'].includes(event.type)) requireValue(!previous || (event.type==='action_dispatched' && previous.replay_allowed),'已确认或效果不明动作禁止重复派发');
  if(['action_planned','action_dispatched'].includes(event.type)) {
   scope(cases,[event.checkpoint_id]);
   requireValue(typeof event.side_effect === 'boolean', '动作必须明确 side_effect，不能按 HTTP 方法猜测');
   requireValue(!previous || previous.side_effect === event.side_effect, '重试不得改变动作副作用属性');
   if(event.type === 'action_dispatched') {
    const proxy = events.filter(item => item.type === 'proxy_state').at(-1)?.proxy;
    const session = events.filter(item => item.type === 'browser_session').at(-1);
    const unsafe = proxy?.state === 'isolation_unknown' || ['disconnected','target_lost','retired'].includes(session?.phase);
    requireValue(!unsafe || (event.purpose === 'isolation_cleanup' && event.side_effect === false), '隔离或会话未知，停止业务操作并先恢复安全状态');
   }
  }
  if(['action_confirmed','effect_observed'].includes(event.type)) {
   requireValue(previous?.state==='dispatched_unknown','效果观察必须引用未终结的已派发动作');
   requireValue(['confirmed_success','confirmed_failure','not_submitted'].includes(event.outcome??'confirmed_success'),'动作效果状态无效');
   const observed = refs(log,event.fact_refs,'动作效果依据',{types:['page_observation','network_observation']});
   requireValue(observed.every(fact => fact.action_id === event.action_id && fact.sequence > previous.last_event.sequence && (!previous.last_event.checkpoint_id || fact.checkpoint_ids?.includes(previous.last_event.checkpoint_id))), '动作效果依据必须属于本动作、本检查点且晚于派发，不能借用旧事实重试');
   requireValue(text(event.description),'动作效果需要可读观察');
  }
 }
 const custom=['preparation_adjustment','form_interaction','supplementary_attempt','checkpoint_semantics','mock_channel_coverage'];
 if(!custom.includes(event.type)) return;
 assertNoSecrets(event); safePaths(event); evidenceRefs(log,event);
 if(event.type==='checkpoint_semantics') {
  keys(event,['checkpoint_id','assertion_domain','condition_kind','basis']); scope(cases,[event.checkpoint_id]);
  requireValue(['frontend','real_backend','real_permission'].includes(event.assertion_domain) && ['fixed','preparation','direct'].includes(event.condition_kind) && text(event.basis),'检查点语义分类或依据缺失');
  requireValue(!events.some(item=>item.checkpoint_id===event.checkpoint_id && ['checkpoint_semantics','checkpoint_started','checkpoint_result'].includes(item.type)),'检查点语义必须在执行前登记且不可覆写'); return;
 }
 if(event.type==='mock_channel_coverage') {
  keys(event,['target_id','context_ref','scenario_hash','covered_route_ids','request_refs','uncovered_channels','channels']);
  requireValue(text(event.target_id) && text(event.context_ref) && /^[a-f0-9]{64}$/.test(event.scenario_hash),'通道绑定标识缺失');
  refs(log,event.request_refs,'通道覆盖',{types:['network_observation']});
  requireValue(Array.isArray(event.uncovered_channels) && Array.isArray(event.channels) && Array.isArray(event.covered_route_ids),'通道核验结构无效'); return;
 }
 scope(cases,event.checkpoint_ids);
 if(event.type==='preparation_adjustment') {
  keys(event,['adjustment_id','checkpoint_ids','classification','original','replacement','basis_refs','unchanged_goal_reason','support_scope','verification_refs','evidence_refs']);
  requireValue(text(event.adjustment_id) && !events.some(item=>item.type===event.type && item.adjustment_id===event.adjustment_id),'准备调整 ID 缺失或重复');
  requireValue(event.classification==='preparation','核心条件不可替代后提升原结果，只能追加补充观察');
  requireValue(event.original!==undefined && event.replacement!==undefined && text(event.unchanged_goal_reason) && text(event.support_scope),'准备调整缺少原值、替代值、目标不变理由或支持范围');
  requireValue(!events.some(item=>item.type==='checkpoint_semantics' && event.checkpoint_ids.includes(item.checkpoint_id) && item.condition_kind!=='preparation'),'固定或直接核心条件不得作为准备调整');
  refs(log,event.basis_refs,'调整依据');
  const verified=refs(log,event.verification_refs,'准备验证',{types:['page_observation','network_observation','form_interaction']});
  requireValue(verified.every(item=>item.type!=='form_interaction' || ['readback','uploaded','saved'].includes(item.stage)),'准备数据尚未完成实际验证');
 }
 if(event.type==='form_interaction') {
  keys(event,['interaction_id','checkpoint_ids','control_kind','stage','method','description','actual_value','fact_refs','evidence_refs']);
  requireValue(text(event.interaction_id) && ['text','date','file','save'].includes(event.control_kind) && text(event.method) && text(event.description),'控件交互标识、类型或操作事实缺失');
  const stages={text:['tool_filled','confirmed','readback'],date:['tool_filled','confirmed','readback'],file:['file_selected','uploaded'],save:['saved']};
  requireValue(stages[event.control_kind].includes(event.stage),'控件阶段无效，不得混淆填入、上传和保存');
  const prior=events.filter(item=>item.type==='form_interaction' && item.interaction_id===event.interaction_id);
  requireValue(prior.every(item=>item.control_kind===event.control_kind && JSON.stringify(item.checkpoint_ids)===JSON.stringify(event.checkpoint_ids)),'交互标识不得跨控件或范围复用');
  if(!['tool_filled','file_selected'].includes(event.stage)) refs(log,event.fact_refs,'实际控件事实',{types:['page_observation','network_observation']});
  if(event.stage==='readback') { requireValue(prior.some(item=>item.stage==='confirmed'),'回读前必须实际提交或组件确认'); requireValue(event.actual_value!==undefined,'回读必须记录实际可见值'); }
  if(event.stage==='uploaded') requireValue(prior.some(item=>item.stage==='file_selected'),'上传前必须记录实际文件选择');
 }
 if(event.type==='supplementary_attempt') {
  keys(event,['attempt_id','checkpoint_ids','phase','result','description','fact_refs','evidence_refs','source']);
  requireValue(text(event.attempt_id) && ['started','result'].includes(event.phase) && text(event.description) && ['real','mock'].includes(event.source),'补充尝试结构或来源无效');
  const prior=events.filter(item=>item.type===event.type && item.attempt_id===event.attempt_id);
  if(event.phase==='started') requireValue(prior.length===0,'补充尝试不得重复开始');
  else { requireValue(prior.length===1 && prior[0].phase==='started' && JSON.stringify(prior[0].checkpoint_ids)===JSON.stringify(event.checkpoint_ids) && prior[0].source===event.source,'补充结果必须匹配开始范围且不可覆写'); requireValue(['passed','failed','undetermined'].includes(event.result),'补充结果无效'); refs(log,event.fact_refs,'补充观察',{types:['page_observation','network_observation','mock_observation','form_interaction']}); }
 }
}
export function validateExecutionFacts(cases,log) {
 const replay={...log,events:[]};
 for(const event of log.events??[]) { validateExecutionFact(cases,replay,event); replay.events.push(event); }
}
export function executionProvenance(log,checkpointIds) {
 const related=event=>(event.checkpoint_ids??[]).some(id=>checkpointIds.includes(id));
 return {adjustments:(log.events??[]).filter(event=>event.type==='preparation_adjustment' && related(event)),supplementary:(log.events??[]).filter(event=>event.type==='supplementary_attempt' && related(event)),forms:(log.events??[]).filter(event=>event.type==='form_interaction' && related(event))};
}
