import { checkV5Contracts, writeV5Contracts } from '../src/v5/registry-generator.mjs';

const schemaDirectory = 'skill/generate-test-cases/scripts/schemas';
const policyDirectory = 'skill/generate-test-cases/scripts/policies';
const argumentsList = process.argv.slice(2);

if (argumentsList.length > 1 || (argumentsList.length === 1 && argumentsList[0] !== '--check')) {
  throw new Error('usage: node build/generate-v5-policy-artifacts.mjs [--check]');
}

if (argumentsList[0] === '--check') await checkV5Contracts(schemaDirectory, policyDirectory);
else await writeV5Contracts(schemaDirectory, policyDirectory);
