import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { digest } from './canonical.mjs';
import { assertSupportedSchema } from './schema-validator.mjs';

/** @param {string} schemaDirectory @param {string | undefined} embeddedManifestDigest */
export async function loadSchemaRegistry(schemaDirectory, embeddedManifestDigest) {
  const manifestPath = path.join(schemaDirectory, '..', 'schema-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expectedManifestDigest = embeddedManifestDigest ?? manifest.digest;
  if (digest({ schema_version: manifest.schema_version, schemas: manifest.schemas }) !== expectedManifestDigest || manifest.digest !== expectedManifestDigest) {
    throw new Error('SCHEMA_INTEGRITY_MISMATCH');
  }
  if (!Array.isArray(manifest.schemas) || typeof manifest.schema_version !== 'string') throw new Error('SCHEMA_INTEGRITY_MISMATCH');
  const schemas = new Map();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== 'object' || typeof entry.file !== 'string' || typeof entry.digest !== 'string') throw new Error('SCHEMA_INTEGRITY_MISMATCH');
    const schema = JSON.parse(await readFile(path.join(schemaDirectory, entry.file), 'utf8'));
    if (digest(schema) !== entry.digest) throw new Error('SCHEMA_INTEGRITY_MISMATCH');
    assertSupportedSchema(schema);
    schemas.set(entry.file, schema);
  }
  return { schemaVersion: manifest.schema_version, schemas };
}
