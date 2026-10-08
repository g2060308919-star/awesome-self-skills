import assert from "node:assert/strict";
import test from "node:test";

import {
  coverageEnabled,
  deriveCoverageState,
  validateCoverageEvent,
  validateCoverageLog
} from "../scripts/lib/execution-coverage.mjs";

const checkpointIds = ["A/s1/o1", "B/s1/o1", "A/s2/o1"];
const testCases = {
  schema_version: "2.0",
  suite: { name: "双站跨角色", target_urls: ["https://web1.example.test", "https://web2.example.test"] },
  cases: [
    { case_id: "A", steps: [
      { step_id: "s1", expected: [{ oracle_id: "o1", text: "创建成功" }] },
      { step_id: "s2", expected: [{ oracle_id: "o1", text: "回查成功" }] }
    ] },
    { case_id: "B", steps: [{ step_id: "s1", expected: [{ oracle_id: "o1", text: "审核成功" }] }] }
  ]
};

function baseLog() {
  return {
    schema_version: "2.0",
    extensions: { execution_coverage: { schema_version: "1.0" } },
    test_cases: { sha256: "a".repeat(64) },
    run: { status: "initialized" },
    browser: { owned_target_ids: ["target-web1", "target-web2"], preexisting_target_ids: [], attached_preexisting_target_ids: [] },
    cases: [
      { case_id: "A", checkpoints: [
        { step_id: "s1", oracle_id: "o1", status: "pending", result: null },
        { step_id: "s2", oracle_id: "o1", status: "pending", result: null }
      ] },
      { case_id: "B", checkpoints: [{ step_id: "s1", oracle_id: "o1", status: "pending", result: null }] }
    ],
    events: [
      { type: "workflow_profile", profile: "permission-batches-html-v2", sequence: 1, at: "2026-09-20T00:00:00.000Z" },
      {
        type: "permission_plan", version: "1.0", sequence: 2, at: "2026-09-20T00:00:01.000Z",
        groups: [
          { group_id: "role-a", checkpoint_ids: ["A/s1/o1", "A/s2/o1"], case_ids: ["A"], role_text: "A", permissions: ["创建和回查"], availability: "ready", account_ref: "account-a", preparation_owner: null, declaration: "用户已提供 A" },
          { group_id: "role-b", checkpoint_ids: ["B/s1/o1"], case_ids: ["B"], role_text: "B", permissions: ["审核"], availability: "ready", account_ref: "account-b", preparation_owner: null, declaration: "用户已提供 B" }
        ],
        role_independent_case_ids: []
      }
    ]
  };
}

function coveragePlan(overrides = {}) {
  return {
    type: "coverage_plan",
    action: "initial",
    revision: 1,
    snapshot_hash: "a".repeat(64),
    source: "原用例步骤、权限确认与测试地址",
    items: [
      {
        checkpoint_id: "A/s1/o1",
        scopes: [{
          scope_id: "scope-a-create-web1", group_ids: ["role-a"], location_ref: "https://web1.example.test/create",
          location_status: "known", step_refs: ["A/s1"], source_refs: ["snapshot:A/s1", "permission:role-a"]
        }],
        dependencies: []
      },
      {
        checkpoint_id: "B/s1/o1",
        scopes: [{
          scope_id: "scope-b-approve-web2", group_ids: ["role-b"], location_ref: "https://web2.example.test/review",
          location_status: "known", step_refs: ["B/s1"], source_refs: ["snapshot:B/s1", "permission:role-b"]
        }],
        dependencies: [{
          dependency_id: "dep-created-record", step_refs: ["A/s1"], checkpoint_refs: ["A/s1/o1"],
          required_fact: "A 创建的业务记录标识存在", source_refs: ["snapshot:B/s1"]
        }]
      },
      {
        checkpoint_id: "A/s2/o1",
        scopes: [{
          scope_id: "scope-a-readback-web1", group_ids: ["role-a"], location_ref: null,
          location_status: "needs_discovery", step_refs: ["A/s2"], source_refs: ["snapshot:A/s2"],
          known_entry_clue: "从 A 的记录列表进入详情", location_gap: "实际详情路径需在登录后发现"
        }],
        dependencies: [{
          dependency_id: "dep-approved-record", step_refs: ["B/s1"], checkpoint_refs: ["B/s1/o1"],
          required_fact: "B 已审核同一业务记录", source_refs: ["snapshot:A/s2"]
        }]
      }
    ],
    ...overrides
  };
}

