import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { isExecutionPreparationGap } from './gap-kinds.mjs';

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
  if (isExecutionPreparationGap(value)) return 'execution';
  if (value === 'source-conflict' || value === 'fact-conflict' || value === 'evidence'
    || value === 'extraction' || value === 'authority' || value === 'exclusion'
    || value === 'invalid-exclusion') return 'evidence';
  return 'business';
}

/** @param {any} entry @param {string} resourceId */
function declaredResource(entry, resourceId) {
  let found = null;
  for (let index = 0; index < entry.testability_profile.setup_resources.length; index += 1) {
    const resource = entry.testability_profile.setup_resources[index];
    if (resource.resource_id !== resourceId) continue;
    if (found !== null) throw new BundleRenderError([{
      category: 'reference', code: 'SETUP_RESOURCE_AMBIGUOUS', path: '/setup_resources',
      message: 'rendered setup resource must resolve uniquely'
    }]);
    found = resource;
  }
  if (found === null) throw new BundleRenderError([{
    category: 'reference', code: 'SETUP_RESOURCE_UNKNOWN', path: '/setup_resources',
    message: 'rendered setup resource must be declared'
  }]);
  return found;
}

/** Translate compiler-authored prompts only; preserve operator-authored questions.
 * @param {string} question @param {boolean} zh
 */
function recoveryQuestion(question, zh) {
  if (!zh) return question;
  const capability = /^What verified test setup, control, or observation capability is available for (.*)\?$/u.exec(question);
  if (capability) return '在“' + capability[1] + '”范围内，有哪些已验证的数据准备、控制或观察能力？';
  const authority = /^Which authoritative source rule applies to (.*)\?$/u.exec(question);
  if (authority) return '“' + authority[1] + '”范围内，应采用哪份权威来源中的规则？';
  const exclusion = /^What authoritative scope-exclusion rule applies to (.*)\?$/u.exec(question);
  if (exclusion) return '哪条权威规则将“' + exclusion[1] + '”排除在本次范围外？';
  const rule = /^What authoritative product rule or expected result resolves the (.*) gap in (.*)\?$/u.exec(question);
  if (rule) return '针对“' + rule[2] + '”的缺口，明确的产品规则或预期结果是什么？';
  return question;
}

