const COVERAGE_VERSION = "1.0";
const PLAN_ACTIONS = new Set(["initial", "refine"]);
const LOCATION_STATES = new Set(["known", "needs_discovery"]);
const CONTEXT_VERIFICATIONS = new Set(["verified", "mismatch", "unconfirmed"]);
const SWITCH_STATES = new Set(["completed", "not_required", "incomplete", "unconfirmed"]);
const REVIEW_PURPOSES = new Set(["switch", "batch_end", "wait", "resume", "checkpoint_close", "final"]);
const CLOSURE_KINDS = new Set([
  "observed", "exploration_insufficient", "dependency_blocked", "user_decision", "data_handoff", "preexcluded"
]);

function failure(message) {
  const error = new Error(message);
  error.code = "RUN_CONSISTENCY";
  return error;
}

function requireValue(condition, message) {
  if (!condition) throw failure(message);
}

function string(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function rejectUnknown(value, allowed, label) {
  requireValue(object(value), `${label} 必须是对象`);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  requireValue(!unknown, `${label} 包含未知字段：${unknown}`);
}

function strings(value, label, { empty = false } = {}) {
  requireValue(Array.isArray(value) && (empty || value.length > 0), `${label} 必须是${empty ? "" : "非空"}字符串数组`);
  requireValue(value.every(string), `${label} 包含空值或非字符串`);
  requireValue(new Set(value).size === value.length, `${label} 包含重复值`);
}

function refs(value, label, { empty = false } = {}) {
  requireValue(Array.isArray(value) && (empty || value.length > 0), `${label} 必须是${empty ? "" : "非空"}引用数组`);
  requireValue(value.every(item => (Number.isInteger(item) && item > 0) || string(item)), `${label} 包含无效引用`);
  requireValue(new Set(value.map(String)).size === value.length, `${label} 包含重复引用`);
}

function checkpointRecords(testCases, log) {
  const records = new Map();
  for (let caseIndex = 0; caseIndex < testCases.cases.length; caseIndex += 1) {
    const sourceCase = testCases.cases[caseIndex];
    const loggedCase = log.cases?.[caseIndex];
    let checkpointIndex = 0;
    for (const step of sourceCase.steps) {
      for (const oracle of step.expected) {
        const checkpointId = `${sourceCase.case_id}/${step.step_id}/${oracle.oracle_id}`;
        records.set(checkpointId, {
          checkpoint_id: checkpointId,
          case_id: sourceCase.case_id,
          step_id: step.step_id,
          excluded: sourceCase.excluded === true,
          checkpoint: loggedCase?.checkpoints?.[checkpointIndex] ?? null
        });
        checkpointIndex += 1;
      }
    }
  }
  return records;
}

function permissionPlan(log) {
  return log.events?.find(event => event.type === "permission_plan") ?? null;
}

function planEvents(log) {
  return (log.events ?? []).filter(event => event.type === "coverage_plan");
}

function latestPlan(log) {
  return planEvents(log).at(-1) ?? null;
}

function planIndex(event) {
  return new Map((event?.items ?? []).map(item => [item.checkpoint_id, item]));
}

function scopeIndex(event) {
  const scopes = new Map();
  for (const item of event?.items ?? []) {
    for (const scope of item.scopes ?? []) scopes.set(scope.scope_id, { ...scope, checkpoint_id: item.checkpoint_id });
  }
  return scopes;
}

function groupOwners(plan) {
  const owners = new Map();
  for (const group of plan?.groups ?? []) {
    for (const checkpointId of group.checkpoint_ids ?? []) {
      const current = owners.get(checkpointId) ?? [];
      current.push(group.group_id);
      owners.set(checkpointId, current);
    }
  }
  return owners;
}

function groupsById(plan) {
  return new Map((plan?.groups ?? []).map(group => [group.group_id, group]));
}

function validateDependency(dependency, records, label) {
  rejectUnknown(dependency, new Set([
    "dependency_id", "step_refs", "checkpoint_refs", "required_fact", "source_refs"
  ]), label);
  requireValue(string(dependency.dependency_id), `${label}.dependency_id 必须非空`);
  strings(dependency.step_refs, `${label}.step_refs`);
  strings(dependency.checkpoint_refs, `${label}.checkpoint_refs`, { empty: true });
  for (const checkpointId of dependency.checkpoint_refs) {
    requireValue(records.has(checkpointId), `${label} 引用未知原检查点：${checkpointId}`);
  }
  requireValue(string(dependency.required_fact), `${label}.required_fact 必须非空`);
  refs(dependency.source_refs, `${label}.source_refs`);
}

function validatePlanEvent(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "action", "revision", "snapshot_hash", "items", "source", "sequence", "at"
  ]), "coverage_plan");
  requireValue(PLAN_ACTIONS.has(event.action), "coverage_plan.action 必须为 initial 或 refine");
  requireValue(Number.isInteger(event.revision) && event.revision > 0, "coverage_plan.revision 必须为正整数");
  requireValue(event.snapshot_hash === log.test_cases?.sha256, "coverage_plan.snapshot_hash 与不可变用例快照不一致");
  requireValue(string(event.source), "coverage_plan 缺少来源说明");
  requireValue(Array.isArray(event.items), "coverage_plan.items 必须是数组");
  const permission = permissionPlan(log);
  requireValue(permission, "coverage_plan 必须在 permission_plan 后建立");
  requireValue(!(log.events ?? []).some(item => ["case_started", "checkpoint_started", "checkpoint_result", "mock_checkpoint"].includes(item.type)),
    "coverage_plan.initial 必须在业务开始前建立");

  const previousPlans = planEvents(log);
  if (event.action === "initial") {
    requireValue(previousPlans.length === 0 && event.revision === 1, "coverage_plan.initial 只能建立一次且 revision 必须为 1");
  } else {
    const previous = previousPlans.at(-1);
    requireValue(previous && event.revision === previous.revision + 1, "coverage_plan.refine revision 必须连续递增");
  }

  const records = checkpointRecords(testCases, log);
  const owners = groupOwners(permission);
  const knownGroups = groupsById(permission);
  const checkpointIds = new Set();
  const scopeIds = new Set();
  const dependencyIds = new Set();
  for (const [itemIndex, item] of event.items.entries()) {
    const label = `coverage_plan.items[${itemIndex}]`;
    rejectUnknown(item, new Set(["checkpoint_id", "scopes", "dependencies"]), label);
    requireValue(records.has(item.checkpoint_id), `${label} 引用未知检查点：${item.checkpoint_id}`);
    requireValue(!checkpointIds.has(item.checkpoint_id), `${label}.checkpoint_id 重复`);
    checkpointIds.add(item.checkpoint_id);
    requireValue(Array.isArray(item.scopes), `${label}.scopes 必须是数组`);
    requireValue(records.get(item.checkpoint_id).excluded || item.scopes.length > 0, `${label} 缺少执行范围`);
    const allowedOwners = new Set(owners.get(item.checkpoint_id) ?? []);
    for (const [scopeIndexValue, scope] of item.scopes.entries()) {
      const scopeLabel = `${label}.scopes[${scopeIndexValue}]`;
      rejectUnknown(scope, new Set([
        "scope_id", "group_ids", "location_ref", "location_status", "step_refs", "source_refs",
        "known_entry_clue", "location_gap"
      ]), scopeLabel);
      requireValue(string(scope.scope_id) && !scopeIds.has(scope.scope_id), `${scopeLabel}.scope_id 缺失或重复`);
      scopeIds.add(scope.scope_id);
      strings(scope.group_ids, `${scopeLabel}.group_ids`, { empty: true });
      for (const groupId of scope.group_ids) {
        requireValue(knownGroups.has(groupId), `${scopeLabel} 引用未知权限组：${groupId}`);
        requireValue(allowedOwners.has(groupId), `${scopeLabel} 的权限组 ${groupId} 不属于检查点 ${item.checkpoint_id}`);
      }
      requireValue(scope.group_ids.length === allowedOwners.size && scope.group_ids.every(id => allowedOwners.has(id)),
        `${scopeLabel} 必须精确关联检查点已有权限组`);
      requireValue(LOCATION_STATES.has(scope.location_status), `${scopeLabel}.location_status 无效`);
      strings(scope.step_refs, `${scopeLabel}.step_refs`);
      const requiredStepRef = `${records.get(item.checkpoint_id).case_id}/${records.get(item.checkpoint_id).step_id}`;
      requireValue(scope.step_refs.includes(requiredStepRef), `${scopeLabel}.step_refs 缺少原步骤 ${requiredStepRef}`);
      refs(scope.source_refs, `${scopeLabel}.source_refs`);
      if (scope.location_status === "known") {
        requireValue(string(scope.location_ref), `${scopeLabel} 已知位置必须有 location_ref`);
        requireValue(scope.known_entry_clue === undefined && scope.location_gap === undefined,
          `${scopeLabel} 已知位置不得伪装为待发现缺口`);
      } else {
        requireValue(scope.location_ref === null, `${scopeLabel} 待发现位置不得伪造 location_ref`);
        requireValue(string(scope.known_entry_clue) && string(scope.location_gap), `${scopeLabel} 缺少已知入口线索或具体位置缺口`);
      }
    }
    requireValue(Array.isArray(item.dependencies), `${label}.dependencies 必须是数组`);
    for (const [dependencyIndex, dependency] of item.dependencies.entries()) {
      validateDependency(dependency, records, `${label}.dependencies[${dependencyIndex}]`);
      requireValue(!dependencyIds.has(dependency.dependency_id), `coverage_plan dependency_id 重复：${dependency.dependency_id}`);
      dependencyIds.add(dependency.dependency_id);
    }
  }
  if (event.action === "initial") {
    requireValue(checkpointIds.size === records.size && [...records.keys()].every(id => checkpointIds.has(id)),
      "coverage_plan.initial 必须精确覆盖全部原检查点，不能缺少或增加");
  } else {
    const previous = planIndex(previousPlans.at(-1));
    requireValue(checkpointIds.size === previous.size && [...previous.keys()].every(id => checkpointIds.has(id)),
      "coverage_plan.refine 必须保留全部原检查点，不能形成不完整的当前计划");
    for (const checkpointId of checkpointIds) {
      requireValue(records.get(checkpointId).checkpoint?.result == null, `coverage_plan.refine 不得修改已终结检查点：${checkpointId}`);
      requireValue(previous.has(checkpointId), `coverage_plan.refine 不得增加原检查点：${checkpointId}`);
      const before = previous.get(checkpointId);
      const after = event.items.find(item => item.checkpoint_id === checkpointId);
      requireValue(JSON.stringify(before.dependencies) === JSON.stringify(after.dependencies),
        `coverage_plan.refine 不得改变检查点 ${checkpointId} 的依赖语义`);
      requireValue(before.scopes.length === after.scopes.length, `coverage_plan.refine 不得增加或删除检查点 ${checkpointId} 的范围`);
      const beforeScopes = new Map(before.scopes.map(scope => [scope.scope_id, scope]));
      for (const scope of after.scopes) {
        const prior = beforeScopes.get(scope.scope_id);
        requireValue(prior, `coverage_plan.refine 不得更换 scope_id：${scope.scope_id}`);
        requireValue(JSON.stringify(prior.group_ids) === JSON.stringify(scope.group_ids) &&
          JSON.stringify(prior.step_refs) === JSON.stringify(scope.step_refs),
        `coverage_plan.refine 不得改变范围 ${scope.scope_id} 的权限或原步骤语义`);
        if (prior.location_status === "known") {
          requireValue(scope.location_status === "known" && scope.location_ref === prior.location_ref,
            `coverage_plan.refine 不得改变已知位置 ${scope.scope_id}`);
        } else {
          requireValue(scope.location_status === "needs_discovery" || scope.location_status === "known",
            `coverage_plan.refine 的位置演进无效：${scope.scope_id}`);
        }
      }
    }
  }
}