function append(log, event) {
  const stored = { ...structuredClone(event), sequence: log.events.length + 1, at: `2026-09-20T00:00:${String(log.events.length + 1).padStart(2, "0")}.000Z` };
  log.events.push(stored);
  return stored;
}

test("v1.1 AC-48/49/50: initial coverage maps every original checkpoint without a role-by-site cartesian product", () => {
  const log = baseLog();
  const event = coveragePlan();
  assert.equal(coverageEnabled(log), true);
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, event));
  append(log, event);
  const state = deriveCoverageState(testCases, log);
  assert.equal(state.plan_revision, 1);
  assert.deepEqual([...state.scopes.keys()], ["scope-a-create-web1", "scope-b-approve-web2", "scope-a-readback-web1"]);
  assert.equal(state.scopes.size, 3, "three semantic scopes stay three instead of becoming six role × site combinations");
  assert.deepEqual(state.return_tasks.map(item => item.checkpoint_id), ["A/s2/o1"]);
  assert.doesNotThrow(() => validateCoverageLog(testCases, log));
});

test("v1.1 AC-48/49: missing checkpoints, duplicate scopes, or unrelated permission groups fail closed", () => {
  const missing = baseLog();
  assert.throws(() => validateCoverageEvent(testCases, missing, coveragePlan({ items: coveragePlan().items.slice(0, 2) })), /精确覆盖|缺少/);

  const duplicate = baseLog();
  const duplicatePlan = coveragePlan();
  duplicatePlan.items[1].scopes[0].scope_id = "scope-a-create-web1";
  assert.throws(() => validateCoverageEvent(testCases, duplicate, duplicatePlan), /scope_id|重复/);

  const unrelated = baseLog();
  const unrelatedPlan = coveragePlan();
  unrelatedPlan.items[1].scopes[0].group_ids = ["role-a"];
  assert.throws(() => validateCoverageEvent(testCases, unrelated, unrelatedPlan), /权限组|检查点/);
});

test("v1.1 AC-55/56: each site context binds the actual account, target, environment, storage context, URL, and role observation", () => {
  const log = baseLog();
  append(log, coveragePlan());
  append(log, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-a", observed_account_ref: "account-a",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-a", switch_status: "not_required", description: "页面显示 A 账号"
    }
  });
  const valid = {
    type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-a", observed_account_ref: "account-a",
    target_id: "target-web1", context_ref: "profile-a", environment_ref: "staging",
    observed_url: "https://web1.example.test/create", verification: "verified", switch_status: "not_required",
    fact_refs: [3], role_observation_refs: [4]
  };
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, valid));

  assert.throws(() => validateCoverageEvent(testCases, log, { ...valid, target_id: "unknown" }), /Target/);
  assert.throws(() => validateCoverageEvent(testCases, log, { ...valid, observed_account_ref: "account-b" }), /账号/);
  assert.throws(() => validateCoverageEvent(testCases, log, { ...valid, observed_url: "https://user:pass@web1.example.test/create" }), /URL|认证/);
  assert.throws(() => validateCoverageEvent(testCases, log, { ...valid, role_observation_refs: [] }), /权限核验/);
});

