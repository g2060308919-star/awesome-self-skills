import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './canonical.mjs';
import { assertSupportedSchema } from './schema-validator.mjs';

/** @param {string} schemaDirectory @param {string | undefined} embeddedManifestDigest @param {string | undefined} [embeddedCompilerVersion] */
export async function loadSchemaRegistry(schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion) {
  const manifestPath = path.join(schemaDirectory, '..', 'schema-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expectedManifestDigest = embeddedManifestDigest ?? manifest.digest;
  if (digest({ compiler_version: manifest.compiler_version, schema_version: manifest.schema_version, schemas: manifest.schemas }) !== expectedManifestDigest || manifest.digest !== expectedManifestDigest) {
    throw new Error('SCHEMA_INTEGRITY_MISMATCH');
  }
  if (!Array.isArray(manifest.schemas) || typeof manifest.schema_version !== 'string' || typeof manifest.compiler_version !== 'string' || (embeddedCompilerVersion && manifest.compiler_version !== embeddedCompilerVersion)) throw new Error('SCHEMA_INTEGRITY_MISMATCH');
  const schemas = new Map();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string' || typeof entry.digest !== 'string') throw new Error('SCHEMA_INTEGRITY_MISMATCH');
    const schema = JSON.parse(await readFile(path.join(schemaDirectory, entry.file), 'utf8'));
    if (digest(schema) !== entry.digest) throw new Error('SCHEMA_INTEGRITY_MISMATCH');
    assertSupportedSchema(schema);
    schemas.set(entry.file, schema);
  }
  return { compilerVersion: manifest.compiler_version, schemaVersion: manifest.schema_version, schemas };
}
