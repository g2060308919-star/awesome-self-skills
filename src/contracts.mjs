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
  Object.freeze({ collection: 'sources', id: 'source_id' }),
  Object.freeze({ collection: 'locators', id: 'locator_id' }),
  Object.freeze({ collection: 'decision_records', id: 'decision_id' }),
  Object.freeze({ collection: 'clarification_events', id: 'event_id' }),
  Object.freeze({ collection: 'claims', id: 'claim_id' }),
  Object.freeze({ collection: 'views', id: 'view_id' }),
  Object.freeze({ collection: 'obligations', id: 'obligation_id' }),
  Object.freeze({ collection: 'cases', id: 'case_id' })
]);
