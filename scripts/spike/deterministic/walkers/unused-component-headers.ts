/**
 * Walker: unreferenced `components.headers` entries.
 *
 * Targets github F5 ("X-RateLimit response headers defined in `components.headers`
 * but referenced by zero operations").
 *
 * Logic: enumerate `components.headers.<name>` keys, then walk the entire spec
 * looking for `$ref: '#/components/headers/<name>'`. Headers that never appear
 * as a $ref target are dead code in the spec.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

export async function walkUnusedComponentHeaders(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  if (!components || typeof components !== 'object') return [];
  const headers = components.headers as Record<string, unknown> | undefined;
  if (!headers || typeof headers !== 'object') return [];

  const declared = Object.keys(headers);
  if (declared.length === 0) return [];

  // Collect all $ref targets in the spec
  const referenced = new Set<string>();
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
      if (k === '$ref' && typeof v === 'string') {
        const m = v.match(/^#\/components\/headers\/([^/]+)$/);
        if (m && m[1]) referenced.add(decodeURIComponent(m[1]));
      } else {
        visit(v);
      }
    }
  }

  // Skip the components.headers subtree itself when collecting refs (header
  // definitions can $ref each other internally — that's not "use").
  for (const [topKey, topVal] of Object.entries(root)) {
    if (topKey === 'components') {
      // Walk all of components EXCEPT components.headers
      if (topVal && typeof topVal === 'object') {
        for (const [compKey, compVal] of Object.entries(topVal as Record<string, unknown>)) {
          if (compKey === 'headers') continue;
          visit(compVal);
        }
      }
    } else {
      visit(topVal);
    }
  }

  const unused = declared.filter((name) => !referenced.has(name));
  if (unused.length === 0) return [];

  return [
    {
      detectorId: 'walker:unused-component-headers',
      layer: 'walker-statistical',
      title: `${unused.length} component header(s) defined but never referenced`,
      narration:
        `\`components.headers\` declares ${declared.length} reusable header object(s); ` +
        `${unused.length} of them are never referenced by any operation: ` +
        `${unused.slice(0, 10).join(', ')}` +
        `${unused.length > 10 ? ` (and ${unused.length - 10} more)` : ''}. ` +
        `Defining headers in \`components.headers\` but not referencing them is dead code in ` +
        `the spec. Codegen tools that produce typed response objects drop the metadata entirely; ` +
        `SDK consumers writing logic that consumes those headers must hard-code names from ` +
        `external documentation. Either reference the headers from operation responses or ` +
        `remove the unused definitions.`,
      rationale:
        'OpenAPI 3.0 §4.7.18.1 ("Response Object") supports `headers` as a typed declaration on ' +
        'responses. Defining a reusable header in `components.headers` is only meaningful if at ' +
        'least one response references it via `$ref`.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Reference the ${unused.length} unused component header(s) from operation responses or remove them.`,
      meta: { unused, totalDeclared: declared.length },
    },
  ];
}