test("permission recovery: a freshly verified account added after the initial plan can establish coverage and start its checkpoint", () => {
  const log = baseLog();
  const group = log.events[1].groups.find(item => item.group_id === "role-a");
  group.availability = "user_preparation_required";
  group.account_ref = null;
  group.preparation_owner = "user";
  group.declaration = "用户稍后自行准备 A 权限";
  append(log, coveragePlan());
  append(log, {
    type: "target_inventory", owned_target_ids: ["target-web1", "target-web2"],
    preexisting_target_ids: [], attached_preexisting_target_ids: []
  });
  append(log, {
    type: "permission_availability",
    group_id: "role-a",
    availability: "ready",
    account_ref: "account-a-ready",
    declaration: "用户说明虚构账号已具备 A 权限"
  });
  append(log, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-a-ready", observed_account_ref: "account-a-ready",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-a-ready", switch_status: "completed",
      description: "页面已核对虚构账号和 A 权限"
    }
  });
  const context = {
    type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-a-ready",
    observed_account_ref: "account-a-ready", target_id: "target-web1", context_ref: "profile-a-ready",
    environment_ref: "staging", observed_url: "https://web1.example.test/create", verification: "verified",
    switch_status: "completed", fact_refs: [5, 6], role_observation_refs: [6]
  };

  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, context));
  append(log, context);
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, {
    type: "checkpoint_started",
    checkpoint_id: "A/s1/o1",
    scope_ids: ["scope-a-create-web1"],
    context_refs: [7]
  }));
  append(log, {
    type: "checkpoint_started",
    checkpoint_id: "A/s1/o1",
    scope_ids: ["scope-a-create-web1"],
    context_refs: [7]
  });
  assert.doesNotThrow(() => validateCoverageLog(testCases, log));
  assert.doesNotThrow(() => validateCoverageLog(testCases, structuredClone(log)));
});

test("permission recovery fails closed for groups that are not ready, have another account, or lack fresh verified role evidence", () => {
  function pendingLog() {
    const log = baseLog();
    const group = log.events[1].groups.find(item => item.group_id === "role-a");
    group.availability = "user_preparation_required";
    group.account_ref = null;
    group.preparation_owner = "user";
    append(log, coveragePlan());
    return log;
  }

  function context(overrides = {}) {
    return {
      type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-current",
      observed_account_ref: "account-current", target_id: "target-web1", context_ref: "profile-current",
      environment_ref: "staging", observed_url: "https://web1.example.test/create", verification: "verified",
      switch_status: "completed", fact_refs: [3], role_observation_refs: [], ...overrides
    };
  }

  const notReady = pendingLog();
  assert.throws(() => validateCoverageEvent(testCases, notReady, context()), /当前未就绪/);

  const missingAccount = pendingLog();
  append(missingAccount, {
    type: "permission_availability", group_id: "role-a", availability: "ready",
    account_ref: null, declaration: "损坏日志中的就绪状态没有账号"
  });
  assert.throws(() => validateCoverageEvent(testCases, missingAccount, context({ fact_refs: [4] })), /当前账号缺失/);

  const missingObservation = pendingLog();
  append(missingObservation, {
    type: "permission_availability", group_id: "role-a", availability: "ready",
    account_ref: "account-current", declaration: "用户说明虚构账号已准备"
  });
  assert.throws(() => validateCoverageEvent(testCases, missingObservation, context({ fact_refs: [4] })), /当前角色核验无效：unverified/);

  append(missingObservation, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-current", observed_account_ref: "account-current",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-current", switch_status: "completed", description: "当前核验通过"
    }
  });
  assert.throws(() => validateCoverageEvent(testCases, missingObservation, context({
    account_ref: "account-other", observed_account_ref: "account-other", fact_refs: [4, 5], role_observation_refs: [5]
  })), /当前账号不一致/);

  const stale = baseLog();
  append(stale, coveragePlan());
  append(stale, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-a", observed_account_ref: "account-a",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-old", switch_status: "not_required", description: "旧账号核验"
    }
  });
  append(stale, {
    type: "permission_availability", group_id: "role-a", availability: "ready",
    account_ref: "account-current", declaration: "用户将权限切换到新账号"
  });
  assert.throws(() => validateCoverageEvent(testCases, stale, context({ fact_refs: [4, 5], role_observation_refs: [4] })), /当前角色核验无效：stale/);

  for (const verification of ["mismatch", "unconfirmed"]) {
    const invalid = pendingLog();
    append(invalid, {
      type: "permission_availability", group_id: "role-a", availability: "ready",
      account_ref: "account-current", declaration: "用户说明虚构账号已准备"
    });
    append(invalid, {
      type: "role_observation",
      observation: {
        group_id: "role-a", account_ref: "account-current", observed_account_ref: "account-other",
        verification_scope: "execution_context", verification, target_id: "target-web1",
        environment_ref: "staging", context_ref: "profile-current", switch_status: "completed", description: "页面账号核验未通过"
      }
    });
    assert.throws(() => validateCoverageEvent(testCases, invalid, context({ fact_refs: [4, 5], role_observation_refs: [5] })),
      new RegExp(`当前角色核验无效：${verification}`));
  }

  const staleReference = pendingLog();
  append(staleReference, {
    type: "permission_availability", group_id: "role-a", availability: "ready",
    account_ref: "account-current", declaration: "用户说明虚构账号已准备"
  });
  append(staleReference, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-current", observed_account_ref: "account-current",
      verification_scope: "execution_context", verification: "unconfirmed", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-current", switch_status: "completed", description: "较早观察尚未确认"
    }
  });
  append(staleReference, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-current", observed_account_ref: "account-current",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-current", switch_status: "completed", description: "当前观察已经核验"
    }
  });
  assert.throws(() => validateCoverageEvent(testCases, staleReference, context({
    fact_refs: [4, 5, 6], role_observation_refs: [5]
  })), /当前有效观察|verified/);
});