/** @param {any} item @param {boolean} zh */
function recoveryDetails(item, zh) {
  /** @type {string[]} */
  const details = [];
  /** @type {Record<string,[string,string]>} */
  const reasons = {
    CAPABILITY_UNKNOWN: ['Capability availability is unconfirmed.', '能力可用性尚未确认。'],
    CAPABILITY_UNAVAILABLE: ['Capability is confirmed unavailable.', '能力已确认不可用。'],
    CAPABILITY_PROVENANCE_MISSING: ['Capability has no supporting verification evidence.', '缺少能力的验证依据。'],
    CONTROL_MISSING: ['The required control is missing.', '缺少必要的操作控制。'],
    OBSERVER_MISSING: ['The required observer is missing.', '缺少必要的观察能力。'],
    FORMAL_ORACLE_MISSING: ['No sourced expected result is available.', '缺少有来源支持的预期结果。'],
    ORACLE_INVALID: ['The expected-result comparison is incomplete or invalid.', '预期结果的比较条件不完整或无效。'],
    UNRESOLVED_CONFLICT: ['Conflicting authoritative rules remain unresolved.', '权威规则间的冲突尚未解决。'],
    FACT_UNRESOLVED: ['The requirement fact remains ambiguous or conflicted.', '需求事实仍存在歧义或冲突。']
  };
  const codes = String(item.reason).split(',');
  for (let i = 0; i < codes.length; i += 1) {
    const pair = reasons[codes[i]];
    if (pair) append(details, pair[zh ? 1 : 0]);
  }
  // Compiler semantic refs may contain typed resource subjects mixed with trace IDs.
  // Decode only the resource descriptors; keep opaque IDs in the audit index.
  try {
    const refs = JSON.parse('[' + item.recovery.required_material + ']');
    for (let i = 0; i < refs.length; i += 1) {
      const ref = refs[i];
      if (ref && typeof ref === 'object' && typeof ref.subject === 'string'
        && (ref.kind === 'capability' || ref.kind === 'control' || ref.kind === 'observer')) {
        append(details, (zh ? '涉及资源：' : 'Resource: ') + ref.subject
          + (typeof ref.target === 'string' ? ' → ' + ref.target
            : ref.target && typeof ref.target.observation_target === 'string' ? ' → ' + ref.target.observation_target : ''));
      }
    }
  } catch { /* Plain trace references are intentionally rendered only in the audit. */ }
  return details;
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
  for (let index = 0; index < snapshot.blocked.length; index += 1) {
    const item = snapshot.blocked[index];
    const ids = new Set();
    let previous = '';
    for (let dependencyIndex = 0; dependencyIndex < item.blocking_roots.length; dependencyIndex += 1) {
      const dependency = item.blocking_roots[dependencyIndex];
      if (ids.has(dependency.root_issue_id) || (previous && previous >= dependency.root_issue_id)) append(diagnostics, {
        category: 'traceability', code: 'BLOCKED_DEPENDENCY_SET_INVALID', path: `/blocked/${index}/blocking_roots`,
        message: 'Blocked dependencies must be unique and canonical'
      });
      ids.add(dependency.root_issue_id);
      previous = dependency.root_issue_id;
    }
    if (item.root_issue_id !== item.blocking_roots[0].root_issue_id
      || canonicalStringify(item.recovery) !== canonicalStringify(item.blocking_roots[0].recovery)) append(diagnostics, {
      category: 'traceability', code: 'BLOCKED_DEPENDENCY_ALIAS_MISMATCH', path: `/blocked/${index}`,
      message: 'Blocked scalar aliases must exactly equal the first dependency'
    });
  }
  if (diagnostics.length > 0) throw new BundleRenderError(diagnostics);
  const business = businessCaseInventory(snapshot);
  const runnerIds = new Set(snapshot.execution_plan.runner_case_ids);
  /** @type {any[]} */
  const executeCases = [];
  for (let index = 0; index < business.inventory.length; index += 1) {
    const item = business.inventory[index];
    if (runnerIds.has(item.caseEntry.case_id)) append(executeCases, item);
  }
  const coverage = snapshot.coverage;
  const plan = snapshot.execution_plan;
  const planByItemKey = new Map();
  for (let index = 0; index < plan.items.length; index += 1) {
    const item = plan.items[index];
    planByItemKey.set(`${String(item.item_kind)}\u0000${String(item.item_id)}`, item);
  }
  const zh = snapshot.output_language === 'zh-CN';
  /** @param {string} en @param {string} cn */
  const L = (en, cn) => zh ? cn : en;
  /** @param {unknown} value */
  const label = (value) => {
    /** @type {Record<string,string>} */
    const labels = {
      grounded: '有充分依据', conditional: '依赖临时条件', blocked: '受阻',
      exploratory: '探索建议', not_applicable: '不适用', execute: '执行',
      do_not_execute: '不执行', pending: '待决定', critical: '严重', high: '高',
      medium: '中', low: '低', document_only: '仅交付文档', ready: '执行计划已确认',
      requirement: '需求规定', derived: '推导值', example: '示例值', assumption: '假设值',
      'temporary-assumption': '临时假设',
      equals: '等于', contains: '包含', matches: '匹配', within: '范围内',
      executable_subset_ready: '已有可执行子集', critical_gaps: '存在关键缺口',
      no_deterministic_cases: '尚无确定性用例', no_applicable_formal_test_points: '无适用正式测试点'
    };
    return zh ? labels[String(value)] ?? inline(value) : titleCase(value);
  };
  const lines = [
    L('# Manual Functional Test Plan', '# 人工功能测试用例'), '',
    L('## Delivery Overview', '## 交付概览'), '',
    L('- Generated, not executed. No test results or defect verdicts are claimed.',
      '- 仅生成，尚未执行；不包含测试结果或缺陷结论。'),
    '- ' + L('Delivery', '交付状态') + ': ' + label(plan.status),
    '- ' + L('Coverage boundary: the following ratios account for declared, reviewed facts, not independently proven PRD recall.',
      '覆盖边界：以下比例核算已声明、已审阅的事实，不代表已独立证明 PRD 语义无遗漏。'),
    '- ' + L('Requirement accounting', '需求事实核算') + ': ' + coverage.requirements.accounted + '/' + coverage.requirements.total,
    '- ' + L('Formal Test Points covered', '正式测试点覆盖') + ': ' + coverage.formal.covered + '/' + coverage.formal.total,
    '- ' + L('Grounded executable coverage', '充分依据用例覆盖') + ': ' + coverage.executable.grounded + '/' + coverage.executable.total,
    '- ' + L('Confirmed runner Cases', '已确认可交给执行器的用例') + ': ' + plan.runner_case_ids.length,
    '- ' + L('Blocked Test Points / scope exclusions', '受阻测试点 / 范围排除') + ': ' + snapshot.blocked.length + ' / ' + coverage.not_applicable.length,
    '', L('## Case Overview', '## 用例总览'), ''
  ];
  /** @type {string[][]} */
  const overviewRows = [];
  for (let index = 0; index < business.inventory.length; index += 1) {
    const item = business.inventory[index];
    append(overviewRows, [
      String(business.displayByCaseId.get(item.caseEntry.case_id)), inline(item.caseEntry.title),
      inline(item.caseEntry.scope), label(item.caseEntry.risk), label(item.semanticStatus),
      label(item.planItem?.execution_disposition ?? 'pending')
    ]);
  }
  appendArray(lines, table([
    L('Case', '用例'), L('Title', '标题'), L('Scope', '范围'), L('Risk', '风险'),
    L('Evidence status', '依据状态'), L('Decision', '执行决定')
  ], overviewRows));
  append(lines, '', L('## Cases', '## 用例明细'), '');
  if (business.inventory.length === 0) append(lines, L('_None._', '_无。_'), '');
  for (let index = 0; index < business.inventory.length; index += 1) {
    const item = business.inventory[index];
    const entry = item.caseEntry;
    append(lines, '### ' + business.displayByCaseId.get(entry.case_id) + ' — ' + inline(entry.title), '',
      '- ' + L('Scope', '范围') + ': ' + inline(entry.scope),
      '- ' + L('Role', '角色') + ': ' + inline(entry.role.value),
      '- ' + L('Risk', '风险') + ': ' + label(entry.risk),
      '- ' + L('Evidence status', '依据状态') + ': ' + label(item.semanticStatus),
      '- ' + L('Execution decision', '执行决定') + ': ' + label(item.planItem?.execution_disposition ?? 'pending'));
    if (item.semanticStatus === 'conditional') append(lines,
      '- ' + L('Temporary assumption invalidation', '临时假设失效条件') + ': ' + inline(entry.temporary_assumption.invalidation_condition));
    if (item.planItem?.reason) append(lines, '- ' + L('Decision basis', '决定依据') + ': ' + inline(
      item.planItem.basis?.origin === 'default_grounded_recommendation'
        ? L('Selected for this run.', '已选择纳入本次执行。') : item.planItem.reason));
    append(lines,
      '- ' + L('Impact rationale', '影响依据') + ': ' + inline(entry.risk_basis.impact),
      '- ' + L('Likelihood rationale', '可能性依据') + ': ' + inline(entry.risk_basis.likelihood),
      '- ' + L('Exposure rationale', '影响范围依据') + ': ' + inline(entry.risk_basis.exposure));
    if (entry.scenario.intent === 'compatibility') {
      const baseline = declaredResource(entry, entry.scenario.compatibility.baseline_ref);
      append(lines, '- ' + L('Compatibility baseline', '兼容性基线') + ': ' + inline(baseline.locator));
      append(lines, '- ' + L('Comparison dimension', '比较维度') + ': ' + inline(entry.scenario.compatibility.dimensions[0]));
    }
    append(lines, '', L('#### Preconditions', '#### 前置条件'), '');
    for (let i = 0; i < entry.preconditions.length; i += 1) {
      const pre = entry.preconditions[i];
      append(lines, String(i + 1) + '. ' + inline(pre.condition) + ' — ' + L('Preparation', '准备路径') + ': ' + inline(pre.reachable_from));
      const resource = declaredResource(entry, pre.setup.resource_ref);
      append(lines, '   - ' + L('Resource', '资源入口') + ': ' + inline(resource.locator),
        '   - ' + L('Preparation completed when', '准备完成判据') + ': ' + inline(pre.setup.completion.subject_ref) + ' ' + label(pre.setup.completion.operator) + ' ' + code(pre.setup.completion.operand.value));
    }
    append(lines, '', L('#### Test Data', '#### 测试数据'), '');
    for (let i = 0; i < entry.data.length; i += 1) {
      const datum = entry.data[i];
      append(lines, '- ' + inline(datum.name) + ' = ' + code(datum.value) + ' — ' + L('Origin', '取值来源') + ': ' + label(datum.value_origin));
    }
    append(lines, '', L('#### Steps and Expected Results', '#### 步骤与预期结果'), '');
    for (let i = 0; i < entry.steps.length; i += 1) {
      const step = entry.steps[i];
      append(lines, String(i + 1) + '. ' + inline(step.action));
      for (let j = 0; j < step.expectations.length; j += 1) {
        const expectation = step.expectations[j];
        append(lines, '   - ' + L('Expected', '预期') + ': ' + inline(expectation.business_assertion),
          '   - ' + L('Observe', '观察') + ': ' + inline(expectation.observer) + ' / '
            + inline(expectation.observation_surface) + ' → ' + inline(expectation.observation_target));
        const assertion = expectation.oracle.assertion;
        const operator = assertion.operator === 'equals' ? L('equals', '等于')
          : assertion.operator === 'contains' ? L('contains', '包含')
            : assertion.operator === 'matches' ? L('matches', '匹配') : L('within', '范围内');
        append(lines, '   - ' + L('Typed Oracle', '结构化判定') + ': ' + inline(assertion.subject_ref)
          + ' ' + operator + ' ' + code(assertion.operand.value));
        if (expectation.oracle.tolerance !== undefined) append(lines,
          '   - ' + L('Tolerance', '容差') + ': ' + code(expectation.oracle.tolerance));
        if (expectation.oracle.window !== undefined) append(lines,
          '   - ' + L('Observation window', '观察时间窗') + ': ' + inline(expectation.oracle.window));
      }
    }
    append(lines, '', L('#### Post-state and Cleanup', '#### 后置状态与清理'), '',
      '- ' + L('Post-state', '后置状态') + ': ' + inline(entry.post_state.state));
    if (entry.cleanup.required) {
      for (let i = 0; i < entry.cleanup.steps.length; i += 1) append(lines,
        '- ' + L('Cleanup', '清理') + ': ' + inline(entry.cleanup.steps[i]));
    } else append(lines, '- ' + L('No cleanup', '无需清理') + ': ' + inline(entry.cleanup.no_cleanup_reason));
    append(lines, '');
  }
  const groupedGaps = new Map();
  /** @type {any[][]} */
  const gapGroups = [];
  for (let i = 0; i < snapshot.blocked.length; i += 1) {
    const blockedItem = snapshot.blocked[i];
    const dependencies = blockedItem.blocking_roots ?? [{ root_issue_id: blockedItem.root_issue_id, recovery: blockedItem.recovery }];
    for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
    const item = { ...blockedItem, ...dependencies[dependencyIndex] };
    if (!groupedGaps.has(item.root_issue_id)) {
      /** @type {any[]} */
      const group = [];
      groupedGaps.set(item.root_issue_id, group);
      append(gapGroups, group);
    }
    append(groupedGaps.get(item.root_issue_id), item);
    }
  }
  let gapIndex = 0;
  const categories = ['business', 'execution', 'evidence'];
  for (let categoryIndex = 0; categoryIndex < categories.length; categoryIndex += 1) {
    const category = categories[categoryIndex];
    append(lines, category === 'business' ? L('## Business Rule Gaps', '## 待补充业务规则')
      : category === 'execution' ? L('## Execution Preparation Gaps', '## 待补齐执行准备')
        : L('## Source and Evidence Gaps', '## 待补齐来源与依据'), '');
    let categoryCount = 0;
    for (let groupIndex = 0; groupIndex < gapGroups.length; groupIndex += 1) {
    const members = gapGroups[groupIndex];
    if (businessGapCategory(members[0].recovery.missing_type) !== category) continue;
    categoryCount += 1;
    gapIndex += 1;
    append(lines, '### ' + L('Gap', '缺口') + '-' + gapIndex, '');
    for (let i = 0; i < members.length; i += 1) {
      const item = members[i];
      append(lines, '- ' + inline(item.subject) + ' — ' + L('Scope', '范围') + ': ' + inline(item.scope)
        + '; ' + L('Risk', '风险') + ': ' + label(item.risk));
      const decision = planByItemKey.get('formal_test_point\u0000' + item.obligation_id);
      if (decision?.reason) append(lines, '  - ' + L('Decision', '执行决定') + ': ' + label(decision.execution_disposition) + ' — ' + inline(decision.reason));
    }
    append(lines, '- ' + L('Question', '需确认事项') + ': ' + inline(recoveryQuestion(members[0].recovery.question, zh)));
    const details = recoveryDetails(members[0], zh);
    for (let i = 0; i < details.length; i += 1) append(lines, '- ' + inline(details[i]));
    append(lines, '- ' + L('Needed', '需要补充') + ': ' + (category === 'execution'
      ? L('Verified preparation, control or observation capability.', '已验证的数据准备、控制或观察能力。')
      : category === 'evidence'
        ? L('Authoritative evidence resolving the source gap or conflict.', '可消除来源缺失、歧义或冲突的权威证据。')
        : L('An authoritative product rule and expected result.', '明确的产品规则及预期结果。')), '');
    }
    if (categoryCount === 0) append(lines, L('_None._', '_无。_'), '');
  }
  append(lines, L('## Scope Exclusions', '## 范围排除'), '');
  if (coverage.not_applicable.length === 0) append(lines, L('_None._', '_无。_'));
  for (let i = 0; i < coverage.not_applicable.length; i += 1) {
    const item = coverage.not_applicable[i];
    append(lines, '- ' + (item.subject_kind === 'formal_test_point' ? L('Formal Test Point', '正式测试点') : L('Requirement fact', '需求事实'))
      + ' “' + inline(item.subject) + '” ' + L('in', '范围') + ' ' + inline(item.scope) + ' — ' + inline(item.reason));
  }
  append(lines, '', L('## Exploratory Risks', '## 探索性风险'), '');
  if (snapshot.exploratory.length === 0) append(lines, L('_None._', '_无。_'));
  for (let i = 0; i < snapshot.exploratory.length; i += 1) {
    const item = snapshot.exploratory[i];
    append(lines, '- ' + inline(item.title) + ' — ' + label(item.risk) + ': '
      + L('Nonformal risk hypothesis; not counted as formal coverage.', '非正式风险建议，不计入正式覆盖。'));
    if (item.origin === 'heuristic') append(lines,
      '  - ' + L('Unsourced heuristic, not evidence', '无来源的启发式建议，不是证据') + ': ' + inline(item.hypothesis),
      '  - ' + L('Rationale', '提出依据') + ': ' + inline(item.rationale));
    const decision = planByItemKey.get('exploratory\u0000' + item.exploratory_id);
    if (decision?.reason) append(lines, '  - ' + L('Decision', '执行决定') + ': ' + label(decision.execution_disposition) + ' — ' + inline(decision.reason));
  }
  append(lines, '', L('## Manual Execution Worksheet', '## 人工执行记录表'), '',
    L('Not executed. Record results downstream against the bundle digest and stable Case ID; only confirmed runner Cases are listed.',
      '尚未执行。执行结果由下游按 bundle 摘要和稳定用例 ID 记录；下表仅列出已确认可执行的用例。'), '');
  /** @type {string[][]} */
  const worksheetRows = [];
  for (let i = 0; i < executeCases.length; i += 1) append(worksheetRows, [
    String(business.displayByCaseId.get(executeCases[i].caseEntry.case_id)),
    inline(executeCases[i].caseEntry.title), inline(executeCases[i].caseEntry.scope),
    label(executeCases[i].caseEntry.risk), inline(executeCases[i].caseEntry.role.value),
    L('Not recorded', '未记录'), '—', '—'
  ]);
  appendArray(lines, table([L('Case', '用例'), L('Title', '标题'), L('Scope', '范围'), L('Risk', '风险'), L('Role', '角色'), L('Result', '结果'), L('Defect', '缺陷'), L('Notes', '备注')], worksheetRows));
  append(lines, '', L('## Audit Appendix', '## 审计索引'), '',
    L('Complete typed Oracles, evidence, coverage ledgers and lineage are in the normative JSON. Cases are not duplicated here.',
      '完整的结构化 Oracle、证据、覆盖账本和血缘均保留在规范 JSON 中，此处不重复用例正文。'), '',
    '- ' + L('Schema / compiler', 'Schema / 编译器') + ': ' + code(snapshot.schema_version) + ' / ' + code(snapshot.quality.compiler_version),
    '- ' + L('Source revision', '资料修订') + ': ' + snapshot.source_revision,
    '- ' + L('Semantic source digest', '资料语义摘要') + ': ' + code(snapshot.quality.lineage.semantic_source_digest),
    '- ' + L('Plan digest', '计划摘要') + ': ' + code(plan.plan_digest),
    '- ' + L('Semantic result digest', '语义结果摘要') + ': ' + code(plan.semantic_result_digest), '');
  /** @type {string[][]} */
  const traceRows = [];
  for (let i = 0; i < business.inventory.length; i += 1) {
    const entry = business.inventory[i].caseEntry;
    append(traceRows, [String(business.displayByCaseId.get(entry.case_id)), code(entry.case_id),
      codeList(entry.obligation_ids), codeList(entry.evidence_refs)]);
  }
  appendArray(lines, table([L('Case', '用例'), L('Stable ID', '稳定 ID'), L('Test Points', '测试点'), L('Evidence', '证据')], traceRows));
  /** @type {string[][]} */
  const gapTraceRows = [];
  for (let i = 0; i < snapshot.blocked.length; i += 1) {
    const item = snapshot.blocked[i];
    const dependencies = item.blocking_roots ?? [{ root_issue_id: item.root_issue_id, recovery: item.recovery }];
    for (let dependencyIndex = 0; dependencyIndex < dependencies.length; dependencyIndex += 1) {
      const dependency = dependencies[dependencyIndex];
      append(gapTraceRows, [inline(item.subject), code(item.obligation_id), code(dependency.root_issue_id),
        code(item.reason), code(dependency.recovery.required_material)]);
    }
  }
  append(lines, '', L('### Gap Traceability', '### 缺口追溯'), '');
  appendArray(lines, table([L('Subject', '事项'), L('Test Point', '测试点'), L('Shared root', '共享根因'),
    L('Diagnostic codes', '诊断码'), L('Recovery references', '恢复引用')], gapTraceRows));
  append(lines, '', L('### Exploratory Traceability', '### 探索建议追溯'), '');
  for (let i = 0; i < snapshot.exploratory.length; i += 1) append(lines,
    '- ' + code(snapshot.exploratory[i].exploratory_id) + ': ' + inline(snapshot.exploratory[i].reason));
  append(lines, '', L('### Limits', '### 限制'), '');
  for (let i = 0; i < snapshot.quality.limits.length; i += 1) append(lines, '- ' + (
    zh && snapshot.quality.limits[i] === 'Compilation is limited to the supplied revision.'
      ? '本次编译仅涵盖所提供的资料修订。' : inline(snapshot.quality.limits[i])));
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
