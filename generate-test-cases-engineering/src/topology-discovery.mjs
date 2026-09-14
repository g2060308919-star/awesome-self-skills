import { canonicalStringify, digest } from './canonical.mjs';

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const MODULE_SUFFIX_PATTERN = /[\p{Script=Han}A-Za-z0-9_.-]{1,24}(?:系统|服务|后台|中台|端)/gu;
const REVIEW_CLASSES = new Set(['normative', 'uncertain', 'non_normative']);
const UNIT_KINDS = new Set(['text_block', 'table', 'image']);
const CANDIDATE_KINDS = new Set(['module_mention', 'boundary_signal']);

/** @param {string} code @returns {never} */
function fail(code) { throw new TypeError(code); }

/** @param {unknown} value @param {string} code @returns {Record<string, any>} */
function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return /** @type {Record<string, any>} */ (value);
}

/** @param {Record<string, any>} value @param {string[]} keys */
function closedKeys(value, keys) {
  const allowed = new Set(keys);
  if (Reflect.ownKeys(value).some(key => typeof key !== 'string' || !allowed.has(key))) fail('TOPOLOGY_INPUT_UNKNOWN_FIELD');
}

/** @param {unknown} value @param {string} code */
function nonblank(value, code) {
  if (typeof value !== 'string' || !value.trim()) fail(code);
  return value.normalize('NFC').trim();
}

/** @param {unknown} value @param {string} code @returns {any[]} */
function list(value, code) {
  if (!Array.isArray(value)) fail(code);
  return /** @type {any[]} */ (value);
}

/**
 * Capture JSON-like input without invoking submitted accessors, iterators or
 * prototype methods. The returned graph is detached from the caller.
 * @param {unknown} input
 * @returns {any}
 */
export function snapshotTopologyInputV4(input) {
  const active = new WeakSet();
  const memo = new WeakMap();
  /** @param {unknown} value @returns {any} */
  const visit = (value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (!value || typeof value !== 'object') fail('TOPOLOGY_INPUT_VALUE_INVALID');
    const source = /** @type {object} */ (value);
    if (active.has(source)) fail('TOPOLOGY_INPUT_CYCLIC');
    if (memo.has(source)) return memo.get(source);
    const isArray = Array.isArray(source);
    const prototype = Object.getPrototypeOf(source);
    if ((isArray && prototype !== Array.prototype)
      || (!isArray && prototype !== Object.prototype && prototype !== null)) fail('TOPOLOGY_INPUT_PROTOTYPE');
    const descriptors = Object.getOwnPropertyDescriptors(source);
    if (Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')) fail('TOPOLOGY_INPUT_SYMBOL');
    for (const descriptor of Object.values(descriptors)) {
      if (!Object.hasOwn(descriptor, 'value')) fail('TOPOLOGY_INPUT_ACCESSOR');
    }
    active.add(source);
    if (isArray) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0) fail('TOPOLOGY_INPUT_ARRAY_INVALID');
      const result = new Array(length);
      memo.set(source, result);
      const keys = Object.keys(descriptors).filter(key => key !== 'length');
      if (keys.length !== length) fail('TOPOLOGY_INPUT_ARRAY_INVALID');
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || descriptor.enumerable !== true) fail('TOPOLOGY_INPUT_ARRAY_INVALID');
        result[index] = visit(descriptor.value);
      }
      active.delete(source);
      return result;
    }
    const result = {};
    memo.set(source, result);
    for (const key of Object.keys(descriptors).sort(compareCodePoints)) {
      const descriptor = descriptors[key];
      if (descriptor.enumerable !== true) fail('TOPOLOGY_INPUT_PROPERTY_INVALID');
      Object.defineProperty(result, key, {
        value: visit(descriptor.value), enumerable: true, writable: true, configurable: true
      });
    }
    active.delete(source);
    return result;
  };
  return visit(input);
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0);
  const b = Array.from(right, character => character.codePointAt(0) ?? 0);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}

/** @param {string[]} values */
function sortedUnique(values) {
  return [...new Set(values.map(value => value.normalize('NFC')))].sort(compareCodePoints);
}

/** @param {any} value @returns {any} */
function sealDiscovery(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) sealDiscovery(child);
  return Object.freeze(value);
}