function knownTargets(log) {
  return new Set([
    ...(log.browser?.owned_target_ids ?? []),
    ...(log.browser?.preexisting_target_ids ?? []),
    ...(log.browser?.attached_preexisting_target_ids ?? [])
  ]);
}

function eventAt(log, reference) {
  return Number.isInteger(reference) ? (log.events ?? []).find(event => event.sequence === reference) ?? null : null;
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}

function observationPayload(event) {
  return event?.observation && object(event.observation) ? event.observation : event;
}

function validateContextEvent(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "scope_ids", "account_ref", "observed_account_ref", "target_id", "context_ref", "environment_ref",
    "observed_url", "verification", "switch_status", "fact_refs", "role_observation_refs", "sequence", "at"
  ]), "coverage_context");
  const plan = latestPlan(log);
  requireValue(plan, "coverage_context 缺少 coverage_plan");
  const scopes = scopeIndex(plan);
  strings(event.scope_ids, "coverage_context.scope_ids");
  const selected = event.scope_ids.map(id => {
    requireValue(scopes.has(id), `coverage_context 引用未知 scope_id：${id}`);
    return scopes.get(id);
  });
  requireValue(event.account_ref === null || string(event.account_ref), "coverage_context.account_ref 无效");
  requireValue(event.observed_account_ref === null || string(event.observed_account_ref), "coverage_context.observed_account_ref 无效");
  requireValue(string(event.target_id) && knownTargets(log).has(event.target_id), "coverage_context 引用未登记 Target");
  requireValue(string(event.context_ref), "coverage_context 缺少存储上下文 context_ref");
  requireValue(string(event.environment_ref), "coverage_context 缺少 environment_ref");
  requireValue(string(event.observed_url) && safeHttpUrl(event.observed_url), "coverage_context observed_url 无效或包含认证信息");
  requireValue(CONTEXT_VERIFICATIONS.has(event.verification), "coverage_context.verification 无效");
  requireValue(SWITCH_STATES.has(event.switch_status), "coverage_context.switch_status 无效");
  refs(event.fact_refs, "coverage_context.fact_refs");
  for (const reference of event.fact_refs) {
    if (Number.isInteger(reference)) requireValue(eventAt(log, reference), `coverage_context.fact_refs 引用未知事件：${reference}`);
  }

  const permission = permissionPlan(log);
  const groups = groupsById(permission);
  const requiredGroups = new Set(selected.flatMap(scope => scope.group_ids));
  if (requiredGroups.size > 0) {
    requireValue(string(event.account_ref), "特殊权限执行上下文必须绑定 account_ref");
    for (const groupId of requiredGroups) {
      requireValue(groups.get(groupId)?.account_ref === event.account_ref, `coverage_context 账号与权限组 ${groupId} 不一致`);
    }
    refs(event.role_observation_refs, "coverage_context 权限核验 role_observation_refs");
    const observedGroups = new Set();
    for (const reference of event.role_observation_refs) {
      requireValue(Number.isInteger(reference), "coverage_context.role_observation_refs 只能引用事件 sequence");
      const source = eventAt(log, reference);
      const observation = observationPayload(source);
      requireValue(source?.type === "role_observation" && requiredGroups.has(observation.group_id),
        `coverage_context 权限核验引用无效：${reference}`);
      requireValue(observation.account_ref === event.account_ref && observation.observed_account_ref === event.observed_account_ref,
        "coverage_context 与权限核验账号不一致");
      requireValue(observation.target_id === event.target_id && observation.context_ref === event.context_ref && observation.environment_ref === event.environment_ref,
        "coverage_context 与权限核验的 Target、环境或上下文不一致");
      observedGroups.add(observation.group_id);
    }
    requireValue(observedGroups.size === requiredGroups.size && [...requiredGroups].every(id => observedGroups.has(id)),
      "coverage_context 缺少范围所需的权限核验");
  } else {
    requireValue(event.role_observation_refs === undefined || event.role_observation_refs.length === 0,
      "无特殊权限范围不得虚构权限核验引用");
  }
  if (event.verification === "verified") {
    requireValue(event.account_ref === event.observed_account_ref, "coverage_context 实际账号与计划账号不一致，不得记为 verified");
    requireValue(["completed", "not_required"].includes(event.switch_status), "coverage_context 切换未完成，不得记为 verified");
  }
  const observed = new URL(event.observed_url);
  for (const scope of selected.filter(item => item.location_status === "known")) {
    const planned = new URL(scope.location_ref);
    requireValue(observed.origin === planned.origin && observed.pathname === planned.pathname,
      `coverage_context URL 与范围 ${scope.scope_id} 的已知位置不一致`);
  }
  void testCases;
}

