import { V5ProtocolError } from './errors.mjs';

/**
 * Derive the closed semantic Case status without consulting execution resources.
 * @param {{evidence_levels:string[],unresolved_gap_ids:string[],not_applicable_basis_levels?:string[],exploratory_only?:boolean}} input
 */
export function deriveCaseStatus(input) {
  if (!Array.isArray(input.evidence_levels) || !Array.isArray(input.unresolved_gap_ids) || input.evidence_levels.some((level) => !['E1', 'E2', 'E3'].includes(level))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Case status requires only accepted E1/E2/E3 business evidence.');
  if (input.not_applicable_basis_levels !== undefined) {
    if (input.unresolved_gap_ids.length > 0 || input.not_applicable_basis_levels.length === 0 || input.not_applicable_basis_levels.some((level) => !['E2', 'E3'].includes(level))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'NotApplicable requires independent E2/E3 exclusion basis and no unresolved gap.');
    return 'NotApplicable';
  }
  if (input.exploratory_only === true) {
    if (input.unresolved_gap_ids.length > 0) return 'Blocked';
    return 'Exploratory';
  }
  if (input.unresolved_gap_ids.length > 0) return 'Blocked';
  if (input.evidence_levels.length === 0 || input.evidence_levels.some((level) => !['E1', 'E2', 'E3'].includes(level))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Grounded or Conditional Case requires accepted business evidence.');
  return input.evidence_levels.includes('E1') ? 'Conditional' : 'Grounded';
}
