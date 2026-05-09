/**
 * Walker: prose-only deprecation markers without `deprecated: true`.
 *
 * Targets stripe F13 ("Three operations have prose-only deprecation markers
 * but `deprecated: true` is not set").
 *
 * No threshold — list every offending op-path. (Prose-deprecation without flag
 * is always a finding, not a statistical one.)
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import { walkOperations } from './_shared.js';

const DEPRECATION_RE = /\bdeprecat(ed|ion)\b|\bno longer (recommended|supported|available)\b|\bwill be removed\b|\bobsolete\b/i;

export async function walkProseDeprecationWithoutFlag(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const offenders: Array<{ path: string; method: string; quote: string }> = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    if (operation.deprecated === true) continue; // already flagged correctly
    const desc = operation.description;
    const summary = operation.summary;
    const text = [
      typeof desc === 'string' ? desc : '',
      typeof summary === 'string' ? summary : '',
    ].join(' ');
    const match = text.match(DEPRECATION_RE);
    if (!match) continue;
    // Trim a short quote around the match for narration
    const idx = text.search(DEPRECATION_RE);
    const quote = text
      .slice(Math.max(0, idx - 20), Math.min(text.length, idx + 80))
      .trim();
    offenders.push({ path, method, quote });
  }

  if (offenders.length === 0) return [];

  const examples = offenders
    .slice(0, 3)
    .map((o) => `${o.method.toUpperCase()} ${o.path} — "${o.quote}"`)
    .join('; ');

  return [
    {
      detectorId: 'walker:prose-deprecation-without-flag',
      layer: 'walker-statistical',
      title: 'Operations have prose-only deprecation markers but `deprecated: true` is not set',
      narration:
        `${offenders.length} operation(s) carry deprecation language in their \`description\` ` +
        `or \`summary\` field but do **not** set the OpenAPI \`deprecated: true\` flag. ` +
        `Examples: ${examples}. ` +
        `OpenAPI tooling — codegens, lint tools, documentation portals — reads \`deprecated: true\` ` +
        `to flag operations as legacy in generated SDKs (e.g. \`@deprecated\` annotations in ` +
        `TypeScript / Java) and to grey-out entries in docs. Prose-only deprecation is invisible ` +
        `to that tooling.`,
      rationale:
        'OpenAPI 3.0 §4.7.4 ("Operation Object") defines `deprecated` as a boolean signal for ' +
        'tooling. Microsoft REST API Guidelines §12.4 ("Deprecation") recommends the machine-' +
        'readable flag *and* prose, not prose alone.',
      category: 'clarity',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: offenders.map((o) => ({ path: o.path, method: o.method })),
      patchOps: offenders.map((o) => ({
        op: 'add',
        path: `/paths/${o.path.replace(/~/g, '~0').replace(/\//g, '~1')}/${o.method}/deprecated`,
        value: true,
      })),
      patchSummary: `Set \`deprecated: true\` on the ${offenders.length} operation(s) that already announce deprecation in prose.`,
      meta: { count: offenders.length },
    },
  ];
}
