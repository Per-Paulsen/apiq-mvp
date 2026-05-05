/**
 * Walker: vendor-extension overuse across enum / property fields.
 *
 * Targets stripe F9 ("`x-stripeBypassValidation` vendor extension exposed on
 * 538 enum fields signals non-authoritative enums") and github F23
 * ("All 1145 operations carry an undocumented `x-github` extension").
 *
 * Threshold: total `x-*` extension occurrences across the entire spec > 100.
 * Reports the top 5 most-used extensions.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

const MIN_TOTAL_OCCURRENCES = 100;

export async function walkVendorExtensionOveruse(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const counts: Map<string, number> = new Map();
  const seen = new WeakSet<object>();

  function visit(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }

    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith('x-')) {
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      visit(v);
    }
  }

  visit(spec);

  // Total occurrences across all extensions
  let totalOccurrences = 0;
  for (const c of counts.values()) totalOccurrences += c;

  if (totalOccurrences < MIN_TOTAL_OCCURRENCES) return [];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top5 = sorted.slice(0, 5);
  const top5Str = top5.map(([k, c]) => `\`${k}\` (${c})`).join(', ');

  return [
    {
      detectorId: 'walker:vendor-extension-overuse',
      layer: 'walker-statistical',
      title: `Vendor extensions used heavily across the spec (${totalOccurrences} total occurrences)`,
      narration:
        `The spec carries ${totalOccurrences} \`x-*\` vendor-extension occurrences across ${counts.size} ` +
        `distinct extension keys. Top 5 by frequency: ${top5Str}. ` +
        `Vendor extensions are valid per OpenAPI 3.0 §3.4 but expect to be either documented or to ` +
        `have semantic meaning visible from context. Heavy use of undocumented extensions creates ` +
        `a contract gap: tooling that doesn't recognise the extension silently ignores it; consumers ` +
        `who do recognise it must guess at the semantics. AI-codegen tools that emit strict types ` +
        `from the spec may be acting on incomplete information without knowing it.`,
      rationale:
        'OpenAPI 3.0 §3.4 ("Specification Extensions") permits `x-` extensions but expects them to ' +
        'be either documented or to have semantic meaning visible from context. Heavy use of ' +
        'undocumented extensions creates a hidden second contract that only insiders understand.',
      category: 'clarity',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: 'Document the semantics of heavily-used `x-*` vendor extensions in `info.description` or remove them from the public spec.',
      meta: { totalOccurrences, distinctKeys: counts.size, top5: Object.fromEntries(top5) },
    },
  ];
}
