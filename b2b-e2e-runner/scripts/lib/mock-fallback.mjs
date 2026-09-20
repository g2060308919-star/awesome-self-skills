const MOCK_VERSION = "1.0";
const ATTEMPT_ACTIONS = new Set(["started", "paused", "resumed", "scenario_updated", "finished", "aborted"]);
const DISPOSITIONS = new Set(["supplemented", "unavailable", "stopped", "unsupported"]);

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
  requireValue(value.every(string) && new Set(value).size === value.length, `${label} 包含空值、非字符串或重复值`);
}

function sequences(value, label, { empty = false } = {}) {
  requireValue(Array.isArray(value) && (empty || value.length > 0), `${label} 必须是${empty ? "" : "非空"}事件引用数组`);
  requireValue(value.every(item => Number.isInteger(item) && item > 0) && new Set(value).size === value.length,
    `${label} 包含无效或重复事件引用`);
}

function eventAt(log, sequence) {
  return (log.events ?? []).find(event => event.sequence === sequence) ?? null;
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
          excluded: sourceCase.excluded === true,
          checkpoint: loggedCase?.checkpoints?.[checkpointIndex] ?? null
        });
        checkpointIndex += 1;
      }
    }
  }
  return records;
}

function policy(log) {
  const events = (log.events ?? []).filter(event => event.type === "mock_policy");
  return events.at(-1)?.decision ?? null;
}

function mockExtension(log) {
  return log.extensions?.mock_fallback?.schema_version === MOCK_VERSION;
}

function coverageExtension(log) {
  return log.extensions?.execution_coverage?.schema_version === "1.0";
}

function assistanceItems(log) {
  const items = new Map();
  for (const event of log.events ?? []) {
    if (event.type !== "assistance") continue;
    if (event.phase === "requested") items.set(event.assistance_id, new Set(event.checkpoint_ids ?? []));
    else if (items.has(event.assistance_id)) for (const checkpointId of event.checkpoint_ids ?? []) items.get(event.assistance_id).delete(checkpointId);
  }
  return items;
}

function contextInvalidated(log, context) {
  return (log.events ?? []).some(event => (event.sequence ?? 0) > (context.sequence ?? 0) && (
    event.type === "resume_check" ||
    (event.type === "run_state" && ["awaiting_user", "interrupted"].includes(event.status ?? event.state)) ||
    (event.type === "execution_context_change" && (
      event.context_ref === context.context_ref || (event.target_ids ?? []).includes(context.target_id)
    ))
  ));
}

function verifiedContext(log, reference) {
  const context = eventAt(log, reference);
  requireValue(context?.type === "coverage_context" && context.verification === "verified",
    `Mock 上下文引用未完成真实核验：${reference}`);
  requireValue(!contextInvalidated(log, context), `Mock 上下文引用已失效：${reference}`);
  return context;
}

function evidenceEntries(log) {
  const result = new Map();
  for (const event of log.events ?? []) {
    for (const entry of event.evidence ?? []) result.set(entry.evidence_id, { entry, event });
  }
  return result;
}

function validatePolicy(log, event) {
  rejectUnknown(event, new Set(["type", "action", "decision", "decision_source", "basis", "sequence", "at"]), "mock_policy");
  requireValue(mockExtension(log), "mock_policy 缺少 mock_fallback 扩展");
  requireValue(["initial", "revoked"].includes(event.action), "mock_policy.action 无效");
  requireValue(["allowed", "declined"].includes(event.decision), "mock_policy.decision 无效");
  requireValue(event.decision_source === "user" && string(event.basis), "mock_policy 必须保存脱敏的用户明确决定");
  const previous = (log.events ?? []).filter(item => item.type === "mock_policy");
  if (event.action === "initial") {
    requireValue(previous.length === 0, "mock_policy.initial 只能记录一次");
    requireValue(!(log.events ?? []).some(item => item.type === "permission_plan"), "mock_policy.initial 必须早于 permission_plan");
  } else {
    requireValue(policy(log) === "allowed" && event.decision === "declined", "Mock 政策只能从 allowed 明确撤回为 declined");
    requireValue(!previous.some(item => item.action === "revoked"), "Mock 政策已经撤回，不能覆盖历史决定");
  }
}

