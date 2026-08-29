import { compareCodePoints, isObject } from './registry.mjs';

const RISK_LEVELS = new Set(['critical', 'high', 'medium', 'low']);
const PARAMETER_KEYS = ['domains', 'interaction_risk', 'oracle_mappings'];
const DOMAIN_KEYS = ['name', 'values'];
const CONSTRAINT_KEYS = ['forbidden'];
const ASSIGNMENT_KEYS = ['parameter', 'value'];
const ORACLE_MAPPING_KEYS = ['assignments', 'required_oracle_refs'];

/** @typedef {null | boolean | number | string} JsonScalar */
/** @typedef {{name: string, values: JsonScalar[]}} Domain */
/** @typedef {{parameter: string, value: JsonScalar}} Assignment */
/** @typedef {{forbidden: Assignment[]}} Constraint */
/** @typedef {{values: Record<string, JsonScalar>, required_oracle_refs: string[]}} SelectedVector */
/** @typedef {{status: 'selected', vectors: SelectedVector[]} | {status: 'blocked', reason: 'max_candidates_exceeded' | 'no_valid_candidates', max_candidates: number}} SelectionResult */

/** @param {Record<string, unknown>} object @param {string[]} expected @param {string} label */
function assertExactKeys(object, expected, label) {
  const actual = Object.keys(object).sort(compareCodePoints);
  const wanted = [...expected].sort(compareCodePoints);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} must have only ${wanted.join(', ')}`);
  }
}

/** @param {unknown} value @returns {value is JsonScalar} */
function isJsonScalar(value) {
  return value === null || typeof value === 'boolean' || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value));
}

/** @param {JsonScalar} value */
function scalarKey(value) {
  if (value === null) return 'null:null';
  return `${typeof value}:${JSON.stringify(value)}`;
}

/** @param {JsonScalar} left @param {JsonScalar} right */
function compareScalars(left, right) {
  return compareCodePoints(scalarKey(left), scalarKey(right));
}

/** @param {unknown} value @param {string} label @returns {JsonScalar} */
function requireScalar(value, label) {
  if (!isJsonScalar(value)) throw new TypeError(`${label} must be a finite JSON scalar`);
  return value;
}

/** @param {unknown} value @param {string} label */
function requireNonblankString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a nonblank string`);
  }
  return value;
}

/** @param {unknown} parameters @returns {{domains: Domain[], oracleMappings: Record<string, unknown>[]}} */
function validateParameters(parameters) {
  if (!isObject(parameters)) throw new TypeError('parameters must be an object');
  assertExactKeys(parameters, PARAMETER_KEYS, 'parameters');
  if (typeof parameters.interaction_risk !== 'string'
    || !RISK_LEVELS.has(parameters.interaction_risk)) {
    throw new TypeError('parameters.interaction_risk must be explicit');
  }
  if (!Array.isArray(parameters.domains) || parameters.domains.length < 3) {
    throw new TypeError('t-wise selection requires at least three domains');
  }
  /** @type {Domain[]} */
  const domains = [];
  const names = new Set();
  for (const [index, rawDomain] of parameters.domains.entries()) {
    if (!isObject(rawDomain)) throw new TypeError(`domain ${index} must be an object`);
    assertExactKeys(rawDomain, DOMAIN_KEYS, `domain ${index}`);
    const name = requireNonblankString(rawDomain.name, `domain ${index} name`);
    if (names.has(name)) throw new TypeError(`duplicate domain name "${name}"`);
    names.add(name);
    if (!Array.isArray(rawDomain.values) || rawDomain.values.length === 0) {
      throw new TypeError(`domain "${name}" must have a nonempty finite value array`);
    }
    const values = rawDomain.values.map((value, valueIndex) => requireScalar(
      value, `domain "${name}" value ${valueIndex}`
    ));
    const valueKeys = new Set();
    for (const value of values) {
      const key = scalarKey(value);
      if (valueKeys.has(key)) throw new TypeError(`domain "${name}" has duplicate values`);
      valueKeys.add(key);
    }
    domains.push({ name, values: [...values].sort(compareScalars) });
  }
  domains.sort((left, right) => compareCodePoints(left.name, right.name));
  if (!Array.isArray(parameters.oracle_mappings)) {
    throw new TypeError('parameters.oracle_mappings must be an array');
  }
  return { domains, oracleMappings: parameters.oracle_mappings };
}

/**
 * @param {unknown} raw
 * @param {Map<string, Map<string, JsonScalar>>} valuesByDomain
 * @param {string} label
 * @returns {Assignment[]}
 */
