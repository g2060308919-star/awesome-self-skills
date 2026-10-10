export function sameCase(left, right) {
  const stable = value => JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  return stable(left) === stable(right);
}

export function mergeRetakeModels(rootModel, retakes) {
  const model = structuredClone(rootModel);
  const rows = new Map(model.rows.map(row => [row.case_id, row]));
  const details = new Map(model.case_details.map(detail => [detail.case_id, detail]));
  for (const { runId, model: retake } of retakes) {
    for (let index = 0; index < retake.rows.length; index += 1) {
      const row = retake.rows[index];
      const previous = rows.get(row.case_id);
      if (!previous) throw new TypeError(`补测包含根范围外用例：${row.case_id}`);
      if (retake.case_details[index].steps.some(step => step.expected.some(
        expected => expected.result === null || expected.result === "not_executed"
      ))) throw new TypeError(`补测用例 ${row.case_id} 仅覆盖部分检查点，不能完整替换原用例`);
      rows.set(row.case_id, { ...row, anchor: previous.anchor, display_id: previous.display_id });
      details.set(row.case_id, { ...retake.case_details[index], anchor: previous.anchor,
        display_id: previous.display_id, source_run_id: runId, source_kind: "补测" });
    }
  }
  model.rows = model.rows.map(row => rows.get(row.case_id));
  model.case_details = model.case_details.map(detail => details.get(detail.case_id));
  model.counts = { passed: 0, failed: 0, undetermined: 0, not_executed: 0 };
  for (const row of model.rows) model.counts[row.result] += 1;
  const total = model.rows.length;
  const percentage = count => total ? `${((count / total) * 100).toFixed(1)}%` : "0.0%";
  model.overview.total = total;
  model.overview.pass_rate = percentage(model.counts.passed);
  model.overview.fail_rate = percentage(model.counts.failed);
  model.result_details = { failed: model.rows.filter(row => row.result === "failed"),
    undetermined: model.rows.filter(row => row.result === "undetermined") };
  model.run.durations = { accurate: false, execution_ms: null, waiting_ms: null,
    execution_label: "无法准确计算", waiting_label: "无法准确计算" };
  model.overview.execution_duration = "无法准确计算";
  model.overview.waiting_duration = "无法准确计算";
  return model;
}