function validateDataGap(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "gap_id", "checkpoint_ids", "real_blocker_refs", "exploration_refs", "missing_conditions",
    "known_request_facts", "not_started_dependencies", "sequence", "at"
  ]), "data_gap");
  requireValue(coverageExtension(log), "data_gap 需要 execution_coverage 扩展");
  requireValue(string(event.gap_id) && !(log.events ?? []).some(item => item.type === "data_gap" && item.gap_id === event.gap_id),
    `data_gap.gap_id 缺失或重复：${event.gap_id}`);
  const records = checkpointRecords(testCases, log);
  strings(event.checkpoint_ids, "data_gap.checkpoint_ids");
  for (const checkpointId of event.checkpoint_ids) requireValue(records.has(checkpointId), `data_gap 引用未知检查点：${checkpointId}`);
  sequences(event.real_blocker_refs, "data_gap.real_blocker_refs");
  sequences(event.exploration_refs, "data_gap.exploration_refs");
  for (const reference of [...event.real_blocker_refs, ...event.exploration_refs]) {
    const source = eventAt(log, reference);
    requireValue(source && ["blocker", "page_observation", "network_observation", "checkpoint_result"].includes(source.type),
      `data_gap 引用的真实阻塞或探索事实无效：${reference}`);
  }
  strings(event.missing_conditions, "data_gap.missing_conditions");
  strings(event.known_request_facts, "data_gap.known_request_facts");
  strings(event.not_started_dependencies, "data_gap.not_started_dependencies");
}

function stateBefore(log) {
  return deriveMockState(null, log);
}

function validateCandidate(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "candidate_id", "case_id", "checkpoint_ids", "gap_ids", "purpose", "sequence", "at"
  ]), "mock_candidate");
  requireValue(mockExtension(log) && policy(log) === "allowed", "Mock 政策未明确允许，不能建立候选");
  const state = stateBefore(log);
  requireValue(string(event.candidate_id) && !state.candidates.has(event.candidate_id), "mock_candidate.candidate_id 缺失或重复");
  requireValue(string(event.case_id) && testCases.cases.some(item => item.case_id === event.case_id), "mock_candidate.case_id 引用未知用例");
  strings(event.checkpoint_ids, "mock_candidate.checkpoint_ids");
  const records = checkpointRecords(testCases, log);
  for (const checkpointId of event.checkpoint_ids) {
    const record = records.get(checkpointId);
    requireValue(record?.case_id === event.case_id, `mock_candidate 检查点不属于用例 ${event.case_id}`);
    requireValue(!record.excluded && record.checkpoint?.result !== "failed", `mock_candidate 不得覆盖预排除或真实失败检查点：${checkpointId}`);
  }
  strings(event.gap_ids, "mock_candidate.gap_ids");
  const covered = new Set();
  for (const gapId of event.gap_ids) {
    const gap = state.gaps.get(gapId);
    requireValue(gap, `mock_candidate 引用未知数据缺口：${gapId}`);
    for (const checkpointId of gap.checkpoint_ids) covered.add(checkpointId);
  }
  requireValue(event.checkpoint_ids.every(id => covered.has(id)), "mock_candidate 的检查点缺少对应 data_gap 事实");
  requireValue(string(event.purpose), "mock_candidate 缺少补测目的");
}

