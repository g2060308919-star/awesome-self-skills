/** Shared presentation classification; does not alter evidence, roots or decisions.
 * @param {unknown} type */
export function isExecutionPreparationGap(type) {
  return type === 'testability' || type === 'capability' || type === 'resource_limit'
    || type === 'resource-limit' || type === 'control' || type === 'observer'
    || type === 'execution-preparation';
}