function openScopes(testCases, log, plan) {
  const records = checkpointRecords(testCases, log);
  return [...scopeIndex(plan).values()].filter(scope => records.get(scope.checkpoint_id)?.checkpoint?.result == null);
}

function openAssistanceCheckpoints(log) {
  const items = new Map();
  for (const event of log.events ?? []) {
    if (event.type !== "assistance") continue;
    if (event.phase === "requested") items.set(event.assistance_id, new Set(event.checkpoint_ids ?? []));
    else if (items.has(event.assistance_id)) for (const checkpointId of event.checkpoint_ids ?? []) items.get(event.assistance_id).delete(checkpointId);
  }
  return new Set([...items.values()].flatMap(set => [...set]));
}

function closureBasisEvents(log, closure) {
  return closure.basis_refs.filter(Number.isInteger).map(reference => eventAt(log, reference));
}

function validateReviewEvent(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "review_id", "purpose", "plan_revision", "based_on_sequence", "scope_ids", "checkpoint_ids",
    "fact_refs", "assistance_refs", "ready_scope_ids", "preparable_scope_ids", "blocked_scope_ids", "closures",
    "choice", "reason", "sequence", "at"
  ]), "coverage_review");
  requireValue(string(event.review_id), "coverage_review.review_id 必须非空");
  requireValue(!(log.events ?? []).some(item => item.type === "coverage_review" && item.review_id === event.review_id),
    `coverage_review.review_id 重复：${event.review_id}`);
  requireValue(REVIEW_PURPOSES.has(event.purpose), "coverage_review.purpose 无效");
  const plan = latestPlan(log);
  requireValue(plan && event.plan_revision === plan.revision, "coverage_review.plan_revision 不是当前计划版本");
  requireValue(event.based_on_sequence === (log.events?.length ?? 0), "coverage_review 必须绑定当前事件边界");
  strings(event.scope_ids, "coverage_review.scope_ids", { empty: true });
  strings(event.checkpoint_ids, "coverage_review.checkpoint_ids", { empty: true });
  const scopes = scopeIndex(plan);
  const records = checkpointRecords(testCases, log);
  for (const scopeId of event.scope_ids) requireValue(scopes.has(scopeId), `coverage_review 引用未知范围：${scopeId}`);
  for (const checkpointId of event.checkpoint_ids) requireValue(records.has(checkpointId), `coverage_review 引用未知检查点：${checkpointId}`);
  refs(event.fact_refs, "coverage_review.fact_refs", { empty: true });
  refs(event.assistance_refs, "coverage_review.assistance_refs", { empty: true });
  for (const reference of [...event.fact_refs, ...event.assistance_refs]) {
    if (Number.isInteger(reference)) requireValue(eventAt(log, reference), `coverage_review 引用未知事件：${reference}`);
  }
  for (const key of ["ready_scope_ids", "preparable_scope_ids", "blocked_scope_ids"]) {
    strings(event[key], `coverage_review.${key}`, { empty: true });
    for (const scopeId of event[key]) requireValue(event.scope_ids.includes(scopeId), `coverage_review.${key} 超出审查范围：${scopeId}`);
  }
  const partition = [...event.ready_scope_ids, ...event.preparable_scope_ids, ...event.blocked_scope_ids];
  requireValue(new Set(partition).size === partition.length, "coverage_review 范围分类互相重叠");
  requireValue(Array.isArray(event.closures), "coverage_review.closures 必须是数组");
  const closed = new Set();
  for (const [index, closure] of event.closures.entries()) {
    const label = `coverage_review.closures[${index}]`;
    rejectUnknown(closure, new Set(["checkpoint_id", "closure_kind", "basis_refs", "not_attempted_reason"]), label);
    requireValue(event.checkpoint_ids.includes(closure.checkpoint_id) && !closed.has(closure.checkpoint_id), `${label}.checkpoint_id 无效或重复`);
    closed.add(closure.checkpoint_id);
    requireValue(CLOSURE_KINDS.has(closure.closure_kind), `${label}.closure_kind 无效`);
    refs(closure.basis_refs, `${label}.basis_refs`);
    const basisEvents = closureBasisEvents(log, closure);
    requireValue(basisEvents.every(Boolean), `${label}.basis_refs 包含未知事件`);
    if (closure.closure_kind !== "observed") {
      requireValue(string(closure.not_attempted_reason) || closure.closure_kind === "exploration_insufficient",
        `${label} 缺少未执行或无法继续的具体原因`);
    }
    const record = records.get(closure.checkpoint_id);
    if (closure.closure_kind === "preexcluded") requireValue(record.excluded, `${label}.preexcluded 仅适用于输入预排除用例`);
    if (closure.closure_kind === "observed") {
      requireValue(basisEvents.some(item => ["action_dispatched", "effect_observed", "page_observation", "network_observation", "evidence_capture", "checkpoint_result", "mock_observation"].includes(item.type)),
        `${label}.observed 缺少实际动作、页面、请求或证据事实`);
    }
    if (closure.closure_kind === "exploration_insufficient") {
      requireValue(basisEvents.some(item => ["blocker", "data_gap", "page_observation", "network_observation"].includes(item.type)),
        `${label}.exploration_insufficient 缺少真实探索依据`);
    }
    if (closure.closure_kind === "dependency_blocked") {
      requireValue(basisEvents.some(item => ["checkpoint_result", "blocker", "data_gap"].includes(item.type)),
        `${label}.dependency_blocked 缺少实际依赖或数据缺口事实`);
    }
    if (closure.closure_kind === "user_decision") {
      requireValue(basisEvents.some(item => item.type === "assistance" && item.decision_source === "user"),
        `${label}.user_decision 缺少用户决定事件`);
    }
    if (closure.closure_kind === "data_handoff") {
      requireValue(basisEvents.some(item => item.type === "mock_candidate"), `${label}.data_handoff 缺少 Mock 候选事实`);
    }
  }
  requireValue(string(event.choice) && string(event.reason), "coverage_review 必须包含选择和具体原因");

  if (["wait", "final"].includes(event.purpose)) {
    requireValue(event.scope_ids.length === scopes.size && [...scopes.keys()].every(id => event.scope_ids.includes(id)),
      `coverage_review.${event.purpose} 必须覆盖全量执行范围`);
    requireValue(event.checkpoint_ids.length === records.size && [...records.keys()].every(id => event.checkpoint_ids.includes(id)),
      `coverage_review.${event.purpose} 必须覆盖全量原检查点`);
  }
  if (event.purpose === "checkpoint_close") {
    for (const checkpointId of event.checkpoint_ids) {
      const required = [...scopes.values()].filter(scope => scope.checkpoint_id === checkpointId).map(scope => scope.scope_id);
      requireValue(required.every(id => event.scope_ids.includes(id)), `coverage_review.checkpoint_close 缺少检查点 ${checkpointId} 的必要范围`);
      requireValue(closed.has(checkpointId), `coverage_review.checkpoint_close 缺少检查点 ${checkpointId} 的终结依据`);
    }
  }
  if (event.purpose === "final") {
    requireValue(closed.size === records.size, "coverage_review.final 缺少逐检查点终结依据");
  }
  if (event.purpose === "wait") {
    requireValue(event.ready_scope_ids.length === 0 && event.preparable_scope_ids.length === 0,
      "coverage_review.wait 仍存在可推进或可安全准备范围，不得全局等待");
  }
  const unfinished = openScopes(testCases, log, plan).filter(scope => event.scope_ids.includes(scope.scope_id));
  const classified = new Set(partition);
  requireValue(unfinished.every(scope => classified.has(scope.scope_id)), "coverage_review 未分类全部尚未终结范围");
  if (event.purpose === "wait") {
    const openAssistance = openAssistanceCheckpoints(log);
    const factEvents = event.fact_refs.filter(Number.isInteger).map(reference => eventAt(log, reference));
    for (const scopeId of event.blocked_scope_ids) {
      const scope = scopes.get(scopeId);
      const hasAssistance = openAssistance.has(scope.checkpoint_id);
      const hasDependencyFact = factEvents.some(item => item && ["blocker", "data_gap", "checkpoint_result"].includes(item.type));
      requireValue(hasAssistance || hasDependencyFact, `coverage_review.wait 的阻塞范围 ${scopeId} 缺少开放协作或实际依赖依据`);
    }
  }
  if (["switch", "batch_end"].includes(event.purpose)) {
    const contexts = event.fact_refs.filter(Number.isInteger).map(reference => eventAt(log, reference))
      .filter(item => item?.type === "coverage_context" && string(item.account_ref));
    requireValue(contexts.length > 0, `coverage_review.${event.purpose} 必须引用当前账号的 coverage_context`);
    const accounts = new Set(contexts.map(item => item.account_ref));
    const groups = groupsById(permissionPlan(log));
    const relevant = openScopes(testCases, log, plan).filter(scope =>
      scope.group_ids.some(groupId => accounts.has(groups.get(groupId)?.account_ref))
    );
    requireValue(relevant.every(scope => event.scope_ids.includes(scope.scope_id)),
      `coverage_review.${event.purpose} 缺少当前账号仍有关联的遗留范围`);
  }
}

