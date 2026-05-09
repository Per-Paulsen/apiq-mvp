/**
 * Helper-2 — request-body content-type iteration (Welle Arch / OQ-4 consolidation).
 *
 * Used by:
 *   - threat-p2-functions::patchContentTypeCorrect          (RFC2-97)
 *   - threat-p3-functions::webhookRejectsWildcardContentType (TM-A51)
 *   - standards-p3-functions::multipartFormBundle           (RFC2-100/101)
 *   - standards-p3-functions::mergePatchPropertiesNotRequired (RFC2-98)
 *   - standards-p3-functions::jsonPatchSchemaIsArray         (RFC2-99)
 *
 * All five inspect `op.requestBody.content[<media-type>]` shapes. Pre-consolidation
 * each function expanded the same `isObject(rb) && isObject(rb.content)` boilerplate
 * inline. Extracted here so callers focus on per-mediaType predicate-logic.
 */

type AnyObj = Record<string, unknown>;

function isObject(v: unknown): v is AnyObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Returns the `op.requestBody.content` map, or an empty object when the
 * operation has no requestBody / no content (so callers can iterate without
 * a null-check).
 */
export function getRequestBodyContent(op: unknown): Record<string, AnyObj> {
  if (!isObject(op)) return {};
  const rb = isObject(op.requestBody) ? op.requestBody : null;
  if (!rb) return {};
  const content = isObject(rb.content) ? rb.content : null;
  if (!content) return {};
  const out: Record<string, AnyObj> = {};
  for (const [mediaType, body] of Object.entries(content)) {
    if (isObject(body)) out[mediaType] = body;
  }
  return out;
}

/**
 * Iterates `(mediaType, body)` pairs in `op.requestBody.content`. Calls
 * `visit` for each. The `visit` callback may return `false` to short-circuit
 * iteration (mirrors `Array.prototype.some`).
 *
 * Returns `true` iff the visitor short-circuited (`false`-return), `false`
 * otherwise. Most call-sites ignore the return; the bool exists for
 * `someMediaTypeMatches`-style predicates.
 */
export function forEachRequestBodyMediaType(
  op: unknown,
  visit: (mediaType: string, body: AnyObj) => void | boolean
): boolean {
  const content = getRequestBodyContent(op);
  for (const [mediaType, body] of Object.entries(content)) {
    const ret = visit(mediaType, body);
    if (ret === false) return true;
  }
  return false;
}
