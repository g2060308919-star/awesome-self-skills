import { advanceStrict } from './advance-strict.mjs';

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
const compilerVersion = typeof __COMPILER_VERSION__ === 'string' ? __COMPILER_VERSION__ : '0.1.0';
const reply = nodeMajor >= 20
  ? compilerVersion.length > 0
    ? await advanceStrict(process.argv[2] ?? '')
    : {
        status: 'fatal',
        diagnostics: [{
          category: 'reference',
          code: 'compiler_version_missing',
          message: 'The bundled compiler version is missing.'
        }]
      }
  : {
      status: 'fatal',
      diagnostics: [{
        category: 'reference',
        code: 'runtime_node20_required',
        message: 'Node.js 20 or newer is required.'
      }]
    };

process.stdout.write(`${JSON.stringify(reply)}\n`);
