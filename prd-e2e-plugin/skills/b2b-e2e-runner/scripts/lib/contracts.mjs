const RESULT_STATES = new Set(["passed", "failed", "undetermined", "not_executed"]);
const EVIDENCE_STATES = new Set(["complete", "partial", "missing", "not_required"]);

export class ContractError extends Error {
  constructor(message, fieldPath) {
    super(message);
    this.name = "ContractError";
    this.code = "INPUT_CONTRACT";
    this.path = fieldPath;
  }
}

function requireValue(condition, fieldPath, message = "字段缺失或类型错误") {
  if (!condition) throw new ContractError(`${fieldPath}: ${message}`, fieldPath);
}

export function validateTestCases(input) {
  requireValue(input && typeof input === "object" && !Array.isArray(input), "$", "必须是对象");
  requireValue(input.schema_version === "2.0", "$.schema_version", "必须为 2.0");
  requireValue(input.suite && typeof input.suite === "object", "$.suite");
  requireValue(typeof input.suite.name === "string" && input.suite.name.trim(), "$.suite.name");
  requireValue(Array.isArray(input.suite.target_urls), "$.suite.target_urls", "必须是数组");
  requireValue(input.suite.target_urls.every(value => typeof value === "string"), "$.suite.target_urls");
  requireValue(Array.isArray(input.cases) && input.cases.length > 0, "$.cases", "必须是非空数组");
  const caseIds = new Set();
  input.cases.forEach((testCase, caseIndex) => {
    const base = `$.cases[${caseIndex}]`;
    requireValue(testCase && typeof testCase === "object", base);
    requireValue(typeof testCase.module === "string" && testCase.module.trim(), `${base}.module`);
    requireValue(typeof testCase.title === "string" && testCase.title.trim(), `${base}.title`);
    requireValue(Array.isArray(testCase.preconditions), `${base}.preconditions`);
    requireValue(Array.isArray(testCase.steps) && testCase.steps.length > 0, `${base}.steps`);
    requireValue(typeof testCase.case_id === "string" && testCase.case_id.trim(), `${base}.case_id`);
    requireValue(!caseIds.has(testCase.case_id), `${base}.case_id`, "用例 ID 重复");
    caseIds.add(testCase.case_id);
    requireValue(testCase.preconditions.every(value => typeof value === "string"), `${base}.preconditions`);
    const stepIds = new Set();
    testCase.steps.forEach((step, stepIndex) => {
      const stepBase = `${base}.steps[${stepIndex}]`;
      requireValue(typeof step.action === "string" && step.action.trim(), `${stepBase}.action`);
      requireValue(Array.isArray(step.expected) && step.expected.length > 0, `${stepBase}.expected`);
      if (step.step_id !== undefined) {
        requireValue(typeof step.step_id === "string" && step.step_id.trim(), `${stepBase}.step_id`);
        requireValue(!stepIds.has(step.step_id), `${stepBase}.step_id`, "步骤 ID 重复");
        stepIds.add(step.step_id);
      }
      const oracleIds = new Set();
      step.expected.forEach((oracle, oracleIndex) => {
        requireValue(
          oracle && typeof oracle === "object" && typeof oracle.text === "string" && oracle.text.trim(),
          `${stepBase}.expected[${oracleIndex}].text`
        );
        if (oracle.oracle_id !== undefined) {
          const oraclePath = `${stepBase}.expected[${oracleIndex}].oracle_id`;
          requireValue(typeof oracle.oracle_id === "string" && oracle.oracle_id.trim(), oraclePath);
          requireValue(!oracleIds.has(oracle.oracle_id), oraclePath, "Oracle ID 重复");
          oracleIds.add(oracle.oracle_id);
        }
      });
    });
  });
  return input;
}

export function normalizeTestCases(input) {
  validateTestCases(input);
  const normalized = structuredClone(input);
  normalized.cases = normalized.cases.map(testCase => {
    const usedSteps = new Set(testCase.steps.flatMap(step => step.step_id ? [step.step_id] : []));
    const steps = testCase.steps.map((step, stepIndex) => {
      let stepId = step.step_id;
      if (!stepId) {
        const base = `step-${String(stepIndex + 1).padStart(3, "0")}`;
        stepId = base;
        for (let suffix = 2; usedSteps.has(stepId); suffix += 1) stepId = `${base}-${suffix}`;
        usedSteps.add(stepId);
      }
      const usedOracles = new Set(step.expected.flatMap(oracle => oracle.oracle_id ? [oracle.oracle_id] : []));
      const expected = step.expected.map((oracle, oracleIndex) => {
        let oracleId = oracle.oracle_id;
        if (!oracleId) {
          const base = `oracle-${String(oracleIndex + 1).padStart(3, "0")}`;
          oracleId = base;
          for (let suffix = 2; usedOracles.has(oracleId); suffix += 1) oracleId = `${base}-${suffix}`;
          usedOracles.add(oracleId);
        }
        return { ...oracle, oracle_id: oracleId };
      });
      return { ...step, step_id: stepId, expected };
    });
    return { ...testCase, steps };
  });
  return normalized;
}

export function checkpointId(caseId, stepId, oracleId) {
  return `${caseId}/${stepId}/${oracleId}`;
}

export function expectedCheckpointIds(cases) {
  return new Set(cases.cases.flatMap(testCase => testCase.steps.flatMap(step =>
    step.expected.map(oracle => checkpointId(testCase.case_id, step.step_id, oracle.oracle_id))
  )));
}

export function validateCheckpointEvent(event) {
  requireValue(typeof event.checkpoint_id === "string" && event.checkpoint_id, "$.checkpoint_id");
  requireValue(RESULT_STATES.has(event.result), "$.result", "不是有效四态结果");
  requireValue(typeof event.reason === "string" && event.reason.trim(), "$.reason", "必须提供语义化原因");
  requireValue(EVIDENCE_STATES.has(event.evidence_status), "$.evidence_status", "不是有效证据状态");
}

export const resultStates = Object.freeze([...RESULT_STATES]);
export const evidenceStates = Object.freeze([...EVIDENCE_STATES]);
