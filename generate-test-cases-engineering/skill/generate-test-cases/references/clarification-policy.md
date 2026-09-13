# Clarification policy

Clarification is a compiler-controlled two-phase transaction over the currently visible question parts.

## Present

Present one business-readable batch in compiler order. Explain the concrete question, why it is needed, decision impact, unresolved outcome, and affected business items. Do not expose internal digests or protocol identities as user-facing prose, but preserve them unchanged in the submitted action.

## Preview

Submit `preview_clarification_response` with response units that bind exactly one current question part, unless the user explicitly uses an advertised clone control with the exact target set. Blank, ambiguous, unknown, or out-of-scope text does not silently answer a part.

The compiler parses controls, validates answer nature and constraints, and returns a deterministic preview containing the projected impact digest. Preview writes no semantic artifact.

## Commit

Show the preview to the user. Commit only after an explicit advertised confirmation token by submitting `commit_clarification_response` with the exact preview digest. A changed semantic root, question state, response, or digest makes the preview stale and requires a new preview.

Temporary answers require an explicit temporary marker and basis. Defer, unknown, and close-for-delivery controls apply only to currently advertised parts. Closing a gap for delivery retains the unresolved truth; it does not fabricate an answer, delete a formal test point, or make execution ready.

## Partial and invalid responses

Reliably bound answered parts may commit while untouched parts remain presented. Conflicting actions for one part, foreign part IDs, invalid controls, missing origin bindings, and wrong answer-constraint digests commit nothing and return the exact protocol error. After commit, the compiler derives the clarification decision, provenance, impact, next semantic root, and next presentation.
