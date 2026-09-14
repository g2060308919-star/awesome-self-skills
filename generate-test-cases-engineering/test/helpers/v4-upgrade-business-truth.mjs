// @ts-nocheck -- independent test-oracle projections intentionally mutate open semantic fixtures.
import assert from 'node:assert/strict';

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} label */
function rows(value, label) {
  assert.ok(Array.isArray(value), `${label} must be an array`);
  for (const [index, item] of value.entries()) {
    assert.ok(record(item), `${label}[${index}] must be an object`);
  }
  return /** @type {Record<string, any>[]} */ (value);
}

/**
 * Independent business acceptance projection. The caller must project these
 * rows from the actual canonical result; this helper never compiles a Case or
 * returns its truth fixture as candidate input.
 * @param {unknown} submittedProjection @param {unknown} submittedTruth
 */
export function assertFCityBusinessProjection(submittedProjection, submittedTruth) {
  assert.ok(record(submittedProjection), 'business projection must be an object');
  assert.ok(record(submittedTruth), 'business truth must be an object');
  const projection = submittedProjection;
  const truth = submittedTruth;
  const outcomes = rows(projection.outcomes, 'outcomes');
  for (const expected of rows(truth.required_outcomes, 'required_outcomes')) {
    assert.ok(outcomes.some((actual) => actual.key === expected.key
      && actual.subject === expected.subject
      && actual.condition === expected.condition
      && actual.result === expected.result), `missing or wrong outcome: ${expected.key}`);
  }

  const columnRules = rows(projection.column_rules, 'column_rules');
  for (const column of truth.column_rules.columns) {
    for (const [branch, result] of [
      ['selected', truth.column_rules.selected_result],
      ['otherwise', truth.column_rules.otherwise_result]
    ]) {
      assert.ok(columnRules.some((actual) => actual.column === column
        && actual.branch === branch && actual.result === result),
      `missing ${branch} branch for column ${column}`);
    }
  }

  const scores = rows(projection.score_instances, 'score_instances');
  for (const expected of rows(truth.required_score_instances, 'required_score_instances')) {
    assert.ok(scores.some((actual) => actual.subject === 'star_level'
      && actual.value === expected.value && actual.expected === expected.expected),
    `missing or wrong required score instance: ${expected.value}`);
  }
  assert.equal(scores.some((actual) => actual.subject === 'star_level'
    && (actual.value < 1 || actual.value > 6)), false,
  'out-of-scope star_level must not gain a formal expected result');

  const sources = rows(projection.source_instances, 'source_instances');
  assert.ok(sources.some((actual) => actual.subject === 'source'
    && actual.value === 23 && actual.expected === '打车去过'), 'source=23 mapping is missing or wrong');
  assert.ok(sources.some((actual) => actual.subject === 'source'
    && actual.value === 24 && truth.allowed_source_24_labels.includes(actual.expected)),
  'source=24 mapping is missing or outside the exact allowed label set');

  const authorityRows = rows(projection.authority, 'authority');
  assert.ok(authorityRows.some((actual) => actual.role === '管理员'
    && actual.resource === '负向体验报表' && actual.result === '允许查看'),
  'administrator permission outcome is missing');
  assert.ok(authorityRows.some((actual) => actual.role === '普通用户'
    && actual.resource === '负向体验报表' && actual.result === '无访问权限'),
  'ordinary-user denial outcome is missing');

  const official = rows(projection.official_outputs, 'official_outputs');
  assert.deepEqual(official.map((item) => item.format).sort(), ['csv', 'json', 'markdown']);
  const canonical = official[0]?.semantic_projection;
  assert.ok(record(canonical), 'official semantic projection is required');
  for (const item of official) {
    assert.deepEqual(item.semantic_projection, canonical,
      `${item.format} is not a complete projection of the canonical result`);
  }

  const serialized = JSON.stringify(projection);
  for (const invention of truth.must_not_invent) {
    assert.equal(serialized.includes(invention), false, `unsupported formal result invented: ${invention}`);
  }
}

