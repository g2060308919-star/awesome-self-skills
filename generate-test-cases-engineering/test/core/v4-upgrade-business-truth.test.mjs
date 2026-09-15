// @ts-nocheck -- legal-shape semantic mutants intentionally violate the independent truth contract.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertFCityBusinessProjection, validFCityProjection
} from '../helpers/v4-upgrade-business-truth.mjs';

const truth = JSON.parse(await readFile(
  new URL('../fixtures/v4-upgrade/f-city/business-truth.json', import.meta.url), 'utf8'
));

test('T01 AT01/AT26/AT31/AT38 independent F-CITY truth accepts the complete semantic projection', () => {
  assert.doesNotThrow(() => assertFCityBusinessProjection(validFCityProjection(truth), truth));
});

test('T01 AT27 legal-format candidate missing score value 6 fails independent recall', () => {
  const candidate = validFCityProjection(truth);
  candidate.score_instances = candidate.score_instances.filter((item) => item.value !== 6);
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /score instance: 6/u);
});

test('T01 AT31 equal-count permission substitution cannot hide the ordinary-user denial', () => {
  const candidate = validFCityProjection(truth);
  candidate.authority[1] = { role: '访客', resource: '负向体验报表', result: '无访问权限' };
  assert.equal(candidate.authority.length, 2);
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /ordinary-user denial/u);
});

test('T01 AT36 valid-shape wrong-subject Oracle cannot satisfy score coverage', () => {
  const candidate = validFCityProjection(truth);
  candidate.score_instances = candidate.score_instances.map((item) => ({ ...item, subject: 'source' }));
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /score instance: 1/u);
});

test('T01 AT38 JSON-only completeness cannot hide a Markdown condition omission', () => {
  const candidate = validFCityProjection(truth);
  candidate.official_outputs[1].semantic_projection.conditions = ['城市指南评价'];
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /markdown is not a complete projection/u);
});

test('T01 AT01 every named column keeps both selected and otherwise outcomes', () => {
  const candidate = validFCityProjection(truth);
  candidate.column_rules = candidate.column_rules.filter((item) => !(
    item.column === 'IP' && item.branch === 'otherwise'
  ));
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /otherwise branch for column IP/u);
});

test('T01 AT45 source=24 allows only the two supplied negative labels', () => {
  const candidate = validFCityProjection(truth);
  candidate.source_instances.find((item) => item.value === 24).expected = '没有乘车';
  assert.throws(() => assertFCityBusinessProjection(candidate, truth), /source=24/u);
});