function contextInvalidated(contextEvent, log) {
  const plan = latestPlan(log);
  const scopedGroups = new Set((contextEvent.scope_ids ?? []).flatMap(scopeId => scopeIndex(plan).get(scopeId)?.group_ids ?? []));
  return (log.events ?? []).some(event => (event.sequence ?? 0) > (contextEvent.sequence ?? 0) && (
    event.type === "resume_check" ||
    event.type === "coverage_plan" ||
    (event.type === "run_state" && ["awaiting_user", "interrupted"].includes(event.status ?? event.state)) ||
    (event.type === "permission_availability" && scopedGroups.has(event.group_id)) ||
    (event.type === "role_observation" && (() => {
      const observation = observationPayload(event);
      return observation.context_ref === contextEvent.context_ref && observation.target_id === contextEvent.target_id &&
        observation.observed_account_ref !== contextEvent.observed_account_ref;
    })()) ||
    (event.type === "execution_context_change" && (
      event.context_ref === contextEvent.context_ref || (event.target_ids ?? []).includes(contextEvent.target_id)
    ))
  ));
}

function coverageContextAt(log, reference) {
  const event = eventAt(log, reference);
  requireValue(event?.type === "coverage_context", `执行上下文引用无效：${reference}`);
  requireValue(!contextInvalidated(event, log), `执行上下文 ${reference} 已失效，必须重新记录新鲜核验`);
  requireValue(event.verification === "verified", `执行上下文 ${reference} 未完成真实核验`);
  return event;
}

