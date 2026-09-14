import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectTWiseVectors } from '../../src/obligations/combinatorial.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture() {
  return JSON.parse(await readFile(path.join(
    repositoryRoot, 'test/fixtures/views/combinatorial-selection.json'
  ), 'utf8'));
}

/** @param {unknown} value */
function scalarKey(value) {
  return `${value === null ? 'null' : typeof value}:${JSON.stringify(value)}`;
}

/** @param {string[]} names @param {number} size */
function indexCombinations(names, size) {
  /** @type {string[][]} */
  const result = [];
  /** @param {number} start @param {string[]} selected */
  function visit(start, selected) {
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index <= names.length - (size - selected.length); index += 1) {
      selected.push(names[index]);
      visit(index + 1, selected);
      selected.pop();
    }
  }
  visit(0, []);
  return result;
}

/** @param {Record<string, any>} values @param {string[]} names */
function tupleKey(values, names) {
  return JSON.stringify(names.map((name) => [name, scalarKey(values[name])]));
}

/** Independent brute-force oracle used only for small randomized tests. @param {any} parameters @param {any[]} constraints */
function allValidVectors(parameters, constraints) {
  const domains = [...parameters.domains].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  /** @type {Record<string, any>[]} */
  const vectors = [];
  /** @param {number} index @param {Record<string, any>} current */
  function visit(index, current) {
    if (index === domains.length) {
      const invalid = constraints.some((constraint) => constraint.forbidden.every(
        (/** @type {any} */ assignment) => scalarKey(current[assignment.parameter]) === scalarKey(assignment.value)
      ));
      if (!invalid) vectors.push({ ...current });
      return;
    }
    const domain = domains[index];
    for (const value of domain.values) {
      current[domain.name] = value;
      visit(index + 1, current);
    }
  }
  visit(0, {});
  return vectors;
}

/** @param {Record<string, any>[]} all @param {Record<string, any>[]} selected @param {number} strength */
function assertFullCoverage(all, selected, strength) {
  const names = Object.keys(all[0] ?? selected[0] ?? {}).sort();
  const dimensions = indexCombinations(names, strength);
  const validTuples = new Set(all.flatMap((vector) => dimensions.map((group) => tupleKey(vector, group))));
  const selectedTuples = new Set(selected.flatMap((vector) => dimensions.map((group) => tupleKey(vector, group))));
  assert.deepEqual([...validTuples].filter((key) => !selectedTuples.has(key)), []);
}

/** Independent materialized greedy reference, used only for bounded small models. @param {Record<string, any>[]} all @param {number} strength */
function referenceGreedyValues(all, strength) {
  const names = Object.keys(all[0] ?? {}).sort();
  const dimensions = indexCombinations(names, strength);
  const signature = (/** @type {Record<string, any>} */ vector) => JSON.stringify(
    names.map((name) => [name, scalarKey(vector[name])])
  );
  const candidates = [...all].sort((left, right) => {
    const leftSignature = signature(left);
    const rightSignature = signature(right);
    return leftSignature < rightSignature ? -1 : leftSignature > rightSignature ? 1 : 0;
  });
  const tuples = candidates.map((vector) => new Set(
    dimensions.map((group) => tupleKey(vector, group))
  ));
  const uncovered = new Set(tuples.flatMap((candidateTuples) => [...candidateTuples]));
  const remaining = new Set(candidates.map((_, index) => index));
  /** @type {Record<string, any>[]} */
  const selected = [];
  while (uncovered.size > 0) {
    let best = -1;
    let bestCount = -1;
    for (const index of remaining) {
      let count = 0;
      for (const tuple of tuples[index]) if (uncovered.has(tuple)) count += 1;
      if (count > bestCount) {
        best = index;
        bestCount = count;
      }
    }
    if (best < 0 || bestCount <= 0) throw new Error('reference cover cannot make progress');
    selected.push(candidates[best]);
    remaining.delete(best);
    for (const tuple of tuples[best]) uncovered.delete(tuple);
  }
  return selected;
}

