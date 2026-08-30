# Environment capability check

Initially checked on 2026-08-29; runtime state refreshed on 2026-08-30.

## Initial Codex MCP inventory

`codex mcp list` reported these configured servers:

| Name | Status |
|---|---|
| `computer-use` | disabled |
| `cua_repl` | disabled |
| `node_repl` | enabled |

At the initial check, no `chrome-devtools` MCP server was configured. The then-active task inventory likewise contained no callable Chrome DevTools MCP tool. Incidental Chrome wording in the enabled Node REPL description did not provide that MCP and was a prohibited fallback for this Skill.

The pre-install representative run therefore stopped before browser launch and used no fallback: [representative-run/report.md](representative-run/report.md).

## Configuration and verification

Official OpenAI documentation states that local Codex MCP servers are configured in `~/.codex/config.toml` or a trusted project's `.codex/config.toml`, and that the desktop app must restart after adding a server: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>.

The user explicitly authorized the pinned isolated server, and it was configured with:

```text
codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@1.7.0 --isolated
```

Post-configuration `codex mcp get chrome-devtools` reported:

```text
enabled: true
transport: stdio
command: npx
args: -y chrome-devtools-mcp@1.7.0 --isolated
```

`codex mcp list` likewise reported `chrome-devtools` as enabled. The pinned release and isolated profile are personal Codex MCP configuration and are not files in the three-file Skill package.

## Fresh-process discovery

A new Codex executor process was started after configuration with the Chrome server required and the prohibited browser fallbacks disabled. It successfully called `chrome-devtools.new_page`, which launched an independent visible Chrome with a temporary profile and opened the loopback non-production demo. The human then completed the credential-free display-name login; a fresh Chrome DevTools observation confirmed the authenticated workspace before execution resumed.

The completed forward run is documented in [`chrome-forward-run/checkpoint.md`](chrome-forward-run/checkpoint.md), with final artifacts under [`chrome-forward-run/artifacts/`](chrome-forward-run/artifacts/). All eight cases reached terminal states. After the user explicitly authorized `删除 REQ-9001，保留 REQ-9002`, the runner deleted only REQ-9001 and freshly verified REQ-9002 unchanged. No prohibited fallback appeared in the audited path.

The final execution record reports Passed 4, Failed 1, Inconclusive 2, and Not Run 1. This proves the pinned MCP is both discoverable and usable for a complete real-browser semantic run; it does not turn the historical pre-install missing-MCP run into browser evidence.