test("permission recovery requires every group in a multi-group scope to share the ready verified current account", () => {
  function multiGroupLog() {
    const log = baseLog();
    const roleA = log.events[1].groups.find(item => item.group_id === "role-a");
    const roleB = log.events[1].groups.find(item => item.group_id === "role-b");
    for (const group of [roleA, roleB]) {
      group.availability = "user_preparation_required";
      group.account_ref = null;
      group.preparation_owner = "user";
    }
    roleB.case_ids = ["A", "B"];
    roleB.checkpoint_ids = ["A/s1/o1", "B/s1/o1"];
    const plan = coveragePlan();
    plan.items[0].scopes[0].group_ids = ["role-a", "role-b"];
    plan.items[0].scopes[0].source_refs.push("permission:role-b");
    assert.doesNotThrow(() => validateCoverageEvent(testCases, log, plan));
    append(log, plan);
    return log;
  }

  function makeObservation(groupId) {
    return {
      type: "role_observation",
      observation: {
        group_id: groupId, account_ref: "account-shared", observed_account_ref: "account-shared",
        verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
        environment_ref: "staging", context_ref: "profile-shared", switch_status: "completed",
        description: `页面已核对 ${groupId}`
      }
    };
  }

  const log = multiGroupLog();
  append(log, {
    type: "permission_availability", group_id: "role-a", availability: "ready",
    account_ref: "account-shared", declaration: "A 已准备"
  });
  append(log, makeObservation("role-a"));
  const context = {
    type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-shared",
    observed_account_ref: "account-shared", target_id: "target-web1", context_ref: "profile-shared",
    environment_ref: "staging", observed_url: "https://web1.example.test/create", verification: "verified",
    switch_status: "completed", fact_refs: [4, 5], role_observation_refs: [5]
  };
  assert.throws(() => validateCoverageEvent(testCases, log, context), /role-b 当前未就绪/);

  append(log, {
    type: "permission_availability", group_id: "role-b", availability: "ready",
    account_ref: "account-shared", declaration: "B 已准备"
  });
  append(log, makeObservation("role-a"));
  append(log, makeObservation("role-b"));
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, {
    ...context,
    fact_refs: [4, 5, 6, 7, 8],
    role_observation_refs: [7, 8]
  }));
});

