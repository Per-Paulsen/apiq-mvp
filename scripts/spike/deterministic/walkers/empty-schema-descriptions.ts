/**
 * Walker: empty/missing/stub descriptions on component schemas.
 *
 * Targets stripe F29 ("79% of component schemas carry empty-string description")
 * and dnd5eapi F11 ("41 of 49 component schemas carry stub `description` values
 * that just echo the schema name").
 *
 * Threshold: >50% of component schemas have empty/missing/stub descriptions.
 *
 * "Stub" detection: description text, after stripping backticks/whitespace,
 * is identical to the schema name.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkComponentSchemas, pct } from './_shared.js';

function isEmptyOrStub(name: string, description: unknown): boolean {
  if (description === undefined || description === null) return true;
  if (typeof description !== 'string') return true;
  const trimmed = description.trim();
  if (trimmed.length === 0) return true;
  // Stub: strip backticks/whitespace and compare to name
  const stripped = trimmed.replace(/[`\s]/g, '');
  if (stripped === name) return true;
  // Very short descriptions that don't add information
  if (trimmed.length < 4) return true;
  return false;
}

export async function walkEmptySchemaDescriptions(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let empty = 0;
  let stub = 0;
  let missing = 0;

  for (const { name, schema } of walkComponentSchemas(spec)) {
    total++;
    const desc = schema.description;
    if (desc === undefined) {
      missing++;
    } else if (typeof desc !== 'string' || desc.trim().length === 0) {
      empty++;
    } else {
      const stripped = desc.trim().replace(/[`\s]/g, '');
      if (stripped === name || desc.trim().length < 4) {
        stub++;
      }
    }
  }

  if (total === 0) return [];
  const flagged = empty + stub + missing;
  const ratio = flagged / total;
  if (ratio <= 0.5) return [];

  const percentage = pct(flagged, total);
  const breakdown: string[] = [];
  if (empty > 0) breakdown.push(`${empty} empty-string`);
  if (missing > 0) breakdown.push(`${missing} missing entirely`);
  if (stub > 0) breakdown.push(`${stub} stub-only (echo schema name)`);

  return [
    {
      detectorId: 'walker:empty-schema-descriptions',
      layer: 'walker-statistical',
      title: 'Component schemas carry empty or stub descriptions',
      narration:
        `${flagged}/${total} component schemas (${percentage}%) have empty, missing, ` +
        `or stub descriptions (${breakdown.join('; ')}). ` +
        `Empty-string descriptions are worse than missing — tooling treats them as ` +
        `"documented but blank" rather than "documentation pipeline did not visit". ` +
        `Stub descriptions (e.g. \`Spell.description = "Spell"\`) satisfy the structural ` +
        `"description present" check but provide zero informational value to documentation ` +
        `consumers, codegen tools that emit doc-comments, or AI agents reading the spec.`,
      rationale:
        'OpenAPI 3.0 §4.7.21 ("Schema Object") names `description` as the documentation surface. ' +
        'JSON Schema §10.1.1 makes `description` an annotation keyword. Empty-string and stub ' +
        'descriptions are technically valid but pragmatically worse than absent — tooling has ' +
        'no way to distinguish "not documented" from "deliberately empty/stub".',
      category: 'clarity',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Populate `description` on component schemas where it is currently empty or stub.',
      meta: { flagged, empty, missing, stub, total, percentage },
    },
  ];
}
