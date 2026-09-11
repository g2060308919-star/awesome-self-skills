import { canonicalV5Stringify } from './canonical-v5.mjs';
import { validateV5CaseDocument } from './case-compiler.mjs';

/** @param {Record<string,any>} document */
export function renderV5Json(document) {
  validateV5CaseDocument(document);
  return `${canonicalV5Stringify(document)}\n`;
}
