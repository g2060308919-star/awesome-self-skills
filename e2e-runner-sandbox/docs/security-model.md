# Security model

The Sandbox assumes Runner input, browser content, execution artifacts, filenames, host traces, and OCR output are untrusted. It minimizes capability and makes evaluation fail closed.

## Isolation boundaries

- The business server binds only to literal `127.0.0.1` on an ephemeral port.
- The evaluator control plane is a Unix socket in a `0700` temporary directory; the socket, metadata, and random capability are owner-only.
- Constant-time capability comparison precedes an allowlisted command dispatch.
- The process denies DNS, public TCP, HTTP, HTTPS, Fetch, and WebSocket egress. Only literal loopback and the owned control socket are allowed.
- Chrome DevTools MCP uses `chrome-devtools-mcp@1.7.0 --isolated`, never the user's daily Chrome profile.
- CSP, same-origin POST validation, host-only HttpOnly SameSite Strict cookies, output escaping, rate limits, and no-store headers protect the business plane.

## Data policy

Fixtures use reserved `.invalid` email domains and synthetic identities only. Approval notifications stay in a transactional fake outbox. There are no webhooks, email, analytics, databases, identity providers, or real external side effects.

Per-run secret and sensitive canaries are evaluator-private. Status and business routes redact them. Artifact scanning handles exact, normalized, case-folded, OCR-spaced, truncated, nested JSON, filename, and offline-image forms without copying a matched value into the result.

## Evaluator separation

The Runner sees only its materialized input, the business URL, the visible UI, and triggered assistance. It may operate only through the approved Chrome DevTools browser mechanism. Direct API calls, alternate browsers, browser-state inspection, control/Oracle access, undeclared writes, duplicate mutations, fabricated evidence, and canary leakage are hard-gate failures.

The trusted reference driver is evaluator-only. Its trace is tagged `trusted-reference` and is intentionally ineligible as Runner provenance.

## Artifact boundary

Artifact readers require a real absolute root, reject symbolic links and path escape, enforce per-file and aggregate byte limits plus evidence entry/nesting limits, validate UTF-8 and JSON, and resolve every evidence reference. Evaluation is read-only. Offline OCR uses pinned local engine and language-model bytes whose versions and digests are recorded.

See [operator-runbook.md](operator-runbook.md) for the reveal policy, manual-login boundary, cleanup handling, and authenticated shutdown procedure.