function validateAttempt(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "attempt_id", "candidate_ids", "case_id", "action", "scenario_revision", "scenario_hash", "state_version",
    "context_refs", "proxy_cycle_refs", "candidate_checkpoint_ids", "supporting_checkpoint_ids", "sequence", "at"
  ]), "mock_attempt");
  requireValue(mockExtension(log) && policy(log) === "allowed", "Mock 政策未明确允许或已撤回，不能运行尝试");
  requireValue(string(event.attempt_id) && ATTEMPT_ACTIONS.has(event.action), "mock_attempt 标识或 action 无效");
  requireValue(Number.isInteger(event.scenario_revision) && event.scenario_revision > 0 && /^[a-f0-9]{64}$/.test(event.scenario_hash),
    "mock_attempt 场景版本或哈希无效");
  requireValue(Number.isInteger(event.state_version) && event.state_version >= 0, "mock_attempt.state_version 无效");
  sequences(event.context_refs, "mock_attempt.context_refs");
  strings(event.proxy_cycle_refs, "mock_attempt.proxy_cycle_refs");
  const state = stateBefore(log);
  const existing = state.attempts.get(event.attempt_id);
  if (event.action === "started") {
    requireValue(!existing, `Mock 尝试已存在：${event.attempt_id}`);
    strings(event.candidate_ids, "mock_attempt.candidate_ids");
    requireValue(string(event.case_id), "mock_attempt.case_id 必填");
    const candidateCheckpointIds = new Set();
    for (const candidateId of event.candidate_ids) {
      const candidate = state.candidates.get(candidateId);
      requireValue(candidate && !candidate.outcome, `Mock 候选不存在或已收尾：${candidateId}`);
      requireValue(candidate.case_id === event.case_id, `Mock 候选与尝试用例不一致：${candidateId}`);
      for (const checkpointId of candidate.checkpoint_ids) candidateCheckpointIds.add(checkpointId);
    }
    strings(event.candidate_checkpoint_ids, "mock_attempt.candidate_checkpoint_ids");
    requireValue(event.candidate_checkpoint_ids.length === candidateCheckpointIds.size && event.candidate_checkpoint_ids.every(id => candidateCheckpointIds.has(id)),
      "mock_attempt.candidate_checkpoint_ids 必须精确覆盖候选范围");
    strings(event.supporting_checkpoint_ids, "mock_attempt.supporting_checkpoint_ids", { empty: true });
    for (const reference of event.context_refs) verifiedContext(log, reference);
    const records = checkpointRecords(testCases, log);
    for (const checkpointId of [...event.candidate_checkpoint_ids, ...event.supporting_checkpoint_ids]) {
      requireValue(records.get(checkpointId)?.case_id === event.case_id, `mock_attempt 检查点不属于用例 ${event.case_id}`);
    }
    requireValue(event.state_version === 0, "mock_attempt.started 的初始状态版本必须为 0");
    return;
  }
  requireValue(existing, `Mock 尝试不存在：${event.attempt_id}`);
  requireValue(event.case_id === existing.case_id && JSON.stringify(event.candidate_ids) === JSON.stringify(existing.candidate_ids),
    "mock_attempt 后续事件的用例或候选范围不一致");
  requireValue(event.context_refs.length > 0 && event.proxy_cycle_refs.length > 0, "mock_attempt 后续事件必须保留上下文和代理周期引用");
  const allowed = {
    paused: ["running"], resumed: ["paused"], scenario_updated: ["running", "paused"],
    finished: ["running"], aborted: ["running", "paused"]
  };
  requireValue(allowed[event.action].includes(existing.state), `mock_attempt.${event.action} 不能从 ${existing.state} 转换`);
  if (event.action === "scenario_updated") requireValue(event.scenario_revision === existing.scenario_revision + 1, "Mock 场景修订号必须连续递增");
  else requireValue(event.scenario_revision === existing.scenario_revision && event.scenario_hash === existing.scenario_hash,
    "mock_attempt 后续事件场景版本或哈希不一致");
  requireValue(event.state_version === existing.state_version, "mock_attempt.state_version 与已记录状态不一致");
  if (event.action === "finished") {
    for (const checkpointId of existing.candidate_checkpoint_ids) {
      requireValue(existing.checkpoint_results.has(checkpointId), `Mock 尝试仍有候选检查点未终结：${checkpointId}`);
    }
  }
}

