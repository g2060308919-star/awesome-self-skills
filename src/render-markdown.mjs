import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

export class BundleRenderError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('Markdown rendering requires a valid canonical test bundle');
    this.name = 'BundleRenderError';
    this.status = 'need_revision';
    this.stage = 'render_markdown';
    this.diagnostics = diagnostics.map((item) => ({ ...item }));
  }
}

/** @param {unknown} value */
function inline(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('*', '\\*')
    .replaceAll('_', '\\_')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '\\|')
    .replaceAll('\r\n', '<br>')
    .replaceAll('\n', '<br>')
    .replaceAll('\r', '<br>');
}

/** @param {unknown} value */
function code(value) {
  return `<code>${inline(value)}</code>`;
}

/** @param {unknown[]} values */
function codeList(values) {
  return values.length === 0 ? '_None._' : values.map(code).join(', ');
}

/** @param {any} oracle */
function oracleText(oracle) {
  const expectedField = {
    value: 'expected_value', state: 'expected_state', event: 'expected_event', 'side-effect': 'expected_side_effect'
  }[String(oracle.type)] ?? '';
  const parts = [inline(oracle.type), inline(oracle.comparison), code(oracle[expectedField])];
  if (Object.hasOwn(oracle, 'tolerance')) parts.push(`tolerance ${code(oracle.tolerance)}`);
  if (Object.hasOwn(oracle, 'window')) parts.push(`window ${code(oracle.window)}`);
  return parts.join(' ');
}

/** @param {any} caseEntry @param {boolean} conditional */
function renderCase(caseEntry, conditional) {
  const lines = [
    `### ${code(caseEntry.case_id)} — ${inline(caseEntry.title)}`,
    '',
    `- Scope: ${code(caseEntry.scope)}`,
    `- Risk: ${code(caseEntry.risk)}`,
    `- Role: ${inline(caseEntry.role.value)} (evidence: ${code(caseEntry.role.evidence_ref)})`,
    `- Requirement facts: ${codeList(caseEntry.fact_ids)}`,
    `- Formal Test Points: ${codeList(caseEntry.obligation_ids)}`,
    `- Evidence references: ${codeList(caseEntry.evidence_refs)}`
  ];
  if (conditional) lines.push(
    `- Temporary assumption: ${code(caseEntry.temporary_assumption.claim_id)}; invalid when ${inline(caseEntry.temporary_assumption.invalidation_condition)}`
  );
  lines.push('', '#### Preconditions', '');
  for (const [index, item] of caseEntry.preconditions.entries()) lines.push(
    `${index + 1}. ${inline(item.condition)} (reachable from: ${inline(item.reachable_from)}; evidence: ${code(item.evidence_ref)})`
  );
  lines.push('', '#### Test Data', '');
  for (const item of caseEntry.data) lines.push(
    `- ${inline(item.name)} = ${code(item.value)} (${inline(item.provenance.type)}: ${code(item.provenance.ref)})`
  );
  lines.push('', '#### Steps and Oracles', '');
  for (const [index, step] of caseEntry.steps.entries()) {
    lines.push(`${index + 1}. ${code(step.step_id)} — ${inline(step.action)} (evidence: ${code(step.action_evidence_ref)})`);
    for (const expectation of step.expectations) lines.push(
      `   - ${code(expectation.expectation_id)}: ${inline(expectation.business_assertion)}`,
      `     - Observe: ${inline(expectation.observer)} via ${inline(expectation.observation_surface)} → ${inline(expectation.observation_target)}`,
      `     - Oracle: ${oracleText(expectation.oracle)}`,
      `     - Evidence: ${code(expectation.evidence_ref)}`
    );
  }
  lines.push('', '#### Post-state and Cleanup', '');
  lines.push(`- Post-state: ${inline(caseEntry.post_state.state)} (evidence: ${code(caseEntry.post_state.evidence_ref)})`);
  if (caseEntry.cleanup.required) lines.push(
    `- Cleanup: ${caseEntry.cleanup.steps.map(inline).join('; ')} (evidence: ${code(caseEntry.cleanup.evidence_ref)})`
  );
  else lines.push(
    `- Cleanup: none — ${inline(caseEntry.cleanup.no_cleanup_reason)} (evidence: ${code(caseEntry.cleanup.no_cleanup_evidence_ref)})`
  );
  return lines;
}

/** @param {string} title @param {any[]} cases @param {boolean} conditional */
function renderCaseLane(title, cases, conditional) {
  const lines = [`## ${title}`, ''];
  if (cases.length === 0) return [...lines, '_None._'];
  for (const [index, item] of cases.entries()) {
    if (index > 0) lines.push('');
    lines.push(...renderCase(item, conditional));
  }
  return lines;
}

