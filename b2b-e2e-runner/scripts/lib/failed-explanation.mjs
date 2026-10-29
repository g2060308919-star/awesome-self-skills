const LABELS = ["实际操作顺序", "预期与页面实际表现", "实际表现和预期的差异"];

function sectionBody(text, label) {
  const source = String(text ?? "");
  const marker = `${label}：`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const from = start + marker.length;
  let end = source.length;
  for (const next of LABELS) {
    if (next === label) continue;
    const at = source.indexOf(`${next}：`, from);
    if (at >= 0 && at < end) end = at;
  }
  return source.slice(from, end).trim();
}

export function renderFailureExplanation(text) {
  const bodies = LABELS.map(label => sectionBody(text, label) || "未记录");
  const rendered = LABELS.map((label, index) => `${label}：${bodies[index]}`).join("\n");
  const deliverable = bodies.every(body => body !== "未记录" && !/^未记录(?:[。；]|$)/u.test(body));
  return { text: rendered, deliverable };
}

export function failureExplanationDeliverable(text) {
  return renderFailureExplanation(text).deliverable;
}

export function reproducibleFailure({ operations, expected, actual, difference }) {
  return [
    `实际操作顺序：${operations}`,
    `预期与页面实际表现：预期：${expected}；页面实际表现：${actual}`,
    `实际表现和预期的差异：${difference}`
  ].join("\n");
}
