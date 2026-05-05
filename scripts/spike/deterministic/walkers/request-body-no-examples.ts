/**
 * Walker: POST/PUT/PATCH operations without requestBody examples.
 *
 * Targets stripe F27 ("Zero operations carry `requestBody` examples").
 *
 * Threshold: >50% of POST/PUT/PATCH ops lack examples on requestBody.content.*
 *
 * Detects both legacy `example: ...` and `examples: { ... }` keywords on
 * requestBody.content[mediaType].
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkOperations, isRequestBodyMethod, pct } from './_shared.js';

function hasExamples(requestBody: unknown): boolean {
  if (!requestBody || typeof requestBody !== 'object') return false;
  const rb = requestBody as Record<string, unknown>;
  const content = rb.content as Record<string, unknown> | undefined;
  if (!content || typeof content !== 'object') return false;
  for (const mediaType of Object.values(content)) {
    if (!mediaType || typeof mediaType !== 'object') continue;
    const mt = mediaType as Record<string, unknown>;
    if (mt.example !== undefined) return true;
    if (mt.examples && typeof mt.examples === 'object' &&
        Object.keys(mt.examples as object).length > 0) return true;
  }
  return false;
}

export async function walkRequestBodyNoExamples(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let withoutExamples = 0;

  for (const { method, operation } of walkOperations(spec)) {
    if (!isRequestBodyMethod(method)) continue;
    if (operation.requestBody === undefined) continue;
    total++;
    if (!hasExamples(operation.requestBody)) {
      withoutExamples++;
    }
  }

  if (total === 0) return [];
  const ratio = withoutExamples / total;
  if (ratio <= 0.5) return [];

  const percentage = pct(withoutExamples, total);
  return [
    {
      detectorId: 'walker:request-body-no-examples',
      layer: 'walker-statistical',
      title: 'Operations carry no requestBody examples',
      narration:
        `${withoutExamples}/${total} POST/PUT/PATCH operations (${percentage}%) have no ` +
        `\`example\` or \`examples\` on \`requestBody.content\`. ` +
        `Documentation portals (ReDoc, SwaggerUI, Stoplight Elements) render the request ` +
        `shape from the schema alone, without a concrete sample payload. AI-codegen tools ` +
        `that use examples to drive realistic test fixtures get nothing. SDK consumers writing ` +
        `their first call see only the schema and have to leave the spec to find a working ` +
        `example in external docs.`,
      rationale:
        'OpenAPI 3.0 §4.7.13 ("Request Body Object") and §4.7.20 ("Example Object") name ' +
        '`example` and `examples` as a first-class documentation surface. RFC 7807-style API ' +
        'design guides (Microsoft REST §3.5, Google AIP-192) treat example payloads as required ' +
        'for any consumer-facing API.',
      category: 'clarity',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Add representative `example` or `examples` blocks on `requestBody.content` for each operation.',
      meta: { withoutExamples, total, percentage },
    },
  ];
}
