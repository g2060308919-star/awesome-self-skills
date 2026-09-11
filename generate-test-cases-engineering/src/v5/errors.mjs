export class V5ProtocolError extends Error {
  /** @param {string} code @param {string} message @param {string} [jsonPointer] */
  constructor(code, message, jsonPointer) {
    super(`${code}: ${message}`);
    this.name = 'V5ProtocolError';
    this.code = code;
    /** @type {string|undefined} */
    this.integrity_target_kind = undefined;
    /** @type {string[]|undefined} */
    this.affected_refs = undefined;
    if (jsonPointer !== undefined) this.json_pointer = jsonPointer;
  }
}
