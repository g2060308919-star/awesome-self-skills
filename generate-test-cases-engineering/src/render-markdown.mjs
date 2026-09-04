import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

const RENDER_DIAGNOSTIC_LIMIT = 256;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_ARRAY_POP = Array.prototype.pop;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
const NATIVE_ARRAY_JOIN = Array.prototype.join;
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
    const canonical = canonicalRenderDiagnostics(diagnostics);
    this.diagnostics = [];
    for (let index = 0; index < canonical.length; index += 1) {
      append(this.diagnostics, { ...canonical[index] });
    }
  }
}

/** @param {unknown[]} target @param {...unknown} values */
function append(target, ...values) {
  for (let index = 0; index < values.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY, Object, [
    target, String(target.length), { value: values[index], writable: true, enumerable: true, configurable: true }
  ]);
}

/** @param {unknown[]} target @param {unknown[]} source */
function appendArray(target, source) {
  for (let index = 0; index < source.length; index += 1) append(target, source[index]);
}

/** @param {unknown[]} values @param {string} separator */
function joinArray(values, separator) {
  return Reflect.apply(NATIVE_ARRAY_JOIN, values, [separator]);
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
    append(retained, sorted[index]);
  }
  append(retained, {
    category: 'classification', code: 'DIAGNOSTICS_TRUNCATED', path: '/',
    message: `render diagnostics are bounded at ${RENDER_DIAGNOSTIC_LIMIT} entries`
  });
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
      append(diagnostics, {
        category: 'schema', code: 'CYCLIC_BUNDLE_INVALID', path: path || '/',
        message: 'render input must be an acyclic own-data bundle'
      });
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
      append(diagnostics, {
        category: 'schema', code: 'BUNDLE_DESCRIPTOR_UNREADABLE', path: path || '/',
        message: 'render input descriptors could not be captured'
      });
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (prototype !== Array.prototype) {
        append(diagnostics, {
          category: 'schema', code: 'ARRAY_PROTOTYPE_INVALID', path: path || '/',
          message: 'render input arrays must use Array.prototype'
        });
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
          append(diagnostics, {
            category: 'schema', code: 'ARRAY_SYMBOL_PROPERTY_INVALID', path: path || '/',
            message: 'render input arrays cannot contain symbol properties'
          });
          continue;
        }
        if (key === 'length') continue;
        const numericKey = Number(key);
        if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= length || String(numericKey) !== key) {
          invalid = true;
          append(diagnostics, {
            category: 'schema', code: 'ARRAY_NAMED_PROPERTY_INVALID', path: `${path}/${pointerPart(key)}`,
            message: 'render input arrays cannot contain named properties'
          });
        } else append(numeric, numericKey);
      }
      Reflect.apply(NATIVE_ARRAY_SORT, numeric, [(left, right) => left - right]);
      if (numeric.length !== length) {
        invalid = true;
        let expected = 0;
        for (let index = 0; index < numeric.length; index += 1) {
          if (numeric[index] !== expected) break;
          expected += 1;
        }
        append(diagnostics, {
          category: 'schema', code: 'ARRAY_HOLE', path: `${path}/${expected}`,
          message: 'render input arrays must be dense'
        });
      }
      for (let index = 0; index < numeric.length; index += 1) {
        const descriptor = descriptors[String(numeric[index])];
        if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value')) {
          invalid = true;
          append(diagnostics, {
            category: 'schema', code: 'ACCESSOR_NOT_ALLOWED', path: `${path}/${numeric[index]}`,
            message: 'render input must use own data properties'
          });
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
        append(pending, {
          source: descriptor.value, path: `${path}/${numericKey}`,
          assign(/** @type {unknown} */ value) { NATIVE_DEFINE_PROPERTY(target, numericKey, { value, enumerable: true, writable: true, configurable: true }); }
        });
      }
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      append(diagnostics, {
        category: 'schema', code: 'RECORD_PROTOTYPE_INVALID', path: path || '/',
        message: 'render input records must use a plain or null prototype'
      });
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
        append(diagnostics, {
          category: 'schema', code: 'RECORD_SYMBOL_PROPERTY_INVALID', path: path || '/',
          message: 'render input records cannot contain symbol properties'
        });
        continue;
      }
      const descriptor = descriptors[key];
      if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value')) {
        append(diagnostics, {
          category: 'schema', code: 'ACCESSOR_NOT_ALLOWED', path: `${path}/${pointerPart(key)}`,
          message: 'render input must use own data properties'
        });
      } else append(pending, {
        source: descriptor.value, path: `${path}/${pointerPart(key)}`,
        assign(/** @type {unknown} */ value) { NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true }); }
      });
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
  if (values.length === 0) return '_None._';
  /** @type {string[]} */
  const encoded = [];
  for (let index = 0; index < values.length; index += 1) append(encoded, code(values[index]));
  return joinArray(encoded, ', ');
}