function scopesForCheckpoint(log, checkpointId) {
  const plan = latestPlan(log);
  return [...scopeIndex(plan).values()].filter(scope => scope.checkpoint_id === checkpointId);
}

function dependenciesForCheckpoint(log, checkpointId) {
  return planIndex(latestPlan(log)).get(checkpointId)?.dependencies ?? [];
}

function validateCheckpointStart(testCases, log, event) {
  const plan = latestPlan(log);
  requireValue(plan, "启用执行覆盖后，业务开始前必须记录 coverage_plan");
  strings(event.scope_ids, "checkpoint_started.scope_ids");
  refs(event.context_refs, "checkpoint_started.context_refs");
  const required = scopesForCheckpoint(log, event.checkpoint_id);
  requireValue(required.length > 0, `checkpoint_started 缺少检查点 ${event.checkpoint_id} 的执行范围`);
  const requiredIds = new Set(required.map(scope => scope.scope_id));
  for (const scopeId of event.scope_ids) requireValue(requiredIds.has(scopeId), `checkpoint_started 引用无关执行范围：${scopeId}`);
  const covered = new Set();
  const factRefs = new Set();
  for (const reference of event.context_refs) {
    requireValue(Number.isInteger(reference), "checkpoint_started.context_refs 只能引用事件 sequence");
    const context = coverageContextAt(log, reference);
    for (const scopeId of context.scope_ids) if (event.scope_ids.includes(scopeId)) covered.add(scopeId);
    for (const factRef of context.fact_refs ?? []) if (Number.isInteger(factRef)) factRefs.add(factRef);
  }
  requireValue(event.scope_ids.every(scopeId => covered.has(scopeId)), "checkpoint_started 的执行范围缺少匹配的新鲜上下文");
  const records = checkpointRecords(testCases, log);
  for (const dependency of dependenciesForCheckpoint(log, event.checkpoint_id)) {
    for (const checkpointId of dependency.checkpoint_refs) {
      requireValue(records.get(checkpointId)?.checkpoint?.result === "passed",
        `checkpoint_started 的依赖检查点尚未通过：${checkpointId}`);
      const resultEvent = [...(log.events ?? [])].reverse().find(item =>
        item.type === "checkpoint_result" && item.checkpoint_id === checkpointId && item.result === "passed");
      requireValue(resultEvent && factRefs.has(resultEvent.sequence),
        `checkpoint_started 缺少依赖 ${dependency.dependency_id} 的实际业务事实引用`);
    }
  }
}