function validateObservation(log, event) {
  rejectUnknown(event, new Set([
    "type", "attempt_id", "receipt_id", "route_id", "request_id", "disposition", "request_facts", "response_facts",
    "state_before_version", "state_after_version", "evidence_refs", "proxy_cycle_ref", "sequence", "at"
  ]), "mock_observation");
  const state = stateBefore(log);
  const attempt = state.attempts.get(event.attempt_id);
  requireValue(attempt?.state === "running", "mock_observation 必须属于运行中的 Mock 尝试");
  requireValue(string(event.receipt_id) && !state.receipts.has(event.receipt_id), "mock_observation.receipt_id 缺失或重复");
  requireValue(string(event.route_id) && string(event.request_id), "mock_observation 缺少规则或请求关联");
  requireValue(["mocked", "blocked", "passthrough"].includes(event.disposition), "mock_observation.disposition 无效");
  strings(event.request_facts, "mock_observation.request_facts");
  strings(event.response_facts, "mock_observation.response_facts", { empty: event.disposition !== "mocked" });
  requireValue(event.state_before_version === attempt.state_version, "mock_observation.state_before_version 与尝试状态不一致");
  const expectedAfter = event.disposition === "mocked" ? attempt.state_version + 1 : attempt.state_version;
  requireValue(event.state_after_version === expectedAfter, "mock_observation.state_after_version 不符合原子事务结果");
  strings(event.evidence_refs, "mock_observation.evidence_refs", { empty: true });
  requireValue(attempt.proxy_cycle_refs.includes(event.proxy_cycle_ref), "mock_observation 引用未知代理周期");
}

function validateMockCheckpoint(testCases, log, event) {
  rejectUnknown(event, new Set([
    "type", "attempt_id", "checkpoint_id", "action", "scope_ids", "context_refs", "result", "observation", "reason",
    "evidence_refs", "request_refs", "execution_refs", "coverage_review_ref", "sequence", "at"
  ]), "mock_checkpoint");
  const state = stateBefore(log);
  const attempt = state.attempts.get(event.attempt_id);
  requireValue(attempt?.state === "running", "mock_checkpoint 必须属于运行中的 Mock 尝试");
  requireValue([...attempt.candidate_checkpoint_ids, ...attempt.supporting_checkpoint_ids].includes(event.checkpoint_id),
    "mock_checkpoint 引用不属于尝试范围的原检查点");
  const records = checkpointRecords(testCases, log);
  requireValue(records.has(event.checkpoint_id), "mock_checkpoint 引用未知原检查点");
  if (event.action === "started") {
    requireValue(!attempt.checkpoint_started.has(event.checkpoint_id) && !attempt.checkpoint_results.has(event.checkpoint_id),
      "同一 Mock 尝试内检查点不得重复开始或覆盖结果");
    strings(event.scope_ids, "mock_checkpoint.scope_ids");
    sequences(event.context_refs, "mock_checkpoint.context_refs");
    const covered = new Set();
    for (const reference of event.context_refs) {
      const context = verifiedContext(log, reference);
      for (const scopeId of context.scope_ids ?? []) if (event.scope_ids.includes(scopeId)) covered.add(scopeId);
    }
    requireValue(event.scope_ids.every(scopeId => covered.has(scopeId)), "mock_checkpoint 的执行范围缺少匹配的新鲜上下文");
    return;
  }
  requireValue(event.action === "result", "mock_checkpoint.action 必须为 started 或 result");
  requireValue(attempt.checkpoint_started.has(event.checkpoint_id) && !attempt.checkpoint_results.has(event.checkpoint_id),
    "mock_checkpoint.result 必须先 started 且只能终结一次");
  requireValue(["passed", "failed", "undetermined"].includes(event.result), "mock_checkpoint.result 仅允许 passed/failed/undetermined");
  requireValue(string(event.observation) && string(event.reason), "mock_checkpoint.result 缺少观察或原因");
  strings(event.evidence_refs, "mock_checkpoint.evidence_refs", { empty: true });
  const registered = evidenceEntries(log);
  const started = (log.events ?? []).find(item => item.type === "mock_checkpoint" && item.action === "started" &&
    item.attempt_id === event.attempt_id && item.checkpoint_id === event.checkpoint_id);
  for (const evidenceId of event.evidence_refs) {
    const evidence = registered.get(evidenceId);
    requireValue(evidence?.entry?.checkpoint_ids?.includes(event.checkpoint_id), `mock_checkpoint 引用未登记或不支持当前检查点的证据：${evidenceId}`);
    requireValue((evidence.event.sequence ?? 0) > (started?.sequence ?? 0), `mock_checkpoint 证据不在当前补测检查点执行范围内：${evidenceId}`);
  }
  strings(event.request_refs, "mock_checkpoint.request_refs", { empty: event.result === "undetermined" });
  for (const receiptId of event.request_refs) requireValue(state.receipts.get(receiptId)?.attempt_id === event.attempt_id, `mock_checkpoint 引用未知请求收据：${receiptId}`);
  sequences(event.execution_refs, "mock_checkpoint.execution_refs", { empty: event.result === "undetermined" });
  for (const reference of event.execution_refs) requireValue(eventAt(log, reference)?.type === "mock_observation", `mock_checkpoint.execution_refs 无效：${reference}`);
  const review = eventAt(log, event.coverage_review_ref);
  requireValue(review?.type === "coverage_review" && review.purpose === "checkpoint_close" && review.checkpoint_ids?.includes(event.checkpoint_id),
    "mock_checkpoint.result 缺少匹配的 checkpoint_close 审查");
  requireValue(review.sequence === (log.events?.length ?? 0), "Mock 终结审查后已有状态变化，必须重新审查");
}

