import { readFile } from "node:fs/promises";
import path from "node:path";
import * as runtime from "../scripts/run-artifacts.mjs";
import { deriveExecutionProgress, scenarioForEvent } from "../scripts/lib/execution-progress.mjs";
import { validatePermissionEvent } from "../scripts/lib/permission-batches.mjs";

// Component fixtures supply deterministic observations through the public APIs.
// They are not browser evidence. No extension, validator, or recorded history is removed.
export async function fixtureState(runRoot) {
  const [snapshot, log] = await Promise.all([
    readFile(path.join(runRoot, "test-cases.json"), "utf8").then(JSON.parse),
    readFile(path.join(runRoot, "execution-log.json"), "utf8").then(JSON.parse)
  ]);
  return { snapshot, log };
}

export async function recordFixtureScreenshotGaps(runRoot) {
  const { snapshot } = await fixtureState(runRoot);
  for (const item of snapshot.cases.filter(item => !item.excluded)) {
    await runtime.recordEvent(runRoot, {
      type: "evidence_capture", capture_kind: "screenshot", outcome: "unavailable",
      checkpoint_ids: item.steps.flatMap(step => step.expected.map(oracle => `${item.case_id}/${step.step_id}/${oracle.oracle_id}`)),
      description: "组件夹具没有浏览器截图采集通道", attempts: ["已确认本测试仅构造本地日志夹具"],
      reason: "本测试未启动真实浏览器，不伪造截图证据"
    });
  }
}

export async function initializeFixtureRun(options) {
  const run = await runtime.initializeRun(options);
  if (options.workflowProfile === undefined) {
    const { snapshot } = await fixtureState(run.runRoot);
    await recordFixtureEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: snapshot.cases.map(item => item.case_id) });
  }
  return run;
}

async function ensurePlan(runRoot) {
  const { snapshot, log } = await fixtureState(runRoot);
  if (log.events.some(event => event.type === "coverage_plan")) return;
  const permission = log.events.find(event => event.type === "permission_plan");
  if (!permission) return;
  await runtime.recordEvent(runRoot, {
    type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: log.test_cases.sha256,
    source: "组件夹具的不可变快照与权限计划",
    items: snapshot.cases.flatMap(item => item.steps.flatMap(step => step.expected.map(oracle => {
      const checkpoint_id = `${item.case_id}/${step.step_id}/${oracle.oracle_id}`;
      return { checkpoint_id, dependencies: [], scopes: item.excluded ? [] : [{
        scope_id: `fixture:${checkpoint_id}`,
        group_ids: permission.groups.filter(group => group.checkpoint_ids.includes(checkpoint_id)).map(group => group.group_id),
        location_ref: snapshot.suite.target_urls[0], location_status: "known",
        step_refs: [`${item.case_id}/${step.step_id}`], source_refs: [`snapshot:${item.case_id}/${step.step_id}`]
      }] };
    })))
  });
}

async function ensureTarget(runRoot, targetId) {
  const { log } = await fixtureState(runRoot);
  if (log.browser.owned_target_ids.includes(targetId)) return;
  return runtime.recordEvent(runRoot, {
    type: "target_inventory", owned_target_ids: [...log.browser.owned_target_ids, targetId],
    preexisting_target_ids: log.browser.preexisting_target_ids,
    attached_preexisting_target_ids: log.browser.attached_preexisting_target_ids
  });
}

async function fixtureContext(runRoot, checkpointId) {
  const { snapshot, log } = await fixtureState(runRoot);
  const plan = log.events.find(event => event.type === "coverage_plan");
  const item = plan.items.find(item => item.checkpoint_id === checkpointId);
  const scopes = item.scopes;
  const groups = scopes.flatMap(scope => scope.group_ids);
  const roles = groups.map(groupId => [...log.events].reverse().find(event => event.type === "role_observation" && event.observation?.group_id === groupId));
  const role = roles[0]?.observation;
  const targetId = role?.target_id ?? "fixture-target";
  await ensureTarget(runRoot, targetId);
  const { log: fresh } = await fixtureState(runRoot);
  const context = await runtime.recordEvent(runRoot, {
    type: "coverage_context", scope_ids: scopes.map(scope => scope.scope_id),
    account_ref: role?.account_ref ?? null, observed_account_ref: role?.observed_account_ref ?? null,
    target_id: targetId, context_ref: role?.context_ref ?? "fixture-context", environment_ref: role?.environment_ref ?? "fixture",
    observed_url: snapshot.suite.target_urls[0], verification: "verified", switch_status: "not_required",
    fact_refs: [fresh.events.at(-1).sequence], ...(roles.length ? { role_observation_refs: roles.map(event => event.sequence) } : {})
  });
  return { scope_ids: scopes.map(scope => scope.scope_id), context_refs: [context.sequence] };
}

