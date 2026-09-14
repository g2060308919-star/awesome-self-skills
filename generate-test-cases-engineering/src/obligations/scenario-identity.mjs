import {stableId} from '../canonical.mjs';

/** Strategy selectors exclude Oracle result, evidence, risk, and descriptive labels. @param {any} identity */
export function partitionIdentity(identity) {
 const {kind,scope,responsibility}=identity;
 const base={kind,scope,responsibility};
 if(kind==='decision') return {...base,conditions:identity.rule.conditions,priority:identity.rule.priority};
 if(kind==='input-domain') return {...base,domain:identity.domain,...(identity.class?{class_id:identity.class.class_id}:{boundary:identity.boundary,value:identity.value,inclusive:identity.inclusive})};
 if(kind==='timing') return {...base,timing_event:identity.timing_event,threshold:identity.threshold,order:identity.order,...(identity.threshold_relation?{relation:identity.threshold_relation}:{signal:identity.signal})};
 if(kind==='state') return {...base,from:identity.transition.from,event:identity.transition.event,condition:identity.transition.condition,transition_order:identity.transition.transition_order};
 if(kind==='flow') return {...base,...(identity.edge?{from:identity.edge.from.element_id,condition:identity.edge.condition,...(identity.iterations===undefined?{}:{iterations:identity.iterations})}:{node:identity.node.element_id})};
 if(kind==='role') return {...base,role:identity.role,permission:identity.permission};
 if(kind==='integration') return {...base,contract_element_id:identity.contract_element_id,...(identity.side_effect?{side_effect:identity.side_effect}:{}),...(identity.signal?{signal:identity.signal}:{}),...(identity.invariant?{invariant:identity.invariant}:{})};
 throw new TypeError(`Unknown scenario strategy ${String(kind)}`);
}
/** @param {any} identity */
export function scenarioPartitionRef(identity) {return stableId('partition',partitionIdentity(identity));}

/** Compiler-only custom/combination metadata uses structured owner/vector, never Case labels. @param {any} obligation @param {unknown} [owner] */
export function ownedScenarioMetadata(obligation,owner='') {
 const vector=obligation.combination_vector;
 const operation={kind:obligation.kind,scope:obligation.scope,owner:vector?.owner ?? owner,view_element_refs:obligation.view_element_refs};
 const partition={...operation,...(vector?{assignments:vector.assignments.map((/** @type {any} */ a)=>({parameter_id:a.parameter_id,value_id:a.value_id}))}:{})};
 return {primary_operation_refs:[stableId('operation',operation)],scenario_partition_ref:stableId('partition',partition)};
}