test("permission recovery makes switch and batch-end reviews include every open scope on the current derived account", () => {
  for (const purpose of ["switch", "batch_end"]) {
    const log = baseLog();
    for (const group of log.events[1].groups) {
      group.availability = "user_preparation_required";
      group.account_ref = null;
      group.preparation_owner = "user";
    }
    log.cases[0].checkpoints[1].status = "completed";
    log.cases[0].checkpoints[1].result = "passed";
    append(log, coveragePlan());
    for (const [groupId, targetId, contextRef] of [
      ["role-a", "target-web1", "profile-a"],
      ["role-b", "target-web2", "profile-b"]
    ]) {
      append(log, {
        type: "permission_availability", group_id: groupId, availability: "ready",
        account_ref: "account-shared", declaration: `${groupId} 已由同一虚构账号准备`
      });
      append(log, {
        type: "role_observation",
        observation: {
          group_id: groupId, account_ref: "account-shared", observed_account_ref: "account-shared",
          verification_scope: "execution_context", verification: "verified", target_id: targetId,
          environment_ref: "staging", context_ref: contextRef, switch_status: "completed", description: `${groupId} 核验通过`
        }
      });
    }
    append(log, {
      type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-shared",
      observed_account_ref: "account-shared", target_id: "target-web1", context_ref: "profile-a",
      environment_ref: "staging", observed_url: "https://web1.example.test/create", verification: "verified",
      switch_status: "completed", fact_refs: [4, 5], role_observation_refs: [5]
    });
    const incomplete = {
      type: "coverage_review", review_id: `${purpose}-incomplete`, purpose, plan_revision: 1,
      based_on_sequence: log.events.length, scope_ids: ["scope-a-create-web1"], checkpoint_ids: ["A/s1/o1"],
      fact_refs: [8], assistance_refs: [], ready_scope_ids: ["scope-a-create-web1"], preparable_scope_ids: [],
      blocked_scope_ids: [], closures: [], choice: "switch", reason: "仅覆盖了同账号的一部分范围"
    };
    assert.throws(() => validateCoverageEvent(testCases, log, incomplete), /当前账号仍有关联的遗留范围/);
    assert.doesNotThrow(() => validateCoverageEvent(testCases, log, {
      ...incomplete,
      review_id: `${purpose}-complete`,
      scope_ids: ["scope-a-create-web1", "scope-b-approve-web2"],
      checkpoint_ids: ["A/s1/o1", "B/s1/o1"],
      ready_scope_ids: ["scope-a-create-web1"],
      preparable_scope_ids: ["scope-b-approve-web2"],
      reason: "覆盖同一当前账号关联的全部未完成范围"
    }));
  }
});

test("initially-ready groups and permission-independent scopes preserve their existing coverage behavior", () => {
  const ready = baseLog();
  append(ready, coveragePlan());
  append(ready, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-a", observed_account_ref: "account-a",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-a", switch_status: "not_required", description: "初始账号核验通过"
    }
  });
  assert.doesNotThrow(() => validateCoverageEvent(testCases, ready, {
    type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-a", observed_account_ref: "account-a",
    target_id: "target-web1", context_ref: "profile-a", environment_ref: "staging",
    observed_url: "https://web1.example.test/create", verification: "verified", switch_status: "not_required",
    fact_refs: [4], role_observation_refs: [4]
  }));

  const independent = baseLog();
  independent.events[1].groups = [independent.events[1].groups[0]];
  independent.events[1].groups[0].checkpoint_ids = ["A/s1/o1", "A/s2/o1"];
  independent.events[1].role_independent_case_ids = ["B"];
  const independentPlan = coveragePlan();
  independentPlan.items[1].scopes[0].group_ids = [];
  independentPlan.items[1].scopes[0].source_refs = ["snapshot:B/s1"];
  assert.doesNotThrow(() => validateCoverageEvent(testCases, independent, independentPlan));
  append(independent, independentPlan);
  assert.doesNotThrow(() => validateCoverageEvent(testCases, independent, {
    type: "coverage_context", scope_ids: ["scope-b-approve-web2"], account_ref: null, observed_account_ref: null,
    target_id: "target-web2", context_ref: "profile-general", environment_ref: "staging",
    observed_url: "https://web2.example.test/review", verification: "verified", switch_status: "not_required",
    fact_refs: [3]
  }));
});

