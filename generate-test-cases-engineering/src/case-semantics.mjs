import { validateAgainstSchema } from './schema-validator.mjs';
import { resolveObserver } from './testability-links.mjs';

const apply = Reflect.apply;
const arrayEntries = Array.prototype.entries;
const arraySome = Array.prototype.some;
const arrayFilter = Array.prototype.filter;
const arrayIncludes = Array.prototype.includes;
const isArray = Array.isArray;
const define = Object.defineProperty;
/** @param {any[]} values */
const entries = values => apply(arrayEntries,values,[]);
/** @param {any[]} values @param {(value:any)=>boolean} predicate */
const some = (values,predicate) => apply(arraySome,values,[predicate]);
/** @param {any[]} values @param {(value:any)=>boolean} predicate */
const filter = (values,predicate) => apply(arrayFilter,values,[predicate]);
/** @param {any[]} values @param {any} value */
const includes = (values,value) => apply(arrayIncludes,values,[value]);
/** @param {any[]} values @param {any} value */
const push = (values,value) => define(values,values.length,{value,enumerable:true,writable:true,configurable:true});

const text = { type: 'string', minLength: 1, pattern: '\\S' };
const id = { type: 'string', minLength: 1, pattern: '^[A-Za-z0-9][A-Za-z0-9_.:/#-]*$' };
/** @param {Record<string, unknown>} properties @param {string[]} [required] */
const closed = (properties, required = Object.keys(properties)) => ({type:'object',properties,required,additionalProperties:false});
export const operandSchema = {oneOf: ['string','number','boolean','null'].map(type => closed({type:{const:type},value:{type}}))};
export const predicateSchema = closed({subject_ref:id,operator:{enum:['equals','contains','matches','within']},operand:operandSchema});
export const assertionSchema = closed({...predicateSchema.properties,surface:id});
export const riskBasisSchema = closed({impact:text,likelihood:text,exposure:text});
const identity = {operation_id:id,operation_ref:id,partition_id:id,subject_ref:id};
export const scenarioSchema = {oneOf:[
  closed({...identity,intent:{const:'behavior'}}),
  closed({...identity,intent:{const:'compatibility'},compatibility:closed({baseline_ref:id,dimensions:{type:'array',items:id,minItems:1,uniqueItems:true}})})
]};
export const effectsSchema = {type:'array',items:id,uniqueItems:true};
export const setupSchema = closed({resource_kind:{enum:['entry','fixture','account','data']},resource_ref:id,completion:predicateSchema,mutation_effects:effectsSchema});
export const resourcesSchema = {type:'array',minItems:1,items:closed({resource_id:id,kind:{enum:['entry','fixture','account','data']},locator:{type:'string',pattern:'^(?:[A-Za-z][A-Za-z0-9+.-]*://|/)[^\\s]+$'},evidence_ref:id})};
export const heuristicSchema = closed({exploratory_id:id,title:text,scope:text,risk:{enum:['critical','high','medium','low']},origin:{const:'heuristic'},category:{enum:['boundary','concurrency','failure','degradation','security','usability']},hypothesis:text,rationale:text});

/** @param {any} predicate */
function operandMatchesOperator(predicate) {
 return predicate?.operator === 'within' ? predicate?.operand?.type === 'number'
  : includes(['contains','matches'],predicate?.operator) ? predicate?.operand?.type === 'string' : true;
}

/** Accepted compiler metadata is mandatory; supporting trace references are not action selectors.
 * @param {any} draft @param {any[]} obligations
 */
export function caseScenarioReferenceErrors(draft,obligations) {
 const errors=/** @type {Array<{category:string,code:string,path:string,message:string}>} */ ([]);
 for(const obligation of obligations) {
  if (!isArray(obligation.primary_operation_refs) || !includes(obligation.primary_operation_refs,draft.scenario?.operation_ref)) push(errors,{category:'classification',code:'CASE_OPERATION_REFERENCE_INVALID',path:'/scenario/operation_ref',message:'Case operation must select a compiler-derived primary operation shared by every linked Test Point'});
  if (typeof obligation.scenario_partition_ref !== 'string' || obligation.scenario_partition_ref !== draft.scenario?.partition_id) push(errors,{category:'classification',code:'CASE_PARTITION_REFERENCE_INVALID',path:'/scenario/partition_id',message:'Case partition must equal every linked compiler-derived responsibility partition'});
 }
 return errors;
}

/** Validate only trusted snapshots; natural language support is still reviewed by the adapter.
 * @param {any} draft @returns {Array<{category:string,code:string,path:string,message:string}>}
 */
