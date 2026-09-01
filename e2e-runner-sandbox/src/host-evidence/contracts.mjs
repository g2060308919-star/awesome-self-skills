export const HOST_EVENT_SCHEMA_VERSION = "host-event-v1";
export const HOST_SOURCE_PACKAGE_SCHEMA_VERSION = "host-source-package-v1";
export const CODEX_ADAPTER = Object.freeze({
  name: "codex-rollout",
  version: "1.3.0",
  format: "codex-rollout-jsonl",
  formatVersion: "codex-rollout-v1"
});
export const HOST_EXPORTER = Object.freeze({
  name: "explicit-codex-rollout-exporter",
  version: "1.1.0"
});
export const TOOL_MAPPING_VERSION = "chrome-devtools-tools-v1";
export const HOST_TRUST_LEVELS = Object.freeze([
  "host-native",
  "recorded-fixture",
  "operator-attested",
  "runner-self-reported",
  "untrusted"
]);

const CHROME_TOOL_NAMES = new Set([
  "click",
  "close_page",
  "drag",
  "emulate",
  "evaluate_script",
  "fill",
  "fill_form",
  "get_console_message",
  "get_network_request",
  "handle_dialog",
  "hover",
  "list_console_messages",
  "list_network_requests",
  "list_pages",
  "navigate_page",
  "navigate_page_history",
  "new_page",
  "performance_analyze_insight",
  "performance_start_trace",
  "performance_stop_trace",
  "press_key",
  "resize_page",
  "select_page",
  "take_screenshot",
  "take_snapshot",
  "upload_file",
  "wait_for"
]);

function finalToolSegment(name) {
  return String(name).split(/__|[./:]/).filter(Boolean).at(-1) ?? "";
}

export function normalizeToolName(name) {
  const logicalName = finalToolSegment(name);
  const chromeNamespace = /chrome(?:[_-]devtools|devtools[_-]mcp)/i.test(String(name));
  if (chromeNamespace && CHROME_TOOL_NAMES.has(logicalName)) {
    return { tool: logicalName, toolNamespace: "chrome-devtools-mcp" };
  }
  return { tool: "unknown", toolNamespace: "unknown" };
}

export function isBrowserRead(tool) {
  return new Set([
    "get_console_message", "get_network_request", "list_console_messages",
    "list_network_requests", "list_pages", "performance_analyze_insight",
    "take_screenshot", "take_snapshot", "wait_for"
  ]).has(tool);
}