/** @param {any} oracle */
function oracleText(oracle) {
  const expectedField = {
    value: 'expected_value', state: 'expected_state', event: 'expected_event', 'side-effect': 'expected_side_effect'
  }[String(oracle.type)] ?? '';
  const parts = [inline(oracle.type), inline(oracle.comparison), code(oracle[expectedField])];
  if (Object.hasOwn(oracle, 'tolerance')) append(parts, `tolerance ${code(oracle.tolerance)}`);
  if (Object.hasOwn(oracle, 'window')) append(parts, `window ${code(oracle.window)}`);
  return joinArray(parts, ' ');
}

/** @param {any} caseEntry @param {boolean} conditional @param {number} [headingLevel] */
function renderCase(caseEntry, conditional, headingLevel = 3) {
  const caseHeading = '#'.repeat(headingLevel);
  const detailHeading = '#'.repeat(headingLevel + 1);
  const lines = [
    `${caseHeading} ${code(caseEntry.case_id)} — ${inline(caseEntry.title)}`,
    '',
    `- Scope: ${code(caseEntry.scope)}`,
    `- Risk: ${code(caseEntry.risk)}`,
    `- Role: ${inline(caseEntry.role.value)} (evidence: ${code(caseEntry.role.evidence_ref)})`,
    `- Requirement facts: ${codeList(caseEntry.fact_ids)}`,
    `- Formal Test Points: ${codeList(caseEntry.obligation_ids)}`,
    `- Evidence references: ${codeList(caseEntry.evidence_refs)}`
  ];
  if (conditional) append(lines,
    `- Temporary assumption: ${code(caseEntry.temporary_assumption.claim_id)}; invalid when ${inline(caseEntry.temporary_assumption.invalidation_condition)}`
  );
  append(lines, '', `${detailHeading} Preconditions`, '');
  for (let index = 0; index < caseEntry.preconditions.length; index += 1) {
    const item = caseEntry.preconditions[index];
    append(lines, `${index + 1}. ${inline(item.condition)} (reachable from: ${inline(item.reachable_from)}; evidence: ${code(item.evidence_ref)})`);
  }
  append(lines, '', `${detailHeading} Test Data`, '');
  for (let dataIndex = 0; dataIndex < caseEntry.data.length; dataIndex += 1) {
    const item = caseEntry.data[dataIndex];
    append(lines, `- ${inline(item.name)} = ${code(item.value)} (origin: ${inline(item.value_origin)}; ${inline(item.provenance.type)}: ${code(item.provenance.ref)})`);
  }
  append(lines, '', `${detailHeading} Steps and Oracles`, '');
  for (let index = 0; index < caseEntry.steps.length; index += 1) {
    const step = caseEntry.steps[index];
    append(lines, `${index + 1}. ${code(step.step_id)} — ${inline(step.action)} (evidence: ${code(step.action_evidence_ref)})`);
    for (let expectationIndex = 0; expectationIndex < step.expectations.length; expectationIndex += 1) {
      const expectation = step.expectations[expectationIndex];
      append(
        lines,
        `   - ${code(expectation.expectation_id)}: ${inline(expectation.business_assertion)}`,
        `     - Observe: ${inline(expectation.observer)} via ${inline(expectation.observation_surface)} → ${inline(expectation.observation_target)}`,
        `     - Oracle: ${oracleText(expectation.oracle)}`,
        `     - Evidence: ${code(expectation.evidence_ref)}`
      );
    }
  }
  append(lines, '', `${detailHeading} Post-state and Cleanup`, '');
  append(lines, `- Post-state: ${inline(caseEntry.post_state.state)} (evidence: ${code(caseEntry.post_state.evidence_ref)})`);
  if (caseEntry.cleanup.required) {
    /** @type {string[]} */
    const cleanupSteps = [];
    for (let index = 0; index < caseEntry.cleanup.steps.length; index += 1) {
      append(cleanupSteps, inline(caseEntry.cleanup.steps[index]));
    }
    append(lines, `- Cleanup: ${joinArray(cleanupSteps, '; ')} (evidence: ${code(caseEntry.cleanup.evidence_ref)})`);
  } else append(lines,
    `- Cleanup: none — ${inline(caseEntry.cleanup.no_cleanup_reason)} (evidence: ${code(caseEntry.cleanup.no_cleanup_evidence_ref)})`
  );
  return lines;
}