export function validateCaseSemantics(draft) {
  /** @type {Array<{category:string,code:string,path:string,message:string}>} */
  const errors = [];
  /** @param {unknown} value @param {any} schema @param {string} path */
  const check = (value,schema,path) => {
    for (const error of validateAgainstSchema(value,schema)) push(errors,{...error,path:`${path}${error.path === '/' ? '' : error.path}`});
  };
  check(draft.scenario,scenarioSchema,'/scenario');
  check(draft.risk_basis,riskBasisSchema,'/risk_basis');
  check(draft.execution_effects,effectsSchema,'/execution_effects');
  check(draft.cleanup?.resolved_effects,effectsSchema,'/cleanup/resolved_effects');
  check(draft.testability_profile?.setup_resources,resourcesSchema,'/testability_profile/setup_resources');
  const effects = new Set(isArray(draft.execution_effects) ? draft.execution_effects : []);
  for (const [i,p] of entries(isArray(draft.preconditions) ? draft.preconditions : [])) {
    check(p.setup,setupSchema,`/preconditions/${i}/setup`);
    if(!operandMatchesOperator(p.setup?.completion)) push(errors,{category:'classification',code:'SETUP_PREDICATE_INVALID',path:`/preconditions/${i}/setup/completion`,message:'Setup predicate operator requires a compatible typed operand'});
    const resource = filter(isArray(draft.testability_profile?.setup_resources) ? draft.testability_profile.setup_resources : [],r => r.resource_id === p.setup?.resource_ref);
    if (resource.length !== 1 || resource[0].kind !== p.setup?.resource_kind) push(errors,{category:'reference',code:'SETUP_RESOURCE_UNRESOLVED',path:`/preconditions/${i}/setup`,message:'Setup must resolve exactly one declared concrete resource of matching kind'});
    if (isArray(p.setup?.mutation_effects)) for (const effect of p.setup.mutation_effects) effects.add(effect);
  }
  /** @param {string} code @param {string} path @param {string} message */
  const fail = (code,path,message) => push(errors,{category:'classification',code,path,message});
  if (draft.scenario?.intent === 'compatibility' && draft.scenario.compatibility?.dimensions?.length !== 1) fail('COMPATIBILITY_DIMENSION_MULTIPLE','/scenario/compatibility','Each compatibility Case compares one dimension');
  if (draft.scenario?.intent === 'compatibility' && !some(draft.testability_profile?.setup_resources ?? [],r => r.resource_id === draft.scenario.compatibility?.baseline_ref)) fail('COMPATIBILITY_BASELINE_UNRESOLVED','/scenario/compatibility/baseline_ref','Compatibility baseline must resolve to a concrete sourced resource');
  const resolved = new Set(isArray(draft.cleanup?.resolved_effects) ? draft.cleanup.resolved_effects : []);
  if ((effects.size > 0 && draft.cleanup?.required !== true) || effects.size !== resolved.size || some([...effects],e => !resolved.has(e))) fail('SETUP_EFFECTS_UNRESOLVED','/cleanup','Cleanup must resolve exactly the declared setup and execution mutation effects');
  const surfaces = new Set();
  for (const [i,item] of entries(isArray(draft.data) ? draft.data : [])) {
    if (item.partition_id !== draft.scenario?.partition_id) fail('CASE_PARTITION_MISMATCH',`/data/${i}`,'Data belongs to one scenario partition');
  }
  for (const [i,step] of entries(isArray(draft.steps) ? draft.steps : [])) {
    check(step.operation_id,id,`/steps/${i}/operation_id`);
    if (step.operation_id !== draft.scenario?.operation_id) fail('CASE_OPERATION_MISMATCH',`/steps/${i}/operation_id`,'Every action must belong to the single scenario operation');
    for (const [j,e] of entries(isArray(step.expectations) ? step.expectations : [])) {
      const a=e.oracle?.assertion;
      check(a,assertionSchema,`/steps/${i}/expectations/${j}/oracle/assertion`);
      if (a?.subject_ref !== draft.scenario?.subject_ref) fail('CASE_SUBJECT_MISMATCH',`/steps/${i}/expectations/${j}`,'Assertion must observe the single scenario subject');
      if (a?.operator !== e.oracle?.comparison) fail('ORACLE_OPERATOR_MISMATCH',`/steps/${i}/expectations/${j}`,'Oracle operator must match the typed assertion');
      const field = /** @type {Record<string,string>} */ ({value:'expected_value',state:'expected_state',event:'expected_event','side-effect':'expected_side_effect'})[e.oracle?.type];
      if (field && e.oracle[field] !== String(a?.operand?.value)) fail('ORACLE_DISPLAY_MISMATCH',`/steps/${i}/expectations/${j}`,'Expected display value must equal the typed operand');
      if (!operandMatchesOperator(a)) fail('ORACLE_OPERAND_INVALID',`/steps/${i}/expectations/${j}`,'Oracle operator requires a compatible typed operand');
      if (a) surfaces.add(a.surface);
      const observer = resolveObserver(draft.testability_profile?.observers ?? [],e);
      if (!observer) fail('TESTABILITY_REFERENCE_MISMATCH',`/steps/${i}/expectations/${j}`,'Expectation must resolve one declared observer');
      else if (observer.subject_ref !== a?.subject_ref || observer.surface_id !== a?.surface) fail('ASSERTION_OBSERVER_MISMATCH',`/steps/${i}/expectations/${j}`,'Typed subject and surface must match the resolved observer registry');
    }
  }
  if (surfaces.size > 1) fail('CASE_SURFACE_MULTIPLE','/steps','Separate observation surfaces into independent Cases');
  return errors;
}