/** @param {Record<string, any>} truth */
export function validFCityProjection(truth) {
  const semanticProjection = {
    conditions: ['城市指南评价', '其他业务线', '存在符合条件的记录'],
    values: truth.required_score_instances,
    permissions: ['管理员允许查看负向体验报表', '普通用户无访问权限']
  };
  return {
    outcomes: structuredClone(truth.required_outcomes),
    column_rules: truth.column_rules.columns.flatMap((column) => [
      { column, branch: 'selected', result: truth.column_rules.selected_result },
      { column, branch: 'otherwise', result: truth.column_rules.otherwise_result }
    ]),
    score_instances: truth.required_score_instances.map((item) => ({
      subject: 'star_level', ...item
    })),
    source_instances: truth.source_instances.map((item) => ({ subject: 'source', ...item })),
    authority: [
      { role: '管理员', resource: '负向体验报表', result: '允许查看' },
      { role: '普通用户', resource: '负向体验报表', result: '无访问权限' }
    ],
    official_outputs: ['json', 'markdown', 'csv'].map((format) => ({
      format, semantic_projection: structuredClone(semanticProjection)
    }))
  };
}

/**
 * Project independent acceptance rows from the actual canonical bundle and
 * its two official text renderings. No expected F-CITY answer is accepted as
 * input here; missing Cases or missing rendered fields disappear and are then
 * rejected by assertFCityBusinessProjection.
 * @param {Record<string, any>} bundle
 * @param {{json:string,markdown:string,csv:string}} outputs
 */
export function projectFCityCanonicalDelivery(bundle, outputs) {
  const cases = rows(bundle.cases, 'canonical cases');
  /** @param {string} factId */
  const byFact = (factId) => cases.filter((item) => Array.isArray(item.fact_ids)
    && item.fact_ids.includes(factId));
  /** @param {Record<string, any>} item */
  const condition = (item) => item.data_conditions?.[0]?.description;
  /** @param {Record<string, any>} item */
  const expected = (item) => item.oracles?.[0]?.expected;
  const required = [
    ['permission.admin.negative_report', 'FACT-permission-admin', '负向体验报表'],
    ['permission.ordinary.negative_report', 'FACT-permission-ordinary', '负向体验报表'],
    ['permission.authorized.content_management', 'FACT-permission-content', '内容管理'],
    ['query.selected_business_line', 'FACT-query-selected', '查询条件'],
    ['query.existing_records', 'FACT-query-existing', '查询结果']
  ].flatMap(([key, factId, subject]) => byFact(factId).map((item) => ({
    key, subject, condition: condition(item), result: expected(item)
  })));
  const columnRules = ['UID', '评分', '点赞数', 'IP'].flatMap((column) =>
    byFact(`FACT-column-${column}`).map((item) => ({
      column, branch: condition(item), result: expected(item)
    })));
  const scoreInstances = byFact('FACT-score').map((item) => ({
    subject: 'star_level',
    value: Number.parseInt(/^star_level=(\d+)$/u.exec(condition(item))?.[1] ?? '', 10),
    expected: expected(item)
  }));
  const sourceInstances = byFact('FACT-source').map((item) => ({
    subject: 'source',
    value: Number.parseInt(/^source=(\d+)$/u.exec(condition(item))?.[1] ?? '', 10),
    expected: expected(item)
  }));
  const authority = [
    ...byFact('FACT-permission-admin').map((item) => ({
      role: '管理员', resource: '负向体验报表', result: expected(item)
    })),
    ...byFact('FACT-permission-ordinary').map((item) => ({
      role: '普通用户', resource: '负向体验报表', result: expected(item)
    }))
  ];
  /** @param {string} text @param {'json'|'markdown'|'csv'} format */
  const renderedProjection = (text, format) => {
    const searchable = format === 'markdown'
      ? text.replaceAll('\\_', '_')
      : text;
    return ({
    cases: cases.flatMap((item) => {
      const tokens = [
        item.title,
        ...item.data_conditions.map((entry) => entry.description),
        ...item.steps.map((entry) => entry.action),
        ...item.oracles.map((entry) => entry.expected)
      ];
      return tokens.every((token) => searchable.includes(token)) ? [{
        fact_ids: [...item.fact_ids].sort(),
        title: item.title,
        conditions: item.data_conditions.map((entry) => entry.description),
        steps: item.steps.map((entry) => entry.action),
        expected: item.oracles.map((entry) => entry.expected)
      }] : [];
    })
    });
  };
  return {
    outcomes: required,
    column_rules: columnRules,
    score_instances: scoreInstances,
    source_instances: sourceInstances,
    authority,
    official_outputs: ['json', 'markdown', 'csv'].map((format) => ({
      format,
      semantic_projection: renderedProjection(outputs[format], format)
    }))
  };
}