/** @param {string} title @param {any[]} cases @param {boolean} conditional @param {number} [headingLevel] */
function renderCaseLane(title, cases, conditional, headingLevel = 2) {
  const lines = [`${'#'.repeat(headingLevel)} ${title}`, ''];
  if (cases.length === 0) {
    append(lines, '_None._');
    return lines;
  }
  for (let index = 0; index < cases.length; index += 1) {
    const item = cases[index];
    if (index > 0) append(lines, '');
    appendArray(lines, renderCase(item, conditional, headingLevel + 1));
  }
  return lines;
}

/** @param {string[]} headers @param {string[][]} rows */
function table(headers, rows) {
  /** @type {string[]} */
  const separators = [];
  for (let index = 0; index < headers.length; index += 1) append(separators, '---');
  const output = [
    `| ${joinArray(headers, ' | ')} |`,
    `| ${joinArray(separators, ' | ')} |`
  ];
  for (let index = 0; index < rows.length; index += 1) {
    append(output, `| ${joinArray(rows[index], ' | ')} |`);
  }
  return output;
}

/** @type {Readonly<Record<string, number>>} */
const RISK_ORDER = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

/** @param {unknown} value */
function titleCase(value) {
  const text = String(value).replaceAll('_', ' ').replaceAll('-', ' ');
  return text.length === 0 ? '' : `${text[0].toUpperCase()}${text.slice(1)}`;
}

/** @param {unknown} missingType */
function businessGapCategory(missingType) {
  const value = String(missingType);
  if (value === 'testability' || value === 'capability' || value === 'resource_limit'
    || value === 'control' || value === 'observer') return 'execution';
  if (value === 'source-conflict' || value === 'fact-conflict' || value === 'evidence'
    || value === 'extraction' || value === 'authority' || value === 'exclusion'
    || value === 'invalid-exclusion') return 'evidence';
  return 'business';
}

/** @param {'business'|'execution'|'evidence'} category */
function businessGapCause(category) {
  if (category === 'execution') return 'Required test setup or observation capability is unavailable or unverified.';
  if (category === 'evidence') return 'Source evidence is missing, ambiguous, conflicting, or lacks the required authority.';
  return 'A required product rule or expected outcome is unresolved.';
}

/** @param {'business'|'execution'|'evidence'} category */
function businessGapRequiredInput(category) {
  if (category === 'execution') return 'Verified test setup, control, or observation capability.';
  if (category === 'evidence') return 'Authoritative source evidence that resolves the ambiguity or conflict.';
  return 'An authoritative product rule or expected result.';
}

/** @param {any[]} members */
function groupedScopes(members) {
  /** @type {string[]} */
  const scopes = [];
  const seen = new Set();
  for (let index = 0; index < members.length; index += 1) {
    const scope = String(members[index].scope);
    if (!seen.has(scope)) {
      seen.add(scope);
      append(scopes, inline(scope));
    }
  }
  return scopes;
}

/** @param {any[]} members */
function highestRisk(members) {
  let selected = 'low';
  let selectedOrder = RISK_ORDER.low;
  for (let index = 0; index < members.length; index += 1) {
    const candidate = String(members[index].risk);
    const candidateOrder = RISK_ORDER[candidate] ?? 99;
    if (candidateOrder < selectedOrder) {
      selected = candidate;
      selectedOrder = candidateOrder;
    }
  }
  return selected;
}

