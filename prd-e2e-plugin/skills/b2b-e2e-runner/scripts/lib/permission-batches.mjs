const PROFILE_V1 = "permission-batches-html-v1";
const PROFILE_V2 = "permission-batches-html-v2";
const PROFILES = new Set([PROFILE_V1, PROFILE_V2]);
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

function isV2(executionLog) {
  return workflowProfile(executionLog) === PROFILE_V2;
}

function knownTargetIds(executionLog) {
  const browser = executionLog.browser ?? {};
  return new Set([
    ...(browser.owned_target_ids ?? []),
    ...(browser.preexisting_target_ids ?? []),
    ...(browser.attached_preexisting_target_ids ?? [])
  ]);
}

function rejectUnknownKeys(value, allowed, label) {
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  requireValue(!unknown, `${label} 包含未知字段：${unknown}`);
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
    if (event.type === "execution_context_change" && group.last_observation && (
      event.context_ref === group.last_observation.context_ref ||
      (event.target_ids ?? []).includes(group.last_observation.target_id)
    )) invalidation = Math.max(invalidation, event.sequence ?? 0);
  }
  return invalidation;
}

export function derivePermissionState(testCases, executionLog) {
  const profile = workflowProfile(executionLog);
  const plan = permissionPlan(executionLog);
  if (!PROFILES.has(profile) || !plan) {
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

function validateExplorationSummary(summary, knownCheckpoints, label) {
  requireValue(summary && typeof summary === "object" && !Array.isArray(summary), `${label} 必须是对象`);
  rejectUnknownKeys(summary, new Set([
    "checkpoint_ids", "missing_fact", "known_facts", "attempts", "not_attempted_reason", "cannot_continue_reason"
  ]), label);
  validateStringArray(summary.checkpoint_ids, `${label}.checkpoint_ids`);
  for (const checkpointId of summary.checkpoint_ids) requireValue(knownCheckpoints.has(checkpointId), `${label} 引用未知检查点：${checkpointId}`);
  requireValue(nonEmptyString(summary.missing_fact), `${label}.missing_fact 必须非空`);
  validateStringArray(summary.known_facts, `${label}.known_facts`, { allowEmpty: true });
  requireValue(Array.isArray(summary.attempts), `${label}.attempts 必须是数组`);
  for (const [index, attempt] of summary.attempts.entries()) {
    requireValue(attempt && typeof attempt === "object" && !Array.isArray(attempt), `${label}.attempts[${index}] 必须是对象`);
    rejectUnknownKeys(attempt, new Set(["action", "observation"]), `${label}.attempts[${index}]`);
    requireValue(nonEmptyString(attempt.action) && nonEmptyString(attempt.observation), `${label}.attempts[${index}] 必须包含 action 和 observation`);
  }
  if (summary.attempts.length === 0) requireValue(nonEmptyString(summary.not_attempted_reason), `${label}.not_attempted_reason 在未尝试时必填`);
  else requireValue(summary.not_attempted_reason === undefined, `${label}.not_attempted_reason 仅用于没有尝试的情况`);
  requireValue(nonEmptyString(summary.cannot_continue_reason), `${label}.cannot_continue_reason 必须非空`);
}

function assistanceState(executionLog) {
  const items = new Map();
  for (const event of executionLog.events ?? []) {
    if (event.type !== "assistance" || !event.assistance_id || !event.phase) continue;
    if (event.phase === "requested") {
      items.set(event.assistance_id, { requested: event, remaining: new Set(event.checkpoint_ids ?? []) });
      continue;
    }
    const item = items.get(event.assistance_id);
    if (item) for (const checkpointId of event.checkpoint_ids ?? []) item.remaining.delete(checkpointId);
  }
  return items;
}

function eventBySequence(executionLog, sequence) {
  return Number.isInteger(sequence) ? (executionLog.events ?? []).find(event => event.sequence === sequence) ?? null : null;
}

function stoppedWaitingGroupIds(executionLog) {
  return new Set((executionLog.events ?? []).filter(event =>
    event.type === "assistance" && (
      event.permission_decision === "stop_waiting" ||
      (isV2(executionLog) && event.phase === "stop_waiting")
    )
  ).flatMap(event => event.group_ids ?? []));
}

function validateAssistanceEvent(event, executionLog, groups, knownCheckpoints) {
  rejectUnknownKeys(event, new Set([
    "type", "assistance_id", "phase", "checkpoint_ids", "description", "required_user_action",
    "attempts", "decision_source", "group_ids", "sequence", "at"
  ]), "v2 assistance");
  requireValue(nonEmptyString(event.assistance_id), "v2 assistance 缺少 assistance_id");
  requireValue(["requested", "resolved", "unavailable", "stop_waiting", "stop_run"].includes(event.phase), "v2 assistance.phase 无效");
  validateStringArray(event.checkpoint_ids, "v2 assistance.checkpoint_ids");
  for (const checkpointId of event.checkpoint_ids) requireValue(knownCheckpoints.has(checkpointId), `v2 assistance 引用未知检查点：${checkpointId}`);
  requireValue(nonEmptyString(event.description), "v2 assistance 必须包含事实说明");
  if (event.group_ids !== undefined) {
    validateStringArray(event.group_ids, "v2 assistance.group_ids");
    for (const groupId of event.group_ids) requireValue(groups.has(groupId), `v2 assistance 引用未知权限组：${groupId}`);
  }
  const items = assistanceState(executionLog);
  const current = items.get(event.assistance_id);
  if (event.phase === "requested") {
    requireValue(!current, `协作事项已存在：${event.assistance_id}`);
    requireValue(nonEmptyString(event.required_user_action), "v2 assistance.requested 必须说明 required_user_action");
    validateStringArray(event.attempts, "v2 assistance.attempts", { allowEmpty: true });
    requireValue(event.decision_source === "agent", "v2 assistance.requested.decision_source 必须为 agent");
    return;
  }
  if (event.phase === "stop_run" && !current) {
    requireValue(event.decision_source === "user", "v2 assistance.stop_run 必须来自用户明确决定");
    return;
  }
  requireValue(current, `协作事项不存在：${event.assistance_id}`);
  for (const checkpointId of event.checkpoint_ids) requireValue(current.remaining.has(checkpointId), `协作事项不包含未解决检查点：${checkpointId}`);
  requireValue(["user", "agent"].includes(event.decision_source), "v2 assistance.decision_source 无效");
  if (["unavailable", "stop_waiting", "stop_run"].includes(event.phase)) {
    requireValue(event.decision_source === "user", `v2 assistance.${event.phase} 必须来自用户明确决定`);
  }
}

function validateV2Undetermined(event, executionLog, record, knownCheckpoints) {
  const hasInline = event.exploration_summary !== undefined;
  const hasReference = event.exploration_ref !== undefined;
  requireValue(hasInline !== hasReference, "v2 最终 undetermined 必须在 exploration_summary 和 exploration_ref 中恰选一种");
  if (hasInline) {
    validateExplorationSummary(event.exploration_summary, knownCheckpoints, "checkpoint_result.exploration_summary");
    requireValue(event.exploration_summary.checkpoint_ids.includes(event.checkpoint_id), "exploration_summary 影响范围不包含当前检查点");
  } else {
    const source = eventBySequence(executionLog, event.exploration_ref);
    requireValue(source?.type === "blocker" && source.exploration_summary, "exploration_ref 未引用先前的合法 blocker 摘要");
    requireValue(source.exploration_summary.checkpoint_ids.includes(event.checkpoint_id), "exploration_ref 引用的摘要不影响当前检查点");
  }
  const open = [...assistanceState(executionLog).values()].some(item => item.remaining.has(event.checkpoint_id));
  requireValue(!open, `检查点 ${event.checkpoint_id} 仍有未解决协作，不得写入最终 undetermined`);
  if (event.resolution_ref !== undefined) {
    const resolution = eventBySequence(executionLog, event.resolution_ref);
    requireValue(resolution?.type === "assistance" && ["resolved", "unavailable", "stop_waiting", "stop_run"].includes(resolution.phase), "resolution_ref 未引用先前的合法协作解决或结束记录");
    requireValue(resolution.checkpoint_ids.includes(event.checkpoint_id), "resolution_ref 引用的协作记录影响范围不包含当前检查点");
  }
  if (record.checkpoint?.status !== "running" && event.permission_group_ids === undefined) {
    requireValue(event.resolution_ref !== undefined, "尚未开始的 v2 检查点终结为 undetermined 时缺少 resolution_ref");
  }
}

export function validatePermissionEvent(testCases, executionLog, event) {
  const profile = workflowProfile(executionLog);
  if (event.type === "workflow_profile") {
    requireValue(!profile && (executionLog.events?.length ?? 0) === 0, "workflow_profile 只能由 init 写入首个事件");
    requireValue(PROFILES.has(event.profile), `未知 workflow profile：${event.profile}`);
    return;
  }
  if (!PROFILES.has(profile)) return;

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
  const knownCheckpoints = new Set(checkpoints.keys());

  if (isV2(executionLog) && event.type === "assistance") {
    validateAssistanceEvent(event, executionLog, groups, knownCheckpoints);
    return;
  }
  if (isV2(executionLog) && event.type === "blocker") {
    rejectUnknownKeys(event, new Set(["type", "checkpoint_ids", "description", "reason", "exploration_summary", "sequence", "at"]), "v2 blocker");
    validateStringArray(event.checkpoint_ids, "v2 blocker.checkpoint_ids");
    for (const checkpointId of event.checkpoint_ids) requireValue(knownCheckpoints.has(checkpointId), `v2 blocker 引用未知检查点：${checkpointId}`);
    requireValue(nonEmptyString(event.description ?? event.reason), "v2 blocker 必须包含真实卡点说明");
    if (event.exploration_summary !== undefined) {
      validateExplorationSummary(event.exploration_summary, knownCheckpoints, "blocker.exploration_summary");
      for (const checkpointId of event.exploration_summary.checkpoint_ids) requireValue(event.checkpoint_ids.includes(checkpointId), "blocker.exploration_summary 不得扩大 blocker 影响范围");
    }
    return;
  }
  if (isV2(executionLog) && event.type === "evidence_capture") {
    rejectUnknownKeys(event, new Set([
      "type", "checkpoint_ids", "capture_kind", "outcome", "description", "attempts", "reason", "evidence", "sequence", "at"
    ]), "v2 evidence_capture");
    validateStringArray(event.checkpoint_ids, "v2 evidence_capture.checkpoint_ids");
    for (const checkpointId of event.checkpoint_ids) requireValue(knownCheckpoints.has(checkpointId), `v2 evidence_capture 引用未知检查点：${checkpointId}`);
    requireValue(event.capture_kind === "screenshot", "v2 evidence_capture.capture_kind 必须为 screenshot");
    requireValue(["captured", "failed", "unavailable"].includes(event.outcome), "v2 evidence_capture.outcome 无效");
    requireValue(nonEmptyString(event.description), "v2 evidence_capture 必须包含采集上下文说明");
    validateStringArray(event.attempts, "v2 evidence_capture.attempts", { allowEmpty: true });
    if (event.outcome === "captured") {
      requireValue(Array.isArray(event.evidence) && event.evidence.length > 0, "v2 evidence_capture.captured 必须注册真实图片证据");
      for (const evidence of event.evidence) {
        requireValue(evidence?.kind === "screenshot", "v2 截图证据 kind 必须为 screenshot");
        validateStringArray(evidence.checkpoint_ids, "v2 截图证据 checkpoint_ids");
        for (const checkpointId of evidence.checkpoint_ids) requireValue(event.checkpoint_ids.includes(checkpointId), "v2 截图证据不得扩大采集事件影响范围");
      }
    } else {
      requireValue(nonEmptyString(event.reason), `v2 evidence_capture.${event.outcome} 必须包含 reason`);
      requireValue(event.evidence === undefined || event.evidence.length === 0, "截图失败或不可用时不得引用模拟图片");
    }
    return;
  }
  if (isV2(executionLog) && event.type === "report_context") {
    rejectUnknownKeys(event, new Set([
      "type", "prd_links", "environment_description", "display_timezone", "description", "sequence", "at"
    ]), "v2 report_context");
    requireValue(Array.isArray(event.prd_links ?? []), "v2 report_context.prd_links 必须是数组");
    for (const [index, link] of (event.prd_links ?? []).entries()) {
      requireValue(link && typeof link === "object" && !Array.isArray(link), `v2 report_context.prd_links[${index}] 必须是对象`);
      rejectUnknownKeys(link, new Set(["title", "url"]), `v2 report_context.prd_links[${index}]`);
      requireValue(nonEmptyString(link.title) && nonEmptyString(link.url), `v2 report_context.prd_links[${index}] 缺少 title 或 url`);
      let parsed;
      try { parsed = new URL(link.url); } catch { throw consistencyError(`v2 report_context.prd_links[${index}] 链接无效`); }
      requireValue(["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password, `v2 report_context.prd_links[${index}] 只允许无认证信息的 HTTP(S) 链接`);
    }
    requireValue(event.environment_description === undefined || nonEmptyString(event.environment_description), "v2 report_context.environment_description 无效");
    if (event.display_timezone !== undefined) {
      requireValue(nonEmptyString(event.display_timezone), "v2 report_context.display_timezone 无效");
      try { new Intl.DateTimeFormat("zh-CN", { timeZone: event.display_timezone }).format(new Date()); }
      catch { throw consistencyError("v2 report_context.display_timezone 不是合法时区"); }
    }
    requireValue(nonEmptyString(event.description), "v2 report_context 必须包含元数据来源说明");
    return;
  }

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
    if (isV2(executionLog)) {
      rejectUnknownKeys(observation, new Set([
        "group_id", "account_ref", "observed_account_ref", "verification_scope", "verification",
        "target_id", "environment_ref", "context_ref", "switch_status", "description"
      ]), "v2 执行上下文核验");
      requireValue(observation.observed_account_ref === null || nonEmptyString(observation.observed_account_ref), "v2 执行上下文 observed_account_ref 无效");
      requireValue(observation.verification_scope === "execution_context", "v2 执行上下文 verification_scope 必须为 execution_context");
      requireValue(["verified", "mismatch", "unconfirmed"].includes(observation.verification), "v2 执行上下文 verification 无效");
      requireValue(nonEmptyString(observation.target_id) && knownTargetIds(executionLog).has(observation.target_id), "v2 执行上下文引用未登记 Target");
      requireValue(nonEmptyString(observation.environment_ref), "v2 执行上下文缺少 environment_ref");
      requireValue(nonEmptyString(observation.context_ref), "v2 执行上下文缺少 context_ref");
      requireValue(["completed", "not_required", "incomplete", "unconfirmed"].includes(observation.switch_status), "v2 执行上下文 switch_status 无效");
      if (observation.verification === "verified") {
        requireValue(observation.observed_account_ref === observation.account_ref, "v2 执行上下文实际账号与计划账号不一致，不得记为 verified");
        requireValue(["completed", "not_required"].includes(observation.switch_status), "v2 执行上下文必要切换未完成，不得记为 verified");
      }
      requireValue(nonEmptyString(observation.description), "v2 执行上下文核验必须包含新鲜事实说明");
      return;
    }
    requireValue(["verified", "mismatch"].includes(observation.verification), "角色核验 verification 必须为 verified 或 mismatch");
    requireValue(nonEmptyString(observation.description), "角色核验必须包含实际页面观察");
    return;
  }
  if (event.type === "execution_context_change") {
    requireValue(isV2(executionLog), "execution_context_change 仅属于 v2 工作流");
    rejectUnknownKeys(event, new Set(["type", "context_ref", "target_ids", "description", "sequence", "at"]), "execution_context_change");
    requireValue(nonEmptyString(event.context_ref), "execution_context_change 缺少 context_ref");
    validateStringArray(event.target_ids, "execution_context_change.target_ids");
    const targets = knownTargetIds(executionLog);
    for (const targetId of event.target_ids) requireValue(targets.has(targetId), `execution_context_change 引用未登记 Target：${targetId}`);
    requireValue(nonEmptyString(event.description), "execution_context_change 必须包含已发生变化的事实说明");
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
    if (isV2(executionLog)) {
      rejectUnknownKeys(event, new Set([
        "type", "assistance_id", "group_id", "checkpoint_ids", "reason", "sequence", "at"
      ]), "v2 permission_wait");
      requireValue(nonEmptyString(event.assistance_id), "v2 permission_wait 缺少 assistance_id");
      const assistance = assistanceState(executionLog).get(event.assistance_id);
      requireValue(assistance && assistance.remaining.size > 0, `v2 permission_wait 引用的协作事项不存在或已解决：${event.assistance_id}`);
      requireValue((assistance.requested.group_ids ?? []).includes(event.group_id), `v2 permission_wait 的协作事项未关联权限组：${event.group_id}`);
      for (const checkpointId of event.checkpoint_ids ?? []) {
        requireValue(assistance.remaining.has(checkpointId), `v2 permission_wait 的协作事项不包含未解决检查点：${checkpointId}`);
      }
    }
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
    if (isV2(executionLog) && event.evidence_refs !== undefined) validateStringArray(event.evidence_refs, "checkpoint_result.evidence_refs", { allowEmpty: true });
    if (["passed", "failed"].includes(event.result)) {
      requireValue(record.checkpoint?.status === "running", `检查点 ${event.checkpoint_id} 必须先实际开始`);
      requireValue(canRunCheckpoint(state, event.checkpoint_id), `检查点 ${event.checkpoint_id} 所需权限未就绪或未经实际核验`);
    } else if (event.result === "undetermined" && isV2(executionLog)) {
      validateV2Undetermined(event, executionLog, record, knownCheckpoints);
      if (record.checkpoint?.status !== "running" && event.permission_group_ids !== undefined) {
        validateStringArray(event.permission_group_ids, "checkpoint_result.permission_group_ids");
        const stopWaiting = stoppedWaitingGroupIds(executionLog);
        for (const groupId of event.permission_group_ids) {
          const group = groups.get(groupId);
          requireValue(group?.checkpoint_ids.includes(event.checkpoint_id), `无法确定结果引用不相关权限组：${groupId}`);
          requireValue(group.availability === "unavailable" || stopWaiting.has(groupId), `权限组 ${groupId} 尚无允许结束等待的明确决定`);
        }
      }
    } else if (event.result === "undetermined" && record.checkpoint?.status !== "running") {
      validateStringArray(event.permission_group_ids, "checkpoint_result.permission_group_ids");
      const stopWaiting = stoppedWaitingGroupIds(executionLog);
      for (const groupId of event.permission_group_ids) {
        const group = groups.get(groupId);
        requireValue(group?.checkpoint_ids.includes(event.checkpoint_id), `无法确定结果引用不相关权限组：${groupId}`);
        requireValue(group.availability === "unavailable" || stopWaiting.has(groupId), `权限组 ${groupId} 尚无允许结束等待的明确决定`);
      }
    }
    return;
  }
  if (event.type === "run_state" && isV2(executionLog) && (event.status ?? event.state) === "awaiting_user") {
    rejectUnknownKeys(event, new Set(["type", "status", "state", "reason", "assistance_ids", "sequence", "at"]), "v2 awaiting_user");
    requireValue(nonEmptyString(event.reason), "v2 awaiting_user 必须说明全局暂停原因");
    validateStringArray(event.assistance_ids, "v2 awaiting_user.assistance_ids");
    const assistance = assistanceState(executionLog);
    for (const assistanceId of event.assistance_ids) {
      requireValue((assistance.get(assistanceId)?.remaining.size ?? 0) > 0, `v2 awaiting_user 引用的协作事项不存在或已解决：${assistanceId}`);
    }
    return;
  }
  if (event.type === "run_state" && isV2(executionLog) && (event.status ?? event.state) === "running" && executionLog.run?.status === "awaiting_user") {
    rejectUnknownKeys(event, new Set(["type", "status", "state", "reason", "sequence", "at"]), "v2 resumed running");
    const awaiting = [...(executionLog.events ?? [])].reverse().find(item =>
      item.type === "run_state" && (item.status ?? item.state) === "awaiting_user"
    );
    const resume = [...(executionLog.events ?? [])].reverse().find(item => item.type === "resume_check");
    requireValue(resume && (resume.sequence ?? 0) > (awaiting?.sequence ?? 0), "v2 全局暂停后必须先执行 resume-check 才能恢复 running");
    const assistance = assistanceState(executionLog);
    for (const assistanceId of awaiting?.assistance_ids ?? []) {
      requireValue(assistance.has(assistanceId) && assistance.get(assistanceId).remaining.size === 0, `v2 全局暂停关联的协作事项尚未解决：${assistanceId}`);
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
    browser: {
      owned_target_ids: [],
      preexisting_target_ids: [],
      attached_preexisting_target_ids: [],
      role_observations: []
    },
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
    if (event.type === "target_inventory") {
      for (const key of ["owned_target_ids", "preexisting_target_ids", "attached_preexisting_target_ids"]) {
        if (event[key]) replay.browser[key] = [...event[key]];
      }
    }
    if (event.type === "role_observation") replay.browser.role_observations.push({ ...event.observation, at: event.at });
    if (event.type === "run_state") replay.run.status = event.status ?? event.state;
  }
}

export const permissionWorkflowProfile = PROFILE_V1;
export const permissionWorkflowProfileV2 = PROFILE_V2;
export const permissionWorkflowProfiles = Object.freeze([PROFILE_V1, PROFILE_V2]);
