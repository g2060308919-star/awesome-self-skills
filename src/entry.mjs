import { advanceStrict } from './advance-strict.mjs';

const reply = await advanceStrict(process.argv[2] ?? '');
process.stdout.write(`${JSON.stringify(reply)}\n`);