function validateAssignments(raw, valuesByDomain, label) {
  if (!Array.isArray(raw) || raw.length === 0) throw new TypeError(`${label} must be nonempty`);
  /** @type {Assignment[]} */
  const assignments = [];
  const assigned = new Set();
  for (const [index, rawAssignment] of raw.entries()) {
    if (!isObject(rawAssignment)) throw new TypeError(`${label} assignment ${index} must be an object`);
    assertExactKeys(rawAssignment, ASSIGNMENT_KEYS, `${label} assignment ${index}`);
    const parameter = requireNonblankString(
      rawAssignment.parameter, `${label} assignment ${index} parameter`
    );
    if (assigned.has(parameter)) throw new TypeError(`${label} repeats parameter "${parameter}"`);
    assigned.add(parameter);
    const domainValues = valuesByDomain.get(parameter);
    if (!domainValues) throw new TypeError(`${label} names unknown parameter "${parameter}"`);
    const value = requireScalar(rawAssignment.value, `${label} assignment ${index} value`);
    if (!domainValues.has(scalarKey(value))) {
      throw new TypeError(`${label} value is outside domain "${parameter}"`);
    }
    assignments.push({ parameter, value });
  }
  return assignments.sort((left, right) => compareCodePoints(left.parameter, right.parameter));
}

/** @param {Assignment[]} assignments */
function assignmentKey(assignments) {
  return JSON.stringify(assignments.map(({ parameter, value }) => [parameter, scalarKey(value)]));
}

/**
 * @param {unknown} constraints
 * @param {Map<string, Map<string, JsonScalar>>} valuesByDomain
 * @returns {Constraint[]}
 */
function validateConstraints(constraints, valuesByDomain) {
  if (!Array.isArray(constraints)) throw new TypeError('constraints must be an explicit array');
  /** @type {Constraint[]} */
  const normalized = [];
  const seen = new Set();
  for (const [index, rawConstraint] of constraints.entries()) {
    if (!isObject(rawConstraint)) throw new TypeError(`constraint ${index} must be an object`);
    assertExactKeys(rawConstraint, CONSTRAINT_KEYS, `constraint ${index}`);
    const forbidden = validateAssignments(rawConstraint.forbidden, valuesByDomain, `constraint ${index}`);
    const key = assignmentKey(forbidden);
    if (seen.has(key)) throw new TypeError('duplicate forbidden constraint');
    seen.add(key);
    normalized.push({ forbidden });
  }
  return normalized.sort((left, right) => compareCodePoints(
    assignmentKey(left.forbidden), assignmentKey(right.forbidden)
  ));
}

/** @param {Record<string, JsonScalar>} values @param {string[]} domainNames */
function vectorKey(values, domainNames) {
  return JSON.stringify(domainNames.map((name) => [name, scalarKey(values[name])]));
}

/** @param {Map<string, JsonScalar>} assigned @param {Constraint[]} constraints */
function violatesConstraint(assigned, constraints) {
  return constraints.some(({ forbidden }) => forbidden.every(({ parameter, value }) => (
    assigned.has(parameter) && scalarKey(/** @type {JsonScalar} */ (assigned.get(parameter))) === scalarKey(value)
  )));
}

/**
 * @param {Domain[]} domains
 * @param {Constraint[]} constraints
 * @param {number} maxCandidates
 */
function enumerateValidCandidates(domains, constraints, maxCandidates) {
  /** @type {Record<string, JsonScalar>[]} */
  const candidates = [];
  const assigned = new Map();
  let exceeded = false;

  /** @param {number} index */
  function visit(index) {
    if (exceeded) return;
    if (index === domains.length) {
      candidates.push(Object.fromEntries(assigned));
      exceeded = candidates.length > maxCandidates;
      return;
    }
    const domain = domains[index];
    for (const value of domain.values) {
      assigned.set(domain.name, value);
      if (!violatesConstraint(assigned, constraints)) visit(index + 1);
      assigned.delete(domain.name);
      if (exceeded) return;
    }
  }
  visit(0);
  return exceeded ? null : candidates;
}

/**
 * Count a candidate's uncovered t-tuples without constructing the C(n,t) tuple
 * universe. For each domain, a bit marks each selected vector matching the
 * candidate there. A chosen domain subset is covered exactly when the
 * intersection of its match masks is nonzero.
 * @param {Record<string, JsonScalar>} candidate
 * @param {Record<string, JsonScalar>[]} candidates
 * @param {number[]} selectedIndexes
 * @param {string[]} domainNames
 * @param {number} strength
 */
function uncoveredTupleCount(candidate, candidates, selectedIndexes, domainNames, strength) {
  if (selectedIndexes.length === 0) return 1n;
  const allSelected = (1n << BigInt(selectedIndexes.length)) - 1n;
  /** @type {Map<bigint, bigint>[]} */
  const countsBySize = Array.from({ length: strength + 1 }, () => new Map());
  countsBySize[0].set(allSelected, 1n);
  let visitedDomains = 0;
  for (const domainName of domainNames) {
    let matchingSelected = 0n;
    for (const [position, selectedIndex] of selectedIndexes.entries()) {
      if (scalarKey(candidate[domainName]) === scalarKey(candidates[selectedIndex][domainName])) {
        matchingSelected |= 1n << BigInt(position);
      }
    }
    const maximumSize = Math.min(strength, visitedDomains + 1);
    for (let size = maximumSize; size >= 1; size -= 1) {
      for (const [priorMask, count] of countsBySize[size - 1]) {
        const nextMask = priorMask & matchingSelected;
        countsBySize[size].set(nextMask, (countsBySize[size].get(nextMask) ?? 0n) + count);
      }
    }
    visitedDomains += 1;
  }
  return countsBySize[strength].get(0n) ?? 0n;
}

