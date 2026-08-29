declare const process: any;

declare module 'node:assert/strict' {
  const assert: any;
  export default assert;
}

declare module 'node:child_process' {
  export const spawn: any;
}

declare module 'node:fs/promises' {
  export const mkdtemp: any;
  export const readdir: any;
  export const rm: any;
  export const stat: any;
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

declare module 'node:url' {
  export const fileURLToPath: any;
}
