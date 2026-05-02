/**
 * Cycle-safe helpers for dereferenced OpenAPI specs.
 *
 * `SwaggerParser.dereference()` resolves `$ref`s into real JS object references.
 * Specs with cyclical `$ref`s (e.g. recursive schemas like `Item.subItems[].subItems[]`)
 * therefore produce real JS object cycles, which crash plain `JSON.stringify`
 * with `TypeError: Converting circular structure to JSON`.
 *
 * `cycleStripSpec` walks the tree with a `WeakSet` of visited objects and
 * returns a deep clone in which any node that would re-enter an ancestor is
 * replaced with a marker `{ "$ref": "#cyclic" }`. The result is a plain
 * non-cyclic JS object tree that is safe to pass to `JSON.stringify`,
 * `structuredClone`, `fast-json-patch`, etc.
 *
 * `stringifySpecForPrompt` is a thin wrapper that produces the minified JSON
 * string for the LLM prompt.
 *
 * Both functions use the same algorithm so the LLM and the patch validator
 * see the exact same tree (including identical placement of cycle markers).
 */

const CYCLE_MARKER_KEY = '$ref';
const CYCLE_MARKER_VALUE = '#cyclic';

function makeCycleMarker(): Record<string, unknown> {
  // Return a fresh object each time so callers can mutate the result tree
  // without aliasing markers across the spec.
  return { [CYCLE_MARKER_KEY]: CYCLE_MARKER_VALUE };
}

function replaceCycles(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  const obj = value as object;
  if (seen.has(obj)) {
    return makeCycleMarker();
  }
  seen.add(obj);
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) {
      out[i] = replaceCycles(value[i], seen);
    }
    return out;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = replaceCycles((value as Record<string, unknown>)[key], seen);
  }
  return out;
}

/**
 * Return a deep clone of `specJson` in which every cyclical back-reference is
 * replaced with `{ "$ref": "#cyclic" }`. The input is not mutated.
 */
export function cycleStripSpec(specJson: unknown): unknown {
  return replaceCycles(specJson, new WeakSet());
}

export function stringifySpecForPrompt(specJson: unknown): string {
  return JSON.stringify(cycleStripSpec(specJson));
}
