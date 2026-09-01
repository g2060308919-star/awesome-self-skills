# Host evidence contract

## Trust boundary

V1 imports one explicitly named Codex rollout JSONL. The exporter never discovers, lists or scans Host session history. The operator supplies an authorization actor and timestamp; the source must be a bounded regular file. The owner-only package contains a copied `session-rollout.jsonl` and `manifest.json` with exporter/format versions, one-way session digest, time boundary, file size/SHA-256 and manifest SHA-256.

Trust levels are `host-native`, `recorded-fixture`, `operator-attested`, `runner-self-reported` and `untrusted`. Only a validated `host-native` package may qualify a real Trial. The other levels intentionally remain diagnostic.

## Adapter and normalization

`codex-rollout-v1` recognizes actual Codex `session_meta`, message and tool call/output records. Calls are paired by call ID, timestamps and sequence must be ordered, and exactly one session boundary is required. It handles both `function_call` and `custom_tool_call` record families.

Normalized `host-event-v1` events contain actor, logical tool, namespace, timestamps and content/argument/result/source digests. Raw messages, tool results and page content are not copied. Supported Chrome DevTools MCP names use the versioned mapping; unknown tools remain `unknown` and make release evidence ineligible. Message content is retained only as SHA-256 so exact scripted replies can be proven without publishing chat text.

## Bridge outputs

The Bridge creates three objects bound to the same Trial ID, runId, session digest, source-manifest digest and normalized-events digest:

- `host-trace-v1`: scorer-compatible tool entries plus adapter/mapping provenance;
- `assistance-v1`: immutable script events with Host and control-event references;
- `metrics-v1`: active elapsed time, browser reads, private business requests, write attempts and repeated no-progress actions, each with input digests and deriver version.

Scope classification comes from the independently persisted Trial confirmation when the Host tool record does not embed it. A Runner browser event before that timestamp fails closed. Business-request counts come only from the private run-bound HTTP trace, and writes come only from Oracle `operation_attempt` events. Missing sources produce `null` plus `derivable: false`, never a fabricated zero.

Source-package and normalized-event digests are rechecked during evaluation. Unknown records, tool/order/session/run mismatches, modified files, unproven external assistance or self-reported sources cannot become release-eligible.