async function review(runRoot, purpose, { checkpointId, closure, factRefs = [] } = {}) {
  const { snapshot, log } = await fixtureState(runRoot);
  const plan = log.events.find(event => event.type === "coverage_plan");
  const progress = deriveExecutionProgress(snapshot, log);
  const items = checkpointId ? plan.items.filter(item => item.checkpoint_id === checkpointId) : purpose === "wait" ? plan.items.filter(item => item.scopes.some(scope => progress.scenes.some(scene => scene.scope_id === scope.scope_id && scene.batch_id === progress.active_batch_id))) : plan.items;
  const scopeIds = items.flatMap(item => item.scopes.map(scope => scope.scope_id));
  const checkpointIds = items.map(item => item.checkpoint_id);
  const closures = closure ? [closure] : [];
  if (purpose === "final") {
    for (const item of items) {
      const prior = [...log.events].reverse().find(event => event.type === "checkpoint_result" && event.checkpoint_id === item.checkpoint_id);
      const sourceCase = snapshot.cases.find(source => source.steps.some(step => step.expected.some(oracle => `${source.case_id}/${step.step_id}/${oracle.oracle_id}` === item.checkpoint_id)));
      if (prior) {
        const previousReview = log.events.find(event => event.sequence === prior.coverage_review_ref);
        closures.push(previousReview.closures.find(value => value.checkpoint_id === item.checkpoint_id));
      } else if (sourceCase.excluded) {
        closures.push({ checkpoint_id: item.checkpoint_id, closure_kind: "preexcluded", basis_refs: [`snapshot:${sourceCase.case_id}`], not_attempted_reason: "原输入明确排除" });
      }
    }
  }
  const completed = new Set(progress.checkpoints.filter(item => item.complete).map(item => item.checkpoint_id));
  const openScopeIds = items.filter(item => !completed.has(item.checkpoint_id)).flatMap(item => item.scopes.map(scope => scope.scope_id));
  const event = await runtime.recordEvent(runRoot, {
    type: "coverage_review", review_id: `fixture-review-${log.events.length + 1}`, purpose, plan_revision: plan.revision,
    based_on_sequence: log.events.length, scope_ids: scopeIds, checkpoint_ids: checkpointIds,
    fact_refs: factRefs.length ? factRefs : log.events.filter(event => ["blocker", "assistance", "checkpoint_result", "page_observation"].includes(event.type)).map(event => event.sequence),
    assistance_refs: [], ready_scope_ids: purpose === "wait" ? [] : openScopeIds, preparable_scope_ids: [],
    blocked_scope_ids: purpose === "wait" ? openScopeIds : [], closures,
    choice: purpose === "final" ? "finish" : purpose === "wait" ? "wait" : "continue",
    reason: "组件夹具按当前事件边界核对原检查点与执行范围"
  });
  return event.sequence;
}

