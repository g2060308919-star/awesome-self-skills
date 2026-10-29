import { canonicalStringify } from '../src/canonical.mjs';
import { assertSupportedSchema } from '../src/schema-validator.mjs';

/** Remap copied local definitions without changing their contracts.
 * @param {any} value @param {string} prefix @returns {any} */
function prefixed(value, prefix) {
  if (Array.isArray(value)) return value.map(item => prefixed(item, prefix));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
    key === '$ref' ? String(child).replace('#/$defs/', `#/$defs/${prefix}`) : prefixed(child, prefix)]));
}

/** Validate the contracts before producing a manifest or a bundle.
 * @param {Map<string,any>} schemas */
export function verifySchemaContracts(schemas) {
  for (const [name, schema] of schemas) {
    assertSupportedSchema(schema);
    /** @param {any} node */
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (node.$ref && !Object.hasOwn(schema.$defs ?? {}, node.$ref.slice('#/$defs/'.length))) {
        throw new Error(`SCHEMA_CONTRACT_REFERENCE: ${name} ${node.$ref}`);
      }
      for (const value of Object.values(node)) walk(value);
    }
    walk(schema);
  }
  // These current contracts are public validator roots used by adapters,
  // although the Source Pack root does not reach the transient UI context.
  for (const [file, names] of Object.entries({
    'source-pack.schema.json': ['v4Source', 'v4ExecutionContext', 'v4ExecutionEvent'],
    'reply.schema.json': ['artifactRequest', 'resumeRef', 'needArtifactReply',
      'finishedReply', 'v4FinalConfirmationPresentation'],
    'behavior-views.schema.json': ['v4Artifact', 'v4Element', 'v4DesignAssurance'],
    'evidence-claims.schema.json': ['v4SourceCanonicalProjection'],
    'execution-plan.schema.json': ['v4ExecutionPlan']
  })) {
    for (const name of names) if (!Object.hasOwn(schemas.get(file)?.$defs ?? {}, name)) {
      throw new Error(`SCHEMA_CONTRACT_REFERENCE: ${file} exported ${name}`);
    }
  }
  const context = schemas.get('case-context.schema.json');
  const reply = schemas.get('reply.schema.json');
  const sources = { e: 'evidence-claims.schema.json', o: 'test-obligations.schema.json', r: 'ordering-registry.schema.json' };
  /** @param {any} left @param {any} right @param {string} label */
  function equal(left, right, label) {
    if (left === undefined || right === undefined || canonicalStringify(left) !== canonicalStringify(right)) {
      throw new Error(`SCHEMA_CONTRACT_DIVERGENCE: ${label}`);
    }
  }
  for (const [name, definition] of Object.entries(context.$defs)) {
    const [prefix] = name.split('_');
    const source = schemas.get(sources[/** @type {keyof typeof sources} */ (prefix)]);
    equal(definition, prefixed(source?.$defs[name.slice(2)], `${prefix}_`), `case-context:${name}`);
    equal(reply.$defs[`ctx_${name}`], prefixed(definition, 'ctx_'), `reply:${name}`);
  }
  const { $id, $schema, $defs, ...body } = context;
  equal(reply.$defs.caseContext, prefixed(body, 'ctx_'), 'reply:caseContext');
}