test("v1.1 AC-51/57/58/65: reviews preserve A→B→A return work and cannot close or wait around uncovered scopes", () => {
  const log = baseLog();
  append(log, coveragePlan());
  for (const [scopeId, account, target, context, roleSequence, url] of [
    ["scope-a-create-web1", "account-a", "target-web1", "profile-a", 4, "https://web1.example.test/create"],
    ["scope-b-approve-web2", "account-b", "target-web2", "profile-b", 6, "https://web2.example.test/review"]
  ]) {
    append(log, {
      type: "role_observation", observation: {
        group_id: account === "account-a" ? "role-a" : "role-b", account_ref: account, observed_account_ref: account,
        verification_scope: "execution_context", verification: "verified", target_id: target, environment_ref: "staging",
        context_ref: context, switch_status: "not_required", description: `页面显示 ${account}`
      }
    });
    append(log, {
      type: "coverage_context", scope_ids: [scopeId], account_ref: account, observed_account_ref: account,
      target_id: target, context_ref: context, environment_ref: "staging", observed_url: url,
      verification: "verified", switch_status: "not_required", fact_refs: [roleSequence - 1], role_observation_refs: [roleSequence]
    });
  }
  const state = deriveCoverageState(testCases, log);
  assert.deepEqual(state.ready_scope_ids, ["scope-a-create-web1", "scope-b-approve-web2"]);
  assert.deepEqual(state.preparable_scope_ids, ["scope-a-readback-web1"]);
  assert.deepEqual(state.return_tasks.map(item => item.scope_id), ["scope-a-readback-web1"]);

  const badFinal = {
    type: "coverage_review", review_id: "review-final", purpose: "final", plan_revision: 1,
    based_on_sequence: log.events.length, scope_ids: ["scope-a-create-web1", "scope-b-approve-web2"],
    checkpoint_ids: checkpointIds.slice(0, 2), fact_refs: [4, 6], assistance_refs: [],
    ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: [], closures: [],
    choice: "finish", reason: "错误地忽略返回任务"
  };
  assert.throws(() => validateCoverageEvent(testCases, log, badFinal), /全量|范围|检查点/);

  const badWait = { ...badFinal, review_id: "review-wait", purpose: "wait", choice: "wait",
    scope_ids: ["scope-a-create-web1", "scope-b-approve-web2", "scope-a-readback-web1"], checkpoint_ids: checkpointIds,
    ready_scope_ids: ["scope-a-create-web1"], preparable_scope_ids: ["scope-a-readback-web1"] };
  assert.throws(() => validateCoverageEvent(testCases, log, badWait), /可推进|可准备|等待/);
});

test("v1.1 AC-53/63/64: dependent work cannot start until its referenced business fact is actually recorded", () => {
  const log = baseLog();
  append(log, coveragePlan());
  append(log, {
    type: "role_observation", observation: {
      group_id: "role-b", account_ref: "account-b", observed_account_ref: "account-b", verification_scope: "execution_context",
      verification: "verified", target_id: "target-web2", environment_ref: "staging", context_ref: "profile-b",
      switch_status: "not_required", description: "页面显示 B 账号"
    }
  });
  append(log, {
    type: "coverage_context", scope_ids: ["scope-b-approve-web2"], account_ref: "account-b", observed_account_ref: "account-b",
    target_id: "target-web2", context_ref: "profile-b", environment_ref: "staging", observed_url: "https://web2.example.test/review",
    verification: "verified", switch_status: "not_required", fact_refs: [4], role_observation_refs: [4]
  });
  assert.throws(() => validateCoverageEvent(testCases, log, {
    type: "checkpoint_started", checkpoint_id: "B/s1/o1", scope_ids: ["scope-b-approve-web2"], context_refs: [5]
  }), /依赖|A\/s1\/o1|业务事实/);

  append(log, { type: "checkpoint_started", checkpoint_id: "A/s1/o1", scope_ids: ["scope-a-create-web1"], context_refs: [5] });
  append(log, { type: "effect_observed", checkpoint_ids: ["A/s1/o1"], description: "创建得到 REC-1" });
  append(log, { type: "checkpoint_result", checkpoint_id: "A/s1/o1", result: "passed", reason: "创建成功", sequence: 8 });
  log.cases[0].checkpoints[0].result = "passed";
  log.cases[0].checkpoints[0].status = "completed";
  // The B context must explicitly cite the actual dependency fact, not merely
  // exist after A was marked passed.
  assert.throws(() => validateCoverageEvent(testCases, log, {
    type: "checkpoint_started", checkpoint_id: "B/s1/o1", scope_ids: ["scope-b-approve-web2"], context_refs: [5]
  }), /依赖.*事实|fact/i);
  append(log, {
    type: "coverage_context", scope_ids: ["scope-b-approve-web2"], account_ref: "account-b", observed_account_ref: "account-b",
    target_id: "target-web2", context_ref: "profile-b", environment_ref: "staging", observed_url: "https://web2.example.test/review",
    verification: "verified", switch_status: "not_required", fact_refs: [7, 8], role_observation_refs: [4]
  });
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, {
    type: "checkpoint_started", checkpoint_id: "B/s1/o1", scope_ids: ["scope-b-approve-web2"], context_refs: [9]
  }));
});