function reviewAt(log, reference, purpose) {
  requireValue(Number.isInteger(reference), "coverage_review_ref 必须是事件 sequence");
  const review = eventAt(log, reference);
  requireValue(review?.type === "coverage_review" && review.purpose === purpose,
    `coverage_review_ref 未引用 ${purpose} 审查`);
  requireValue(review.sequence === (log.events?.length ?? 0), `${purpose} 审查后已有状态变化，必须重新审查`);
  return review;
}

function validateExecutionRefs(log, event) {
  refs(event.execution_refs, "checkpoint_result.execution_refs", { empty: event.result === "undetermined" });
  const structural = new Set([
    "workflow_profile", "permission_plan", "coverage_plan", "coverage_context", "coverage_review",
    "checkpoint_started", "case_started", "run_state", "resume_check"
  ]);
  for (const reference of event.execution_refs) {
    requireValue(Number.isInteger(reference), "checkpoint_result.execution_refs 只能引用事件 sequence");
    const source = eventAt(log, reference);
    requireValue(source && !structural.has(source.type), `checkpoint_result.execution_refs 缺少实际动作、效果或观察事实：${reference}`);
    if (Array.isArray(source.checkpoint_ids)) {
      requireValue(source.checkpoint_ids.includes(event.checkpoint_id), `execution_refs[${reference}] 不支持当前检查点`);
    }
  }
}