function validateDisposition(log, event) {
  rejectUnknown(event, new Set([
    "type", "candidate_id", "outcome", "attempt_id", "basis_refs", "sequence", "at"
  ]), "mock_disposition");
  const state = stateBefore(log);
  const candidate = state.candidates.get(event.candidate_id);
  requireValue(candidate && !candidate.outcome, "mock_disposition 引用未知或已收尾候选");
  requireValue(DISPOSITIONS.has(event.outcome), "mock_disposition.outcome 无效");
  sequences(event.basis_refs, "mock_disposition.basis_refs");
  for (const reference of event.basis_refs) requireValue(eventAt(log, reference), `mock_disposition 引用未知依据：${reference}`);
  if (event.outcome === "supplemented") {
    const attempt = state.attempts.get(event.attempt_id);
    requireValue(attempt?.state === "finished" && attempt.candidate_ids.includes(event.candidate_id),
      "supplemented 必须引用已完成且覆盖候选的 Mock 尝试");
    requireValue(candidate.checkpoint_ids.every(id => attempt.checkpoint_results.has(id)), "supplemented 尝试缺少候选检查点结果");
  } else {
    requireValue(event.attempt_id === undefined || state.attempts.has(event.attempt_id), "mock_disposition.attempt_id 无效");
  }
}

function validateCompletion(log) {
  const state = stateBefore(log);
  const openCandidates = [...state.candidates.values()].filter(candidate => !candidate.outcome);
  requireValue(openCandidates.length === 0, `仍有 ${openCandidates.length} 个 Mock 候选未合法收尾`);
  const activeAttempts = [...state.attempts.values()].filter(attempt => !["finished", "aborted"].includes(attempt.state));
  requireValue(activeAttempts.length === 0, `仍有 ${activeAttempts.length} 个 Mock 尝试运行或暂停中`);
  const openAssistance = [...assistanceItems(log).values()].some(remaining => remaining.size > 0);
  requireValue(!openAssistance, "仍有开放用户协作，不能完成 Mock 扩展 Run");
}

