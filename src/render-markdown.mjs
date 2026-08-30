import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

const RENDER_DIAGNOSTIC_LIMIT = 256;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_ARRAY_PUSH = Array.prototype.push;
const NATIVE_ARRAY_POP = Array.prototype.pop;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_HAS_OWN = Object.hasOwn;

export class BundleRenderError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('Markdown rendering requires a valid canonical test bundle');
    this.name = 'BundleRenderError';
    this.status = 'need_revision';
    this.stage = 'render_markdown';
    this.diagnostics = canonicalRenderDiagnostics(diagnostics).map((item) => ({ ...item }));
  }
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {Diagnostic[]} diagnostics */
function canonicalRenderDiagnostics(diagnostics) {
  const unique = new Map();
  let overflow = false;
  for (let index = 0; index < diagnostics.length; index += 1) {
    if (diagnostics[index].code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else unique.set(canonicalStringify(diagnostics[index]), diagnostics[index]);
  }
  if (unique.size > RENDER_DIAGNOSTIC_LIMIT) overflow = true;
  const sorted = [...unique.values()];
  Reflect.apply(NATIVE_ARRAY_SORT, sorted, [(left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.message, right.message)]);
  if (!overflow) return sorted;
  /** @type {Diagnostic[]} */
  const retained = [];
  for (let index = 0; index < Math.min(sorted.length, RENDER_DIAGNOSTIC_LIMIT - 1); index += 1) {
    Reflect.apply(NATIVE_ARRAY_PUSH, retained, [sorted[index]]);
  }
  Reflect.apply(NATIVE_ARRAY_PUSH, retained, [{
    category: 'classification', code: 'DIAGNOSTICS_TRUNCATED', path: '/',
    message: `render diagnostics are bounded at ${RENDER_DIAGNOSTIC_LIMIT} entries`
  }]);
  Reflect.apply(NATIVE_ARRAY_SORT, retained, [(left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.message, right.message)]);
  return retained;
}

/**
 * Capture the submitted bundle once using own data descriptors. No submitted
 * accessor, iterator, array method, or mutable prototype member is invoked.
 * @param {unknown} root
 */
function snapshotBundle(root) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {unknown} */
  let snapshot;
  /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
  const pending = [{ source: root, path: '', assign(value) { snapshot = value; } }];
  const seen = new Set();
  while (pending.length > 0) {
    const item = Reflect.apply(NATIVE_ARRAY_POP, pending, []);
    if (!item) break;
    const { source, path, assign } = item;
    if (!source || typeof source !== 'object') {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
        category: 'schema', code: 'CYCLIC_BUNDLE_INVALID', path: path || '/',
        message: 'render input must be an acyclic own-data bundle'
      }]);
      assign(null);
      continue;
    }
    seen.add(source);
    let prototype;
    let descriptors;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
    } catch {
      Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
        category: 'schema', code: 'BUNDLE_DESCRIPTOR_UNREADABLE', path: path || '/',
        message: 'render input descriptors could not be captured'
      }]);
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (prototype !== Array.prototype) {
        Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
          category: 'schema', code: 'ARRAY_PROTOTYPE_INVALID', path: path || '/',
          message: 'render input arrays must use Array.prototype'
        }]);
        assign(null);
        continue;
      }
      const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
      Reflect.apply(NATIVE_ARRAY_SORT, keys, [(left, right) => compareCodePoints(
        typeof left === 'symbol' ? String(left.description ?? '') : left,
        typeof right === 'symbol' ? String(right.description ?? '') : right
      )]);
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && NATIVE_HAS_OWN(lengthDescriptor, 'value')
        && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      /** @type {number[]} */
      const numeric = [];
      let invalid = false;
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key === 'symbol') {
          invalid = true;
          Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
            category: 'schema', code: 'ARRAY_SYMBOL_PROPERTY_INVALID', path: path || '/',
            message: 'render input arrays cannot contain symbol properties'
          }]);
          continue;
        }
        if (key === 'length') continue;
        const numericKey = Number(key);
        if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= length || String(numericKey) !== key) {
          invalid = true;
          Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
            category: 'schema', code: 'ARRAY_NAMED_PROPERTY_INVALID', path: `${path}/${pointerPart(key)}`,
            message: 'render input arrays cannot contain named properties'
          }]);
        } else Reflect.apply(NATIVE_ARRAY_PUSH, numeric, [numericKey]);
      }
      Reflect.apply(NATIVE_ARRAY_SORT, numeric, [(left, right) => left - right]);
      if (numeric.length !== length) {
        invalid = true;
        let expected = 0;
        for (let index = 0; index < numeric.length; index += 1) {
          if (numeric[index] !== expected) break;
          expected += 1;
        }
        Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
          category: 'schema', code: 'ARRAY_HOLE', path: `${path}/${expected}`,
          message: 'render input arrays must be dense'
        }]);
      }
      for (let index = 0; index < numeric.length; index += 1) {
        const descriptor = descriptors[String(numeric[index])];
        if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value')) {
          invalid = true;
          Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
            category: 'schema', code: 'ACCESSOR_NOT_ALLOWED', path: `${path}/${numeric[index]}`,
            message: 'render input must use own data properties'
          }]);
        }
      }
      if (invalid) {
        assign(null);
        continue;
      }
      const target = new Array(length);
      assign(target);
      for (let index = numeric.length - 1; index >= 0; index -= 1) {
        const numericKey = numeric[index];
        const descriptor = descriptors[String(numericKey)];
        Reflect.apply(NATIVE_ARRAY_PUSH, pending, [{
          source: descriptor.value, path: `${path}/${numericKey}`,
          assign(/** @type {unknown} */ value) { NATIVE_DEFINE_PROPERTY(target, numericKey, { value, enumerable: true, writable: true, configurable: true }); }
        }]);
      }
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
        category: 'schema', code: 'RECORD_PROTOTYPE_INVALID', path: path || '/',
        message: 'render input records must use a plain or null prototype'
      }]);
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
    Reflect.apply(NATIVE_ARRAY_SORT, keys, [(left, right) => compareCodePoints(
      typeof left === 'symbol' ? String(left.description ?? '') : left,
      typeof right === 'symbol' ? String(right.description ?? '') : right
    )]);
    const target = Object.create(null);
    assign(target);
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (typeof key === 'symbol') {
        Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
          category: 'schema', code: 'RECORD_SYMBOL_PROPERTY_INVALID', path: path || '/',
          message: 'render input records cannot contain symbol properties'
        }]);
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value')) {
        Reflect.apply(NATIVE_ARRAY_PUSH, diagnostics, [{
          category: 'schema', code: 'ACCESSOR_NOT_ALLOWED', path: `${path}/${pointerPart(key)}`,
          message: 'render input must use own data properties'
        }]);
      } else Reflect.apply(NATIVE_ARRAY_PUSH, pending, [{
        source: descriptor.value, path: `${path}/${pointerPart(key)}`,
        assign(/** @type {unknown} */ value) { NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true }); }
      }]);
    }
  }
  return { snapshot, diagnostics: canonicalRenderDiagnostics(diagnostics) };
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
function renderMarkdownTrusted(bundle) {
  const captured = snapshotBundle(bundle);
  if (captured.diagnostics.length > 0) throw new BundleRenderError(captured.diagnostics);
  const snapshot = /** @type {any} */ (captured.snapshot);
  const diagnostics = [
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(snapshot, testBundleSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(snapshot))
  ];
  if (diagnostics.length > 0) throw new BundleRenderError(diagnostics);
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

/**
 * Public fail-closed rendering boundary.
 * @param {unknown} bundle
 */
export function renderMarkdown(bundle) {
  try {
    return renderMarkdownTrusted(bundle);
  } catch (error) {
    if (error instanceof BundleRenderError) throw error;
    throw new BundleRenderError([{
      category: 'schema', code: 'BUNDLE_NORMALIZATION_FAILED', path: '/',
      message: 'render input could not be safely normalized'
    }]);
  }
}
