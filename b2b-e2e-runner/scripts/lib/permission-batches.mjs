const PROFILE = "permission-batches-html-v1";
const AVAILABILITIES = new Set(["ready", "user_preparation_required", "unavailable"]);
const BATCH_PHASES = new Set(["started", "waiting", "drained"]);

function consistencyError(message) {
  const error = new Error(message);
  error.code = "RUN_CONSISTENCY";
  return error;
}

function requireValue(condition, message) {
  if (!condition) throw consistencyError(message);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function eventPayload(event) {
  return event?.observation && typeof event.observation === "object" ? event.observation : event;
}

function checkpointRecords(testCases, executionLog) {
  const records = new Map();
  for (let caseIndex = 0; caseIndex < testCases.cases.length; caseIndex += 1) {
    const sourceCase = testCases.cases[caseIndex];
    const loggedCase = executionLog.cases?.[caseIndex];
    let checkpointIndex = 0;
    for (const step of sourceCase.steps) {
      for (const oracle of step.expected) {
        const checkpoint_id = `${sourceCase.case_id}/${step.step_id}/${oracle.oracle_id}`;
        records.set(checkpoint_id, {
          checkpoint_id,
          case_id: sourceCase.case_id,
          case_index: caseIndex,
          checkpoint: loggedCase?.checkpoints?.[checkpointIndex] ?? null
        });
        checkpointIndex += 1;
      }
    }
  }
  return records;
}

function workflowProfile(executionLog) {
  return executionLog.events?.find(event => event.type === "workflow_profile")?.profile ?? null;
}

function permissionPlan(executionLog) {
  return executionLog.events?.find(event => event.type === "permission_plan") ?? null;
}

function validateStringArray(value, label, { allowEmpty = false } = {}) {
  requireValue(Array.isArray(value) && (allowEmpty || value.length > 0), `${label} 必须是${allowEmpty ? "" : "非空"}字符串数组`);
  requireValue(value.every(nonEmptyString), `${label} 包含空值或非字符串`);
  requireValue(new Set(value).size === value.length, `${label} 包含重复值`);
}

function validatePlan(testCases, executionLog, event) {
  const planKeys = new Set(["type", "version", "groups", "role_independent_case_ids", "sequence", "at"]);
  const unknownPlanKey = Object.keys(event).find(key => !planKeys.has(key));
  requireValue(!unknownPlanKey, `permission_plan 包含未知字段：${unknownPlanKey}`);
  requireValue(event.version === "1.0", "permission_plan.version 必须为 1.0");
  requireValue(Array.isArray(event.groups), "permission_plan.groups 必须是数组");
  validateStringArray(event.role_independent_case_ids, "permission_plan.role_independent_case_ids", { allowEmpty: true });
  const checkpoints = checkpointRecords(testCases, executionLog);
  const knownCases = new Set(testCases.cases.map(item => item.case_id));
  const roleIndependent = new Set(event.role_independent_case_ids);
  for (const caseId of roleIndependent) requireValue(knownCases.has(caseId), `权限计划引用未知用例：${caseId}`);

  const groupIds = new Set();
  const groupedCases = new Set();
  const coveredCheckpoints = new Set();
  for (const group of event.groups) {
    requireValue(group && typeof group === "object", "权限组必须是对象");
    const groupKeys = new Set(["group_id", "role_text", "permissions", "case_ids", "checkpoint_ids", "availability", "account_ref", "preparation_owner", "declaration"]);
    const unknownGroupKey = Object.keys(group).find(key => !groupKeys.has(key));
    requireValue(!unknownGroupKey, `权限组包含未知字段：${unknownGroupKey}`);
    requireValue(nonEmptyString(group.group_id), "权限组缺少 group_id");
    requireValue(!groupIds.has(group.group_id), `权限组 ID 重复：${group.group_id}`);
    groupIds.add(group.group_id);
    requireValue(nonEmptyString(group.role_text), `权限组 ${group.group_id} 缺少 role_text`);
    validateStringArray(group.permissions, `权限组 ${group.group_id}.permissions`);
    validateStringArray(group.case_ids, `权限组 ${group.group_id}.case_ids`);
    validateStringArray(group.checkpoint_ids, `权限组 ${group.group_id}.checkpoint_ids`);
    requireValue(AVAILABILITIES.has(group.availability), `权限组 ${group.group_id} availability 无效`);
    requireValue(group.account_ref === null || nonEmptyString(group.account_ref), `权限组 ${group.group_id} account_ref 无效`);
    requireValue(group.preparation_owner === null || group.preparation_owner === "user", `权限组 ${group.group_id} preparation_owner 无效`);
    requireValue(nonEmptyString(group.declaration), `权限组 ${group.group_id} 缺少安全声明摘要`);
    if (group.availability === "ready") requireValue(nonEmptyString(group.account_ref), `已就绪权限组 ${group.group_id} 必须有 account_ref`);
    if (group.availability === "user_preparation_required") requireValue(group.preparation_owner === "user", `待准备权限组 ${group.group_id} 的 preparation_owner 必须为 user`);

    const casesFromCheckpoints = new Set();
    for (const checkpointId of group.checkpoint_ids) {
      const record = checkpoints.get(checkpointId);
      requireValue(record, `权限组 ${group.group_id} 引用未知检查点：${checkpointId}`);
      requireValue(!roleIndependent.has(record.case_id), `无角色用例 ${record.case_id} 不得同时进入权限组`);
      casesFromCheckpoints.add(record.case_id);
      coveredCheckpoints.add(checkpointId);
    }
    requireValue(
      group.case_ids.length === casesFromCheckpoints.size && group.case_ids.every(id => casesFromCheckpoints.has(id)),
      `权限组 ${group.group_id} 的 case_ids 必须与 checkpoint_ids 涉及的用例完全一致`
    );
    for (const caseId of group.case_ids) {
      requireValue(knownCases.has(caseId), `权限组 ${group.group_id} 引用未知用例：${caseId}`);
      groupedCases.add(caseId);
    }
  }

  const allCases = new Set([...groupedCases, ...roleIndependent]);
  requireValue(allCases.size === knownCases.size && [...knownCases].every(id => allCases.has(id)), "权限计划未完整覆盖全部输入用例");
  for (const [checkpointId, record] of checkpoints) {
    const covered = roleIndependent.has(record.case_id) || coveredCheckpoints.has(checkpointId);
    requireValue(covered, `权限计划未覆盖检查点：${checkpointId}`);
  }
}

function latestInvalidationSequence(group, executionLog, accountChangeSequences) {
  let invalidation = group.availability_sequence;
  invalidation = Math.max(invalidation, accountChangeSequences.get(group.account_ref) ?? 0);
  for (const event of executionLog.events ?? []) {
    if (event.type === "resume_check") invalidation = Math.max(invalidation, event.sequence ?? 0);
    if (event.type === "run_state" && ["awaiting_user", "interrupted"].includes(event.status ?? event.state)) {
      invalidation = Math.max(invalidation, event.sequence ?? 0);
    }
  }
  return invalidation;
}

export function derivePermissionState(testCases, executionLog) {
  const profile = workflowProfile(executionLog);
  const plan = permissionPlan(executionLog);
  if (profile !== PROFILE || !plan) {
    return { profile, plan: null, groups: [], role_independent_case_ids: [], waiting_checkpoint_ids: [], completed: false };
  }
  const checkpoints = checkpointRecords(testCases, executionLog);
  const planSequence = plan.sequence ?? (executionLog.events.indexOf(plan) + 1);
  const groups = plan.groups.map(group => ({
    ...structuredClone(group),
    availability_sequence: planSequence,
    phase: null,
    batch_description: null,
    wait_reason: null,
    wait_checkpoint_ids: [],
    last_observation: null
  }));
  const byId = new Map(groups.map(group => [group.group_id, group]));
  const accountChangeSequences = new Map();

  for (const event of executionLog.events ?? []) {
    if (event.type === "permission_availability") {
      const group = byId.get(event.group_id);
      if (!group) continue;
      group.availability = event.availability;
      group.account_ref = event.account_ref ?? null;
      group.declaration = event.declaration;
      group.availability_sequence = event.sequence ?? 0;
      if (event.availability !== "user_preparation_required") {
        group.wait_reason = null;
        group.wait_checkpoint_ids = [];
      }
      if (group.account_ref) accountChangeSequences.set(group.account_ref, event.sequence ?? 0);
    } else if (event.type === "permission_batch") {
      const group = byId.get(event.group_id);
      if (group) {
        group.phase = event.phase;
        group.batch_description = event.description;
      }
    } else if (event.type === "permission_wait") {
      const group = byId.get(event.group_id);
      if (group) {
        group.wait_reason = event.reason;
        group.wait_checkpoint_ids = [...event.checkpoint_ids];
      }
    } else if (event.type === "role_observation") {
      const observation = eventPayload(event);
      const group = byId.get(observation.group_id);
      if (group) group.last_observation = { ...structuredClone(observation), sequence: event.sequence ?? 0, at: event.at };
    }
  }

  for (const group of groups) {
    group.remaining_checkpoint_ids = group.checkpoint_ids.filter(id => checkpoints.get(id)?.checkpoint?.result == null);
    group.completed = group.remaining_checkpoint_ids.length === 0;
    const observation = group.last_observation;
    const invalidation = latestInvalidationSequence(group, executionLog, accountChangeSequences);
    if (!observation) group.verification = "unverified";
    else if (!group.completed && (observation.sequence <= invalidation || observation.account_ref !== group.account_ref)) group.verification = "stale";
    else group.verification = observation.verification;
    group.first_case_index = Math.min(...group.case_ids.map(id => testCases.cases.findIndex(item => item.case_id === id)));
  }
  groups.sort((left, right) => left.first_case_index - right.first_case_index || left.group_id.localeCompare(right.group_id));
  const waitingCheckpointIds = groups.flatMap(group =>
    group.availability === "user_preparation_required"
      ? group.wait_checkpoint_ids.filter(id => group.remaining_checkpoint_ids.includes(id))
      : []
  );
  const roleIndependentPending = plan.role_independent_case_ids.some(caseId => {
    const testCase = testCases.cases.find(item => item.case_id === caseId);
    return testCase.steps.some(step => step.expected.some(oracle => checkpoints.get(`${caseId}/${step.step_id}/${oracle.oracle_id}`)?.checkpoint?.result == null));
  });
  return {
    profile,
    plan,
    groups,
    role_independent_case_ids: [...plan.role_independent_case_ids],
    waiting_checkpoint_ids: waitingCheckpointIds,
    completed: groups.every(group => group.completed) && !roleIndependentPending
  };
}

export function getPermissionWorkSummary(testCases, executionLog) {
  const state = derivePermissionState(testCases, executionLog);
  const unfinished = state.groups.filter(group => !group.completed);
  return {
    profile: state.profile,
    ready_group_ids: unfinished.filter(group => group.availability === "ready" && group.verification === "verified").map(group => group.group_id),
    ready_unverified_group_ids: unfinished.filter(group => group.availability === "ready" && group.verification !== "verified").map(group => group.group_id),
    user_preparation_required_group_ids: unfinished.filter(group => group.availability === "user_preparation_required").map(group => group.group_id),
    unavailable_group_ids: unfinished.filter(group => group.availability === "unavailable").map(group => group.group_id),
    remaining_checkpoint_ids: unfinished.flatMap(group => group.remaining_checkpoint_ids),
    waiting_checkpoint_ids: [...state.waiting_checkpoint_ids],
    completed: state.completed
  };
}

function requirePlan(executionLog) {
  const plan = permissionPlan(executionLog);
  requireValue(plan, "新工作流在业务执行前必须记录有效权限计划");
  return plan;
}

function ownersForCheckpoint(state, checkpointId) {
  return state.groups.filter(group => group.checkpoint_ids.includes(checkpointId));
}

function canRunCheckpoint(state, checkpointId) {
  const owners = ownersForCheckpoint(state, checkpointId);
  if (!owners.length) return true;
  return owners.every(group => group.availability === "ready" && group.verification === "verified");
}

export function validatePermissionEvent(testCases, executionLog, event) {
  const profile = workflowProfile(executionLog);
  if (event.type === "workflow_profile") {
    requireValue(!profile && (executionLog.events?.length ?? 0) === 0, "workflow_profile 只能由 init 写入首个事件");
    requireValue(event.profile === PROFILE, `未知 workflow profile：${event.profile}`);
    return;
  }
  if (profile !== PROFILE) return;

  if (event.type === "permission_plan") {
    requireValue(!permissionPlan(executionLog), "permission_plan 只能建立一次");
    requireValue(!(executionLog.events ?? []).some(item => ["case_started", "checkpoint_started", "checkpoint_result"].includes(item.type)), "权限计划必须在业务执行前建立");
    validatePlan(testCases, executionLog, event);
    return;
  }
  const plan = requirePlan(executionLog);
  const state = derivePermissionState(testCases, executionLog);
  const groups = new Map(state.groups.map(group => [group.group_id, group]));
  const checkpoints = checkpointRecords(testCases, executionLog);

  if (event.type === "permission_availability") {
    const group = groups.get(event.group_id);
    requireValue(group, `权限状态引用未知权限组：${event.group_id}`);
    requireValue(AVAILABILITIES.has(event.availability), `权限状态无效：${event.availability}`);
    requireValue(event.account_ref === null || nonEmptyString(event.account_ref), "permission_availability.account_ref 无效");
    if (event.availability === "ready") requireValue(nonEmptyString(event.account_ref), "已就绪权限组必须提供 account_ref");
    requireValue(nonEmptyString(event.declaration), "permission_availability 必须包含无秘密的用户声明摘要");
    return;
  }
  if (event.type === "role_observation") {
    const observation = eventPayload(event);
    const group = groups.get(observation.group_id);
    requireValue(group, `角色核验引用未知权限组：${observation.group_id}`);
    requireValue(nonEmptyString(observation.account_ref), "角色核验缺少 account_ref");
    requireValue(observation.account_ref === group.account_ref, `角色核验账号与权限组 ${group.group_id} 当前账号不一致`);
    requireValue(["verified", "mismatch"].includes(observation.verification), "角色核验 verification 必须为 verified 或 mismatch");
    requireValue(nonEmptyString(observation.description), "角色核验必须包含实际页面观察");
    return;
  }
  if (event.type === "permission_batch") {
    const group = groups.get(event.group_id);
    requireValue(group, `权限批次引用未知权限组：${event.group_id}`);
    requireValue(BATCH_PHASES.has(event.phase), `权限批次 phase 无效：${event.phase}`);
    requireValue(nonEmptyString(event.description), "permission_batch 必须包含 description");
    if (event.phase === "started") requireValue(group.availability === "ready" && group.verification === "verified", `权限组 ${group.group_id} 未就绪或未经实际核验`);
    if (event.phase === "waiting") requireValue(group.availability === "user_preparation_required", `权限组 ${group.group_id} 不是待用户准备状态`);
    return;
  }
  if (event.type === "permission_wait") {
    const group = groups.get(event.group_id);
    requireValue(group, `权限等待引用未知权限组：${event.group_id}`);
    requireValue(group.availability === "user_preparation_required", `权限组 ${group.group_id} 不是待用户准备状态`);
    validateStringArray(event.checkpoint_ids, "permission_wait.checkpoint_ids");
    requireValue(nonEmptyString(event.reason), "permission_wait 必须包含具体等待原因");
    for (const checkpointId of event.checkpoint_ids) {
      requireValue(group.checkpoint_ids.includes(checkpointId), `权限等待检查点不属于权限组 ${group.group_id}：${checkpointId}`);
      const checkpoint = checkpoints.get(checkpointId)?.checkpoint;
      requireValue(checkpoint && checkpoint.result == null && checkpoint.status !== "completed", `权限等待不能覆盖已完成检查点：${checkpointId}`);
    }
    return;
  }
  if (event.type === "assistance" && event.permission_decision === "stop_waiting") {
    validateStringArray(event.group_ids, "assistance.group_ids");
    for (const groupId of event.group_ids) requireValue(groups.has(groupId), `停止等待引用未知权限组：${groupId}`);
    return;
  }
  if (event.type === "case_started") {
    const sourceCase = testCases.cases.find(item => item.case_id === event.case_id);
    requireValue(sourceCase, `未知用例：${event.case_id}`);
    const pendingIds = sourceCase.steps.flatMap(step => step.expected.map(oracle => `${sourceCase.case_id}/${step.step_id}/${oracle.oracle_id}`))
      .filter(id => checkpoints.get(id)?.checkpoint?.result == null);
    requireValue(pendingIds.length > 0, `用例 ${event.case_id} 没有可开始的未完成检查点`);
    requireValue(pendingIds.some(id => canRunCheckpoint(state, id)), `用例 ${event.case_id} 所需权限未就绪或未经实际核验`);
    return;
  }
  if (event.type === "checkpoint_started") {
    const record = checkpoints.get(event.checkpoint_id);
    requireValue(record, `未知检查点：${event.checkpoint_id}`);
    requireValue(record.checkpoint?.result == null && record.checkpoint?.status !== "completed", `检查点已经完成：${event.checkpoint_id}`);
    requireValue(canRunCheckpoint(state, event.checkpoint_id), `检查点 ${event.checkpoint_id} 所需权限未就绪或未经实际核验`);
    return;
  }
  if (event.type === "checkpoint_result") {
    const record = checkpoints.get(event.checkpoint_id);
    requireValue(record, `未知检查点：${event.checkpoint_id}`);
    if (["passed", "failed"].includes(event.result)) {
      requireValue(record.checkpoint?.status === "running", `检查点 ${event.checkpoint_id} 必须先实际开始`);
      requireValue(canRunCheckpoint(state, event.checkpoint_id), `检查点 ${event.checkpoint_id} 所需权限未就绪或未经实际核验`);
    } else if (event.result === "undetermined" && record.checkpoint?.status !== "running") {
      validateStringArray(event.permission_group_ids, "checkpoint_result.permission_group_ids");
      const stopWaiting = new Set((executionLog.events ?? []).filter(item => item.type === "assistance" && item.permission_decision === "stop_waiting").flatMap(item => item.group_ids ?? []));
      for (const groupId of event.permission_group_ids) {
        const group = groups.get(groupId);
        requireValue(group?.checkpoint_ids.includes(event.checkpoint_id), `无法确定结果引用不相关权限组：${groupId}`);
        requireValue(group.availability === "unavailable" || stopWaiting.has(groupId), `权限组 ${groupId} 尚无允许结束等待的明确决定`);
      }
    }
    return;
  }
  if (event.type === "run_state" && (event.status ?? event.state) === "completed") {
    const incomplete = [...checkpoints.values()].filter(record => record.checkpoint?.result == null && !testCases.cases[record.case_index].excluded);
    requireValue(incomplete.length === 0, `仍有 ${incomplete.length} 个未处理检查点，不能完成 Run`);
  }
  void plan;
}

function initialReplayCases(testCases) {
  return testCases.cases.map(testCase => ({
    case_id: testCase.case_id,
    result: testCase.excluded ? "not_executed" : "undetermined",
    checkpoints: testCase.steps.flatMap(step => step.expected.map(oracle => ({
      step_id: step.step_id,
      oracle_id: oracle.oracle_id,
      status: testCase.excluded ? "skipped" : "pending",
      result: testCase.excluded ? "not_executed" : null
    })))
  }));
}

export function validatePermissionLog(testCases, executionLog) {
  const replay = {
    run: { status: "initialized", actual_case_order: [], resume_count: 0 },
    cases: initialReplayCases(testCases),
    events: []
  };
  for (const event of executionLog.events ?? []) {
    validatePermissionEvent(testCases, replay, event);
    replay.events.push(event);
    if (event.type === "checkpoint_started") checkpointRecords(testCases, replay).get(event.checkpoint_id).checkpoint.status = "running";
    if (event.type === "checkpoint_result") {
      const checkpoint = checkpointRecords(testCases, replay).get(event.checkpoint_id).checkpoint;
      checkpoint.status = event.status ?? "completed";
      checkpoint.result = event.result;
    }
    if (event.type === "run_state") replay.run.status = event.status ?? event.state;
  }
}

export const permissionWorkflowProfile = PROFILE;
