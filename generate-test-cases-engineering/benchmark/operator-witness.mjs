export const OPERATOR_WITNESS_METHOD = 'operator-observed-codex-subagent-v1';
export const OPERATOR_TASK_ID = '/root';

export const ALLOWED_AGENT_TASK_IDS = Object.freeze([
  '/root/formal_defect_gate_audit',
  '/root/time_quota_defect_expansion',
  '/root/time_quota_defect_expansion/standards_review'
]);

const AGENT_BY_CASE_PREFIX = Object.freeze({
  'PF-TR-': ALLOWED_AGENT_TASK_IDS[0],
  'PF-ID-': ALLOWED_AGENT_TASK_IDS[0],
  'PF-WF-': ALLOWED_AGENT_TASK_IDS[1],
  'PF-FM-': ALLOWED_AGENT_TASK_IDS[1],
  'PF-AS-': ALLOWED_AGENT_TASK_IDS[2],
  'PF-TM-': ALLOWED_AGENT_TASK_IDS[2]
});

/** @param {unknown} caseId */
export function expectedAgentForCase(caseId) {
  if (typeof caseId !== 'string') return null;
  const prefix = Object.keys(AGENT_BY_CASE_PREFIX).find((candidate) => caseId.startsWith(candidate));
  return prefix ? /** @type {Record<string,string>} */ (AGENT_BY_CASE_PREFIX)[prefix] : null;
}

/** @param {unknown} agentTaskId */
export function isAllowedAgentTaskId(agentTaskId) {
  return typeof agentTaskId === 'string' && ALLOWED_AGENT_TASK_IDS.includes(agentTaskId);
}

/** @param {unknown} agentTaskId @param {unknown} caseId */
export function isAllowedAgentForCase(agentTaskId, caseId) {
  return isAllowedAgentTaskId(agentTaskId)
    && expectedAgentForCase(caseId) === agentTaskId;
}
