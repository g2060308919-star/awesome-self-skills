import { derivePermissionState } from "./permission-batches.mjs";

export const resultLabels = Object.freeze({
  passed: "通过",
  failed: "未通过",
  undetermined: "无法确定",
  not_executed: "未执行"
});

const statusLabels = Object.freeze({
  initialized: "已初始化",
  running: "执行中",
  awaiting_user: "未完成，等待用户准备权限",
  completed: "已完成",
  interrupted: "已中断"
});

const permissionAvailabilityLabels = Object.freeze({
  ready: "已就绪",
  user_preparation_required: "待用户准备",
  unavailable: "无法提供"
});

const permissionVerificationLabels = Object.freeze({
  verified: "已核验",
  mismatch: "核验不匹配",
  stale: "核验已失效",
  unverified: "未核验"
});

const evidenceStatusLabels = Object.freeze({
  complete: "证据完整",
  partial: "证据部分完整",
  missing: "证据缺失",
  not_required: "不需要额外证据"
});

const proxyStateLabels = Object.freeze({
  not_required: "本次不需要代理",
  configured: "代理规则已准备",
  starting: "代理正在启动",
  active: "代理正在生效",
  degraded: "代理运行异常",
  stopped: "代理已停止",
  cleanup_failed: "代理清理未完成"
});

function readableTime(value) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(value ?? "");
  if (!match) return "时间未记录";
  const [year, month, day] = match[1].split("-");
  return `${year}年${month}月${day}日 ${match[2]}（UTC）`;
}

function readableTimeInZone(value, timeZone = "UTC") {
  const date = new Date(value ?? "");
  if (!Number.isFinite(date.getTime())) return "时间未记录";
  try {
    const parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    const valueOf = type => parts.find(part => part.type === type)?.value ?? "";
    return `${valueOf("year")}年${valueOf("month")}月${valueOf("day")}日 ${valueOf("hour")}:${valueOf("minute")}:${valueOf("second")}（${timeZone}）`;
  } catch {
    return readableTime(value);
  }
}

function displayId(index) {
  return `TC-${String(index + 1).padStart(3, "0")}`;
}

