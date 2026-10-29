// The immutable snapshot and event stream are the only progress authority.
// This module deliberately does not import permission, coverage or Mock reducers.
import { failureExplanationDeliverable } from './failed-explanation.mjs';
const text = value => typeof value === 'string' && value.trim().length > 0;
const definite = result => ['passed', 'failed'].includes(result);
function requireValue(ok, message) {
  if (!ok) throw Object.assign(new Error(message), { code: 'RUN_CONSISTENCY' });
}
function keys(value, allowed, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} 必须是对象`);
  requireValue(Object.keys(value).every(key => allowed.includes(key)), `${label} 包含未知字段`);
}
function strings(value, label, empty = false) {
  requireValue(Array.isArray(value) && (empty || value.length) && value.every(text) && new Set(value).size === value.length, `${label} 必须是无重复字符串数组`);
}
const eventAt = (log, ref) => (log.events ?? []).find(event => event.sequence === ref);
function facts(log, refs, label, types) {
  requireValue(Array.isArray(refs) && refs.length > 0 && new Set(refs).size === refs.length, `${label} 缺少事实引用`);
  return refs.map(ref => {
    const fact = eventAt(log, ref);
    requireValue(Number.isInteger(ref) && fact && (!types || types.includes(fact.type)), `${label} 引用不存在或类型不符`);
    return fact;
  });
}
export const batchIdForScope = scope => [...scope.group_ids].sort().join('+') || 'general';
export function requiredScenarios(log) {
  const plan = (log.events ?? []).filter(event => event.type === 'coverage_plan').at(-1);
  return (plan?.items ?? []).flatMap(item => item.scopes.flatMap(scope =>
    (scope.scenario_requirements ?? [{ scenario_id: scope.scope_id, step_refs: scope.step_refs, source_refs: scope.source_refs,
      preconditions: scope.preconditions ?? [], assertion_kind: scope.assertion_kind ?? 'ui', assertion_domain: scope.assertion_domain ?? 'frontend', chain_id: scope.chain_id ?? null }]).map(scene => ({
      ...scene,
      assertion_domain: (log.events ?? []).find(event => event.type === 'checkpoint_semantics' && event.checkpoint_id === item.checkpoint_id)?.assertion_domain ?? scene.assertion_domain,
      checkpoint_id: item.checkpoint_id, scope_id: scope.scope_id, group_ids: scope.group_ids,
      batch_id: batchIdForScope(scope), dependencies: item.dependencies
    }))));
}
export function scenarioForEvent(log, event) {
  const selected = requiredScenarios(log).filter(scene => scene.checkpoint_id === event.checkpoint_id &&
    (event.scenario_id ? scene.scenario_id === event.scenario_id : true));
  requireValue(selected.length === 1, '事件必须精确关联已计划的必测场景 scenario_id');
  return selected[0];
}
export function validateScenarioPlan(log, event) {
  const ids = new Set();
  for (const item of event.items) for (const scope of item.scopes) {
    const scenes = scope.scenario_requirements;
    if (scope.assertion_kind !== undefined) requireValue(['ui','response_consumption','request_behavior'].includes(scope.assertion_kind), 'scope assertion_kind 无效');
    if (scope.assertion_domain !== undefined) requireValue(['frontend','real_backend','real_permission'].includes(scope.assertion_domain), 'scope assertion_domain 无效');
    if (scope.preconditions !== undefined) strings(scope.preconditions,'scope preconditions',true);
    if (scope.chain_id !== undefined) requireValue(scope.chain_id === null || text(scope.chain_id), 'scope chain_id 无效');
    if (scenes !== undefined) requireValue(['assertion_kind','assertion_domain','preconditions','chain_id'].every(key => scope[key] === undefined), '多场景语义须在scenario_requirements明确，不能与scope重复');
    if (scenes !== undefined) {
      requireValue(Array.isArray(scenes) && scenes.length > 1, '单一场景直接使用 scope_id，不重复建立场景清单');
      for (const scene of scenes) {
        keys(scene, ['scenario_id', 'step_refs', 'source_refs', 'preconditions', 'assertion_kind', 'assertion_domain', 'chain_id'], 'scenario_requirements');
        strings(scene.step_refs, '场景 step_refs'); strings(scene.preconditions, '场景 preconditions', true);
        requireValue(scene.step_refs.every(ref => scope.step_refs.includes(ref)), '场景步骤超出原范围');
        requireValue(Array.isArray(scene.source_refs) && scene.source_refs.length > 0 && scene.source_refs.every(ref => scope.source_refs.includes(ref)), '场景来源必须属于原范围');
        requireValue(['ui', 'response_consumption', 'request_behavior'].includes(scene.assertion_kind), '场景 assertion_kind 无效');
        requireValue(['frontend', 'real_backend', 'real_permission'].includes(scene.assertion_domain), '场景 assertion_domain 无效');
        requireValue(scene.chain_id === null || text(scene.chain_id), '场景 chain_id 无效');
      }
    }
    for (const scene of scenes ?? [{ scenario_id: scope.scope_id }]) {
      requireValue(text(scene.scenario_id) && !ids.has(scene.scenario_id), '必测场景 ID 缺失或重复'); ids.add(scene.scenario_id);
    }
  }
  const previous = (log.events ?? []).filter(item => item.type === 'coverage_plan').at(-1);
  if (previous) for (const item of event.items) for (const scope of item.scopes) {
    const before = previous.items.flatMap(item => item.scopes).find(item => item.scope_id === scope.scope_id);
    requireValue(['scenario_requirements','assertion_kind','assertion_domain','preconditions','chain_id'].every(key => JSON.stringify(before?.[key]) === JSON.stringify(scope[key])), '不得改写必测场景语义');
  }
  batchOrder({ ...log, events: [...log.events, event] });
}
export function batchOrder(log) {
  const scenes = requiredScenarios(log);
  const original = (log.cases ?? []).flatMap(item => (item.checkpoints ?? []).map(cp => `${item.case_id}/${cp.step_id}/${cp.oracle_id}`));
  const ordered = [...scenes].sort((a,b) => original.indexOf(a.checkpoint_id) - original.indexOf(b.checkpoint_id));
  const order = [...new Set(ordered.map(scene => scene.batch_id))];
  const edges = new Map(order.map(id => [id, new Set()]));
  for (const scene of scenes) for (const dependency of scene.dependencies ?? []) {
    if (dependency.condition_kind === 'preparation' && (log.events ?? []).filter(event => event.type === 'mock_policy').at(-1)?.decision === 'allowed') continue;
    for (const ref of dependency.checkpoint_refs) for (const parent of scenes.filter(item => item.checkpoint_id === ref)) {
      if (parent.batch_id !== scene.batch_id) edges.get(scene.batch_id).add(parent.batch_id);
    }
  }
  const sorted = [];
  while (sorted.length < order.length) {
    const next = order.find(id => !sorted.includes(id) && [...edges.get(id)].every(parent => sorted.includes(parent)));
    requireValue(next, '输入冲突：原必需动作要求跨权限返回，无法安排连续批次；请明确输入，不得改写原用例');
    sorted.push(next);
  }
  return sorted;
}
const isResult = event => event.type === 'checkpoint_result' || (event.type === 'mock_checkpoint' && event.action === 'result');
const isStart = event => event.type === 'checkpoint_started' || (event.type === 'mock_checkpoint' && event.action === 'started');
function belongs(event, scene) {
  return event.checkpoint_id === scene.checkpoint_id && (event.scenario_id ?? scene.scope_id) === scene.scenario_id;
}
function aggregate(results) {
  if (results.includes('failed')) return 'failed';
  if (results.length && results.every(result => result === 'passed')) return 'passed';
  if (results.length && results.every(result => result === 'not_executed')) return 'not_executed';
  return 'undetermined';
}
export function deriveExecutionProgress(testCases, log) {
  const events = log.events ?? [];
  const policy = events.filter(event => event.type === 'mock_policy').at(-1)?.decision ?? null;
  const attempts = new Map();
  for (const event of events.filter(event => event.type === 'mock_attempt')) attempts.set(event.attempt_id, event);
  const openHelp = new Map();
  for (const event of events.filter(event => event.type === 'assistance')) {
    if (event.phase === 'requested') openHelp.set(event.assistance_id, new Set(event.checkpoint_ids));
    else for (const id of event.checkpoint_ids ?? []) openHelp.get(event.assistance_id)?.delete(id);
  }
  const scenes = requiredScenarios(log).map(scene => {
    const results = events.filter(event => isResult(event) && belongs(event, scene));
    const executions = results.filter(result => definite(result.result)).map(result => {
      const prep = events.find(event => event.type === 'scenario_preparation' && event.execution_id === result.execution_id && belongs(event, scene));
      const start = events.find(event => isStart(event) && event.execution_id === result.execution_id && belongs(event, scene));
      const action = events.find(event => event.type === 'action_dispatched' && event.execution_id === result.execution_id && belongs(event, scene) && event.sequence > (start?.sequence ?? Infinity));
      const observation = events.find(event => event.type === 'page_observation' && event.execution_id === result.execution_id && event.scenario_id === scene.scenario_id && event.checkpoint_ids?.includes(scene.checkpoint_id) && event.sequence > (action?.sequence ?? Infinity) && event.sequence < result.sequence);
      const mock = result.type === 'mock_checkpoint';
      const closed = !mock || (attempts.get(result.attempt_id)?.action === 'finished' && events.some(event => event.type === 'mock_disposition' && event.attempt_id === result.attempt_id && event.outcome === 'supplemented'));
      return { result, prep, executed: !!(prep && start && action && observation), closed, source: mock || prep?.data_source === 'mock' || prep?.permission_source === 'mock' ? 'mock' : 'real' };
    });
    const valid = executions.filter(item => item.executed && item.closed);
    const effective = aggregate(valid.map(item => item.result.result));
    const selected = valid.find(item => item.result.result === effective) ?? valid.at(-1);
    const open_assistance = [...openHelp.values()].some(ids => ids.has(scene.checkpoint_id));
    const terminal = results.some(event => ['undetermined', 'not_executed'].includes(event.result));
    const undeterminedResults = results.filter(event => event.result === 'undetermined');
    const ruleGapComplete = policy === 'allowed' && undeterminedResults.length > 0 && undeterminedResults.every(event => event.mock_rule_gap === true);
    return { ...scene, prepared: events.some(event => event.type === 'scenario_preparation' && belongs(event, scene)),
      executed: valid.length > 0, effective_result: effective, source: selected?.source ?? 'real',
      result_ref: selected?.result.sequence ?? null, execution_id: selected?.result.execution_id ?? null,
      attempt_id: selected?.result.attempt_id ?? null, scenario_hash: selected?.prep.scenario_hash ?? null,
      data_source: selected?.prep.data_source ?? null, permission_source: selected?.prep.permission_source ?? null,
      state_version: selected?.prep.state_version ?? null, reason: selected?.result.reason ?? results.at(-1)?.reason ?? '场景尚待执行', open_assistance,
      complete: !open_assistance && (valid.length > 0 || (policy === 'declined' && terminal) || ruleGapComplete) };
  });
  // A named state chain cannot be assembled from unrelated attempts/versions.
  for (const chain of new Set(scenes.map(scene => scene.chain_id).filter(Boolean))) {
    const linked = scenes.filter(scene => scene.chain_id === chain && scene.source === 'mock' && scene.executed);
    if (new Set(linked.map(scene => `${scene.attempt_id}:${scene.scenario_hash}`)).size > 1) {
      for (const scene of linked) { scene.complete = false; if (scene.effective_result !== 'failed') scene.effective_result = 'undetermined'; }
    }
  }
  const checkpoints = testCases.cases.flatMap(testCase => testCase.steps.flatMap(step => step.expected.map(oracle => {
    const id = `${testCase.case_id}/${step.step_id}/${oracle.oracle_id}`;
    const own = scenes.filter(scene => scene.checkpoint_id === id);
    const excluded = testCase.excluded === true;
    return { checkpoint_id: id, case_id: testCase.case_id, scenes: own,
      effective_result: excluded ? 'not_executed' : aggregate(own.map(scene => scene.effective_result)),
      complete: excluded ? policy === 'declined' : own.length > 0 && own.every(scene => scene.complete),
      source: own.some(scene => scene.source === 'mock') ? 'mock' : 'real' };
  })));
  const cases = testCases.cases.map(testCase => {
    const own = checkpoints.filter(item => item.case_id === testCase.case_id);
    return { case_id: testCase.case_id, effective_result: aggregate(own.map(item => item.effective_result)), complete: own.every(item => item.complete), source: own.some(item => item.source === 'mock') ? 'mock' : 'real' };
  });
  const batches = batchOrder(log).map(id => ({ batch_id: id, scenes: scenes.filter(scene => scene.batch_id === id),
    complete: scenes.filter(scene => scene.batch_id === id).every(scene => scene.complete) }));
  const lastBatch = events.filter(event => event.type === 'permission_batch').at(-1);
  const activeBatch = lastBatch?.phase !== 'drained' ? lastBatch?.batch_id ?? lastBatch?.group_id : null;
  const pendingBatch = batches.find(batch => !batch.complete)?.batch_id ?? null;
  return { policy, scenes, checkpoints, cases, batches, active_batch_id: activeBatch ?? pendingBatch,
    complete: cases.every(item => item.complete) && ![...attempts.values()].some(event => !['finished', 'aborted'].includes(event.action)),
    stopped: events.some(event => event.type === 'assistance' && event.phase === 'stop_run' && event.decision_source === 'user') };
}
export function assertExecutionComplete(testCases, log, batchId) {
  const progress = deriveExecutionProgress(testCases, log);
  if (!batchId && progress.stopped) return;
  const complete = batchId ? progress.batches.find(batch => batch.batch_id === batchId)?.complete : progress.complete;
  requireValue(complete, `仍有未实际执行的必测场景或未解决协作，不能${batchId ? ' drained 权限批次' : '正常完成 Run / 最终交付'}`);
}
export function freshContext(log, context) {
  return context?.verification === 'verified' && !(log.events ?? []).some(event => event.sequence > context.sequence && (
    event.type === 'resume_check' || (event.type === 'run_state' && ['awaiting_user', 'interrupted'].includes(event.status ?? event.state)) ||
    (event.type === 'execution_context_change' && (event.context_ref === context.context_ref || event.target_ids?.includes(context.target_id))) ||
    (event.type === 'permission_availability' && requiredScenarios(log).some(scene => context.scope_ids?.includes(scene.scope_id) && scene.group_ids.includes(event.group_id))) ||
    (event.type === 'identity_observation' && event.target_id === context.target_id && event.context_ref === context.context_ref && event.observed_account_ref !== context.observed_account_ref) ||
    (event.type === 'role_observation' && event.observation?.target_id === context.target_id && event.observation?.context_ref === context.context_ref && event.observation?.observed_account_ref !== context.observed_account_ref) ||
    (event.type === 'browser_session' && ['disconnected', 'target_lost', 'retired'].includes(event.phase))
  ));
}
export function validateProgressEvent(testCases, log, event) {
  const events = log.events ?? [];
  if (Object.hasOwn(event, 'mock_rule_gap')) {
    const decision = events.filter(item => item.type === 'mock_policy').at(-1)?.decision;
    requireValue(event.type === 'checkpoint_result' && event.result === 'undetermined' && event.mock_rule_gap === true && decision === 'allowed',
      'mock_rule_gap 只允许在允许 Mock 且结果为 undetermined 时为 true');
    const known = Array.isArray(event.exploration_summary?.known_facts) ? event.exploration_summary.known_facts.join('\n') : '';
    requireValue(typeof event.exploration_summary?.missing_fact === 'string' && event.exploration_summary.missing_fact.includes('页面结果'),
      'mock_rule_gap 的 exploration_summary 必须写明缺少哪个接口的哪个页面结果');
    requireValue(known.includes('唯一字段'), 'mock_rule_gap 必须写明真实请求没有确定出唯一字段');
    requireValue(/用户没有提供|不在已写入/.test(known), 'mock_rule_gap 必须写明用户没有提供该字段，或该页面结果不在已写入的对应关系里');
  }
  if (event.type === 'coverage_plan') {
    validateScenarioPlan(log,event);
    const mode = events.filter(item => item.type === 'mock_policy').at(-1)?.decision;
    if (mode === 'allowed') {
      requireValue(!testCases.cases.some(item => item.excluded), '输入冲突：允许 Mock 全量模式不能包含预排除；请明确输入后新建 Run');
      requireValue(requiredScenarios({...log,events:[...events,event]}).every(scene => scene.assertion_domain === 'frontend'), '输入冲突：真实后端或服务端权限专属断言不能改为前端 Mock，请明确输入');
    }
    return;
  }
  const progress = deriveExecutionProgress(testCases, log);
  if (event.type === 'checkpoint_semantics' && progress.policy === 'allowed') requireValue(event.assertion_domain === 'frontend', '输入冲突：真实后端或真实权限专属断言不能改为前端 Mock，请明确输入');
  if (event.type === 'run_state' && (event.status ?? event.state) === 'completed') return assertExecutionComplete(testCases, log);
  if (event.type === 'permission_batch') {
    const id = event.batch_id ?? event.group_id;
    requireValue(progress.batches.some(batch => batch.batch_id === id), '权限批次不属于固定计划');
    const previous = events.filter(item => item.type === 'permission_batch').at(-1);
    requireValue(!events.some(item => item.type === 'permission_batch' && (item.batch_id ?? item.group_id) === id && item.phase === 'drained'), '已结束权限配置不得返回或重开');
    if (previous && (previous.batch_id ?? previous.group_id) !== id) requireValue(previous.phase === 'drained', '当前连续权限批次尚未 drained，不得切换配置');
    requireValue(id === progress.active_batch_id || (event.phase === 'drained' && id === (previous?.batch_id ?? previous?.group_id)), '只能执行固定顺序中的当前权限批次');
    if (event.phase === 'drained') assertExecutionComplete(testCases, log, id);
    return;
  }
  if (event.type === 'identity_observation') {
    keys(event, ['type','sequence','at','account_ref','observed_account_ref','target_id','context_ref','environment_ref','observed_url','verification','fact_refs'], event.type);
    requireValue((event.account_ref === null || text(event.account_ref)) && event.account_ref === event.observed_account_ref && event.verification === 'verified', '实际身份核验缺失或不匹配');
    requireValue(text(event.context_ref) && text(event.environment_ref) && (log.browser?.owned_target_ids ?? []).includes(event.target_id), '实际身份必须绑定本 Run 自有 Target 和环境');
    const url = new URL(event.observed_url); requireValue(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, '身份入口 URL 无效');
    const basis = facts(log, event.fact_refs, '实际身份', ['page_observation','network_observation']);
    requireValue(basis.every(item => item.target_id === event.target_id && item.context_ref === event.context_ref), '身份依据的 Target 或上下文不一致'); return;
  }
  if (event.type === 'simulated_permission') {
    keys(event, ['type','sequence','at','group_id','identity_ref','gap_ref','contract_refs','input_description'], event.type);
    const identity = eventAt(log, event.identity_ref), gap = eventAt(log, event.gap_ref);
    requireValue(progress.policy === 'allowed' && identity?.type === 'identity_observation' && freshContext(log, identity), '权限模拟需要允许决定及新鲜真实身份');
    requireValue(gap?.type === 'data_gap' && gap.gap_kind === 'permission_unavailable' && gap.group_id === event.group_id && gap.identity_ref === event.identity_ref, '权限模拟需要明确不可提供资源缺口');
    facts(log, event.contract_refs, '模拟权限接口契约', ['network_observation','page_observation','assistance']);
    requireValue(text(event.input_description), '模拟权限输入缺少有依据的语义'); return;
  }
  const scoped = ['scenario_preparation','checkpoint_started','checkpoint_result','mock_checkpoint'];
  if (!scoped.includes(event.type)) return;
  if (event.type === 'checkpoint_result' && !definite(event.result) && !event.scenario_id) {
    const scenes = requiredScenarios(log).filter(scene => scene.checkpoint_id === event.checkpoint_id);
    requireValue(scenes.length === 1, '多场景阻塞结果必须精确关联 scenario_id'); return;
  }
  const scene = scenarioForEvent(log, event);
  if (event.type === 'scenario_preparation') {
    keys(event, ['type','sequence','at','checkpoint_id','scenario_id','execution_id','batch_id','context_refs','fact_refs','data_source','permission_source','attempt_id','scenario_hash','state_version','simulated_permission_ref','prepared_dependencies'], event.type);
    requireValue(text(event.execution_id) && !events.some(item => item.type === event.type && item.execution_id === event.execution_id), '场景 execution_id 缺失或重复');
    requireValue(event.batch_id === scene.batch_id && scene.batch_id === progress.active_batch_id, '场景准备不属于当前连续权限批次');
    requireValue(['real','mock'].includes(event.data_source) && ['real','mock'].includes(event.permission_source), '数据与权限来源必须分别声明');
    const contexts = facts(log,event.context_refs,'准备上下文',['coverage_context']);
    requireValue(contexts.every(context => freshContext(log,context) && context.scope_ids.includes(scene.scope_id)), '场景准备需要同范围新鲜身份上下文');
    const basis = facts(log,event.fact_refs,'前置输入',['page_observation','network_observation','form_interaction','preparation_adjustment']);
    requireValue(basis.every(item => item.checkpoint_ids?.includes(scene.checkpoint_id)), '前置输入事实不属于本检查点');
    if (event.data_source === 'mock' || event.permission_source === 'mock') {
      requireValue(progress.policy === 'allowed' && scene.assertion_domain === 'frontend', '模拟输入不能替代真实后端或服务端权限断言');
      const attempt = events.filter(item => item.type === 'mock_attempt' && item.attempt_id === event.attempt_id).at(-1);
      requireValue(attempt && ['started','resumed','scenario_updated'].includes(attempt.action) && attempt.scenario_hash === event.scenario_hash && (events.filter(item => item.type === 'mock_observation' && item.attempt_id === event.attempt_id).at(-1)?.state_after_version ?? attempt.state_version) === event.state_version, '模拟准备缺少当前相容场景/尝试/状态版本');
    } else requireValue(event.attempt_id === undefined && event.scenario_hash === undefined, '真实输入不得引用合成状态链');
    if (event.permission_source === 'mock') {
      const permission = eventAt(log,event.simulated_permission_ref);
      requireValue(permission?.type === 'simulated_permission' && scene.group_ids.includes(permission.group_id) && contexts.every(context => context.simulated_permission_ref === permission.sequence), '模拟权限准备缺少对应配置事实');
    } else requireValue(event.simulated_permission_ref === undefined && contexts.every(context => !context.simulated_permission_ref), '真实权限不得借用模拟权限上下文');
    if (event.prepared_dependencies !== undefined) {
      requireValue(Array.isArray(event.prepared_dependencies) && new Set(event.prepared_dependencies.map(item => item.dependency_id)).size === event.prepared_dependencies.length, '准备依赖必须唯一');
      for (const prepared of event.prepared_dependencies) {
        keys(prepared,['dependency_id','fact_refs'],'准备依赖');
        requireValue(scene.dependencies.some(dep => dep.dependency_id === prepared.dependency_id && dep.condition_kind === 'preparation'), '不得用模拟准备替代原必需操作');
        const supporting = facts(log,prepared.fact_refs,'准备依赖输入',['page_observation','network_observation','preparation_adjustment']);
        requireValue(supporting.every(fact => event.fact_refs.includes(fact.sequence)), '依赖准备须属于本场景输入事实');
      }
    }
    for (const dependency of scene.dependencies ?? []) for (const id of dependency.checkpoint_refs) {
      if (dependency.condition_kind === 'preparation' && event.data_source === 'mock' && event.prepared_dependencies?.some(item => item.dependency_id === dependency.dependency_id)) continue;
      const parent = progress.checkpoints.find(item => item.checkpoint_id === id);
      requireValue(parent?.complete && parent.effective_result === 'passed', `场景依赖尚未有效通过：${id}`);
      if (parent.source === 'mock') requireValue(event.data_source === 'mock' && parent.scenes.every(item => item.source !== 'mock' || (item.attempt_id === event.attempt_id && item.scenario_hash === event.scenario_hash)), '合成状态只能用于同一相容 Mock 链，不能进入真实写链');
    }
    return;
  }
  if (isStart(event)) {
    const preparation = eventAt(log,event.preparation_ref);
    requireValue(preparation?.type === 'scenario_preparation' && belongs(preparation,scene) && preparation.execution_id === event.execution_id, '场景必须先完成 preparation 前置输入验证');
    requireValue(event.scope_ids?.length === 1 && event.scope_ids[0] === scene.scope_id, '场景执行范围必须精确匹配计划 scope');
    requireValue(event.batch_id === undefined || event.batch_id === scene.batch_id, '事件批次与计划不一致');
    requireValue((event.attempt_id ?? null) === (preparation.attempt_id ?? null), '准备与执行必须属于同一 Mock 尝试');
    requireValue((event.type === 'mock_checkpoint') === (preparation.data_source === 'mock' || preparation.permission_source === 'mock'), '真实与模拟执行入口必须符合准备来源');
    if (event.attempt_id) {
      const current = events.filter(item => item.type === 'mock_attempt' && item.attempt_id === event.attempt_id).at(-1);
      const version = events.filter(item => item.type === 'mock_observation' && item.attempt_id === event.attempt_id).at(-1)?.state_after_version ?? current?.state_version;
      requireValue(current?.scenario_hash === preparation.scenario_hash && version === preparation.state_version, '场景准备的版本或状态已失效，必须基于当前场景重新准备');
    }
    requireValue(scene.batch_id === progress.active_batch_id, '当前连续权限批次未完成，不能启动其他配置');
    requireValue(!events.some(item => isStart(item) && item.execution_id === event.execution_id), '同一场景执行不得重复开始');
    requireValue((event.context_refs ?? []).every(ref => preparation.context_refs.includes(ref)) && preparation.context_refs.every(ref => freshContext(log,eventAt(log,ref))), '准备与执行上下文不一致或已失效'); return;
  }
  if (isResult(event) && definite(event.result)) {
    const start = events.find(item => isStart(item) && item.execution_id === event.execution_id && belongs(item,scene));
    requireValue(start && text(event.execution_id), '结果缺少同场景实际开始');
    requireValue(start.context_refs?.length > 0 && start.context_refs.every(ref => freshContext(log,eventAt(log,ref))), '场景结果上下文已失效，须重新核验；不能借用变化前的准备');
    if (event.attempt_id) {
      const preparation = eventAt(log,start.preparation_ref);
      const current = events.filter(item => item.type === 'mock_attempt' && item.attempt_id === event.attempt_id).at(-1);
      requireValue(current?.scenario_hash === preparation?.scenario_hash && start.attempt_id === event.attempt_id, '结果与准备的场景版本或尝试不一致');
    }
    requireValue(!events.some(item => isResult(item) && item.execution_id === event.execution_id), '同一执行结果不可覆盖');
    const action = events.find(item => item.type === 'action_dispatched' && item.execution_id === event.execution_id && belongs(item,scene) && item.sequence > start.sequence && (item.attempt_id ?? null) === (start.attempt_id ?? null));
    requireValue(action, 'passed/failed 均需要本场景真实触发，回执不能替代执行');
    const refs = [...new Set([...(event.execution_refs ?? []),...(event.page_observation_refs ?? [])])];
    const observed = facts(log,refs,'场景观察');
    const pages = observed.filter(item => item.type === 'page_observation' && item.scenario_id === scene.scenario_id && item.execution_id === event.execution_id && item.checkpoint_ids?.includes(scene.checkpoint_id) && item.sequence > action.sequence && (item.attempt_id ?? null) === (start.attempt_id ?? null));
    requireValue(pages.length > 0, 'passed/failed 均须引用本场景真实触发后的页面观察');
    if (event.result === 'failed') {
      requireValue(failureExplanationDeliverable(event.reason), '未通过原因必须写明实际操作顺序、预期与页面实际表现、实际表现和预期的差异；缺记录不能记为 failed');
      requireValue(pages.every(page => failureExplanationDeliverable(page.description)), '未通过的页面观察必须写明实际操作顺序、预期与页面实际表现、实际表现和预期的差异');
    }
    if (scene.assertion_kind === 'response_consumption' && event.result === 'passed') {
      const response = observed.filter(item => ['network_observation','mock_observation'].includes(item.type) && item.scenario_id === scene.scenario_id && item.execution_id === event.execution_id && item.sequence > action.sequence && (item.type === 'network_observation' ? Number.isInteger(item.response_status) : (item.disposition === 'mocked' && item.attempt_id === event.attempt_id && item.response_facts?.length > 0)));
      requireValue(response.length > 0 && pages.some(page => page.sequence > Math.max(...response.map(item => item.sequence))), '响应消费通过须有同场景匹配响应及随后页面事实');
    }
    if (scene.assertion_kind === 'request_behavior') {
      requireValue(observed.some(item => item.type === 'network_observation' && item.scenario_id === scene.scenario_id && item.execution_id === event.execution_id && item.sequence > action.sequence && item.request_window?.action_ref === action.sequence && Number.isInteger(item.request_window?.completion_ref) && pages.some(page => page.sequence === item.request_window.completion_ref) && text(item.request_window?.completion_basis) && Number.isInteger(item.request_window?.request_count) && item.request_window.request_count >= 0), '请求行为断言须有实际动作至控件完成的请求观察窗口，不能只固定等待');
    }
  }
}
export function validateProgressLog(testCases, log) {
  const replay = { ...log, browser:{owned_target_ids:[],preexisting_target_ids:[],attached_preexisting_target_ids:[]}, events: [] };
  for (const event of log.events ?? []) {
    validateProgressEvent(testCases,replay,event); replay.events.push(event);
    if (event.type === 'target_inventory') for (const key of ['owned_target_ids','preexisting_target_ids','attached_preexisting_target_ids']) if (event[key]) replay.browser[key] = event[key];
  }
  if (log.run.status === 'completed') assertExecutionComplete(testCases,log);
}