/**
 * @param {string[]} lines
 * @param {any[]} blocked
 * @param {Map<string,any>} planByItemKey
 * @param {'business'|'execution'|'evidence'} category
 * @param {string} heading
 * @param {number} nextGapNumber
 */
function appendBusinessGapSection(lines, blocked, planByItemKey, category, heading, nextGapNumber) {
  append(lines, '', `## ${heading}`, '');
  /** @type {Map<string, any[]>} */
  const grouped = new Map();
  /** @type {any[][]} */
  const groups = [];
  for (let index = 0; index < blocked.length; index += 1) {
    const item = blocked[index];
    if (businessGapCategory(item.recovery.missing_type) !== category) continue;
    const rootId = String(item.root_issue_id);
    let members = grouped.get(rootId);
    if (!members) {
      members = [];
      grouped.set(rootId, members);
      append(groups, members);
    }
    append(members, item);
  }
  let count = 0;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const members = groups[groupIndex];
    const item = members[0];
    const scopes = groupedScopes(members);
    const gapNumber = nextGapNumber;
    nextGapNumber += 1;
    count += 1;
    append(lines,
      `### Gap-${String(gapNumber).padStart(3, '0')} — ${inline(item.recovery.question)}`,
      '',
      `- ${scopes.length === 1 ? 'Scope' : 'Scopes'}: ${joinArray(scopes, '; ')}`,
      `- Risk: ${titleCase(highestRisk(members))}`,
      `- Cause: ${businessGapCause(category)}`,
      members.length === 1
        ? '- Impact: one formal Test Point cannot become an executable Case.'
        : `- Impact: ${members.length} formal Test Points cannot become executable Cases.`,
      `- Required input: ${businessGapRequiredInput(category)}`,
      `- Next action: ${inline(item.recovery.question)}`,
      '- Affected Test Points and execution decisions:'
    );
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const member = members[memberIndex];
      const planItem = planByItemKey.get(`formal_test_point\u0000${String(member.obligation_id)}`);
      append(lines,
        `  - ${inline(member.subject)} — Scope: ${inline(member.scope)}; Risk: ${titleCase(member.risk)}`
      );
      if (planItem?.execution_disposition === 'do_not_execute'
        && typeof planItem.reason === 'string') append(
        lines, `    - Do not execute reason: ${inline(planItem.reason)}`
      );
    }
    append(lines,
      ''
    );
  }
  if (count === 0) append(lines, '_None._');
  else if (lines[lines.length - 1] === '') Reflect.apply(NATIVE_ARRAY_POP, lines, []);
  return nextGapNumber;
}

/** @param {any} left @param {any} right */
function compareBusinessCases(left, right) {
  const leftDisposition = left.planItem?.execution_disposition === 'execute' ? 0 : 1;
  const rightDisposition = right.planItem?.execution_disposition === 'execute' ? 0 : 1;
  return leftDisposition - rightDisposition
    || compareCodePoints(String(left.caseEntry.scope), String(right.caseEntry.scope))
    || (RISK_ORDER[String(left.caseEntry.risk)] ?? 99) - (RISK_ORDER[String(right.caseEntry.risk)] ?? 99)
    || compareCodePoints(String(left.caseEntry.role.value), String(right.caseEntry.role.value))
    || compareCodePoints(String(left.caseEntry.title), String(right.caseEntry.title))
    || compareCodePoints(String(left.caseEntry.case_id), String(right.caseEntry.case_id));
}

