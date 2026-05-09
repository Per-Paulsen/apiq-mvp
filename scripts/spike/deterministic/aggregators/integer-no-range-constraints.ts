/**
 * Walker: integer/number properties without minimum/maximum.
 *
 * Targets stripe F25 ("Integer and number properties have zero range constraints
 * across the entire spec") and github F19.
 *
 * Threshold: >50% of integer/number fields lack range constraints.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkAllSchemas, pct } from './_shared.js';

export async function walkIntegerNoRangeConstraints(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let withoutRange = 0;

  for (const { schema } of walkAllSchemas(spec)) {
    const type = schema.type;
    if (type !== 'integer' && type !== 'number') continue;
    // Skip if it has enum (closed set, range moot)
    if (Array.isArray(schema.enum)) continue;
    // Skip if it has format that implies bounds (e.g. int32, int64 — leave those
    // alone; we only flag truly unbounded fields).
    total++;
    const hasMin =
      typeof schema.minimum === 'number' || typeof schema.exclusiveMinimum === 'number' ||
      schema.exclusiveMinimum === true;
    const hasMax =
      typeof schema.maximum === 'number' || typeof schema.exclusiveMaximum === 'number' ||
      schema.exclusiveMaximum === true;
    if (!hasMin && !hasMax) {
      withoutRange++;
    }
  }

  if (total === 0) return [];
  const ratio = withoutRange / total;
  if (ratio <= 0.5) return [];

  const percentage = pct(withoutRange, total);
  return [
    {
      detectorId: 'walker:integer-no-range-constraints',
      layer: 'walker-statistical',
      title: 'Integer/number properties have zero range constraints',
      narration:
        `${withoutRange}/${total} integer/number properties (${percentage}%) lack ` +
        `\`minimum\` / \`maximum\` (and \`exclusiveMinimum\` / \`exclusiveMaximum\`) constraints. ` +
        `Examples include monetary amounts, count fields, IDs, and pagination limits — all of ` +
        `which the runtime API typically enforces but the spec leaves un-encoded. A consumer ` +
        `reading the spec sees \`{"type": "integer"}\` and emits validation logic that allows ` +
        `\`Number.MAX_SAFE_INTEGER\`, then hits a 400 at runtime. This is one of the strongest ` +
        `forms of spec-knowledge-asymmetry — the API has bounds, the spec has none.`,
      rationale:
        'JSON Schema §6.2 ("Validation Keywords for Numeric Instances") and OpenAPI 3.0 §4.7.21 ' +
        'expect `minimum` / `maximum` for numeric fields with documented bounds. Per Microsoft ' +
        'REST §6.3 and Google AIP-141, unbounded numeric fields are a contract gap.',
      category: 'design',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Add `minimum` / `maximum` constraints to integer and number properties where the API has a defined range.',
      meta: { withoutRange, total, percentage },
    },
  ];
}
