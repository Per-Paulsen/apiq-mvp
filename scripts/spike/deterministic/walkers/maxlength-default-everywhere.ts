/**
 * Walker: spec-wide default `maxLength` value used as meaningless validation.
 *
 * Targets stripe F24 ("`maxLength: 5000` is the spec-wide default for string
 * properties, providing no real validation").
 *
 * Heuristic: count fields with `maxLength` set to a value that's used >50× in
 * the spec. The most-used value, if dominant, is likely a meaningless default
 * (e.g. Stripe's 5000).
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkAllSchemas } from './_shared.js';

const MIN_USES = 50;

export async function walkMaxLengthDefaultEverywhere(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const counts: Map<number, number> = new Map();
  let totalStringWithMax = 0;
  let totalStringFields = 0;

  for (const { schema } of walkAllSchemas(spec)) {
    const type = schema.type;
    if (type !== 'string') continue;
    totalStringFields++;
    const ml = schema.maxLength;
    if (typeof ml === 'number' && Number.isFinite(ml)) {
      totalStringWithMax++;
      counts.set(ml, (counts.get(ml) ?? 0) + 1);
    }
  }

  // Find the dominant maxLength value
  let topValue: number | null = null;
  let topCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topValue = value;
    }
  }

  if (topValue === null || topCount < MIN_USES) return [];

  // Compute percentage of string fields carrying this value
  const percentage = totalStringFields > 0
    ? Math.round((topCount / totalStringFields) * 1000) / 10
    : 0;

  return [
    {
      detectorId: 'walker:maxlength-default-everywhere',
      layer: 'walker-statistical',
      title: `string maxLength=${topValue} used as spec-wide default; provides no real validation`,
      narration:
        `${topCount} string properties carry \`maxLength: ${topValue}\` ` +
        `(${percentage}% of all ${totalStringFields} string fields with a type:string declaration). ` +
        `The bound appears as a near-universal default rather than a per-field semantic limit. ` +
        `An email address is bounded by RFC 5321 to 254 characters; a URL is conventionally ` +
        `≤ 2048; a typical product name ≤ 200. A blanket high default leaves the actual semantic ` +
        `bound un-encoded — schema-driven validators, AI-codegen tools, and form-builders treat ` +
        `${topValue} as the per-field limit and emit input components sized accordingly.`,
      rationale:
        'OpenAPI 3.0 §4.7.21 inherits JSON Schema\'s `maxLength`. Microsoft REST §6.3 and ' +
        'Google AIP-141 ("Field validation") name field-appropriate length bounds as a contract ' +
        'concern: an unbounded-or-nearly-unbounded string is a denial-of-service vector and an ' +
        'integration ergonomics issue.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Replace blanket maxLength=${topValue} defaults with field-appropriate bounds (emails ≤ 254, URLs ≤ 2048, descriptions ≤ 1000).`,
      meta: { topValue, topCount, totalStringWithMax, totalStringFields, percentage },
    },
  ];
}