// Break caught: greedy tie-breaking, constraint filtering, or Oracle propagation changes the hand-derived five-vector cover.
test('t-wise selection covers every valid pair with deterministic greedy vectors and independent Oracle mappings', async () => {
  const input = await fixture();

  const actual = selectTWiseVectors(input.parameters, input.strength, input.constraints, input.maxCandidates);

  assert.deepEqual(actual, {
    status: 'selected',
    vectors: [
      { values: { a: 0, b: 0, c: 0 }, required_oracle_refs: ['claim_oracle_000'] },
      { values: { a: 0, b: 1, c: 1 }, required_oracle_refs: ['claim_oracle_011'] },
      { values: { a: 1, b: 0, c: 1 }, required_oracle_refs: [] },
      { values: { a: 0, b: 1, c: 0 }, required_oracle_refs: [] },
      { values: { a: 1, b: 0, c: 0 }, required_oracle_refs: [] }
    ]
  });
  if (actual.status !== 'selected') throw new Error('hand-counted finite model must be selected');
  const all = allValidVectors(input.parameters, input.constraints);
  assert.equal(all.length, 6);
  assertFullCoverage(all, actual.vectors.map((vector) => vector.values), 2);
  assert.equal(actual.vectors.some((vector) => vector.values.a === 1 && vector.values.b === 1), false);
});

// Break caught: selector iteration order leaks parameter/domain/constraint/Oracle-map input order into canonical vectors.
test('t-wise selection is unchanged by parameter domain value constraint assignment and Oracle mapping order', async () => {
  const input = await fixture();
  const expected = selectTWiseVectors(input.parameters, input.strength, input.constraints, input.maxCandidates);
  const reordered = structuredClone(input);
  reordered.parameters.domains.reverse();
  reordered.parameters.domains.forEach((/** @type {any} */ domain) => domain.values.reverse());
  reordered.parameters.oracle_mappings.reverse();
  reordered.parameters.oracle_mappings.forEach((/** @type {any} */ mapping) => {
    mapping.assignments.reverse();
    mapping.required_oracle_refs.reverse();
  });
  reordered.constraints.reverse();
  reordered.constraints.forEach((/** @type {any} */ constraint) => constraint.forbidden.reverse());

  assert.deepEqual(selectTWiseVectors(
    reordered.parameters, reordered.strength, reordered.constraints, reordered.maxCandidates
  ), expected);
});

// Break caught: cap is applied to raw Cartesian size rather than streamed valid candidates, rejecting a heavily constrained finite model.
test('t-wise selection accepts a raw product above cap when partial forbidden pruning leaves at most maxCandidates valid vectors', () => {
  const values = Array.from({ length: 100 }, (_, index) => index);
  const constraints = ['a', 'b', 'c'].flatMap((parameter) => values.slice(1).map((value) => ({
    forbidden: [{ parameter, value }]
  })));
  const parameters = {
    interaction_risk: 'high',
    domains: ['a', 'b', 'c'].map((name) => ({ name, values })),
    oracle_mappings: []
  };

  const actual = selectTWiseVectors(parameters, 2, constraints, 1);

  assert.deepEqual(actual, {
    status: 'selected', vectors: [{ values: { a: 0, b: 0, c: 0 }, required_oracle_refs: [] }]
  });
});

// Break caught: candidate generation allocates or exhaustively scans a huge product, samples, or detects the resource cap later than the fourth valid vector.
test('t-wise selection blocks on the maxCandidates plus one valid vector without allocating the full Cartesian product', () => {
  const parameters = {
    interaction_risk: 'critical',
    domains: ['a', 'b', 'c'].map((name) => ({
      name, values: Array.from({ length: 200 }, (_, index) => index)
    })),
    oracle_mappings: []
  };
  const started = performance.now();

  const actual = selectTWiseVectors(parameters, 2, [], 3);
  const elapsed = performance.now() - started;

  assert.deepEqual(actual, {
    status: 'blocked', reason: 'max_candidates_exceeded', max_candidates: 3
  });
  assert.equal(elapsed < 500, true, `streaming cap detection took ${elapsed.toFixed(1)}ms`);
});

// Break caught: valid-candidate capping succeeds, but a second unbounded combination allocation occurs during tuple scoring.
test('t-wise selection scores high-strength tuples implicitly without materializing the dimension combination space', () => {
  const domainCount = 20;
  const parameters = {
    interaction_risk: 'high',
    domains: Array.from({ length: domainCount }, (_, index) => ({ name: `p${index}`, values: [0] })),
    oracle_mappings: []
  };
  const started = performance.now();

  const actual = selectTWiseVectors(parameters, 10, [], 1);
  const elapsed = performance.now() - started;

  assert.equal(actual.status, 'selected');
  if (actual.status === 'selected') assert.equal(actual.vectors.length, 1);
  assert.equal(elapsed < 250, true, `implicit tuple scoring took ${elapsed.toFixed(1)}ms`);
});