export function validateMockEvent(testCases, log, event) {
  const mockTypes = new Set(["mock_policy", "mock_candidate", "mock_attempt", "mock_observation", "mock_checkpoint", "mock_disposition"]);
  if (mockTypes.has(event.type) && !mockExtension(log)) throw failure(`${event.type} 缺少 mock_fallback 扩展`);
  if (event.type === "mock_policy") return validatePolicy(log, event);
  if (event.type === "data_gap") return validateDataGap(testCases, log, event);
  if (event.type === "mock_candidate") return validateCandidate(testCases, log, event);
  if (event.type === "mock_attempt") return validateAttempt(testCases, log, event);
  if (event.type === "mock_observation") return validateObservation(log, event);
  if (event.type === "mock_checkpoint") return validateMockCheckpoint(testCases, log, event);
  if (event.type === "mock_disposition") return validateDisposition(log, event);
  if (event.type === "run_state" && (event.status ?? event.state) === "completed" && mockExtension(log)) return validateCompletion(log);
}

export function deriveMockState(testCases, log) {
  const gaps = new Map();
  const candidates = new Map();
  const attempts = new Map();
  const receipts = new Map();
  for (const event of log.events ?? []) {
    if (event.type === "data_gap") gaps.set(event.gap_id, structuredClone(event));
    if (event.type === "mock_candidate") candidates.set(event.candidate_id, { ...structuredClone(event), outcome: null, disposition: null });
    if (event.type === "mock_attempt") {
      if (event.action === "started") {
        attempts.set(event.attempt_id, {
          ...structuredClone(event), state: "running", checkpoint_started: new Set(), checkpoint_results: new Map()
        });
      } else {
        const attempt = attempts.get(event.attempt_id);
        if (!attempt) continue;
        if (event.action === "paused") attempt.state = "paused";
        if (event.action === "resumed") attempt.state = "running";
        if (event.action === "scenario_updated") {
          attempt.scenario_revision = event.scenario_revision;
          attempt.scenario_hash = event.scenario_hash;
        }
        if (event.action === "finished") attempt.state = "finished";
        if (event.action === "aborted") attempt.state = "aborted";
        attempt.state_version = event.state_version;
        attempt.context_refs = [...event.context_refs];
        attempt.proxy_cycle_refs = [...event.proxy_cycle_refs];
      }
    }
    if (event.type === "mock_observation") {
      receipts.set(event.receipt_id, { ...structuredClone(event), attempt_id: event.attempt_id });
      const attempt = attempts.get(event.attempt_id);
      if (attempt) attempt.state_version = event.state_after_version;
    }
    if (event.type === "mock_checkpoint") {
      const attempt = attempts.get(event.attempt_id);
      if (!attempt) continue;
      if (event.action === "started") attempt.checkpoint_started.add(event.checkpoint_id);
      if (event.action === "result") attempt.checkpoint_results.set(event.checkpoint_id, structuredClone(event));
    }
    if (event.type === "mock_disposition") {
      const candidate = candidates.get(event.candidate_id);
      if (candidate) {
        candidate.outcome = event.outcome;
        candidate.disposition = structuredClone(event);
      }
    }
  }
  return { enabled: mockExtension(log), policy: policy(log), gaps, candidates, attempts, receipts };
}

export function validateMockLog(testCases, log) {
  if (!coverageExtension(log) && (log.events ?? []).some(event => event.type === "data_gap")) {
    throw failure("data_gap 不能出现在缺少 execution_coverage 扩展的 Run");
  }
  if (!mockExtension(log) && (log.events ?? []).some(event => event.type.startsWith("mock_"))) {
    throw failure("Mock 事件不能出现在缺少 mock_fallback 扩展的 Run");
  }
  const replay = {
    schema_version: log.schema_version,
    extensions: structuredClone(log.extensions ?? {}),
    run: { run_id: log.run?.run_id, status: "initialized" },
    test_cases: structuredClone(log.test_cases),
    cases: testCases.cases.map(sourceCase => ({
      case_id: sourceCase.case_id,
      result: sourceCase.excluded ? "not_executed" : "undetermined",
      checkpoints: sourceCase.steps.flatMap(step => step.expected.map(oracle => ({
        step_id: step.step_id, oracle_id: oracle.oracle_id,
        status: sourceCase.excluded ? "skipped" : "pending",
        result: sourceCase.excluded ? "not_executed" : null,
        reason: sourceCase.excluded ? "输入已排除" : "尚未执行"
      })))
    })),
    browser: { owned_target_ids: [], preexisting_target_ids: [], attached_preexisting_target_ids: [] },
    events: []
  };
  for (const event of log.events ?? []) {
    validateMockEvent(testCases, replay, event);
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
        record.checkpoint.reason = event.reason;
      }
    }
    if (event.type === "run_state") replay.run.status = event.status ?? event.state;
  }
}