test("v1.1 AC-49/52/65: plan refinement preserves all checkpoint, scope, permission, step, and dependency semantics", () => {
  const log = baseLog();
  const initial = coveragePlan();
  append(log, initial);
  const valid = structuredClone(initial);
  valid.action = "refine";
  valid.revision = 2;
  valid.items[2].scopes[0].location_status = "known";
  valid.items[2].scopes[0].location_ref = "https://web1.example.test/detail/REC-1";
  delete valid.items[2].scopes[0].known_entry_clue;
  delete valid.items[2].scopes[0].location_gap;
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, valid));

  const changed = structuredClone(valid);
  changed.items[1].dependencies[0].required_fact = "另一个更方便的条件";
  assert.throws(() => validateCoverageEvent(testCases, log, changed), /依赖|语义|refine/);
  const missing = structuredClone(valid);
  missing.items.pop();
  assert.throws(() => validateCoverageEvent(testCases, log, missing), /全部|完整|精确/);
});

test("v1.1 AC-48/68: the A10 B8 C5 dual-site fixture stays 23 original checkpoints with return work intact", () => {
  const counts = { A: 10, B: 8, C: 5 };
  const cases = [];
  const groups = [];
  const items = [];
  for (const [groupName, count] of Object.entries(counts)) {
    const checkpointIdsForGroup = [];
    for (let index = 1; index <= count; index += 1) {
      const caseId = `${groupName}-${String(index).padStart(2, "0")}`;
      const checkpointId = `${caseId}/step-1/oracle-1`;
      const site = index % 2 === 0 ? "web2" : "web1";
      cases.push({
        case_id: caseId,
        steps: [{ step_id: "step-1", expected: [{ oracle_id: "oracle-1", text: `${groupName} ${index} 完成` }] }]
      });
      checkpointIdsForGroup.push(checkpointId);
      items.push({
        checkpoint_id: checkpointId,
        scopes: [{
          scope_id: `scope-${caseId}-${site}`,
          group_ids: [`role-${groupName.toLowerCase()}`],
          location_ref: `https://${site}.example.test/${groupName.toLowerCase()}/${index}`,
          location_status: "known",
          step_refs: [`${caseId}/step-1`],
          source_refs: [`snapshot:${caseId}/step-1`, `permission:role-${groupName.toLowerCase()}`]
        }],
        dependencies: []
      });
    }
    groups.push({
      group_id: `role-${groupName.toLowerCase()}`,
      checkpoint_ids: checkpointIdsForGroup,
      case_ids: checkpointIdsForGroup.map(id => id.split("/")[0]),
      role_text: groupName,
      permissions: [`${groupName} 权限`],
      availability: "ready",
      account_ref: `account-${groupName.toLowerCase()}`,
      preparation_owner: null,
      declaration: `用户已提供 ${groupName}`
    });
  }
  const fixtureCases = {
    schema_version: "2.0",
    suite: { name: "A10 B8 C5 双站", target_urls: ["https://web1.example.test", "https://web2.example.test"] },
    cases
  };
  const log = {
    schema_version: "2.0",
    extensions: { execution_coverage: { schema_version: "1.0" } },
    test_cases: { sha256: "b".repeat(64) },
    run: { status: "initialized" },
    browser: { owned_target_ids: ["target-web1", "target-web2"], preexisting_target_ids: [], attached_preexisting_target_ids: [] },
    cases: cases.map(item => ({
      case_id: item.case_id,
      checkpoints: [{ step_id: "step-1", oracle_id: "oracle-1", status: "pending", result: null }]
    })),
    events: [
      { type: "workflow_profile", profile: "permission-batches-html-v2", sequence: 1, at: "2026-09-20T00:00:00.000Z" },
      { type: "permission_plan", version: "1.0", groups, role_independent_case_ids: [], sequence: 2, at: "2026-09-20T00:00:01.000Z" }
    ]
  };
  const plan = {
    type: "coverage_plan",
    action: "initial",
    revision: 1,
    snapshot_hash: "b".repeat(64),
    source: "23 条原用例、A/B/C 权限确认与双站地址",
    items
  };
  assert.doesNotThrow(() => validateCoverageEvent(fixtureCases, log, plan));
  append(log, plan);
  const state = deriveCoverageState(fixtureCases, log);
  assert.equal(state.scopes.size, 23);
  assert.deepEqual(
    Object.fromEntries(Object.keys(counts).map(groupName => [
      groupName,
      [...state.scopes.values()].filter(scope => scope.group_ids.includes(`role-${groupName.toLowerCase()}`)).length
    ])),
    counts
  );
  assert.equal(state.preparable_scope_ids.length, 23);
  assert.equal(new Set([...state.scopes.values()].map(scope => scope.checkpoint_id)).size, 23);
});

