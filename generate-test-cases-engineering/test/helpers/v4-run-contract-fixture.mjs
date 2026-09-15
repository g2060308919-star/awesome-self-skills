import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { atomicWriteJson } from '../../src/run-store.mjs';

/**
 * Bind a regression fixture to the pre-upgrade V4 contract. Tests using this
 * helper prove that an already-active V4 run keeps its direct append behavior;
 * new runs are exercised separately through the preview-required contract.
 * @param {string} directory
 * @param {{run_id?:string,delivery_intent?:'case_document'|'execution_plan',lineage?:unknown}} [input]
 */
export async function seedLegacyV4RunInstance(directory, input = {}) {
  const value = {
    schema_version: '4.0.0',
    compiler_version: '0.5.0',
    run_id: input.run_id ?? `RUN-${randomUUID()}`,
    delivery_intent: input.delivery_intent ?? 'case_document',
    created_at: '2026-09-14T00:00:00.000Z',
    lineage: Object.hasOwn(input, 'lineage') ? structuredClone(input.lineage) : null
  };
  await atomicWriteJson(directory, path.join(directory, 'run-instance.json'), value);
  return value;
}