/** @param {any} snapshot */
function businessCaseInventory(snapshot) {
  const planByCaseId = new Map();
  for (let index = 0; index < snapshot.execution_plan.items.length; index += 1) {
    const item = snapshot.execution_plan.items[index];
    if (item.item_kind === 'case') planByCaseId.set(item.item_id, item);
  }
  /** @type {any[]} */
  const inventory = [];
  for (let index = 0; index < snapshot.grounded.length; index += 1) append(inventory, {
    caseEntry: snapshot.grounded[index], semanticStatus: 'grounded',
    planItem: planByCaseId.get(snapshot.grounded[index].case_id)
  });
  for (let index = 0; index < snapshot.conditional.length; index += 1) append(inventory, {
    caseEntry: snapshot.conditional[index], semanticStatus: 'conditional',
    planItem: planByCaseId.get(snapshot.conditional[index].case_id)
  });
  Reflect.apply(NATIVE_ARRAY_SORT, inventory, [compareBusinessCases]);
  const displayByCaseId = new Map();
  for (let index = 0; index < inventory.length; index += 1) {
    displayByCaseId.set(inventory[index].caseEntry.case_id, `TC-${String(index + 1).padStart(3, '0')}`);
  }
  return { inventory, displayByCaseId };
}

/** @param {any} item @param {string} displayId */
function renderBusinessCase(item, displayId) {
  const caseEntry = item.caseEntry;
  const disposition = item.planItem?.execution_disposition === 'execute' ? 'Execute' : 'Do not execute';
  const lines = [
    `### ${displayId} — ${inline(caseEntry.title)}`,
    '',
    `- Scope: ${inline(caseEntry.scope)}`,
    `- Risk: ${titleCase(caseEntry.risk)}`,
    `- Role: ${inline(caseEntry.role.value)}`,
    `- Evidence status: ${titleCase(item.semanticStatus)}`,
    `- Execution decision: ${disposition}`
  ];
  if (item.semanticStatus === 'conditional') append(lines,
    `- Temporary assumption: valid only until ${inline(caseEntry.temporary_assumption.invalidation_condition)}`
  );
  if (disposition === 'Do not execute' && typeof item.planItem?.reason === 'string') append(
    lines, `- Do not execute reason: ${inline(item.planItem.reason)}`
  );
  append(lines, '', '#### Preconditions', '');
  for (let index = 0; index < caseEntry.preconditions.length; index += 1) {
    const precondition = caseEntry.preconditions[index];
    append(lines, `${index + 1}. ${inline(precondition.condition)} (reachable from: ${inline(precondition.reachable_from)})`);
  }
  append(lines, '', '#### Test Data', '');
  for (let index = 0; index < caseEntry.data.length; index += 1) {
    const datum = caseEntry.data[index];
    append(lines, `- ${inline(datum.name)} = ${code(datum.value)} — Origin: ${titleCase(datum.value_origin)}`);
  }
  append(lines, '', '#### Steps and Expected Results', '');
  for (let stepIndex = 0; stepIndex < caseEntry.steps.length; stepIndex += 1) {
    const step = caseEntry.steps[stepIndex];
    append(lines, `${stepIndex + 1}. ${inline(step.action)}`);
    for (let expectationIndex = 0; expectationIndex < step.expectations.length; expectationIndex += 1) {
      const expectation = step.expectations[expectationIndex];
      append(lines,
        `   - Expected: ${inline(expectation.business_assertion)}`,
        `   - Observe: ${inline(expectation.observer)} via ${inline(expectation.observation_surface)} → ${inline(expectation.observation_target)}`,
        `   - Oracle: ${oracleText(expectation.oracle)}`
      );
    }
  }
  append(lines, '', '#### Post-state and Cleanup', '');
  append(lines, `- Post-state: ${inline(caseEntry.post_state.state)}`);
  if (caseEntry.cleanup.required) {
    /** @type {string[]} */
    const cleanupSteps = [];
    for (let index = 0; index < caseEntry.cleanup.steps.length; index += 1) append(
      cleanupSteps, inline(caseEntry.cleanup.steps[index])
    );
    append(lines, `- Cleanup: ${joinArray(cleanupSteps, '; ')}`);
  } else append(lines, `- Cleanup: none — ${inline(caseEntry.cleanup.no_cleanup_reason)}`);
  return lines;
}

