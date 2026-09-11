export class V5ProtocolError extends Error {
  /** @param {string} code @param {string} message @param {string} [jsonPointer] */
  constructor(code, message, jsonPointer) {
    super(`${code}: ${message}`);
    this.name = 'V5ProtocolError';
    this.code = code;
    if (jsonPointer !== undefined) this.json_pointer = jsonPointer;
  }
}
