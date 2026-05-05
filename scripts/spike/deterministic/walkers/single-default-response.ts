/**
 * Walker: write operations whose only response declaration is `default`.
 *
 * Targets stripe F6 ("All write operations use a single `default` response with
 * no per-status differentiation").
 *
 * Threshold: >30% of POST/PUT/PATCH/DELETE ops declare only a `default` response,
 * or only a 2xx + `default` (no other status differentiation).
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';
import { walkOperations, isWriteMethod, pct } from './_shared.js';

export async function walkSingleDefaultResponse(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  let total = 0;
  let onlyDefault = 0;

  for (const { method, operation } of walkOperations(spec)) {
    if (!isWriteMethod(method)) continue;
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;
    total++;
    const keys = Object.keys(responses as object);
    // Count non-2xx, non-default status codes (4xx, 5xx, etc.)
    const errorStatusKeys = keys.filter((k) => {
      if (k === 'default') return false;
      // 2xx is success — not a per-status error differentiation
      const n = parseInt(k, 10);
      if (Number.isFinite(n) && n >= 200 && n < 300) return false;
      return true;
    });
    if (keys.includes('default') && errorStatusKeys.length === 0) {
      onlyDefault++;
    }
  }

  if (total === 0) return [];
  const ratio = onlyDefault / total;
  if (ratio <= 0.3) return [];

  const percentage = pct(onlyDefault, total);
  return [
    {
      detectorId: 'walker:single-default-response',
      layer: 'walker-statistical',
      title: 'Write operations use a single `default` response with no per-status differentiation',
      narration:
        `${onlyDefault}/${total} POST/PUT/PATCH/DELETE operations (${percentage}%) declare only ` +
        `a 2xx + \`default\` response (no explicit 400/401/403/404/409/429 entries). ` +
        `The \`default\` entry catches every non-2xx status, but that defers all status dispatch ` +
        `to runtime. AI-codegen tools that build typed result shapes ` +
        `(e.g. \`Result<Charge, BadRequestError | UnauthorizedError | RateLimitedError>\`) cannot ` +
        `do so from this spec — they degenerate to \`Result<Charge, GenericError>\`, losing all ` +
        `the dispatch information the runtime actually produces.`,
      rationale:
        'OpenAPI 3.0 §4.7.18 ("Responses Object") describes per-status entries as the primary ' +
        'mechanism for documenting response variation. RFC 7807 problem-detail conventions and ' +
        'Microsoft\'s REST guideline 7.10 both recommend documenting each meaningful status code ' +
        'rather than relying on a single catch-all.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Add explicit `400` / `401` / `403` / `404` / `429` response entries on write operations.',
      meta: { onlyDefault, total, percentage },
    },
  ];
}