export async function recordFixtureEvent(runRoot, input, { prepareOnly = false } = {}) {
  const event = structuredClone(input);
  const { snapshot, log } = await fixtureState(runRoot);
  // Preserve the negative permission assertions before fixture context preparation.
  if (["case_started", "checkpoint_started"].includes(event.type)) validatePermissionEvent(snapshot, log, event);
  if (event.type === "role_observation" && event.observation?.verification_scope === undefined && event.observation?.role !== undefined) {
    const role = event.observation;
    delete role.role;
    role.verification_scope = "execution_context";
    role.observed_account_ref = role.account_ref;
    role.target_id = `fixture-target:${role.account_ref}`;
    role.context_ref = `fixture-context:${role.account_ref}`;
    role.environment_ref = "fixture";
    role.switch_status = "not_required";
    await ensureTarget(runRoot, role.target_id);
  }
  if (["case_started", "checkpoint_started", "checkpoint_result", "run_state"].includes(event.type)) await ensurePlan(runRoot);
  if (event.type === "checkpoint_started" && event.scope_ids === undefined) Object.assign(event, await fixtureContext(runRoot, event.checkpoint_id));
  if (event.type === "checkpoint_started" && event.preparation_ref === undefined) {
    const { log: current } = await fixtureState(runRoot);
    const scene = scenarioForEvent(current,event);
    const input = await runtime.recordEvent(runRoot,{type:"page_observation",checkpoint_ids:[event.checkpoint_id],description:"组件夹具：前置输入已准备；不是被测功能结果"});
    const prep = await runtime.recordEvent(runRoot,{type:"scenario_preparation",checkpoint_id:event.checkpoint_id,scenario_id:scene.scenario_id,
      execution_id:`fixture-execution-${current.events.length}`,batch_id:scene.batch_id,context_refs:event.context_refs,fact_refs:[input.sequence],data_source:"real",permission_source:"real"});
    Object.assign(event,{scenario_id:scene.scenario_id,execution_id:`fixture-execution-${current.events.length}`,batch_id:scene.batch_id,preparation_ref:prep.sequence});
  }
  if (event.type === "checkpoint_result") {
    const { log: current } = await fixtureState(runRoot);
    const start = current.events.filter(item => item.type === "checkpoint_started" && item.checkpoint_id === event.checkpoint_id).at(-1);
    if (start) Object.assign(event,{scenario_id:start.scenario_id,execution_id:start.execution_id,batch_id:start.batch_id});
  }
  if (event.type === "checkpoint_result" && event.coverage_review_ref === undefined) {
    let basis;
    let kind;
    if (event.resolution_ref) { basis = [event.resolution_ref]; kind = "user_decision"; }
    else if (event.exploration_ref) { basis = [event.exploration_ref]; kind = "exploration_insufficient"; }
    else {
      if (["passed","failed"].includes(event.result) && !(await fixtureState(runRoot)).log.events.some(item => item.type === "action_dispatched" && item.execution_id === event.execution_id)) await runtime.recordEvent(runRoot,{type:"action_dispatched", action_id:`fixture-action:${event.execution_id}`,checkpoint_id:event.checkpoint_id,scenario_id:event.scenario_id,execution_id:event.execution_id,side_effect:false,description:"组件夹具实际导航触发事件"});
      const observation = await runtime.recordEvent(runRoot, { type: "page_observation", checkpoint_ids: [event.checkpoint_id], scenario_id:event.scenario_id,execution_id:event.execution_id, description: event.observation ?? event.reason });
      basis = [observation.sequence];
      kind = event.result === "undetermined" ? "exploration_insufficient" : "observed";
    }
    event.execution_refs = basis;
    event.coverage_review_ref = await review(runRoot, "checkpoint_close", {
      checkpointId: event.checkpoint_id, factRefs: basis,
      closure: { checkpoint_id: event.checkpoint_id, closure_kind: kind, basis_refs: basis, ...(kind === "user_decision" ? { not_attempted_reason: event.reason } : {}) }
    });
  }
  if (event.type === "run_state" && event.coverage_review_ref === undefined) {
    const purpose = event.status === "completed" ? "final" : event.status === "awaiting_user" ? "wait" : event.status === "running" && log.run.status === "awaiting_user" ? "resume" : null;
    if (purpose) event.coverage_review_ref = await review(runRoot, purpose);
  }
  if (prepareOnly) return event;
  const recorded = await runtime.recordEvent(runRoot, event);
  return recorded;
}

export async function requestFixturePermission(runRoot, { group_id, checkpoint_ids, reason }) {
  const assistance_id = `fixture-permission:${group_id}`;
  await runtime.recordEvent(runRoot, {
    type: "assistance", assistance_id, phase: "requested", checkpoint_ids, group_ids: [group_id],
    description: reason, required_user_action: reason, attempts: ["组件夹具确认该权限尚未准备"], decision_source: "agent"
  });
  await runtime.recordEvent(runRoot, { type: "permission_wait", group_id, checkpoint_ids, reason, assistance_id });
  return assistance_id;
}

export async function resolveFixturePermission(runRoot, { group_id, checkpoint_ids, phase = "resolved", description }) {
  return runtime.recordEvent(runRoot, {
    type: "assistance", assistance_id: `fixture-permission:${group_id}`, phase, checkpoint_ids, group_ids: [group_id],
    description, decision_source: "user"
  });
}