function validateCheckpointResult(log, event) {
  validateExecutionRefs(log, event);
  const review = reviewAt(log, event.coverage_review_ref, "checkpoint_close");
  requireValue(review.checkpoint_ids.includes(event.checkpoint_id), "checkpoint_close 审查不包含当前检查点");
  const required = scopesForCheckpoint(log, event.checkpoint_id).map(scope => scope.scope_id);
  requireValue(required.every(scopeId => review.scope_ids.includes(scopeId)), "checkpoint_result 的终结审查缺少必要执行范围");
  const closure = review.closures.find(item => item.checkpoint_id === event.checkpoint_id);
  requireValue(closure, "checkpoint_result 缺少逐检查点终结依据");
  if (["passed", "failed"].includes(event.result)) {
    requireValue(closure.closure_kind === "observed", "passed/failed 只能由实际观察依据终结");
    requireValue(event.execution_refs.length > 0, "passed/failed 必须引用实际执行事实");
  }
}

function validateRunState(log, event) {
  const status = event.status ?? event.state;
  if (status === "awaiting_user") reviewAt(log, event.coverage_review_ref, "wait");
  if (status === "running" && log.run?.status === "awaiting_user") reviewAt(log, event.coverage_review_ref, "resume");
  if (status === "completed") reviewAt(log, event.coverage_review_ref, "final");
}

function validateCoverageTransition(testCases, log, event) {
  if (event.type === "checkpoint_started") validateCheckpointStart(testCases, log, event);
  if (event.type === "checkpoint_result") validateCheckpointResult(log, event);
  if (event.type === "run_state") validateRunState(log, event);
  if (event.type === "permission_batch" && event.phase === "drained") reviewAt(log, event.coverage_review_ref, "batch_end");
  void testCases;
}

