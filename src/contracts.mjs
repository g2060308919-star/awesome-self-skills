export const REPLY_STATUS = Object.freeze([
  'need_artifact',
  'need_user_answers',
  'need_revision',
  'finished',
  'fatal'
]);

export const DIAGNOSTIC_CATEGORY = Object.freeze([
  'schema',
  'reference',
  'traceability',
  'coverage',
  'classification'
]);

/** Definition collections are intentionally local to one artifact. */
export const STABLE_ID_COLLECTIONS = Object.freeze([
  Object.freeze({ path: Object.freeze(['sources']), id: 'source_id' }),
  Object.freeze({ path: Object.freeze(['locators']), id: 'locator_id' }),
  Object.freeze({ path: Object.freeze(['source_policy', 'rules']), id: 'rule_id' }),
  Object.freeze({ path: Object.freeze(['decision_records']), id: 'decision_id' }),
  Object.freeze({ path: Object.freeze(['clarification_events']), id: 'event_id' }),
  Object.freeze({ path: Object.freeze(['claims']), id: 'claim_id' }),
  Object.freeze({ path: Object.freeze(['fact_ledger']), id: 'fact_id' }),
  Object.freeze({ path: Object.freeze(['views']), id: 'view_id' }),
  Object.freeze({ path: Object.freeze(['views', '*', 'elements']), id: 'element_id', namespace: 'elements' }),
  Object.freeze({ path: Object.freeze(['views', '*', 'relations']), id: 'relation_id' }),
  Object.freeze({ path: Object.freeze(['interaction_candidates']), id: 'candidate_id' }),
  Object.freeze({ path: Object.freeze(['obligations']), id: 'obligation_id' }),
  Object.freeze({ path: Object.freeze(['cases']), id: 'case_id', namespace: 'cases' }),
  Object.freeze({ path: Object.freeze(['cases', '*', 'steps']), id: 'step_id', namespace: 'steps' }),
  Object.freeze({ path: Object.freeze(['cases', '*', 'steps', '*', 'expectations']), id: 'expectation_id', namespace: 'expectations' }),
  Object.freeze({ path: Object.freeze(['exploratory_candidates']), id: 'exploratory_id' }),
  Object.freeze({ path: Object.freeze(['root_issue_dispositions']), id: 'root_issue_id' }),
  Object.freeze({ path: Object.freeze(['grounded']), id: 'case_id', namespace: 'bundle_cases' }),
  Object.freeze({ path: Object.freeze(['conditional']), id: 'case_id', namespace: 'bundle_cases' }),
  Object.freeze({ path: Object.freeze(['blockers']), id: 'root_issue_id', namespace: 'reply_root_issues' }),
  Object.freeze({ path: Object.freeze(['blocked']), id: 'obligation_id' }),
  Object.freeze({ path: Object.freeze(['exploratory']), id: 'exploratory_id' })
]);
