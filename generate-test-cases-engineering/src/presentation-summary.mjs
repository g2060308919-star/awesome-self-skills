/** Count compiled formal obligations once, even when several displayed Cases
 * or a direct Test Point reference share the same responsibility.
 * @param {{item_refs: any[]}} group
 * @param {any[]} obligations
 * @param {{items: any[]}|null} [plan]
 */
export function groupRiskCounts(group, obligations, plan = null) {
  const risks = new Map(obligations.map((item) => [item.obligation_id, item.risk]));
  const cases = new Map((plan?.items ?? []).filter((item) => item.item_kind === 'case')
    .map((item) => [item.item_id, item.related_obligation_ids ?? []]));
  const ids = new Set();
  for (const item of group.item_refs) {
    if (item.item_kind === 'formal_test_point') ids.add(item.item_id);
    else if (item.item_kind === 'case') {
      const related = cases.get(item.item_id);
      if (!Array.isArray(related) || related.length === 0) throw new Error('Presented Case lacks compiled formal responsibility bindings.');
      for (const id of related) ids.add(id);
    } else if (item.item_kind !== 'exploratory') throw new Error('Presented item kind has no formal risk projection.');
  }
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const id of ids) {
    const risk = String(risks.get(id));
    if (!risks.has(id)) throw new Error('Presented formal responsibility is absent from the compiled obligation ledger.');
    if (risk !== 'critical' && risk !== 'high' && risk !== 'medium' && risk !== 'low') throw new Error('Presented formal responsibility has invalid compiled risk.');
    counts[risk] += 1;
  }
  return counts;
}