/**
 * @param {Record<string, unknown>[]} rawMappings
 * @param {Map<string, Map<string, JsonScalar>>} valuesByDomain
 * @param {string[]} domainNames
 * @param {Constraint[]} constraints
 */
function validateOracleMappings(rawMappings, valuesByDomain, domainNames, constraints) {
  /** @type {Map<string, string[]>} */
  const result = new Map();
  for (const [index, rawMapping] of rawMappings.entries()) {
    if (!isObject(rawMapping)) throw new TypeError(`Oracle mapping ${index} must be an object`);
    assertExactKeys(rawMapping, ORACLE_MAPPING_KEYS, `Oracle mapping ${index}`);
    const assignments = validateAssignments(
      rawMapping.assignments, valuesByDomain, `Oracle mapping ${index}`
    );
    if (assignments.length !== domainNames.length
      || assignments.some(({ parameter }, assignmentIndex) => parameter !== domainNames[assignmentIndex])) {
      throw new TypeError(`Oracle mapping ${index} must name every parameter exactly once`);
    }
    if (!Array.isArray(rawMapping.required_oracle_refs)) {
      throw new TypeError(`Oracle mapping ${index} required_oracle_refs must be an array`);
    }
    const refs = rawMapping.required_oracle_refs.map((ref, refIndex) => requireNonblankString(
      ref, `Oracle mapping ${index} ref ${refIndex}`
    ));
    if (new Set(refs).size !== refs.length) throw new TypeError(`Oracle mapping ${index} repeats an Oracle ref`);
    const assigned = new Map(assignments.map(({ parameter, value }) => [parameter, value]));
    if (violatesConstraint(assigned, constraints)) {
      throw new TypeError(`Oracle mapping ${index} targets a forbidden vector`);
    }
    const values = Object.fromEntries(assignments.map(({ parameter, value }) => [parameter, value]));
    const key = vectorKey(values, domainNames);
    if (result.has(key)) throw new TypeError('duplicate Oracle vector mapping');
    result.set(key, [...refs].sort(compareCodePoints));
  }
  return result;
}

/**
 * Select a deterministic greedy t-wise cover from every valid finite candidate.
 * The cap counts valid candidates: raw Cartesian products are streamed and never allocated.
 * @param {unknown} parameters
 * @param {unknown} strength
 * @param {unknown} constraints
 * @param {unknown} maxCandidates
 * @returns {SelectionResult}
 */
export function selectTWiseVectors(parameters, strength, constraints, maxCandidates) {
  const { domains, oracleMappings } = validateParameters(parameters);
  if (!Number.isInteger(strength) || Number(strength) < 2 || Number(strength) > domains.length) {
    throw new TypeError('strength must be an integer from 2 through the domain count');
  }
  if (!Number.isSafeInteger(maxCandidates) || Number(maxCandidates) <= 0) {
    throw new TypeError('maxCandidates must be a positive safe integer');
  }
  const valuesByDomain = new Map(domains.map((domain) => [
    domain.name, new Map(domain.values.map((value) => [scalarKey(value), value]))
  ]));
  const normalizedConstraints = validateConstraints(constraints, valuesByDomain);
  const domainNames = domains.map(({ name }) => name);
  const oracleRefsByVector = validateOracleMappings(
    oracleMappings, valuesByDomain, domainNames, normalizedConstraints
  );
  const candidates = enumerateValidCandidates(domains, normalizedConstraints, Number(maxCandidates));
  if (candidates === null) return {
    status: 'blocked', reason: 'max_candidates_exceeded', max_candidates: Number(maxCandidates)
  };
  if (candidates.length === 0) return {
    status: 'blocked', reason: 'no_valid_candidates', max_candidates: Number(maxCandidates)
  };

  const remaining = new Set(candidates.map((_, index) => index));
  /** @type {number[]} */
  const selectedIndexes = [];
  while (remaining.size > 0) {
    let bestIndex = -1;
    let bestCount = -1n;
    let bestSignature = '';
    for (const index of remaining) {
      const count = uncoveredTupleCount(
        candidates[index], candidates, selectedIndexes, domainNames, Number(strength)
      );
      const signature = vectorKey(candidates[index], domainNames);
      if (count > bestCount || (count === bestCount
        && (bestIndex < 0 || compareCodePoints(signature, bestSignature) < 0))) {
        bestIndex = index;
        bestCount = count;
        bestSignature = signature;
      }
    }
    if (bestIndex < 0 || bestCount <= 0n) break;
    selectedIndexes.push(bestIndex);
    remaining.delete(bestIndex);
  }

  return {
    status: 'selected',
    vectors: selectedIndexes.map((index) => {
      const values = { ...candidates[index] };
      return {
        values,
        required_oracle_refs: [...(oracleRefsByVector.get(vectorKey(values, domainNames)) ?? [])]
      };
    })
  };
}
