/**
 * Shared helpers for walker modules.
 *
 * Walkers all need to traverse `spec.paths.*.*` (operations) and
 * `spec.components.schemas.*` (component schemas) — these helpers centralise
 * the iteration so each walker can focus on its own pattern-detection.
 */

const HTTP_METHODS = new Set([
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace',
]);

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const REQUEST_BODY_METHODS = new Set(['post', 'put', 'patch']);

export function isHttpMethod(key: string): boolean {
  return HTTP_METHODS.has(key.toLowerCase());
}

export function isWriteMethod(key: string): boolean {
  return WRITE_METHODS.has(key.toLowerCase());
}

export function isRequestBodyMethod(key: string): boolean {
  return REQUEST_BODY_METHODS.has(key.toLowerCase());
}

export interface OperationCtx {
  path: string;
  method: string;
  operation: Record<string, unknown>;
  pathItem: Record<string, unknown>;
}

/**
 * Yield every operation in the spec as { path, method, operation, pathItem }.
 * Skips non-method keys like `parameters`, `summary`, `$ref` on path-items.
 */
export function* walkOperations(spec: object): Generator<OperationCtx> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== 'object') return;

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
    const pathItem = pathItemRaw as Record<string, unknown>;
    for (const [key, opRaw] of Object.entries(pathItem)) {
      if (!isHttpMethod(key)) continue;
      if (!opRaw || typeof opRaw !== 'object') continue;
      yield {
        path,
        method: key.toLowerCase(),
        operation: opRaw as Record<string, unknown>,
        pathItem,
      };
    }
  }
}

export interface SchemaCtx {
  name: string;
  schema: Record<string, unknown>;
}

/**
 * Yield every component schema as { name, schema }.
 */
export function* walkComponentSchemas(spec: object): Generator<SchemaCtx> {
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  if (!components || typeof components !== 'object') return;
  const schemas = components.schemas as Record<string, unknown> | undefined;
  if (!schemas || typeof schemas !== 'object') return;

  for (const [name, schemaRaw] of Object.entries(schemas)) {
    if (!schemaRaw || typeof schemaRaw !== 'object') continue;
    yield { name, schema: schemaRaw as Record<string, unknown> };
  }
}

/**
 * Recursively walk every property/schema node under an object, yielding each
 * schema-shaped sub-object encountered. Used by walkers that need to inspect
 * field-level keywords like `maxLength`, `minimum`, etc.
 *
 * Visited object identity is tracked to avoid runaway recursion on cycles
 * (which can survive cycleStripSpec if e.g. allOf chains alias each other).
 */
export function* walkAllSchemas(spec: object): Generator<{ schema: Record<string, unknown>; pointer: string }> {
  const seen = new WeakSet<object>();
  function* rec(node: unknown, pointer: string): Generator<{ schema: Record<string, unknown>; pointer: string }> {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        yield* rec(node[i], `${pointer}/${i}`);
      }
      return;
    }

    const obj = node as Record<string, unknown>;
    // Heuristic: yield this node as a "schema-shaped" object if it has any of
    // the JSON-Schema/OAS keywords we expect on schemas. Catches both inline
    // schemas in operations and component schemas.
    if (
      'type' in obj || 'properties' in obj || 'items' in obj ||
      'allOf' in obj || 'oneOf' in obj || 'anyOf' in obj ||
      'enum' in obj || '$ref' in obj
    ) {
      yield { schema: obj, pointer };
    }

    for (const [k, v] of Object.entries(obj)) {
      yield* rec(v, `${pointer}/${escapeJsonPointer(k)}`);
    }
  }

  yield* rec(spec, '');
}

function escapeJsonPointer(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Format a percentage to one decimal place as a plain number, e.g. 85.7.
 */
export function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * Format an array of example op-paths for narration: trims to first N,
 * adds "...and X more" suffix if truncated.
 */
export function formatExamples(items: string[], max = 3): string {
  if (items.length === 0) return '(none)';
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} (and ${items.length - max} more)`;
}