function mockResultsByCheckpoint(log) {
  const state = deriveMockState(null, log);
  const results = new Map();
  for (const candidate of state.candidates.values()) {
    if (candidate.outcome !== "supplemented") continue;
    const attempt = state.attempts.get(candidate.disposition.attempt_id);
    if (attempt?.state !== "finished") continue;
    for (const [checkpointId, result] of attempt.checkpoint_results) {
      const current = results.get(checkpointId);
      if (!current || result.result === "failed" || (current.result === "undetermined" && result.result === "passed")) {
        results.set(checkpointId, result);
      }
    }
  }
  return results;
}

export function projectEffectiveResults(testCases, log) {
  const mock = mockResultsByCheckpoint(log);
  const cases = testCases.cases.map((sourceCase, caseIndex) => {
    const loggedCase = log.cases[caseIndex];
    let checkpointIndex = 0;
    const projected = [];
    for (const step of sourceCase.steps) {
      for (const oracle of step.expected) {
        const checkpointId = `${sourceCase.case_id}/${step.step_id}/${oracle.oracle_id}`;
        const real = loggedCase.checkpoints[checkpointIndex++];
        const mockResult = mock.get(checkpointId);
        if (real.result === "failed") projected.push({ result: "failed", source: "real", reason: real.reason, attempt_id: null });
        else if (mockResult?.result === "failed") projected.push({ result: "failed", source: "mock", reason: mockResult.reason, attempt_id: mockResult.attempt_id });
        else if (real.result === "passed") projected.push({ result: "passed", source: "real", reason: real.reason, attempt_id: null });
        else if (mockResult?.result === "passed") projected.push({ result: "passed", source: "mock", reason: mockResult.reason, attempt_id: mockResult.attempt_id });
        else projected.push({ result: real.result ?? "undetermined", source: "real", reason: real.reason ?? "检查点尚待继续", attempt_id: null });
      }
    }
    const mockPassAttempts = new Set(projected
      .filter(item => item.source === "mock" && item.result === "passed" && item.attempt_id)
      .map(item => item.attempt_id));
    const inconsistentMockPass = mockPassAttempts.size > 1;
    let effective = sourceCase.excluded ? "not_executed"
      : projected.some(item => item.result === "failed") ? "failed"
        : inconsistentMockPass ? "undetermined"
        : projected.some(item => item.result === "undetermined" || item.result == null) ? "undetermined"
          : projected.every(item => item.result === "not_executed") ? "not_executed" : "passed";
    const decisive = inconsistentMockPass && effective !== "failed"
      ? { reason: "不同 Mock 尝试的成功事实不能拼接为同一用例通过；需要在同一一致场景尝试中复核全部相关检查点" }
      : projected.find(item => item.result === "failed") ?? projected.find(item => item.result === "undetermined") ?? projected.at(-1);
    const source = inconsistentMockPass || projected.some(item => item.source === "mock" && item.result === effective) ? "mock" : "real";
    return {
      case_id: sourceCase.case_id,
      real_result: loggedCase.result,
      effective_result: effective,
      source,
      reason: decisive?.reason ?? loggedCase.reason
    };
  });
  return {
    cases,
    counts: {
      total: cases.length,
      real_passed: cases.filter(item => item.real_result === "passed").length,
      effective_passed: cases.filter(item => item.effective_result === "passed").length,
      failed: cases.filter(item => item.effective_result === "failed").length,
      undetermined: cases.filter(item => item.effective_result === "undetermined").length,
      not_executed: cases.filter(item => item.effective_result === "not_executed").length
    }
  };
}

export const mockFallbackVersion = MOCK_VERSION;