/** @param {string} content */
function moduleLabels(content) {
  const parts = content.normalize('NFC').split(/[\s,，。；;：:、/|（）()\[\]{}<>《》“”"'！？!?]|依赖|调用|连接|回传|返回|发送|接收|通过|流向|以及|或者|和|与|及/gu);
  const labels = [];
  for (const part of parts) {
    for (const match of part.matchAll(MODULE_SUFFIX_PATTERN)) labels.push(match[0]);
  }
  return sortedUnique(labels);
}

/** High-recall structural entities deliberately allow false positives; the
 * mandatory disposition review is where a reviewer marks them not relevant.
 * @param {string} content */
function structuralEntityLabels(content) {
  const normalized = content.normalize('NFC').trim();
  const labels = moduleLabels(normalized);
  if (normalized.length <= 64 && !/[。；;！？!?\n\r]/u.test(normalized)) labels.push(normalized);
  return sortedUnique(labels);
}

/** @param {any} cell @returns {any} */
function normalizeCell(cell) {
  const item = record(cell, 'TOPOLOGY_CELL_INVALID');
  closedKeys(item, ['cell_id', 'locator_id', 'text']);
  return {
    cell_id: nonblank(item.cell_id, 'TOPOLOGY_CELL_ID_INVALID'),
    locator_id: nonblank(item.locator_id, 'TOPOLOGY_LOCATOR_INVALID'),
    text: nonblank(item.text, 'TOPOLOGY_CELL_TEXT_INVALID')
  };
}

/** @param {any} node @returns {any} */
function normalizeNode(node) {
  const item = record(node, 'TOPOLOGY_OCR_NODE_INVALID');
  closedKeys(item, ['node_id', 'locator_id', 'label']);
  return {
    node_id: nonblank(item.node_id, 'TOPOLOGY_OCR_NODE_ID_INVALID'),
    locator_id: nonblank(item.locator_id, 'TOPOLOGY_LOCATOR_INVALID'),
    label: nonblank(item.label, 'TOPOLOGY_OCR_LABEL_INVALID')
  };
}

/** @param {any} arrow @returns {any} */
function normalizeArrow(arrow) {
  const item = record(arrow, 'TOPOLOGY_OCR_ARROW_INVALID');
  closedKeys(item, ['arrow_id', 'locator_id', 'from_label', 'to_label', 'label']);
  return {
    arrow_id: nonblank(item.arrow_id, 'TOPOLOGY_OCR_ARROW_ID_INVALID'),
    locator_id: nonblank(item.locator_id, 'TOPOLOGY_LOCATOR_INVALID'),
    from_label: nonblank(item.from_label, 'TOPOLOGY_OCR_ENDPOINT_INVALID'),
    to_label: nonblank(item.to_label, 'TOPOLOGY_OCR_ENDPOINT_INVALID'),
    label: nonblank(item.label, 'TOPOLOGY_OCR_LABEL_INVALID')
  };
}

/** @param {any} unit @returns {any} */
function normalizeUnit(unit) {
  const item = record(unit, 'TOPOLOGY_UNIT_INVALID');
  const kind = nonblank(item.kind, 'TOPOLOGY_UNIT_KIND_INVALID');
  if (!UNIT_KINDS.has(kind)) fail('TOPOLOGY_UNIT_KIND_INVALID');
  const common = {
    kind, unit_id: nonblank(item.unit_id, 'TOPOLOGY_UNIT_ID_INVALID'),
    review_class: nonblank(item.review_class, 'TOPOLOGY_REVIEW_CLASS_INVALID'),
    locator_id: nonblank(item.locator_id, 'TOPOLOGY_LOCATOR_INVALID')
  };
  if (!REVIEW_CLASSES.has(common.review_class)) fail('TOPOLOGY_REVIEW_CLASS_INVALID');
  if (kind === 'text_block') {
    closedKeys(item, ['kind', 'unit_id', 'review_class', 'locator_id', 'text']);
    return { ...common, text: nonblank(item.text, 'TOPOLOGY_BLOCK_TEXT_INVALID') };
  }
  if (kind === 'table') {
    closedKeys(item, ['kind', 'unit_id', 'review_class', 'locator_id', 'cells']);
    const cells = list(item.cells, 'TOPOLOGY_TABLE_CELLS_INVALID').map(normalizeCell)
      .sort((left, right) => compareCodePoints(left.cell_id, right.cell_id));
    if (!cells.length || new Set(cells.map(cell => cell.cell_id)).size !== cells.length) fail('TOPOLOGY_TABLE_CELLS_INVALID');
    return { ...common, cells };
  }
  closedKeys(item, ['kind', 'unit_id', 'review_class', 'locator_id', 'asset_digest', 'ocr_nodes', 'ocr_arrows']);
  const asset_digest = nonblank(item.asset_digest, 'TOPOLOGY_ASSET_DIGEST_INVALID');
  if (!DIGEST_PATTERN.test(asset_digest)) fail('TOPOLOGY_ASSET_DIGEST_INVALID');
  const ocr_nodes = list(item.ocr_nodes, 'TOPOLOGY_OCR_NODES_INVALID').map(normalizeNode)
    .sort((left, right) => compareCodePoints(left.node_id, right.node_id));
  const ocr_arrows = list(item.ocr_arrows, 'TOPOLOGY_OCR_ARROWS_INVALID').map(normalizeArrow)
    .sort((left, right) => compareCodePoints(left.arrow_id, right.arrow_id));
  if (new Set(ocr_nodes.map(node => node.node_id)).size !== ocr_nodes.length
    || new Set(ocr_arrows.map(arrow => arrow.arrow_id)).size !== ocr_arrows.length) fail('TOPOLOGY_OCR_ID_DUPLICATE');
  return { ...common, asset_digest, ocr_nodes, ocr_arrows };
}

/** @param {unknown} input @returns {any} */
function normalizeStructure(input) {
  const root = record(snapshotTopologyInputV4(input), 'TOPOLOGY_INPUT_INVALID');
  closedKeys(root, ['sources']);
  const sources = list(root.sources, 'TOPOLOGY_SOURCES_INVALID').map(raw => {
    const source = record(raw, 'TOPOLOGY_SOURCE_INVALID');
    closedKeys(source, ['source_id', 'units']);
    const normalized = {
      source_id: nonblank(source.source_id, 'TOPOLOGY_SOURCE_ID_INVALID'),
      units: list(source.units, 'TOPOLOGY_UNITS_INVALID').map(normalizeUnit)
        .sort((left, right) => compareCodePoints(left.unit_id, right.unit_id))
    };
    if (new Set(normalized.units.map(unit => unit.unit_id)).size !== normalized.units.length) fail('TOPOLOGY_UNIT_ID_DUPLICATE');
    return normalized;
  }).sort((left, right) => compareCodePoints(left.source_id, right.source_id));
  if (!sources.length || new Set(sources.map(source => source.source_id)).size !== sources.length) fail('TOPOLOGY_SOURCE_ID_DUPLICATE');
  const unitIds = sources.flatMap(source => source.units.map((/** @type {any} */ unit) => unit.unit_id));
  if (new Set(unitIds).size !== unitIds.length) fail('TOPOLOGY_UNIT_ID_DUPLICATE');
  return { sources };
}

/** @param {Map<string,{kind:string,label:string,locator_ids:Set<string>}>} candidates @param {string} kind @param {string} label @param {string} locatorId */
function addCandidate(candidates, kind, label, locatorId) {
  if (!CANDIDATE_KINDS.has(kind)) fail('TOPOLOGY_CANDIDATE_KIND_INVALID');
  const normalizedLabel = label.normalize('NFC').trim();
  const key = canonicalStringify({ kind, label: normalizedLabel });
  const current = candidates.get(key) ?? { kind, label: normalizedLabel, locator_ids: new Set() };
  current.locator_ids.add(locatorId.normalize('NFC'));
  candidates.set(key, current);
}

/**
 * Deterministic compiler-owned discovery over already canonical source units.
 * Non-normative units are deliberately excluded from scope candidates.
 * @param {unknown} sourceStructure
 * @param {unknown} [semanticDiscovery]
 * @returns {any}
 */
export function discoverTopologyV4(sourceStructure, semanticDiscovery = { semantic_candidates: [] }) {
  const normalized = normalizeStructure(sourceStructure);
  const reviewedBlockIds = [];
  const reviewedTableIds = [];
  const reviewedAssetDigests = [];
  /** @type {Map<string,{kind:string,label:string,locator_ids:Set<string>}>} */
  const candidateMap = new Map();
  const knownLocators = new Set();
  for (const source of normalized.sources) {
    for (const unit of source.units) {
      if (unit.review_class === 'non_normative') continue;
      knownLocators.add(unit.locator_id);
      if (unit.kind === 'text_block') {
        reviewedBlockIds.push(unit.unit_id);
        for (const label of structuralEntityLabels(unit.text)) addCandidate(candidateMap, 'module_mention', label, unit.locator_id);
      } else if (unit.kind === 'table') {
        reviewedTableIds.push(unit.unit_id);
        for (const cell of unit.cells) {
          knownLocators.add(cell.locator_id);
          for (const label of structuralEntityLabels(cell.text)) addCandidate(candidateMap, 'module_mention', label, cell.locator_id);
        }
      } else {
        reviewedAssetDigests.push(unit.asset_digest);
        for (const node of unit.ocr_nodes) {
          knownLocators.add(node.locator_id);
          for (const label of structuralEntityLabels(node.label)) addCandidate(candidateMap, 'module_mention', label, node.locator_id);
        }
        for (const arrow of unit.ocr_arrows) {
          knownLocators.add(arrow.locator_id);
          for (const label of structuralEntityLabels(arrow.from_label)) addCandidate(candidateMap, 'module_mention', label, arrow.locator_id);
          for (const label of structuralEntityLabels(arrow.to_label)) addCandidate(candidateMap, 'module_mention', label, arrow.locator_id);
          addCandidate(candidateMap, 'boundary_signal', `${arrow.from_label} → ${arrow.to_label}`, arrow.locator_id);
        }
      }
    }
  }
  const semantic = record(snapshotTopologyInputV4(semanticDiscovery), 'TOPOLOGY_SEMANTIC_DISCOVERY_INVALID');
  closedKeys(semantic, ['semantic_candidates']);
  for (const raw of list(semantic.semantic_candidates, 'TOPOLOGY_SEMANTIC_CANDIDATES_INVALID')) {
    const candidate = record(raw, 'TOPOLOGY_SEMANTIC_CANDIDATE_INVALID');
    closedKeys(candidate, ['kind', 'label', 'locator_ids']);
    const kind = nonblank(candidate.kind, 'TOPOLOGY_CANDIDATE_KIND_INVALID');
    const label = nonblank(candidate.label, 'TOPOLOGY_CANDIDATE_LABEL_INVALID');
    const locatorIds = list(candidate.locator_ids, 'TOPOLOGY_CANDIDATE_LOCATORS_INVALID')
      .map(locator => nonblank(locator, 'TOPOLOGY_CANDIDATE_LOCATORS_INVALID'));
    if (!CANDIDATE_KINDS.has(kind) || !locatorIds.length || new Set(locatorIds).size !== locatorIds.length
      || locatorIds.some(locator => !knownLocators.has(locator))) fail('TOPOLOGY_SEMANTIC_CANDIDATE_INVALID');
    const key = canonicalStringify({ kind, label });
    if (candidateMap.has(key)) continue;
    for (const locator of locatorIds) addCandidate(candidateMap, kind, label, locator);
  }
  const topologyCandidates = [...candidateMap.values()].map(item => {
    const signature = { kind: item.kind, label: item.label, locator_ids: sortedUnique([...item.locator_ids]) };
    const hash = digest(signature);
    return { candidate_id: `TC-${hash}`, ...signature, discovery_digest: `sha256:${hash}` };
  }).sort((left, right) => compareCodePoints(left.kind, right.kind)
    || compareCodePoints(left.label, right.label) || compareCodePoints(left.candidate_id, right.candidate_id));
  const scanned_units = {
    reviewed_block_ids: sortedUnique(reviewedBlockIds),
    reviewed_table_ids: sortedUnique(reviewedTableIds),
    reviewed_asset_digests: sortedUnique(reviewedAssetDigests)
  };
  const source_structure_digest = `sha256:${digest(normalized)}`;
  const discovery_digest = `sha256:${digest({ source_structure_digest, scanned_units, topology_candidates: topologyCandidates })}`;
  return sealDiscovery({ source_structure_digest, discovery_digest, scanned_units, topology_candidates: topologyCandidates });
}