// Break caught: compact score state double-counts projections shared by multiple valid candidates or chooses a noncanonical first tie.
test('t-wise selection matches an independent materialized greedy oracle including empty-selection ties and duplicate projections', () => {
  const projectionParameters = {
    interaction_risk: 'medium',
    domains: Array.from({ length: 4 }, (_, index) => ({ name: `p${index}`, values: [0, 1] })),
    oracle_mappings: []
  };
  const projectionCandidates = allValidVectors(projectionParameters, []);
  assert.equal(new Set(projectionCandidates.map((vector) => tupleKey(vector, ['p0', 'p1']))).size, 4);
  assert.equal(projectionCandidates.length, 16);
  const projectionActual = selectTWiseVectors(projectionParameters, 2, [], 16);
  assert.equal(projectionActual.status, 'selected');
  if (projectionActual.status === 'selected') assert.deepEqual(
    projectionActual.vectors.map((vector) => vector.values),
    referenceGreedyValues(projectionCandidates, 2)
  );

  let randomState = 0x6eedcafe;
  const random = () => {
    randomState = (Math.imul(randomState, 1103515245) + 12345) >>> 0;
    return randomState / 0x100000000;
  };
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const domainCount = 3 + Math.floor(random() * 2);
    const domains = Array.from({ length: domainCount }, (_, index) => ({
      name: `p${index}`, values: [0, 1, 2].slice(0, 2 + Math.floor(random() * 2))
    }));
    const constraints = [];
    for (let index = 0; index < domainCount - 1; index += 1) {
      if (random() < 0.6) constraints.push({ forbidden: [
        { parameter: `p${index}`, value: Math.floor(random() * domains[index].values.length) },
        { parameter: `p${index + 1}`, value: Math.floor(random() * domains[index + 1].values.length) }
      ] });
    }
    const parameters = { interaction_risk: 'medium', domains, oracle_mappings: [] };
    const all = allValidVectors(parameters, constraints);
    if (all.length === 0) continue;
    const strength = 2 + Math.floor(random() * (domainCount - 1));

    const actual = selectTWiseVectors(parameters, strength, constraints, 200);

    assert.equal(actual.status, 'selected', `iteration ${iteration}`);
    if (actual.status !== 'selected') continue;
    assert.deepEqual(
      actual.vectors.map((vector) => vector.values), referenceGreedyValues(all, strength),
      `iteration ${iteration}`
    );
    assert.deepEqual(actual.vectors[0].values, referenceGreedyValues(all, strength)[0]);
  }
});

// Break caught: 32-bit bitwise masks wrap after the thirty-first selected vector and falsely mark full-strength tuples covered.
test('t-wise selection keeps exact match masks when the selected set crosses 31 and 32 bits', () => {
  const parameters = {
    interaction_risk: 'critical',
    domains: Array.from({ length: 6 }, (_, index) => ({ name: `p${index}`, values: [0, 1] })),
    oracle_mappings: []
  };

  const actual = selectTWiseVectors(parameters, 6, [], 64);

  assert.equal(actual.status, 'selected');
  if (actual.status !== 'selected') return;
  assert.equal(actual.vectors.length, 64);
  assert.equal(new Set(actual.vectors.map((vector) => JSON.stringify(vector.values))).size, 64);
  assert.deepEqual(
    actual.vectors.map((vector) => vector.values),
    referenceGreedyValues(allValidVectors(parameters, []), 6)
  );
});

// Break caught: an unsatisfiable closed constraint model is mistaken for an empty successful sample.
test('t-wise selection returns an explicit no-valid-candidates Blocked result for unsatisfiable constraints', () => {
  const parameters = {
    interaction_risk: 'medium',
    domains: [
      { name: 'a', values: [0, 1] }, { name: 'b', values: [0, 1] }, { name: 'c', values: [0, 1] }
    ],
    oracle_mappings: []
  };
  const constraints = [0, 1].map((value) => ({ forbidden: [{ parameter: 'a', value }] }));

  assert.deepEqual(selectTWiseVectors(parameters, 2, constraints, 8), {
    status: 'blocked', reason: 'no_valid_candidates', max_candidates: 8
  });
});

