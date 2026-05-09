/**
 * Walker: operations that declare a 304 response but no `If-None-Match` /
 * `If-Modified-Since` request-header parameter.
 *
 * Targets github F3 + F4 + F13 (HTTP conditional-request contract gap):
 * documenting 304 without the validators that elicit it leaves the conditional-
 * request contract incomplete per RFC 7232.
 *
 * Logic: walk every operation. If responses includes "304", check if the
 * operation (or path-level) declares an If-None-Match or If-Modified-Since
 * header parameter. If not, flag the operation.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkOperations } from './_shared.js';

const VALIDATOR_HEADERS = new Set(['If-None-Match', 'If-Modified-Since']);

interface ResolvedParam {
  name?: string;
  in?: string;
}

function getParameterNames(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>
): ResolvedParam[] {
  const out: ResolvedParam[] = [];
  for (const source of [pathItem.parameters, operation.parameters]) {
    if (!Array.isArray(source)) continue;
    for (const p of source) {
      if (!p || typeof p !== 'object') continue;
      const pp = p as Record<string, unknown>;
      // Note: dereferenced specs will have `name`/`in` directly; non-dereferenced
      // would have `$ref` here. The deterministic-layer pre-pass receives the
      // already-dereferenced spec per the architecture-spec.
      out.push({
        name: typeof pp.name === 'string' ? pp.name : undefined,
        in: typeof pp.in === 'string' ? pp.in : undefined,
      });
    }
  }
  return out;
}

export async function walkResponseWithoutValidatorsOn304(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ path: string; method: string }> = [];

  for (const { path, method, operation, pathItem } of walkOperations(spec)) {
    const responses = operation.responses;
    if (!responses || typeof responses !== 'object') continue;
    const has304 = '304' in (responses as Record<string, unknown>);
    if (!has304) continue;

    const params = getParameterNames(operation, pathItem);
    const hasValidator = params.some(
      (p) => p.in === 'header' && p.name !== undefined && VALIDATOR_HEADERS.has(p.name)
    );
    if (!hasValidator) {
      offenders.push({ path, method });
    }
  }

  if (offenders.length === 0) return [];

  const exampleOps = offenders
    .slice(0, 5)
    .map((o) => `${o.method.toUpperCase()} ${o.path}`)
    .join(', ');

  return [
    {
      detectorId: 'walker:response-without-validators-on-304',
      layer: 'walker-statistical',
      title: `${offenders.length} operation(s) declare a 304 response without conditional-request validator headers`,
      narration:
        `${offenders.length} operation(s) document a \`304 Not Modified\` response but declare ` +
        `neither \`If-None-Match\` nor \`If-Modified-Since\` as request-header parameters. ` +
        `RFC 7232 §3.2 / §3.3 require one of these conditional-request headers for the server to ` +
        `return 304 — without them, the response is undocumented in terms of how to elicit it. ` +
        `Examples: ${exampleOps}` +
        `${offenders.length > 5 ? ` (and ${offenders.length - 5} more)` : ''}. ` +
        `SDK consumers see \`304\` in the response list but no documented way to trigger it; ` +
        `codegen tools emit no typed conditional-request affordance.`,
      rationale:
        'RFC 7232 ("Conditional Requests") §3.2 ("If-None-Match") and §3.3 ("If-Modified-Since") ' +
        'are the IETF foundation for client-driven cache validation. OpenAPI 3.0 §4.7.10 supports ' +
        'header parameters as first-class. Documenting 304 without the conditional-request headers ' +
        'is half a contract.',
      category: 'design',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: offenders.slice(0, 50),
      patchOps: [],
      patchSummary: `Add \`If-None-Match\` (and \`If-Modified-Since\`) header parameters on the ${offenders.length} operations that document a 304 response.`,
      meta: { count: offenders.length },
    },
  ];
}
