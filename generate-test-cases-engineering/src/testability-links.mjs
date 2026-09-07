const apply = Reflect.apply;
const normalize = String.prototype.normalize;
const lower = String.prototype.toLowerCase;
const replace = String.prototype.replace;

/** Normalize legacy display labels only; stable references remain exact. @param {unknown} value */
export function capabilityLabel(value) {
  if (typeof value !== 'string') return '';
  const text = apply(lower, apply(normalize, value, ['NFKC']), []);
  return apply(replace, apply(replace, text, [/\s+/gu, ' ']), [/^[\s]+|[\s.。!！?？:：;；]+$/gu, '']);
}

/** @param {any[]} observers @param {any} expectation @returns {any|null} */
export function resolveObserver(observers, expectation) {
  const hasRefs = expectation.observer_ref !== undefined || expectation.target_ref !== undefined;
  if (hasRefs && (typeof expectation.observer_ref !== 'string' || !expectation.observer_ref
    || typeof expectation.target_ref !== 'string' || !expectation.target_ref)) return null;
  let match = null;
  for (let index = 0; index < observers.length; index += 1) {
    const observer = observers[index];
    const matches = hasRefs
      ? observer.observer_id === expectation.observer_ref && observer.target_id === expectation.target_ref
      : capabilityLabel(observer.observer) === capabilityLabel(expectation.observer)
        && capabilityLabel(observer.observation_target) === capabilityLabel(expectation.observation_target);
    if (!matches) continue;
    if (match) return null;
    match = observer;
  }
  return match;
}