// Break caught: executable expressions, open object values, duplicate values, unsafe numbers, or malformed enablement enter the finite-domain engine.
test('t-wise selection enforces the closed finite-domain and declarative-constraint contract without eval', () => {
  const base = {
    interaction_risk: 'high',
    domains: [
      { name: 'a', values: [0, 1] }, { name: 'b', values: [false, true] }, { name: 'c', values: [null, '值'] }
    ],
    oracle_mappings: []
  };
  const invalidParameters = [
    { ...base, interaction_risk: undefined },
    { ...base, domains: base.domains.slice(0, 2) },
    { ...base, domains: [...base.domains, { name: 'a', values: [2] }] },
    { ...base, domains: [{ name: 'a', values: [] }, ...base.domains.slice(1)] },
    { ...base, domains: [{ name: 'a', values: [0, -0] }, ...base.domains.slice(1)] },
    { ...base, domains: [{ name: 'a', values: [Number.NaN] }, ...base.domains.slice(1)] },
    { ...base, domains: [{ name: 'a', values: [Number.POSITIVE_INFINITY] }, ...base.domains.slice(1)] },
    { ...base, domains: [{ name: 'a', values: [{}] }, ...base.domains.slice(1)] },
    { ...base, domains: [{ name: 'a', values: [[]] }, ...base.domains.slice(1)] },
    { ...base, extra: true }
  ];
  for (const parameters of invalidParameters) assert.throws(
    () => selectTWiseVectors(parameters, 2, [], 8), TypeError
  );
  for (const strength of [1, 1.5, 4]) assert.throws(
    () => selectTWiseVectors(base, strength, [], 8), TypeError
  );
  for (const maxCandidates of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(
    () => selectTWiseVectors(base, 2, [], maxCandidates), TypeError
  );
  assert.throws(() => selectTWiseVectors(base, 2, undefined, 8), TypeError);
  assert.throws(() => selectTWiseVectors(base, 2, [{
    forbidden: [{ parameter: 'missing', value: 0 }]
  }], 8), TypeError);
  assert.throws(() => selectTWiseVectors(base, 2, [{
    forbidden: [{ parameter: 'a', value: 99 }]
  }], 8), TypeError);
  const taskGlobal = /** @type {any} */ (globalThis);
  taskGlobal.__task6ConstraintExecuted = false;
  assert.throws(() => selectTWiseVectors(base, 2, [{
    forbidden: [{ parameter: 'a', value: 0 }],
    expression: 'globalThis.__task6ConstraintExecuted = true'
  }], 8), TypeError);
  assert.equal(taskGlobal.__task6ConstraintExecuted, false);
  delete taskGlobal.__task6ConstraintExecuted;
});

// Break caught: sparse direct-input arrays bypass map/forEach validation and leak undefined into selection or sorting.
test('t-wise selection rejects holes on every exported array surface', () => {
  const base = {
    interaction_risk: 'high',
    domains: [
      { name: 'a', values: [0, 1] }, { name: 'b', values: [0, 1] }, { name: 'c', values: [0, 1] }
    ],
    oracle_mappings: []
  };
  /** @param {(input: any) => void} mutate @param {any[]} [constraints] */
  function rejectsHole(mutate, constraints = []) {
    const parameters = structuredClone(base);
    mutate(parameters);
    assert.throws(() => selectTWiseVectors(parameters, 2, constraints, 8), /dense array/);
  }

  rejectsHole((input) => { delete input.domains[1]; });
  rejectsHole((input) => { delete input.domains[0].values[1]; });
  rejectsHole((input) => { input.oracle_mappings = new Array(1); });
  const sparseConstraints = new Array(1);
  assert.throws(() => selectTWiseVectors(base, 2, sparseConstraints, 8), /dense array/);
  const sparseForbidden = [{ forbidden: [
    { parameter: 'a', value: 0 }, { parameter: 'b', value: 0 }
  ] }];
  delete sparseForbidden[0].forbidden[1];
  assert.throws(() => selectTWiseVectors(base, 2, sparseForbidden, 8), /dense array/);

  const sparseAssignments = /** @type {any} */ (structuredClone(base));
  sparseAssignments.oracle_mappings = [{
    assignments: [
      { parameter: 'a', value: 0 }, { parameter: 'b', value: 0 }, { parameter: 'c', value: 0 }
    ],
    required_oracle_refs: ['claim_000']
  }];
  delete sparseAssignments.oracle_mappings[0].assignments[1];
  assert.throws(() => selectTWiseVectors(sparseAssignments, 2, [], 8), /dense array/);

  const sparseOracleRefs = /** @type {any} */ (structuredClone(base));
  sparseOracleRefs.oracle_mappings = [{
    assignments: [
      { parameter: 'a', value: 0 }, { parameter: 'b', value: 0 }, { parameter: 'c', value: 0 }
    ],
    required_oracle_refs: ['claim_000', 'claim_backup']
  }];
  delete sparseOracleRefs.oracle_mappings[0].required_oracle_refs[0];
  assert.throws(() => selectTWiseVectors(sparseOracleRefs, 2, [], 8), /dense array/);
});

// Break caught: recursive Cartesian traversal overflows the JavaScript call stack even for one trivial valid vector.
test('t-wise selection iteratively enumerates twelve thousand singleton domains', () => {
  const domainCount = 12_000;
  const parameters = {
    interaction_risk: 'low',
    domains: Array.from({ length: domainCount }, (_, index) => ({
      name: `p${String(index).padStart(5, '0')}`, values: [0]
    })),
    oracle_mappings: []
  };
  const started = performance.now();

  const actual = selectTWiseVectors(parameters, 2, [], 1);
  const elapsed = performance.now() - started;

  assert.equal(actual.status, 'selected');
  if (actual.status === 'selected') assert.equal(Object.keys(actual.vectors[0].values).length, domainCount);
  assert.equal(elapsed < 2_000, true, `iterative singleton enumeration took ${elapsed.toFixed(1)}ms`);
});

// Break caught: unary impossibility on the final search domain exhausts a large prefix product before discovering no vector.
test('t-wise selection preprocesses unary exclusions before searching a large unsatisfiable product', () => {
  const parameters = {
    interaction_risk: 'high',
    domains: [
      ...Array.from({ length: 23 }, (_, index) => ({
        name: `p${String(index).padStart(2, '0')}`, values: [0, 1]
      })),
      { name: 'z_final', values: [0, 1] }
    ],
    oracle_mappings: []
  };
  const constraints = [0, 1].map((value) => ({
    forbidden: [{ parameter: 'z_final', value }]
  }));
  const started = performance.now();

  const actual = selectTWiseVectors(parameters, 2, constraints, 1);
  const elapsed = performance.now() - started;

  assert.deepEqual(actual, {
    status: 'blocked', reason: 'no_valid_candidates', max_candidates: 1
  });
  assert.equal(elapsed < 500, true, `unary impossibility detection took ${elapsed.toFixed(1)}ms`);
});

// Break caught: equal-cardinality search falls back to names and explores an exponential unconstrained prefix before a final impossible pair.
test('t-wise selection prioritizes constrained domains before a twenty-four-domain impossible pair', () => {
  const parameters = {
    interaction_risk: 'high',
    domains: [
      ...Array.from({ length: 22 }, (_, index) => ({
        name: `p${String(index).padStart(2, '0')}`, values: [0, 1]
      })),
      { name: 'z1', values: [0, 1] }, { name: 'z2', values: [0, 1] }
    ],
    oracle_mappings: []
  };
  const constraints = [0, 1].flatMap((left) => [0, 1].map((right) => ({ forbidden: [
    { parameter: 'z1', value: left }, { parameter: 'z2', value: right }
  ] })));
  const started = performance.now();

  const actual = selectTWiseVectors(parameters, 2, constraints, 1);
  const elapsed = performance.now() - started;

  assert.deepEqual(actual, {
    status: 'blocked', reason: 'no_valid_candidates', max_candidates: 1
  });
  assert.equal(elapsed < 500, true, `fail-first pair pruning took ${elapsed.toFixed(1)}ms`);
});

// Break caught: exact DP repeats identical match-mask transitions per domain and becomes impractical above 64 selected vectors.
test('t-wise selection compresses repeated BigInt match masks with exact binomial multiplicities', () => {
  /** @param {number} domainCount @param {number} binaryCount @param {number} strength */
  function run(domainCount, binaryCount, strength) {
    const parameters = {
      interaction_risk: 'critical',
      domains: Array.from({ length: domainCount }, (_, index) => ({
        name: `p${String(index).padStart(2, '0')}`, values: index < binaryCount ? [0, 1] : [0]
      })),
      oracle_mappings: []
    };
    const started = performance.now();
    const actual = selectTWiseVectors(parameters, strength, [], 2 ** binaryCount);
    return { actual, elapsed: performance.now() - started };
  }

  const above64 = run(30, 7, 15);
  assert.equal(above64.actual.status, 'selected');
  if (above64.actual.status === 'selected') assert.equal(above64.actual.vectors.length, 128);
  assert.equal(above64.elapsed < 2_500, true, `30d/128 exact selection took ${above64.elapsed.toFixed(1)}ms`);

  const wide = run(50, 6, 25);
  assert.equal(wide.actual.status, 'selected');
  if (wide.actual.status === 'selected') assert.equal(wide.actual.vectors.length, 64);
  assert.equal(wide.elapsed < 2_500, true, `50d/64 exact selection took ${wide.elapsed.toFixed(1)}ms`);
});

// Break caught: Oracle mappings are partial/non-independent, inferred from neighbors, or allowed to target forbidden/unrelated vectors.
test('t-wise selection validates full vector Oracle mappings and leaves every omitted vector Oracle-empty', async () => {
  const input = await fixture();
  const invalid = structuredClone(input.parameters);
  invalid.oracle_mappings.push({
    assignments: [{ parameter: 'a', value: 0 }, { parameter: 'b', value: 0 }],
    required_oracle_refs: ['claim_partial']
  });
  assert.throws(() => selectTWiseVectors(invalid, 2, input.constraints, 8), TypeError);

  const forbidden = structuredClone(input.parameters);
  forbidden.oracle_mappings.push({
    assignments: [
      { parameter: 'a', value: 1 }, { parameter: 'b', value: 1 }, { parameter: 'c', value: 0 }
    ],
    required_oracle_refs: ['claim_forbidden']
  });
  assert.throws(() => selectTWiseVectors(forbidden, 2, input.constraints, 8), TypeError);

  const actual = selectTWiseVectors(input.parameters, 2, input.constraints, 8);
  assert.equal(actual.status, 'selected');
  if (actual.status === 'selected') {
    assert.equal(actual.vectors.filter((vector) => vector.required_oracle_refs.length > 0).length, 2);
    assert.equal(actual.vectors.filter((vector) => vector.required_oracle_refs.length === 0).length, 3);
  }
});

// Break caught: Unicode is locale-sorted or randomized tuple coverage misses a valid pair/triple under closed constraints.
test('t-wise selection uses Unicode code-point order and passes an independent randomized t-tuple coverage oracle', () => {
  const unicode = {
    interaction_risk: 'low',
    domains: [
      { name: 'p_𐀀', values: ['𐀀', ''] },
      { name: 'a', values: [1, 0] },
      { name: 'p_', values: ['乙', '甲'] }
    ],
    oracle_mappings: []
  };
  const unicodeResult = selectTWiseVectors(unicode, 3, [], 8);
  assert.equal(unicodeResult.status, 'selected');
  if (unicodeResult.status === 'selected') {
    assert.deepEqual(Object.keys(unicodeResult.vectors[0].values), ['a', 'p_', 'p_𐀀']);
    assert.equal(unicodeResult.vectors.length, 8);
  }

  let randomState = 0x5eed1234;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 0x100000000;
  };
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const domainCount = 3 + Math.floor(random() * 2);
    const domains = Array.from({ length: domainCount }, (_, index) => ({
      name: `p${index}`, values: [0, 1, 2].slice(0, 2 + Math.floor(random() * 2))
    }));
    const constraints = [];
    for (let index = 0; index < domainCount - 1; index += 1) {
      if (random() < 0.55) constraints.push({ forbidden: [
        { parameter: `p${index}`, value: Math.floor(random() * domains[index].values.length) },
        { parameter: `p${index + 1}`, value: Math.floor(random() * domains[index + 1].values.length) }
      ] });
    }
    const parameters = { interaction_risk: 'medium', domains, oracle_mappings: [] };
    const all = allValidVectors(parameters, constraints);
    if (all.length === 0) continue;
    const strength = 2 + Math.floor(random() * (domainCount - 1));
    const result = selectTWiseVectors(parameters, strength, constraints, 200);
    assert.equal(result.status, 'selected', `iteration ${iteration}`);
    if (result.status !== 'selected') continue;
    assertFullCoverage(all, result.vectors.map((vector) => vector.values), strength);
    const validSignatures = new Set(all.map((vector) => JSON.stringify(vector)));
    assert.equal(result.vectors.every((vector) => validSignatures.has(JSON.stringify(vector.values))), true);
  }
});