test("v1.1 AC-50/53: switching or draining A after only web1 rejects an omitted A/web2 remainder", () => {
  const log = baseLog();
  append(log, coveragePlan());
  append(log, {
    type: "role_observation",
    observation: {
      group_id: "role-a", account_ref: "account-a", observed_account_ref: "account-a",
      verification_scope: "execution_context", verification: "verified", target_id: "target-web1",
      environment_ref: "staging", context_ref: "profile-a", switch_status: "not_required", description: "页面显示 A 账号"
    }
  });
  append(log, {
    type: "coverage_context", scope_ids: ["scope-a-create-web1"], account_ref: "account-a", observed_account_ref: "account-a",
    target_id: "target-web1", context_ref: "profile-a", environment_ref: "staging",
    observed_url: "https://web1.example.test/create", verification: "verified", switch_status: "not_required",
    fact_refs: [4], role_observation_refs: [4]
  });
  const incomplete = {
    type: "coverage_review", review_id: "switch-a-incomplete", purpose: "switch", plan_revision: 1,
    based_on_sequence: 5, scope_ids: ["scope-a-create-web1"], checkpoint_ids: ["A/s1/o1"],
    fact_refs: [5], assistance_refs: [], ready_scope_ids: ["scope-a-create-web1"], preparable_scope_ids: [],
    blocked_scope_ids: [], closures: [], choice: "switch", reason: "错误地只检查了 A/web1"
  };
  assert.throws(() => validateCoverageEvent(testCases, log, incomplete), /当前账号|遗留范围/);

  const complete = {
    ...incomplete,
    review_id: "switch-a-complete",
    scope_ids: ["scope-a-create-web1", "scope-a-readback-web1"],
    checkpoint_ids: ["A/s1/o1", "A/s2/o1"],
    preparable_scope_ids: ["scope-a-readback-web1"],
    reason: "A 的创建已准备，回查保留为 B 审核后的返回任务"
  };
  assert.doesNotThrow(() => validateCoverageEvent(testCases, log, complete));
});
