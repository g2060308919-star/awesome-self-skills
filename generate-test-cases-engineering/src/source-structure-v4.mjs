// Strict, non-browser structural parser. Unsupported/ambiguous HTML is rejected;
// it is never repaired into a deceptively single paragraph by browser heuristics.
const VOID = new Set(['br', 'hr', 'img', 'input', 'source', 'wbr']);
const INLINE = new Set(['a', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'small', 'sub', 'sup', 'mark', 'label', 'abbr', 'kbd']);
const CONTAINER = new Set(['html', 'body', 'main', 'section', 'article', 'div', 'header', 'footer', 'blockquote', 'ul', 'ol', 'thead', 'tbody', 'tfoot']);
const BLOCK = new Set([...CONTAINER, 'p', 'li', 'pre', 'code', 'table', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
/** @param {string} value */
function entities(value) {
  /** @type {Record<string,string>} */ const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/giu, (raw, key) => {
    if (!key.startsWith('#')) return named[key.toLowerCase()] ?? raw;
    const point = Number.parseInt(key.slice(/^#x/iu.test(key) ? 2 : 1), /^#x/iu.test(key) ? 16 : 10);
    if (point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new TypeError('SOURCE_STRUCTURE_ENTITY_INVALID');
    return String.fromCodePoint(point);
  }).normalize('NFC');
}

/** @typedef {{tag:string,children:Array<HtmlNode|string>,attributes:Record<string,string>}} HtmlNode */
/** @param {string} content @returns {HtmlNode|null} */
function parseHtml(content) {
  /** @type {HtmlNode} */ const root = { tag: 'root', children: [], attributes: {} };
  const stack = [root]; let found = false; let text = '';
  const flush = () => { if (text) stack.at(-1)?.children.push(text); text = ''; };
  for (let index = 0; index < content.length;) {
    if (content[index] === '\\') { text += content.slice(index, index + 2); index += 2; continue; }
    if (content[index] === '`') {
      const run = /^`+/u.exec(content.slice(index))?.[0] ?? '`';
      const end = content.indexOf(run, index + run.length);
      if (end >= 0) { text += content.slice(index, end + run.length); index = end + run.length; continue; }
    }
    if (content.startsWith('<!--', index)) {
      const end = content.indexOf('-->', index + 4);
      if (end < 0) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
      flush(); found = true;
      stack.at(-1)?.children.push({ tag: 'code', attributes: {}, children: [content.slice(index, end + 3)] }); index = end + 3; continue;
    }
    if (!/^<\/?[a-z][a-z0-9]*(?=\s|\/?>)/iu.test(content.slice(index))) { text += content[index]; index += 1; continue; }
    found = true; flush();
    let end = index + 1; let quote = '';
    for (; end < content.length; end += 1) {
      const character = content[end];
      if (quote) { if (character === quote) quote = ''; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === '>') break;
    }
    if (end >= content.length || quote) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
    const token = content.slice(index + 1, end); index = end + 1;
    const match = /^(\/)?([a-z][a-z0-9]*)([\s\S]*)$/iu.exec(token);
    if (!match) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
    const tag = match[2].toLowerCase();
    if (!VOID.has(tag) && !INLINE.has(tag) && !BLOCK.has(tag)) throw new TypeError('SOURCE_STRUCTURE_HTML_UNSUPPORTED');
    if (match[1]) {
      if (match[3].trim() || stack.length < 2 || stack.at(-1)?.tag !== tag) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
      stack.pop(); continue;
    }
    const selfClosing = /\/\s*$/u.test(match[3]);
    const remaining = match[3].replace(/\/\s*$/u, '');
    /** @type {Record<string,string>} */ const attributes = {};
    const pattern = /\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/giy;
    let offset = 0;
    while (offset < remaining.length && remaining.slice(offset).trim()) {
      pattern.lastIndex = offset; const attr = pattern.exec(remaining);
      if (!attr || Object.hasOwn(attributes, attr[1].toLowerCase())) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
      attributes[attr[1].toLowerCase()] = entities(attr[2] ?? attr[3] ?? attr[4] ?? ''); offset = pattern.lastIndex;
    }
    if ((attributes.colspan !== undefined && attributes.colspan !== '1') || (attributes.rowspan !== undefined && attributes.rowspan !== '1')) throw new TypeError('SOURCE_STRUCTURE_TABLE_SPAN_UNSUPPORTED');
    /** @type {HtmlNode} */ const node = { tag, children: [], attributes };
    stack.at(-1)?.children.push(node);
    if (VOID.has(tag) || selfClosing) continue;
    if (tag === 'pre' || tag === 'code') {
      const closePattern = new RegExp('</' + tag + '\\s*>', 'giu'); closePattern.lastIndex = index;
      const close = closePattern.exec(content);
      if (!close) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
      node.children.push(content.slice(index, close.index)); index = closePattern.lastIndex; continue;
    }
    stack.push(node);
  }
  flush();
  if (stack.length !== 1) throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
  return found ? root : null;
}

/** @param {HtmlNode|string} node @returns {string} */
function textOf(node) {
  if (typeof node === 'string') return entities(node);
  if (node.tag === 'br') return '\n';
  if (node.tag === 'img') return (node.attributes.alt || '[image]') + (node.attributes.src ? ' (' + node.attributes.src + ')' : '');
  const text = node.children.map(textOf).join('');
  return node.tag === 'a' && node.attributes.href ? text + ' (' + node.attributes.href + ')' : text;
}

/** @param {string} content @returns {Array<{type:string,text:string,table_index?:number,row?:number,column?:number}>|null} */
export function parseHtmlSourceStructure(content) {
  const root = parseHtml(content); if (!root) return null;
  /** @type {Array<{type:string,text:string,table_index?:number,row?:number,column?:number}>} */ const result = [];
  let tableIndex = 0;
  /** @param {string} type @param {string} text @param {any} [extra] */
  const add = (type, text, extra = {}) => { if (text.trim()) result.push({ type, text: text.trim(), ...extra }); };
  /** @param {string} text @param {string} ordinary */
  function markdownText(text, ordinary) {
    let paragraph = ''; let fenced = false; let table = -1; let row = 0;
    const flush = () => { add(ordinary, paragraph); paragraph = ''; };
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (/^\s*(?:```|~~~)/u.test(line)) { flush(); fenced = !fenced; add('code', line); continue; }
      if (fenced) { add('code', line); continue; }
      if (!line.trim()) { flush(); table = -1; continue; }
      if (/^\s*\|.*\|\s*$/u.test(line) || (table >= 0 && splitMarkdownTableCells(line).length > 1)
        || (isMarkdownTableDelimiter(lines[index + 1] ?? '') && splitMarkdownTableCells(line).length > 1)) {
        flush(); if (table < 0) { table = tableIndex++; row = 0; }
        const cells = splitMarkdownTableCells(line);
        if (cells.every(cell => /^\s*:?-+:?\s*$/u.test(cell))) continue;
        cells.forEach((cell, column) => add('table_cell', cell, { table_index: table, row, column })); row += 1; continue;
      }
      table = -1;
      if (/^\s*#{1,6}\s/u.test(line)) { flush(); add('heading', line); }
      else if (/^\s*(?:[-+*]|[0-9]+[.)])\s/u.test(line)) { flush(); add('list', line); }
      else paragraph += (paragraph ? '\n' : '') + line;
    }
    flush();
  }
  /** @param {HtmlNode} node @param {string} [ordinary] */
  function children(node, ordinary = 'text_block') {
    let paragraph = '';
    const flush = () => { markdownText(paragraph, ordinary); paragraph = ''; };
    for (const child of node.children) {
      if (typeof child === 'string' || INLINE.has(child.tag) || child.tag === 'br' || child.tag === 'wbr') { paragraph += textOf(child); continue; }
      flush(); visit(child);
    }
    flush();
  }
  /** @param {HtmlNode} node */
  function visit(node) {
    if (node.tag === 'table') {
      const table = tableIndex++; let row = 0;
      /** @param {HtmlNode} parent */
      function rows(parent) {
        for (const child of parent.children) {
          if (typeof child === 'string') { if (child.trim()) throw new TypeError('SOURCE_STRUCTURE_TABLE_INVALID'); continue; }
          if (['thead', 'tbody', 'tfoot'].includes(child.tag)) { rows(child); continue; }
          if (child.tag !== 'tr') throw new TypeError('SOURCE_STRUCTURE_TABLE_INVALID');
          let column = 0;
          for (const cell of child.children) {
            if (typeof cell === 'string') { if (cell.trim()) throw new TypeError('SOURCE_STRUCTURE_TABLE_INVALID'); continue; }
            if (!['td', 'th'].includes(cell.tag)) throw new TypeError('SOURCE_STRUCTURE_TABLE_INVALID');
            add('table_cell', textOf(cell), { table_index: table, row, column }); column += 1;
          }
          row += 1;
        }
      }
      rows(node); return;
    }
    if (/^h[1-6]$/u.test(node.tag)) add('heading', textOf(node));
    else if (node.tag === 'pre' || node.tag === 'code') add('code', textOf(node));
    else if (node.tag === 'li') children(node, 'list');
    else if (node.tag === 'img' || node.tag === 'source' || node.tag === 'input') add('image', textOf(node) || '[' + node.tag + ']');
    else if (node.tag === 'hr') add('heading', '---');
    else if (node.tag === 'p' || CONTAINER.has(node.tag) || node.tag === 'root') children(node);
    else throw new TypeError('SOURCE_STRUCTURE_HTML_INVALID');
  }
  visit(root); return result;
}

/** Preserve escaped pipes and code-span pipes as authored cell content.
 * @param {string} line
 */
export function splitMarkdownTableCells(line) {
  const trimmed = line.trim(); const content = trimmed.startsWith('|') ? trimmed.slice(1) : trimmed;
  const cells = []; let current = ''; let code = 0;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '\\' && index + 1 < content.length) { current += content.slice(index, index + 2); index += 1; }
    else if (character === '`') {
      const run = /^`+/u.exec(content.slice(index))?.[0] ?? '`';
      if (!code) code = run.length; else if (code === run.length) code = 0;
      current += run; index += run.length - 1;
    } else if (character === '|' && !code) { cells.push(current); current = ''; }
    else current += character;
  }
  if (current || !cells.length) cells.push(current);
  return cells;
}

/** @param {string} line */
export function isMarkdownTableDelimiter(line) {
  const cells = splitMarkdownTableCells(line);
  return cells.length > 1 && cells.every(cell => /^\s*:?-+:?\s*$/u.test(cell));
}
