declare const process: any;
declare const __SCHEMA_MANIFEST_DIGEST__: string;
declare const __SCHEMA_VERSION__: string;
declare const __COMPILER_VERSION__: string;
declare const __SCHEMA_DIRECTORY__: string;

declare module 'node:assert/strict' {
  const assert: any;
  export default assert;
}

declare module 'node:child_process' {
  export const ChildProcess: any;
  export const spawn: any;
}

declare module 'node:fs/promises' {
  export const mkdtemp: any;
  export const cp: any;
  export const mkdir: any;
  export const readFile: any;
  export const readdir: any;
  export const rm: any;
  export const stat: any;
  export const writeFile: any;
}

declare module 'node:crypto' {
  export const createHash: any;
}

declare module 'node:events' {
  export const EventEmitter: any;
}

declare module 'node:os' {
  const os: any;
  export default os;
}

declare module 'node:path' {
  const path: any;
  export default path;
}

declare module 'node:test' {
  const test: any;
  export default test;
}

declare module 'node:worker_threads' {
  export const Worker: any;
}

declare module 'node:url' {
  export const fileURLToPath: any;
}
