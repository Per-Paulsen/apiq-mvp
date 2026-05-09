/**
 * Walker: mixed page-based + cursor-based pagination across the spec.
 *
 * Targets stripe F16 ("Seven `/search` endpoints use page-based pagination
 * while the rest of the spec uses cursor-based").
 *
 * Logic: walk every operation that's likely a list endpoint (any GET with a
 * `limit` parameter or with `data:` array in 200 response) and classify each as:
 *   - cursor-based: has `cursor`, `starting_after`, `ending_before`, or
 *     `next_token` query parameter
 *   - page-based: has `page` or `per_page` (or `pageSize`) query parameter
 *   - other: neither
 *
 * If both styles co-occur in the same spec, emit a finding listing the minority
 * group (typically the divergent few endpoints).
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkOperations } from './_shared.js';

const CURSOR_PARAMS = new Set(['cursor', 'starting_after', 'ending_before', 'next_token', 'pageToken']);
const PAGE_PARAMS = new Set(['page', 'per_page', 'pageSize', 'page_size']);

interface OpClassification {
  path: string;
  method: string;
  style: 'cursor' | 'page';
}

function paramNames(operation: Record<string, unknown>): string[] {
  const params = operation.parameters;
  if (!Array.isArray(params)) return [];
  const names: string[] = [];
  for (const p of params) {
    if (!p || typeof p !== 'object') continue;
    const pp = p as Record<string, unknown>;
    if (pp.in !== 'query') continue;
    if (typeof pp.name === 'string') names.push(pp.name);
  }
  return names;
}

export async function walkPaginationStyleInconsistency(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const cursorOps: OpClassification[] = [];
  const pageOps: OpClassification[] = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    if (method !== 'get') continue;
    const names = paramNames(operation);
    const hasCursor = names.some((n) => CURSOR_PARAMS.has(n));
    const hasPage = names.some((n) => PAGE_PARAMS.has(n));
    if (hasCursor) {
      cursorOps.push({ path, method, style: 'cursor' });
    } else if (hasPage) {
      pageOps.push({ path, method, style: 'page' });
    }
  }

  // Need both styles present to constitute "inconsistency"
  if (cursorOps.length === 0 || pageOps.length === 0) return [];

  // Identify the minority style (the divergent few)
  const minority = cursorOps.length < pageOps.length ? cursorOps : pageOps;
  const majority = cursorOps.length < pageOps.length ? pageOps : cursorOps;
  const minorityStyle = minority[0]?.style ?? 'page';
  const majorityStyle = majority[0]?.style ?? 'cursor';

  const minorityList = minority
    .slice(0, 7)
    .map((o) => `${o.method.toUpperCase()} ${o.path}`)
    .join(', ');
  const moreSuffix = minority.length > 7 ? ` (and ${minority.length - 7} more)` : '';

  return [
    {
      detectorId: 'walker:pagination-style-inconsistency',
      layer: 'walker-statistical',
      title: `Pagination style inconsistent: ${minority.length} operations use ${minorityStyle}-based, ${majority.length} use ${majorityStyle}-based`,
      narration:
        `The spec mixes two pagination styles. ${majority.length} operations use ` +
        `${majorityStyle}-based pagination while ${minority.length} operations use ` +
        `${minorityStyle}-based pagination. Divergent endpoints: ${minorityList}${moreSuffix}. ` +
        `SDK codegens that build a typed \`Pagination\` abstraction over the spec must special-case ` +
        `the minority endpoints; consumers building dashboards must implement two pagination ` +
        `strategies. Either standardise (if technically feasible) or document the divergence ` +
        `explicitly so consumers know about it before building integrations.`,
      rationale:
        'OpenAPI 3.0 has no built-in pagination construct, so the spec is the only place to ' +
        'document the convention. The OpenAPI Initiative\'s API Design Style Guide and Microsoft ' +
        'REST §10.5 ("Pagination") name internal consistency as the dominant design lever — a ' +
        'divergent pattern is acceptable, an undocumented divergent pattern is not.',
      category: 'design',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: minority.map((o) => ({ path: o.path, method: o.method })),
      patchOps: [],
      patchSummary: `Document the pagination divergence — ${minority.length} endpoints use ${minorityStyle}-based, the rest use ${majorityStyle}-based.`,
      meta: {
        cursorCount: cursorOps.length,
        pageCount: pageOps.length,
        minorityStyle,
        majorityStyle,
      },
    },
  ];
}