export function coverageEnabled(log) {
  return log?.extensions?.execution_coverage?.schema_version === COVERAGE_VERSION;
}

export function validateCoverageEvent(testCases, log, event) {
  if (!coverageEnabled(log)) return;
  if (event.type === "coverage_plan") return validatePlanEvent(testCases, log, event);
  if (event.type === "coverage_context") return validateContextEvent(testCases, log, event);
  if (event.type === "coverage_review") return validateReviewEvent(testCases, log, event);
  return validateCoverageTransition(testCases, log, event);
}

export function deriveCoverageState(testCases, log) {
  if (!coverageEnabled(log)) {
    return { enabled: false, plan_revision: null, scopes: new Map(), ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: [], return_tasks: [] };
  }
  const plan = latestPlan(log);
  if (!plan) {
    return { enabled: true, plan_revision: null, scopes: new Map(), ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: [], return_tasks: [] };
  }
  const scopes = scopeIndex(plan);
  const records = checkpointRecords(testCases, log);
  const contexts = new Map();
  for (const event of log.events ?? []) {
    if (event.type !== "coverage_context") continue;
    for (const scopeId of event.scope_ids) contexts.set(scopeId, event);
  }
  const open = [...scopes.values()].filter(scope => records.get(scope.checkpoint_id)?.checkpoint?.result == null);
  const ready = [];
  const preparable = [];
  for (const scope of open) {
    if (contexts.get(scope.scope_id)?.verification === "verified") ready.push(scope.scope_id);
    else preparable.push(scope.scope_id);
  }
  const groupOrder = [...scopes.values()].map(scope => scope.group_ids.join("+") || "__general__");
  const returnTasks = [];
  const lastSeen = new Map();
  [...scopes.values()].forEach((scope, index) => {
    const key = groupOrder[index];
    const previous = lastSeen.get(key);
    if (previous !== undefined && groupOrder.slice(previous + 1, index).some(group => group !== key)) {
      returnTasks.push({ scope_id: scope.scope_id, checkpoint_id: scope.checkpoint_id, group_ids: [...scope.group_ids] });
    }
    lastSeen.set(key, index);
  });
  return {
    enabled: true,
    plan_revision: plan.revision,
    plan,
    scopes,
    contexts,
    ready_scope_ids: ready,
    preparable_scope_ids: preparable,
    blocked_scope_ids: [],
    return_tasks: returnTasks
  };
}

function initialCases(testCases) {
  return testCases.cases.map(sourceCase => ({
    case_id: sourceCase.case_id,
    checkpoints: sourceCase.steps.flatMap(step => step.expected.map(oracle => ({
      step_id: step.step_id,
      oracle_id: oracle.oracle_id,
      status: sourceCase.excluded ? "skipped" : "pending",
      result: sourceCase.excluded ? "not_executed" : null
    })))
  }));
}

export function validateCoverageLog(testCases, log) {
  if (!coverageEnabled(log)) return;
  const replay = {
    schema_version: log.schema_version,
    extensions: structuredClone(log.extensions),
    test_cases: structuredClone(log.test_cases),
    run: { status: "initialized" },
    browser: { owned_target_ids: [], preexisting_target_ids: [], attached_preexisting_target_ids: [] },
    cases: initialCases(testCases),
    events: []
  };
  for (const event of log.events ?? []) {
    validateCoverageEvent(testCases, replay, event);
    replay.events.push(event);
    if (event.type === "checkpoint_started") {
      const record = checkpointRecords(testCases, replay).get(event.checkpoint_id);
      if (record?.checkpoint) record.checkpoint.status = "running";
    }
    if (event.type === "checkpoint_result") {
      const record = checkpointRecords(testCases, replay).get(event.checkpoint_id);
      if (record?.checkpoint) {
        record.checkpoint.status = event.status ?? "completed";
        record.checkpoint.result = event.result;
      }
    }
    if (event.type === "run_state") replay.run.status = event.status ?? event.state;
    if (event.type === "target_inventory") {
      for (const key of ["owned_target_ids", "preexisting_target_ids", "attached_preexisting_target_ids"]) {
        if (event[key]) replay.browser[key] = [...event[key]];
      }
    }
  }
  const plans = planEvents(replay);
  requireValue(plans.length > 0 || !(log.events ?? []).some(event => ["case_started", "checkpoint_started", "checkpoint_result", "mock_checkpoint"].includes(event.type)),
    "启用执行覆盖的 Run 在业务开始前缺少 coverage_plan");
}

export const executionCoverageVersion = COVERAGE_VERSION;
