/**
 * OpenAPI 3.x validation + dereference helpers.
 *
 * - `detectSwagger2`  — short-circuit reject Swagger 2.0 specs.
 * - `findExternalRefs` — collect any `$ref` whose value does NOT start with `#/`.
 * - `validateAndDereference` — wraps `@apidevtools/swagger-parser`'s `dereference()`,
 *   then applies `cycleStripSpec` so the result is JSON-stringify-safe.
 *
 * Cycle handling: per Epic 00 results §"Cross-cutting", `SwaggerParser.dereference()`
 * resolves recursive `$ref`s into real JS object cycles. We MUST run `cycleStripSpec`
 * immediately after dereference, before any `JSON.stringify` / `structuredClone` /
 * DB write.
 */
import 'server-only';

import SwaggerParser from '@apidevtools/swagger-parser';

import { cycleStripSpec } from '@/lib/analysis/stringify-spec';

const MAX_ISSUES = 10;

export function detectSwagger2(json: unknown): boolean {
  if (json === null || typeof json !== 'object') return false;
  const obj = json as Record<string, unknown>;
  return obj.swagger === '2.0';
}

/**
 * Recursively walk the JSON and collect every `$ref` value that does NOT
 * start with `#/` (i.e. external refs — http(s)://, file paths, etc.).
 * Local refs (`#/components/...`) are allowed and not collected.
 */
export function findExternalRefs(json: unknown): string[] {
  const out: string[] = [];
  walk(json, out);
  return out;
}

function walk(value: unknown, out: string[]): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (key === '$ref' && typeof v === 'string' && !v.startsWith('#/')) {
      // External ref. Skip the cycle-marker shape `{ "$ref": "#cyclic" }`
      // (that starts with `#cyclic`, NOT `#/`) — but since we only flag
      // refs that don't start with `#/`, `#cyclic` would also be flagged.
      // In practice external-ref detection runs BEFORE dereference, so the
      // tree won't contain cycle markers yet. Guard against `#cyclic`
      // anyway for defensive future-proofing.
      if (v !== '#cyclic') {
        out.push(v);
      }
    } else {
      walk(v, out);
    }
  }
}

export type ValidateOk = { ok: true; dereferenced: unknown };
export type ValidateErr = {
  ok: false;
  error: { kind: 'invalid_openapi'; issues: string[] };
};

export async function validateAndDereference(
  json: unknown,
): Promise<ValidateOk | ValidateErr> {
  // SwaggerParser mutates the input — pass a deep clone.
  let clone: unknown;
  try {
    clone =
      typeof structuredClone === 'function'
        ? structuredClone(json)
        : JSON.parse(JSON.stringify(json));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: { kind: 'invalid_openapi', issues: [message].slice(0, MAX_ISSUES) },
    };
  }

  try {
    const dereffed = await SwaggerParser.dereference(
      clone as Parameters<typeof SwaggerParser.dereference>[0],
    );
    // Cycle-strip immediately — recursive schemas produce real JS object cycles
    // that crash JSON.stringify. See `src/lib/analysis/stringify-spec.ts`.
    const acyclic = cycleStripSpec(dereffed);
    return { ok: true, dereferenced: acyclic };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // SwaggerParser surfaces multiple validation errors joined by newlines —
    // split + cap at 10 per spec AC #8.
    const issues = message
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_ISSUES);
    return {
      ok: false,
      error: {
        kind: 'invalid_openapi',
        issues: issues.length > 0 ? issues : [message],
      },
    };
  }
}
