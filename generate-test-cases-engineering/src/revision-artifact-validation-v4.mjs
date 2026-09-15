import { createHash } from 'node:crypto';

import behaviorViewsSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import checkpointSchema from '../skill/generate-test-cases/scripts/schemas/checkpoint.schema.json' with { type: 'json' };
import currentPointerSchema from '../skill/generate-test-cases/scripts/schemas/current-pointer.schema.json' with { type: 'json' };
import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import testObligationsSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };

import { materializeCaseDocumentDeliveryV4 } from './canonical-delivery-v4.mjs';
import { canonicalStringify } from './canonical.mjs';
import { validateSemanticClarificationCheckpointV4 } from './clarification-v4.mjs';
import { validateCanonicalManifestRelations } from './contracts.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { v4ContractForSchema } from './v4-contract.mjs';

/** @param {unknown} value */
function canonicalDigest(value) {
  return `sha256:${createHash('sha256').update(canonicalStringify(value), 'utf8').digest('hex')}`;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string, string>} texts @param {string} key */
function parseCanonicalJson(texts, key) {
  let value;
  try { value = JSON.parse(texts[key]); } catch { throw new TypeError('REVISION_ARTIFACT_SCHEMA_INVALID'); }
  if (`${canonicalStringify(value)}\n` !== texts[key]) throw new TypeError('REVISION_ARTIFACT_NOT_CANONICAL');
  return value;
}

/** @param {unknown} value @param {unknown} schema */
function requireSchema(value, schema) {
  if (validateAgainstSchema(value, schema).length || validateUniqueStableIds(value).length) {
    throw new TypeError('REVISION_ARTIFACT_SCHEMA_INVALID');
  }
}

/** @param {Record<string, any>} value @param {string[]} keys */
function requireExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalStringify(actual) !== canonicalStringify(expected)) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
}

/** @param {unknown} left @param {unknown} right */
function requireSame(left, right) {
  if (canonicalStringify(left) !== canonicalStringify(right)) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
}

/**
 * Validate every schema and relationship that can be established from one
 * candidate revision alone. No filesystem mutation is permitted here.
 * @param {{profile:'pre_case_pending'|'post_case_pending'|'final',revision:number,run_id:string,
 * texts:Record<string,string>}} input
 */
export function validateRevisionArtifactsV4(input) {
  if (!record(input) || !record(input.texts)) throw new TypeError('REVISION_ARTIFACT_SCHEMA_INVALID');
  const texts = input.texts;
  /** @type {Record<string, any>} */
  const values = {};
  for (const key of Object.keys(texts)) {
    if (['markdown', 'worksheet', 'html', 'table'].includes(key)) continue;
    values[key] = parseCanonicalJson(texts, key);
  }

  requireSchema(values.source_pack, sourcePackSchema);
  requireSchema(values.evidence_claims, evidenceClaimsSchema);
  requireSchema(values.checkpoint, checkpointSchema);
  const contract = v4ContractForSchema(values.source_pack.schema_version);
  if (!contract || values.checkpoint.schema_version !== contract.schema_version
    || values.checkpoint.compiler_version !== contract.compiler_version) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
  if (validateSemanticClarificationCheckpointV4(values.checkpoint).length) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
  if (values.source_pack.schema_version !== contract.schema_version
    || values.source_pack.source_revision !== input.revision
    || values.source_pack.run_instance_id !== input.run_id
    || values.evidence_claims.schema_version !== contract.schema_version
    || values.evidence_claims.source_revision !== input.revision) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }

  requireExactKeys(values.decision_journal, ['schema_version', 'source_revision', 'decisions']);
  requireSame(values.decision_journal, {
    schema_version: contract.schema_version, source_revision: input.revision,
    decisions: values.source_pack.decision_records
  });
  requireExactKeys(values.fact_ledger, ['schema_version', 'source_revision', 'facts']);
  requireSame(values.fact_ledger, {
    schema_version: contract.schema_version, source_revision: input.revision,
    facts: values.evidence_claims.fact_ledger
  });
  requireExactKeys(values.scope_manifest, [
    'schema_version', 'source_revision', ...Object.keys(values.evidence_claims.scope_manifest)
  ]);
  requireSame(values.scope_manifest, {
    schema_version: contract.schema_version, source_revision: input.revision,
    ...values.evidence_claims.scope_manifest
  });
  requireExactKeys(values.clarification_state, [
    'schema_version', 'source_revision', ...Object.keys(values.checkpoint.clarification_state)
  ]);
  requireSame(values.clarification_state, {
    schema_version: contract.schema_version, source_revision: input.revision,
    ...values.checkpoint.clarification_state
  });
  if (values.checkpoint.fact_ledger_digest !== canonicalDigest(values.evidence_claims.fact_ledger)
    || values.checkpoint.scope_manifest_digest !== canonicalDigest(values.evidence_claims.scope_manifest)) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }

  if (input.profile === 'post_case_pending' || input.profile === 'final') {
    requireSchema(values.behavior_views, behaviorViewsSchema);
    requireSchema(values.test_obligations, testObligationsSchema);
    requireSchema(values.case_drafts, caseDraftsSchema);
    for (const key of ['behavior_views', 'test_obligations', 'case_drafts']) {
      if (values[key].schema_version !== contract.schema_version || values[key].source_revision !== input.revision) {
        throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
      }
    }
    if (values.checkpoint.behavior_views_digest !== canonicalDigest(values.behavior_views)
      || values.checkpoint.case_drafts_digest !== canonicalDigest(values.case_drafts)) {
      throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
    }
  } else if (values.checkpoint.behavior_views_digest !== null
    || values.checkpoint.case_drafts_digest !== null) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }

  if (input.profile === 'final') {
    requireSchema(values.bundle, testBundleSchema);
    requireSchema(values.manifest, currentPointerSchema);
    if (validateCanonicalManifestRelations(values.manifest).length
      || values.bundle.source_revision !== input.revision
      || values.manifest.run_id !== input.run_id
      || values.manifest.revision !== input.revision
      || values.manifest.delivery_intent !== 'case_document') {
      throw new TypeError('CANONICAL_MANIFEST_INVALID');
    }
    let materialized;
    try {
      materialized = materializeCaseDocumentDeliveryV4({
        run_id: input.run_id,
        completed_at: values.manifest.completed_at,
        bundle: values.bundle,
        ...(contract.candidate ? { source_reading: values.source_reading } : {}),
        render_options: values.manifest.render_options,
        non_blocking_diagnostics: []
      });
    } catch {
      throw new TypeError('CANONICAL_MANIFEST_INVALID');
    }
    if (materialized.bundle_bytes !== texts.bundle
      || materialized.markdown_bytes !== texts.markdown
      || materialized.worksheet_bytes !== texts.worksheet
      || (contract.candidate && (materialized.html_bytes !== texts.html
        || materialized.table_bytes !== texts.table
        || materialized.source_reading_bytes !== texts.source_reading))
      || `${canonicalStringify(materialized.manifest)}\n` !== texts.manifest) {
      throw new TypeError('CANONICAL_MANIFEST_INVALID');
    }
  }
  return values;
}
