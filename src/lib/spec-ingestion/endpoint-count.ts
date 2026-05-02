/**
 * Counts unique `(path, method)` pairs across `paths.*` for an OpenAPI 3.x spec.
 *
 * Per Epic 03 Open Question recommendation, ALL HTTP methods are counted —
 * including `options` / `head` / `trace`. They are real endpoints from the
 * tooling perspective and contribute to the LLM-token budget.
 */

const HTTP_METHODS = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

export function countEndpoints(specJson: unknown): number {
  if (specJson === null || typeof specJson !== 'object') return 0;
  const paths = (specJson as Record<string, unknown>).paths;
  if (paths === null || typeof paths !== 'object') return 0;
  let count = 0;
  for (const pathItem of Object.values(paths as Record<string, unknown>)) {
    if (pathItem === null || typeof pathItem !== 'object') continue;
    for (const method of Object.keys(pathItem as Record<string, unknown>)) {
      if (HTTP_METHODS.has(method.toLowerCase())) {
        count++;
      }
    }
  }
  return count;
}
