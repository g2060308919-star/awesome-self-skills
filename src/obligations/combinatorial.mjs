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

/** @param {unknown} value @param {string} label @param {number} [minimumLength] */
function requireDenseArray(value, label, minimumLength = 0) {
  if (!Array.isArray(value) || value.length < minimumLength) {
    throw new TypeError(`${label} must be a dense array${minimumLength > 0 ? ` of length at least ${minimumLength}` : ''}`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must be a dense array`);
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
  const rawDomains = requireDenseArray(parameters.domains, 'parameters.domains', 3);
  /** @type {Domain[]} */
  const domains = [];
  const names = new Set();
  for (let index = 0; index < rawDomains.length; index += 1) {
    const rawDomain = rawDomains[index];
    if (!isObject(rawDomain)) throw new TypeError(`domain ${index} must be an object`);
    assertExactKeys(rawDomain, DOMAIN_KEYS, `domain ${index}`);
    const name = requireNonblankString(rawDomain.name, `domain ${index} name`);
    if (names.has(name)) throw new TypeError(`duplicate domain name "${name}"`);
    names.add(name);
    const rawValues = requireDenseArray(rawDomain.values, `domain "${name}" values`, 1);
    const values = [];
    for (let valueIndex = 0; valueIndex < rawValues.length; valueIndex += 1) {
      values.push(requireScalar(rawValues[valueIndex], `domain "${name}" value ${valueIndex}`));
    }
    const valueKeys = new Set();
    for (const value of values) {
      const key = scalarKey(value);
      if (valueKeys.has(key)) throw new TypeError(`domain "${name}" has duplicate values`);
      valueKeys.add(key);
    }
    domains.push({ name, values: [...values].sort(compareScalars) });
  }
  domains.sort((left, right) => compareCodePoints(left.name, right.name));
  const oracleMappings = requireDenseArray(parameters.oracle_mappings, 'parameters.oracle_mappings');
  return { domains, oracleMappings };
}

/**
 * @param {unknown} raw
 * @param {Map<string, Map<string, JsonScalar>>} valuesByDomain
 * @param {string} label
 * @returns {Assignment[]}
 */
function validateAssignments(raw, valuesByDomain, label) {
  const rawAssignments = requireDenseArray(raw, `${label} assignments`, 1);
  /** @type {Assignment[]} */
  const assignments = [];
  const assigned = new Set();
  for (let index = 0; index < rawAssignments.length; index += 1) {
    const rawAssignment = rawAssignments[index];
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
  const rawConstraints = requireDenseArray(constraints, 'constraints');
  /** @type {Constraint[]} */
  const normalized = [];
  const seen = new Set();
  for (let index = 0; index < rawConstraints.length; index += 1) {
    const rawConstraint = rawConstraints[index];
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
 * Remove unary-forbidden values before traversal, then put the smallest
 * remaining domains first so multi-clause pruning happens as early as possible.
 * Complete vectors are still canonicalized in the original code-point order.
 * @param {Domain[]} domains
 * @param {Constraint[]} constraints
 */
function preprocessSearch(domains, constraints) {
  /** @type {Map<string, Set<string>>} */
  const forbiddenValues = new Map();
  /** @type {Constraint[]} */
  const multiConstraints = [];
  for (const constraint of constraints) {
    if (constraint.forbidden.length !== 1) {
      multiConstraints.push(constraint);
      continue;
    }
    const assignment = constraint.forbidden[0];
    const values = forbiddenValues.get(assignment.parameter) ?? new Set();
    values.add(scalarKey(assignment.value));
    forbiddenValues.set(assignment.parameter, values);
  }
  const filteredDomains = domains.map((domain) => ({
    name: domain.name,
    values: domain.values.filter((value) => !forbiddenValues.get(domain.name)?.has(scalarKey(value)))
  }));
  if (filteredDomains.some((domain) => domain.values.length === 0)) return null;
  const constraintParticipation = new Map(filteredDomains.map(({ name }) => [name, 0]));
  for (const { forbidden } of multiConstraints) {
    for (const { parameter } of forbidden) {
      constraintParticipation.set(parameter, (constraintParticipation.get(parameter) ?? 0) + 1);
    }
  }
  return {
    canonicalDomains: filteredDomains,
    searchDomains: [...filteredDomains].sort((left, right) => (
      left.values.length - right.values.length
      || (constraintParticipation.get(right.name) ?? 0) - (constraintParticipation.get(left.name) ?? 0)
      || compareCodePoints(left.name, right.name)
    )),
    constraints: multiConstraints
  };
}

/**
 * @param {Domain[]} canonicalDomains
 * @param {Domain[]} searchDomains
 * @param {Constraint[]} constraints
 * @param {number} maxCandidates
 */
function enumerateValidCandidates(canonicalDomains, searchDomains, constraints, maxCandidates) {
  /** @type {Record<string, JsonScalar>[]} */
  const candidates = [];
  const assigned = new Map();
  const valueIndexes = new Array(searchDomains.length).fill(0);
  let depth = 0;

  while (depth >= 0) {
    if (depth === searchDomains.length) {
      const vector = Object.fromEntries(canonicalDomains.map(({ name }) => [name, assigned.get(name)]));
      candidates.push(vector);
      if (candidates.length > maxCandidates) return null;
      depth -= 1;
      if (depth >= 0) {
        assigned.delete(searchDomains[depth].name);
        valueIndexes[depth] += 1;
      }
      continue;
    }

    const domain = searchDomains[depth];
    if (valueIndexes[depth] >= domain.values.length) {
      valueIndexes[depth] = 0;
      assigned.delete(domain.name);
      depth -= 1;
      if (depth >= 0) {
        assigned.delete(searchDomains[depth].name);
        valueIndexes[depth] += 1;
      }
      continue;
    }

    assigned.set(domain.name, domain.values[valueIndexes[depth]]);
    if (violatesConstraint(assigned, constraints)) {
      assigned.delete(domain.name);
      valueIndexes[depth] += 1;
      continue;
    }
    depth += 1;
    if (depth < searchDomains.length) valueIndexes[depth] = 0;
  }
  const domainNames = canonicalDomains.map(({ name }) => name);
  return candidates.sort((left, right) => compareCodePoints(
    vectorKey(left, domainNames), vectorKey(right, domainNames)
  ));
}

/** @param {number} n @param {number} k */
function chooseBigInt(n, k) {
  if (k < 0 || k > n) return 0n;
  const take = Math.min(k, n - k);
  let result = 1n;
  for (let index = 1; index <= take; index += 1) {
    result = result * BigInt(n - take + index) / BigInt(index);
  }
  return result;
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
  if (selectedIndexes.length === 0) return chooseBigInt(domainNames.length, strength);
  const allSelected = (1n << BigInt(selectedIndexes.length)) - 1n;
  /** @type {Map<bigint, number>} */
  const multiplicityByMask = new Map();
  for (const domainName of domainNames) {
    let matchingSelected = 0n;
    for (let position = 0; position < selectedIndexes.length; position += 1) {
      const selectedIndex = selectedIndexes[position];
      if (scalarKey(candidate[domainName]) === scalarKey(candidates[selectedIndex][domainName])) {
        matchingSelected |= 1n << BigInt(position);
      }
    }
    multiplicityByMask.set(matchingSelected, (multiplicityByMask.get(matchingSelected) ?? 0) + 1);
  }

  // Domains matching every selected vector cannot change an intersection.
  // Factor them out and apply their binomial multiplicity only to zero-mask
  // states at the end; this is exact and avoids a wide redundant transition.
  const commonMultiplicity = multiplicityByMask.get(allSelected) ?? 0;
  multiplicityByMask.delete(allSelected);

  /** @type {Map<bigint, bigint>[]} */
  let countsBySize = Array.from({ length: strength + 1 }, () => new Map());
  countsBySize[0].set(allSelected, 1n);
  let visitedDomains = 0;
  for (const [matchingSelected, multiplicity] of multiplicityByMask) {
    /** @type {Map<bigint, bigint>[]} */
    const nextCounts = Array.from({ length: strength + 1 }, () => new Map());
    const maximumPriorSize = Math.min(strength, visitedDomains);
    for (let priorSize = 0; priorSize <= maximumPriorSize; priorSize += 1) {
      for (const [priorMask, count] of countsBySize[priorSize]) {
        const maximumTake = Math.min(multiplicity, strength - priorSize);
        for (let take = 0; take <= maximumTake; take += 1) {
          const nextMask = take === 0 ? priorMask : priorMask & matchingSelected;
          const weighted = count * chooseBigInt(multiplicity, take);
          const size = priorSize + take;
          nextCounts[size].set(nextMask, (nextCounts[size].get(nextMask) ?? 0n) + weighted);
        }
      }
    }
    visitedDomains += multiplicity;
    countsBySize = nextCounts;
  }
  let uncovered = 0n;
  for (let size = 0; size <= strength; size += 1) {
    const nonCommonCount = countsBySize[size].get(0n) ?? 0n;
    uncovered += nonCommonCount * chooseBigInt(commonMultiplicity, strength - size);
  }
  return uncovered;
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
  for (let index = 0; index < rawMappings.length; index += 1) {
    const rawMapping = rawMappings[index];
    if (!isObject(rawMapping)) throw new TypeError(`Oracle mapping ${index} must be an object`);
    assertExactKeys(rawMapping, ORACLE_MAPPING_KEYS, `Oracle mapping ${index}`);
    const assignments = validateAssignments(
      rawMapping.assignments, valuesByDomain, `Oracle mapping ${index}`
    );
    if (assignments.length !== domainNames.length
      || assignments.some(({ parameter }, assignmentIndex) => parameter !== domainNames[assignmentIndex])) {
      throw new TypeError(`Oracle mapping ${index} must name every parameter exactly once`);
    }
    const rawRefs = requireDenseArray(
      rawMapping.required_oracle_refs, `Oracle mapping ${index} required_oracle_refs`
    );
    const refs = [];
    for (let refIndex = 0; refIndex < rawRefs.length; refIndex += 1) {
      refs.push(requireNonblankString(rawRefs[refIndex], `Oracle mapping ${index} ref ${refIndex}`));
    }
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
  const search = preprocessSearch(domains, normalizedConstraints);
  if (search === null) return {
    status: 'blocked', reason: 'no_valid_candidates', max_candidates: Number(maxCandidates)
  };
  const candidates = enumerateValidCandidates(
    search.canonicalDomains, search.searchDomains, search.constraints, Number(maxCandidates)
  );
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
