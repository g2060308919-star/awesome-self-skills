export const EVENT_TYPES = Object.freeze([
  "operation_attempt",
  "validation_rejection",
  "authorization_denial",
  "state_mutation",
  "external_action",
  "notification_enqueued",
  "session_event"
]);

export const ATTRIBUTION_CLASSES = Object.freeze([
  "none",
  "expected-business-rejection",
  "product-failure",
  "case-issue",
  "environment-safety",
  "access-or-navigation-uncertainty",
  "target-clarification",
  "authentication-interruption",
  "external-evidence-gap",
  "transient-read-recovered",
  "ambiguous-write-recovered",
  "cleanup-failure"
]);

export const CASE_VERDICTS = Object.freeze([
  "Passed",
  "Failed",
  "Inconclusive",
  "Not Run"
]);

export const ASSERTION_STATES = Object.freeze([
  "verified-pass",
  "verified-fail",
  "unverified",
  "not-run"
]);