/** @param {string[]} headers @param {string[][]} rows */
function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`)
  ];
}

/**
 * Render only fields already present in the canonical bundle. The renderer has
 * no second content channel and therefore cannot add facts or evidence.
 * @param {unknown} bundle
 */
export function renderMarkdown(bundle) {
  const diagnostics = [
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(bundle, testBundleSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(bundle))
  ];
  if (diagnostics.length > 0) throw new BundleRenderError(diagnostics);
  const snapshot = /** @type {any} */ (JSON.parse(canonicalStringify(bundle)));
  const lines = [
    '# Test Case Bundle',
    '',
    `- Schema version: ${code(snapshot.schema_version)}`,
    `- Source revision: ${code(snapshot.source_revision)}`,
    '',
    ...renderCaseLane('Grounded Cases', snapshot.grounded, false),
    '',
    ...renderCaseLane('Conditional Cases', snapshot.conditional, true),
    '',
    '## Blocked Formal Test Points',
    ''
  ];
  if (snapshot.blocked.length === 0) lines.push('_None._');
  for (const item of snapshot.blocked) lines.push(
    `### ${code(item.obligation_id)}`,
    '',
    `- Root issue: ${code(item.root_issue_id)}`,
    `- Risk: ${code(item.risk)}`,
    `- Reason: ${code(item.reason)}`,
    `- Missing type: ${code(item.recovery.missing_type)}`,
    `- Required material: ${inline(item.recovery.required_material)}`,
    `- Recovery question: ${inline(item.recovery.question)}`,
    ''
  );
  if (lines.at(-1) === '') lines.pop();
  lines.push('', '## Exploratory Cases', '');
  if (snapshot.exploratory.length === 0) lines.push('_None._');
  for (const item of snapshot.exploratory) lines.push(
    `### ${code(item.exploratory_id)} — ${inline(item.title)}`,
    '',
    `- Scope: ${code(item.scope)}`,
    `- Risk: ${code(item.risk)}`,
    `- Reason: ${inline(item.reason)}`,
    ''
  );
  if (lines.at(-1) === '') lines.pop();
  const coverage = snapshot.coverage;
  lines.push(
    '', '## Coverage', '',
    '### Requirement Fact Ledger', '',
    `Accounted: ${coverage.requirements.accounted}/${coverage.requirements.total}`, '',
    ...table(['Fact', 'Status'], coverage.requirements.entries.map((/** @type {any} */ item) => [code(item.fact_id), code(item.status)])),
    '', '### Formal Test Point Ledger', '',
    `Covered: ${coverage.formal.covered}/${coverage.formal.total} declared`, '',
    ...table(['Test Point', 'Disposition'], coverage.formal.entries.map((/** @type {any} */ item) => [code(item.obligation_id), code(item.status)])),
    '', '### Grounded Executable Ledger', '',
    `Grounded: ${coverage.executable.grounded}/${coverage.executable.total}`, '',
    ...table(['Test Point', 'Case'], coverage.executable.entries.map((/** @type {any} */ item) => [code(item.obligation_id), code(item.case_id)])),
    '', '### Expert Recall Ledger', '',
    `Status: ${code(coverage.expert_recall.status)}`
  );
  for (const limit of coverage.expert_recall.limits) lines.push(`- ${inline(limit)}`);
  lines.push('', '### NotApplicable (excluded from the coverage numerator)', '');
  if (coverage.not_applicable.length === 0) lines.push('_None._');
  else lines.push(...table(
    ['Test Point', 'Exclusion evidence', 'Scope', 'Review'],
    coverage.not_applicable.map((/** @type {any} */ item) => [
      code(item.obligation_id), code(item.exclusion_claim_id), code(item.scope), code(item.support_review)
    ])
  ));
  lines.push(
    '', '## Quality', '',
    `- Delivery status: ${code(snapshot.quality.delivery_status)}`,
    `- Compiler version: ${code(snapshot.quality.compiler_version)}`,
    `- Schema version: ${code(snapshot.quality.schema_version)}`,
    `- Source lineage digest: ${code(snapshot.quality.lineage.source_digest)}`,
    `- Case-draft lineage digest: ${code(snapshot.quality.lineage.case_draft_digest)}`,
    '- Limits:'
  );
  for (const limit of snapshot.quality.limits) lines.push(`  - ${inline(limit)}`);
  return `${lines.join('\n')}\n`;
}