function durationLabel(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "无法准确计算";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours} 小时` : null, minutes ? `${minutes} 分钟` : null, `${seconds} 秒`].filter(Boolean).join(" ");
}

function deriveDurations(executionLog) {
  const start = Date.parse(executionLog.run.started_at ?? "");
  const boundaryValue = executionLog.run.completed_at ?? executionLog.events?.at(-1)?.at;
  const end = Date.parse(boundaryValue ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { accurate: false, execution_ms: null, waiting_ms: null, execution_label: "无法准确计算", waiting_label: "无法准确计算" };
  }
  let waitingStart = null;
  let waitingMs = 0;
  let accurate = true;
  for (const event of executionLog.events ?? []) {
    if (event.type !== "run_state") continue;
    const at = Date.parse(event.at ?? "");
    if (!Number.isFinite(at)) { accurate = false; continue; }
    const status = event.status ?? event.state;
    if (status === "awaiting_user" && waitingStart === null) waitingStart = at;
    if (["running", "completed", "interrupted"].includes(status) && waitingStart !== null) {
      waitingMs += Math.max(0, at - waitingStart);
      waitingStart = null;
    }
  }
  if (waitingStart !== null) waitingMs += Math.max(0, end - waitingStart);
  const executionMs = Math.max(0, end - start - waitingMs);
  return {
    accurate,
    execution_ms: executionMs,
    waiting_ms: waitingMs,
    execution_label: accurate ? durationLabel(executionMs) : "无法准确计算",
    waiting_label: accurate ? durationLabel(waitingMs) : "无法准确计算"
  };
}

function semanticOutcome(value, success = "已完成", failure = "未完成") {
  if (value === true) return success;
  if (value === false) return failure;
  return "结果未记录";
}

function semanticEvent(event) {
  const observation = event.observation && typeof event.observation === "object" ? event.observation : {};
  const base = { at: event.at ?? null, time_label: readableTime(event.at) };
  if (event.type === "mcp_preflight") return { ...base, stage: "浏览器连接检查", description: event.description ?? "已检查 Chrome DevTools MCP 连接", outcome: event.status === "available" ? "可以继续执行" : "需要处理连接问题" };
  if (event.type === "role_observation") return { ...base, stage: "账号与权限核验", description: observation.description ?? "已核验当前页面中的账号、角色和权限", outcome: permissionVerificationLabels[observation.verification] ?? "核验结果未记录" };
  if (event.type === "permission_availability") return { ...base, stage: "权限准备", description: event.declaration ?? "权限准备状态已更新", outcome: permissionAvailabilityLabels[event.availability] ?? "状态未记录" };
  if (event.type === "permission_batch") return { ...base, stage: "执行批次", description: event.description ?? "权限批次状态已更新", outcome: { started: "已开始", waiting: "等待用户准备", drained: "已完成" }[event.phase] ?? "状态未记录" };
  if (event.type === "permission_wait") return { ...base, stage: "权限准备", description: event.reason ?? "等待用户准备所需权限", outcome: `${event.checkpoint_ids?.length ?? 0} 个检查点等待处理` };
  if (event.type === "assistance") return { ...base, stage: "用户协助", description: event.description ?? event.reason ?? "已记录用户协助", outcome: event.permission_decision === "stop_waiting" ? "已停止等待指定权限" : "已记录" };
  if (event.type === "blocker") return { ...base, stage: "执行阻塞", description: event.description ?? event.reason ?? "执行遇到阻塞", outcome: "需要处理" };
  if (event.type === "evidence_capture") return {
    ...base,
    stage: "关键截图",
    description: event.description ?? event.reason ?? "已记录关键截图采集结果",
    outcome: { captured: "已采集", failed: "采集失败", unavailable: "当前不可用" }[event.outcome] ?? "结果未记录"
  };
  if (event.type === "sample_selected") return { ...base, stage: "测试数据", description: event.description ?? "已选定测试样本", outcome: "已记录" };
  if (event.type === "sample_replaced") return { ...base, stage: "测试数据", description: event.description ?? event.reason ?? "已替换测试样本", outcome: "已记录" };
  if (event.type === "proxy_state") return { ...base, stage: "代理状态", description: event.proxy?.cleanup?.reason ?? "代理状态已更新", outcome: proxyStateLabels[event.proxy?.state] ?? "状态未记录" };
  if (event.type === "cleanup_state") {
    const description = event.cleanup?.items?.map(item => item.observation ?? item.reason ?? item.item).filter(Boolean).join("；") || "已记录环境清理结果";
    return { ...base, stage: "环境清理", description, outcome: semanticOutcome(event.cleanup?.completed, "清理已完成", "清理未完成") };
  }
  if (event.type === "resume_check") return { ...base, stage: "恢复检查", description: `第 ${event.resume_count ?? 1} 次恢复检查已记录；继续执行前需要重新核验页面、账号权限和代理状态`, outcome: "等待重新核验" };
  return { ...base, stage: "其他记录", description: "存在一条无法生成语义摘要的执行记录", outcome: "请查看机器账本" };
}

function semanticFact(item, fallback, success = "已通过", failure = "未通过") {
  if (typeof item === "string") return { item: fallback, description: item, outcome: "已记录" };
  return {
    item: item?.item ?? item?.name ?? fallback,
    description: item?.description ?? item?.observation ?? item?.reason ?? "缺少可读说明",
    outcome: semanticOutcome(item?.succeeded ?? item?.passed, success, failure)
  };
}

function evidenceSummary(counts) {
  const parts = Object.entries(counts).map(([status, count]) => `${count} 个检查点${evidenceStatusLabels[status] ?? "证据状态未识别"}`);
  return parts.length ? parts.join("；") : "没有需要汇总的检查点证据";
}

function checkpointId(caseId, stepId, oracleId) {
  return `${caseId}/${stepId}/${oracleId}`;
}

const evidenceFieldLabels = Object.freeze({
  observation: "实际观察",
  text: "页面文字",
  expected: "期望",
  actual: "实际",
  matched: "是否匹配",
  status: "状态",
  result: "结果",
  region: "区域",
  url: "页面地址",
  method: "请求方式",
  value: "观察值",
  name: "名称",
  count: "数量"
});

function semanticValue(value) {
  if (value === null || value === undefined) return "未记录";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function inlineEvidenceFacts(value) {
  const facts = [];
  function visit(node, key = "observation") {
    if (Array.isArray(node)) {
      if (node.every(item => item === null || typeof item !== "object")) {
        facts.push({ label: evidenceFieldLabels[key] ?? `补充信息 ${facts.length + 1}`, value: node.map(semanticValue).join("、") || "无" });
      } else node.forEach(item => visit(item, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node)) visit(child, childKey);
      return;
    }
    facts.push({ label: evidenceFieldLabels[key] ?? `补充信息 ${facts.length + 1}`, value: semanticValue(node) });
  }
  visit(value);
  return facts.length ? facts : [{ label: "记录状态", value: "已保存结构化页面观察" }];
}

function actualRecordDescription(event) {
  if (typeof event.description === "string" && event.description.trim()) return event.description;
  if (typeof event.observation === "string" && event.observation.trim()) return event.observation;
  if (event.observation && typeof event.observation === "object") {
    return inlineEvidenceFacts(event.observation).map(fact => `${fact.label}：${fact.value}`).join("；");
  }
  if (typeof event.reason === "string" && event.reason.trim()) return event.reason;
  return ({
    checkpoint_started: "已开始检查",
    action_dispatched: "已派发测试操作",
    effect_observed: "已记录操作后的实际效果",
    checkpoint_result: "已记录检查结果"
  })[event.type] ?? "已记录实际执行事实";
}

function evidenceById(executionLog) {
  const entries = new Map();
  for (const event of executionLog.events ?? []) {
    for (const evidence of event.evidence ?? []) {
      entries.set(evidence.evidence_id, {
        ...structuredClone(evidence),
        inline_facts: evidence.inline === undefined ? [] : inlineEvidenceFacts(evidence.inline)
      });
    }
  }
  return entries;
}

function buildCaseDetail(testCase, state, caseIndex, evidence, executionLog, permissionGroups) {
  let checkpointIndex = 0;
  const steps = testCase.steps.map(step => ({
    step_id: step.step_id,
    action: step.action,
    expected: step.expected.map(oracle => {
      const checkpoint = state.checkpoints[checkpointIndex++];
      return {
        oracle_id: oracle.oracle_id,
        checkpoint_id: checkpointId(testCase.case_id, step.step_id, oracle.oracle_id),
        text: oracle.text,
        status: checkpoint.status,
        result: checkpoint.result,
        result_label: checkpoint.result ? resultLabels[checkpoint.result] : "待处理",
        reason: checkpoint.reason ?? "未记录",
        observations: checkpoint.observations?.length ? [...checkpoint.observations] : ["未记录"],
        evidence_status: checkpoint.evidence_status,
        evidence_status_label: evidenceStatusLabels[checkpoint.evidence_status] ?? "证据状态未记录",
        evidence: (checkpoint.evidence_refs ?? []).map(id => evidence.get(id)).filter(Boolean),
        blocker: checkpoint.blocker ?? "未记录",
        permission_group_ids: checkpoint.permission_group_ids ? [...checkpoint.permission_group_ids] : []
      };
    })
  }));
  const checkpointPrefix = `${testCase.case_id}/`;
  const linkedEvents = (executionLog.events ?? []).filter(event =>
    event.case_id === testCase.case_id ||
    (typeof event.checkpoint_id === "string" && event.checkpoint_id.startsWith(checkpointPrefix)) ||
    (event.checkpoint_ids ?? []).some(id => typeof id === "string" && id.startsWith(checkpointPrefix))
  );
  const actualRecords = linkedEvents.filter(event => ["action_dispatched", "effect_observed", "checkpoint_started", "checkpoint_result"].includes(event.type)).map(event => ({
    at: event.at ?? null,
    description: actualRecordDescription(event)
  }));
  const captureRecords = linkedEvents.filter(event => event.type === "evidence_capture").map(event => ({
    outcome: event.outcome,
    description: event.description,
    reason: event.reason ?? null,
    attempts: [...(event.attempts ?? [])]
  }));
  const explorationByKey = new Map();
  for (const event of linkedEvents) {
    let summary = event.exploration_summary;
    let key = event.sequence ?? `${event.type}-${explorationByKey.size}`;
    if (!summary && event.type === "checkpoint_result" && Number.isInteger(event.exploration_ref)) {
      const source = (executionLog.events ?? []).find(item => item.sequence === event.exploration_ref);
      summary = source?.exploration_summary;
      key = source?.sequence ?? key;
    }
    if (!summary) continue;
    explorationByKey.set(key, {
      missing_fact: summary.missing_fact,
      known_facts: [...(summary.known_facts ?? [])],
      attempts: (summary.attempts ?? []).map(item => ({ action: item.action, observation: item.observation })),
      not_attempted_reason: summary.not_attempted_reason ?? null,
      cannot_continue_reason: summary.cannot_continue_reason
    });
  }
  const permissions = permissionGroups.filter(group => group.case_ids.includes(testCase.case_id)).map(group => ({
    role_text: group.role_text,
    permissions: [...group.permissions],
    planned_account_ref: group.account_ref ?? null,
    observed_account_ref: group.last_observation?.observed_account_ref ?? null,
    verification: group.verification
  }));
  return {
    anchor: `case-${caseIndex + 1}`,
    display_id: displayId(caseIndex),
    case_id: testCase.case_id,
    module: testCase.module,
    title: testCase.title,
    preconditions: testCase.preconditions.length ? [...testCase.preconditions] : ["无"],
    result: state.result,
    result_label: resultLabels[state.result],
    reason: state.reason || "缺少必要检查点结果，无法确定",
    steps,
    permissions,
    actual_records: actualRecords,
    capture_records: captureRecords,
    exploration_records: [...explorationByKey.values()]
  };
}

export function buildReportModel(testCases, executionLog) {
  const evidence = evidenceById(executionLog);
  const derivedPermission = derivePermissionState(testCases, executionLog);
  const caseDetails = testCases.cases.map((testCase, index) => buildCaseDetail(testCase, executionLog.cases[index], index, evidence, executionLog, derivedPermission.groups));
  const rows = caseDetails.map(detail => ({
    anchor: detail.anchor,
    display_id: detail.display_id,
    case_id: detail.case_id,
    module: detail.module,
    title: detail.title,
    result: detail.result,
    result_label: detail.result_label,
    reason: detail.reason
  }));
  const counts = { passed: 0, failed: 0, undetermined: 0, not_executed: 0 };
  for (const row of rows) counts[row.result] += 1;
  const permission = {
    ...derivedPermission,
    groups: derivedPermission.groups.map(group => ({
      ...group,
      availability_label: permissionAvailabilityLabels[group.availability] ?? group.availability,
      verification_label: permissionVerificationLabels[group.verification] ?? group.verification
    }))
  };
  const importantTypes = new Set([
    "mcp_preflight", "role_observation", "assistance", "blocker", "sample_selected", "sample_replaced",
    "permission_availability", "permission_batch", "permission_wait", "proxy_state", "cleanup_state", "resume_check", "evidence_capture"
  ]);
  const importantEvents = (executionLog.events ?? []).filter(event => importantTypes.has(event.type)).map(event => structuredClone(event));
  const roles = executionLog.browser?.role_observations ?? [];
  const evidenceCounts = executionLog.cases.flatMap(item => item.checkpoints).reduce((result, checkpoint) => {
    result[checkpoint.evidence_status] = (result[checkpoint.evidence_status] ?? 0) + 1;
    return result;
  }, {});
  const proxy = structuredClone(executionLog.proxy ?? { required: false, state: "not_required", verifications: [] });
  const cleanup = structuredClone(executionLog.cleanup ?? { attempted: false, completed: false, items: [] });
  const profile = executionLog.events?.find(event => event.type === "workflow_profile")?.profile ?? null;
  const reportContext = [...(executionLog.events ?? [])].reverse().find(event => event.type === "report_context") ?? null;
  const displayTimezone = reportContext?.display_timezone ?? "UTC";
  const durations = deriveDurations(executionLog);
  const total = rows.length;
  const percentage = count => total > 0 ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
  const accounts = [...new Set((executionLog.browser?.role_observations ?? []).map(item => item.observed_account_ref ?? item.account_ref).filter(Boolean))];
  return {
    run: {
      run_id: executionLog.run.run_id,
      status: executionLog.run.status,
      status_label: executionLog.run.status === "awaiting_user" && profile === "permission-batches-html-v2"
        ? "未完成，等待用户协作"
        : statusLabels[executionLog.run.status] ?? executionLog.run.status,
      started_at: executionLog.run.started_at,
      started_at_label: readableTime(executionLog.run.started_at),
      completed_at: executionLog.run.completed_at,
      completed_at_label: executionLog.run.completed_at ? readableTime(executionLog.run.completed_at) : "未完成",
      updated_at: executionLog.events?.at(-1)?.at ?? executionLog.run.started_at,
      event_count: executionLog.events?.length ?? 0,
      last_sequence: executionLog.events?.at(-1)?.sequence ?? 0,
      is_final: executionLog.run.status === "completed",
      workflow_profile: profile,
      display_timezone: displayTimezone,
      boundary_at_label: readableTimeInZone(executionLog.events?.at(-1)?.at ?? executionLog.run.started_at, displayTimezone),
      started_at_display_label: readableTimeInZone(executionLog.run.started_at, displayTimezone),
      completed_at_display_label: executionLog.run.completed_at ? readableTimeInZone(executionLog.run.completed_at, displayTimezone) : "未完成",
      durations
    },
    suite: {
      name: testCases.suite.name,
      target_urls: [...(testCases.suite.target_urls ?? [])]
    },
    snapshot_sha256: executionLog.test_cases.sha256,
    roles: roles.map(role => typeof role === "string" ? role : (role.role ?? role.description ?? "未记录")),
    rows,
    counts,
    overview: {
      total,
      pass_rate: percentage(counts.passed),
      fail_rate: percentage(counts.failed),
      execution_duration: durations.execution_label,
      waiting_duration: durations.waiting_label
    },
    report_context: {
      prd_links: structuredClone(reportContext?.prd_links ?? []),
      environment_description: reportContext?.environment_description ?? "未记录",
      display_timezone: displayTimezone,
      source_description: reportContext?.description ?? "未记录",
      accounts,
      proxy_method: proxy.required ? "单 Target CDP Fetch 代理" : "未使用代理"
    },
    case_details: caseDetails,
    result_details: {
      failed: rows.filter(row => row.result === "failed"),
      undetermined: rows.filter(row => row.result === "undetermined")
    },
    assistance: (executionLog.events ?? []).filter(event => ["assistance", "blocker"].includes(event.type)).map(event => structuredClone(event)),
    evidence_counts: evidenceCounts,
    permission,
    important_events: importantEvents,
    timeline: importantEvents.map(semanticEvent),
    proxy,
    proxy_summary: {
      status: proxyStateLabels[proxy.state] ?? "代理状态未记录",
      scope: proxy.required ? (proxy.target_id ? "单个测试页面（已按精确页面绑定）" : "单个测试页面（绑定状态未记录）") : "没有页面受到代理影响",
      scope_outcome: proxy.required ? "限定为单一页面" : "未启用",
      restoration: proxy.required ? (proxy.cleanup?.reason ?? "代理停止后的原始行为恢复说明未记录") : "本次未启用代理，不需要恢复原始行为",
      restoration_outcome: proxy.required ? (proxy.cleanup?.succeeded === true ? "原始行为已恢复" : proxy.cleanup?.succeeded === false ? "原始行为恢复失败" : "恢复结果未记录") : "无需恢复",
      description: proxy.cleanup?.reason ?? (proxy.required ? "代理运行说明未记录" : "本次没有启用代理"),
      verifications: (proxy.verifications ?? []).map((item, index) => semanticFact(item, `验证项 ${index + 1}`))
    },
    cleanup,
    cleanup_summary: {
      status: cleanup.completed ? "清理已完成" : cleanup.attempted ? "清理未完成" : proxy.required ? "尚未执行清理" : "无需清理",
      items: (cleanup.items ?? []).map((item, index) => semanticFact(item, `清理项 ${index + 1}`, "已完成", "未完成"))
    },
    consistency: {
      checks: [
        { item: "用例范围", outcome: "已核对", description: `${rows.length} 条输入用例均已按原顺序纳入报告` },
        { item: "执行记录", outcome: "完整", description: `执行记录完整，共读取 ${executionLog.events?.length ?? 0} 条连续记录` },
        profile === "permission-batches-html-v2"
          ? { item: "交付来源", outcome: "一致", description: "HTML 与对话全量表由同一份不可变用例快照和执行日志模型生成" }
          : { item: "双报告来源", outcome: "一致", description: "HTML 与 Markdown 由同一份不可变用例快照和执行日志生成" },
        { item: "证据状态", outcome: "已汇总", description: evidenceSummary(evidenceCounts) },
        { item: "秘密保护", outcome: "已通过", description: "报告生成前后均执行秘密信息扫描" }
      ]
    }
  };
}