/** @param {string} title @param {any[]} items @param {Map<string,string>} displayByCaseId */
function renderBusinessCaseLane(title, items, displayByCaseId) {
  const lines = [`## ${title}`, ''];
  if (items.length === 0) {
    append(lines, '_None._');
    return lines;
  }
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) append(lines, '');
    appendArray(lines, renderBusinessCase(
      items[index], String(displayByCaseId.get(items[index].caseEntry.case_id))
    ));
  }
  return lines;
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
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateAgainstSchema(snapshot, testBundleSchema)));
  appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateUniqueStableIds(snapshot)));
  if (diagnostics.length > 0) throw new BundleRenderError(diagnostics);
  const business = businessCaseInventory(snapshot);
  const runnerIds = new Set(snapshot.execution_plan.runner_case_ids);
  /** @type {any[]} */
  const executeCases = [];
  /** @type {any[]} */
  const notSelectedCases = [];
  for (let index = 0; index < business.inventory.length; index += 1) {
    const item = business.inventory[index];
    if (runnerIds.has(item.caseEntry.case_id)) append(executeCases, item);
    else append(notSelectedCases, item);
  }
  const coverage = snapshot.coverage;
  const plan = snapshot.execution_plan;
  const planByItemKey = new Map();
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    planByItemKey.set(`${String(item.item_kind)}\u0000${String(item.item_id)}`, item);
  }
  const lines = [
    '# Manual Functional Test Plan',
    '',
    '## Delivery Overview',
    '',
    '- Generated, not executed. This plan contains no test results or defect verdicts.',
    `- Readiness: ${titleCase(snapshot.quality.delivery_status)}`,
    `- Requirement accounting: ${coverage.requirements.accounted}/${coverage.requirements.total}`,
    `- Formal Test Points covered: ${coverage.formal.covered}/${coverage.formal.total}`,
    `- Grounded executable coverage: ${coverage.executable.grounded}/${coverage.executable.total}`,
    `- Execute Cases: ${plan.summary.execute_case_count}`,
    `- Do not execute Cases: ${plan.summary.do_not_execute_case_count}`,
    `- Blocked formal Test Points: ${snapshot.blocked.length}`,
    `- NotApplicable exclusions: ${coverage.not_applicable.length}`,
    '',
    '## Execution Overview',
    ''
  ];
  /** @type {string[][]} */
  const overviewRows = [];
  for (let index = 0; index < business.inventory.length; index += 1) {
    const item = business.inventory[index];
    append(overviewRows, [
      String(business.displayByCaseId.get(item.caseEntry.case_id)),
      inline(item.caseEntry.title), inline(item.caseEntry.scope), titleCase(item.caseEntry.risk),
      inline(item.caseEntry.role.value),
      item.planItem?.execution_disposition === 'execute' ? 'Execute' : 'Do not execute'
    ]);
  }
  appendArray(lines, table(['Case', 'Title', 'Scope', 'Risk', 'Role', 'Decision'], overviewRows));
  append(lines, '');
  appendArray(lines, renderBusinessCaseLane('Cases to Execute', executeCases, business.displayByCaseId));
  append(lines, '');
  appendArray(lines, renderBusinessCaseLane('Cases Not Selected', notSelectedCases, business.displayByCaseId));
  let nextGapNumber = 1;
  nextGapNumber = appendBusinessGapSection(
    lines, snapshot.blocked, planByItemKey, 'business', 'Business Rule Gaps', nextGapNumber
  );
  nextGapNumber = appendBusinessGapSection(
    lines, snapshot.blocked, planByItemKey, 'execution', 'Execution Preparation Gaps', nextGapNumber
  );
  appendBusinessGapSection(
    lines, snapshot.blocked, planByItemKey, 'evidence', 'Source and Evidence Gaps', nextGapNumber
  );
  append(lines, '', '## Scope Exclusions (NotApplicable)', '');
  if (coverage.not_applicable.length === 0) append(lines, '_None._');
  for (let index = 0; index < coverage.not_applicable.length; index += 1) {
    const item = coverage.not_applicable[index];
    append(lines,
      `- ${item.subject_kind === 'requirement_fact' ? 'Requirement fact' : 'Formal Test Point'} “${inline(item.subject)}” in ${inline(item.scope)}: ${inline(item.reason)}`
    );
  }
  append(lines, '', '## Exploratory Risks', '');
  if (snapshot.exploratory.length === 0) append(lines, '_None._');
  for (let index = 0; index < snapshot.exploratory.length; index += 1) {
    const item = snapshot.exploratory[index];
    const planItem = planByItemKey.get(`exploratory\u0000${String(item.exploratory_id)}`);
    append(lines,
      `- ${inline(item.title)} — Scope: ${inline(item.scope)}; Risk: ${titleCase(item.risk)}; Status: exploratory only and outside formal coverage.`
    );
    if (planItem?.execution_disposition === 'do_not_execute'
      && typeof planItem.reason === 'string') append(
      lines, `  - Do not execute reason: ${inline(planItem.reason)}`
    );
  }
  append(lines, '', '## Manual Execution Worksheet', '');
  append(lines,
    'Generated, not executed. Record results downstream and bind each record to the delivered bundle digest + stable Case ID listed in the Audit Appendix.',
    ''
  );
  /** @type {string[][]} */
  const worksheetRows = [];
  for (let index = 0; index < executeCases.length; index += 1) {
    const item = executeCases[index];
    append(worksheetRows, [
      String(business.displayByCaseId.get(item.caseEntry.case_id)), inline(item.caseEntry.title),
      inline(item.caseEntry.scope), titleCase(item.caseEntry.risk), inline(item.caseEntry.role.value),
      'Not recorded', '—', '—'
    ]);
  }
  appendArray(lines, table(
    ['Case', 'Title', 'Scope', 'Risk', 'Role', 'Result', 'Defect', 'Notes'], worksheetRows
  ));
  append(lines,
    '', '## Audit Appendix', '',
    `- Schema version: ${code(snapshot.schema_version)}`,
    `- Source revision: ${code(snapshot.source_revision)}`,
    ''
  );
  appendArray(lines, renderCaseLane('Grounded Cases', snapshot.grounded, false, 3));
  append(lines, '');
  appendArray(lines, renderCaseLane('Conditional Cases', snapshot.conditional, true, 3));
  append(lines, '', '### Blocked Formal Test Points', '');
  if (snapshot.blocked.length === 0) append(lines, '_None._');
  for (let index = 0; index < snapshot.blocked.length; index += 1) {
    const item = snapshot.blocked[index];
    append(
      lines,
      `#### ${code(item.obligation_id)}`,
      '',
      `- Root issue: ${code(item.root_issue_id)}`,
      `- Scope: ${code(item.scope)}`,
      `- Risk: ${code(item.risk)}`,
      `- Reason: ${code(item.reason)}`,
      `- Missing type: ${code(item.recovery.missing_type)}`,
      `- Required material: ${inline(item.recovery.required_material)}`,
      `- Recovery question: ${inline(item.recovery.question)}`,
      ''
    );
  }
  if (lines[lines.length - 1] === '') Reflect.apply(NATIVE_ARRAY_POP, lines, []);
  append(lines, '', '### Exploratory Cases', '');
  if (snapshot.exploratory.length === 0) append(lines, '_None._');
  for (let index = 0; index < snapshot.exploratory.length; index += 1) {
    const item = snapshot.exploratory[index];
    append(
      lines,
      `#### ${code(item.exploratory_id)} — ${inline(item.title)}`,
      '',
      `- Scope: ${code(item.scope)}`,
      `- Risk: ${code(item.risk)}`,
      `- Reason: ${inline(item.reason)}`,
      ''
    );
  }
  if (lines[lines.length - 1] === '') Reflect.apply(NATIVE_ARRAY_POP, lines, []);
  /** @type {string[][]} */
  const requirementRows = [];
  for (let index = 0; index < coverage.requirements.entries.length; index += 1) {
    const item = coverage.requirements.entries[index];
    append(requirementRows, [code(item.fact_id), code(item.status)]);
  }
  /** @type {string[][]} */
  const formalRows = [];
  for (let index = 0; index < coverage.formal.entries.length; index += 1) {
    const item = coverage.formal.entries[index];
    append(formalRows, [code(item.obligation_id), code(item.status)]);
  }
  /** @type {string[][]} */
  const executableRows = [];
  for (let index = 0; index < coverage.executable.entries.length; index += 1) {
    const item = coverage.executable.entries[index];
    append(executableRows, [code(item.obligation_id), code(item.case_id)]);
  }
  append(
    lines,
    '', '### Coverage', '',
    '#### Requirement Fact Ledger', '',
    `Accounted: ${coverage.requirements.accounted}/${coverage.requirements.total}`, ''
  );
  appendArray(lines, table(['Fact', 'Status'], requirementRows));
  append(lines, '', '#### Formal Test Point Ledger', '', `Covered: ${coverage.formal.covered}/${coverage.formal.total} declared`, '');
  appendArray(lines, table(['Test Point', 'Disposition'], formalRows));
  append(lines, '', '#### Grounded Executable Ledger', '', `Grounded: ${coverage.executable.grounded}/${coverage.executable.total}`, '');
  appendArray(lines, table(['Test Point', 'Case'], executableRows));
  append(lines, '', '#### Expert Recall Ledger', '', `Status: ${code(coverage.expert_recall.status)}`);
  for (let index = 0; index < coverage.expert_recall.limits.length; index += 1) {
    append(lines, `- ${inline(coverage.expert_recall.limits[index])}`);
  }
  append(lines, '', '#### NotApplicable (excluded from the coverage numerator)', '');
  if (coverage.not_applicable.length === 0) append(lines, '_None._');
  else {
    /** @type {string[][]} */
    const notApplicableRows = [];
    for (let index = 0; index < coverage.not_applicable.length; index += 1) {
      const item = coverage.not_applicable[index];
      append(notApplicableRows, [
        code(item.subject_kind), code(item.obligation_id ?? item.fact_id),
        code(item.exclusion_claim_id), code(item.scope), code(item.support_review), inline(item.reason)
      ]);
    }
    appendArray(lines, table(['Subject kind', 'Subject', 'Exclusion evidence', 'Scope', 'Review', 'Reason'], notApplicableRows));
  }
  /** @type {string[][]} */
  const planRows = [];
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    append(planRows, [
      code(item.item_kind), code(item.item_id), inline(item.title), code(item.semantic_status),
      code(item.execution_disposition), code(item.reason_code)
    ]);
  }
  append(
    lines,
    '', '### Execution Plan', '',
    `- Status: ${code(plan.status)}`,
    `- Plan digest: ${code(plan.plan_digest)}`,
    `- Semantic result digest: ${code(plan.semantic_result_digest)}`,
    `- Execute Cases: ${plan.summary.execute_case_count}`,
    `- DoNotExecute Cases: ${plan.summary.do_not_execute_case_count}`,
    `- DoNotExecute formal Test Points: ${plan.summary.do_not_execute_formal_test_point_count}`,
    `- DoNotExecute Exploratory items: ${plan.summary.do_not_execute_exploratory_count}`,
    `- Applicable Test Point execution coverage: full ${plan.summary.full_test_point_count}, partial ${plan.summary.partial_test_point_count}, none ${plan.summary.none_test_point_count}`,
    `- Runner Case IDs: ${codeList(plan.runner_case_ids)}`,
    ''
  );
  appendArray(lines, table(
    ['Kind', 'ID', 'Title', 'True status', 'Execution disposition', 'Reason code'], planRows
  ));
  append(
    lines,
    '', '### Quality', '',
    `- Delivery status: ${code(snapshot.quality.delivery_status)}`,
    `- Compiler version: ${code(snapshot.quality.compiler_version)}`,
    `- Schema version: ${code(snapshot.quality.schema_version)}`,
    `- Semantic source digest: ${code(snapshot.quality.lineage.semantic_source_digest)}`,
    `- Evidence semantic digest: ${code(snapshot.quality.lineage.evidence_semantic_digest)}`,
    `- Behavior Views semantic digest: ${code(snapshot.quality.lineage.behavior_views_semantic_digest)}`,
    `- Test Obligations semantic digest: ${code(snapshot.quality.lineage.test_obligations_semantic_digest)}`,
    `- Case Drafts semantic digest: ${code(snapshot.quality.lineage.case_drafts_semantic_digest)}`,
    '- Limits:'
  );
  for (let index = 0; index < snapshot.quality.limits.length; index += 1) {
    append(lines, `  - ${inline(snapshot.quality.limits[index])}`);
  }
  return `${joinArray(lines, '\n')}\n`;
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
