import jsonpatch, { type Operation } from 'fast-json-patch';

export interface HallucinationCheck {
  hallucinated: boolean;
  details?: string;
}

export interface PatchValidationResult {
  applyClean: boolean;
  hallucinationCheck: HallucinationCheck;
  applyError?: string;
}

/**
 * Resolve a JSON pointer (RFC 6901) against the given root.
 * Returns { found: true, value } or { found: false }.
 * Handles "-" as the array-append marker only when it's the final token
 * (treated as "not found" since "-" is a positional marker, not a real index).
 */
function resolvePointer(
  root: unknown,
  pointer: string
): { found: boolean; value?: unknown } {
  if (pointer === '') return { found: true, value: root };
  if (!pointer.startsWith('/')) return { found: false };

  const tokens = pointer
    .slice(1)
    .split('/')
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));

  let cur: unknown = root;
  for (const tok of tokens) {
    if (cur === null || cur === undefined) return { found: false };
    if (Array.isArray(cur)) {
      if (tok === '-') return { found: false };
      const idx = Number(tok);
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) {
        return { found: false };
      }
      cur = cur[idx];
    } else if (typeof cur === 'object') {
      const obj = cur as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(obj, tok)) {
        return { found: false };
      }
      cur = obj[tok];
    } else {
      return { found: false };
    }
  }
  return { found: true, value: cur };
}

function parentPointer(pointer: string): string {
  if (pointer === '' || pointer === '/') return '';
  const idx = pointer.lastIndexOf('/');
  return idx <= 0 ? '' : pointer.slice(0, idx);
}

/**
 * Hallucination check:
 * - For `add` ops: the parent path must exist (so `add /paths/foo/get/parameters/-`
 *   requires `/paths/foo/get/parameters` to exist). The target `path` itself
 *   does not need to exist (it's being created).
 * - For `replace` / `remove` / `test` ops: `path` IS the source — it must exist.
 * - For `move` / `copy` ops: `from` is the source (must exist); `path` is the
 *   destination (created by the op, so we do NOT check it). A missing `from`
 *   field is itself a hallucination.
 */
function checkHallucination(
  specJson: unknown,
  patchOps: Operation[]
): HallucinationCheck {
  for (let i = 0; i < patchOps.length; i++) {
    const op = patchOps[i];
    const opLabel = `op[${i}] ${op.op} ${op.path}`;

    if (op.op === 'add') {
      const parent = parentPointer(op.path);
      const res = resolvePointer(specJson, parent);
      if (!res.found) {
        return {
          hallucinated: true,
          details: `${opLabel}: parent path "${parent}" does not exist in spec`,
        };
      }
    } else if (op.op === 'move' || op.op === 'copy') {
      const from = (op as { from?: string }).from;
      if (!from) {
        return {
          hallucinated: true,
          details: `${opLabel}: missing "from" pointer`,
        };
      }
      const fromRes = resolvePointer(specJson, from);
      if (!fromRes.found) {
        return {
          hallucinated: true,
          details: `${opLabel}: "from" path "${from}" does not exist in spec`,
        };
      }
      // Note: do NOT check op.path — it's the destination, created by the op.
    } else {
      // replace / remove / test: path IS the source.
      const res = resolvePointer(specJson, op.path);
      if (!res.found) {
        return {
          hallucinated: true,
          details: `${opLabel}: source path does not exist in spec`,
        };
      }
    }
  }
  return { hallucinated: false };
}

/**
 * Validate a list of patch ops against a deep clone of the spec.
 * Returns:
 *   - applyClean: did `fast-json-patch.validate` accept the ops against the clone?
 *   - hallucinationCheck: per the rules above
 *   - applyError: error message from `fast-json-patch.validate` if any
 */
export function validatePatchOps(
  specJson: unknown,
  patchOps: Operation[]
): PatchValidationResult {
  const hallucinationCheck = checkHallucination(specJson, patchOps);

  // Deep clone so we never mutate the caller's spec. `specJson` is expected
  // to arrive cycle-stripped (see `cycleStripSpec` in `stringify-spec.ts`),
  // so `structuredClone` is safe. Node 17+ ships `structuredClone` globally;
  // we rely on it rather than a JSON-based fallback because callers may pass
  // trees that contain `undefined` or other JSON-hostile values.
  if (typeof structuredClone !== 'function') {
    throw new Error(
      'validatePatchOps requires Node 17+ (structuredClone is not available)'
    );
  }
  const clone = structuredClone(specJson);

  let applyClean = false;
  let applyError: string | undefined;
  try {
    // `validate` returns undefined on success, an error object on failure.
    // We pass the clone as the document so it can simulate apply.
    const validationError = jsonpatch.validate(patchOps, clone);
    if (validationError) {
      applyError = `${validationError.name}: ${validationError.message}`;
      applyClean = false;
    } else {
      // validate() only checks op shape; also try to apply against the clone
      // to confirm path-resolution works.
      try {
        jsonpatch.applyPatch(clone, patchOps, /*validateOperation*/ true, /*mutateDocument*/ true);
        applyClean = true;
      } catch (applyErr) {
        applyError =
          applyErr instanceof Error
            ? `${applyErr.name}: ${applyErr.message}`
            : String(applyErr);
        applyClean = false;
      }
    }
  } catch (err) {
    applyError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    applyClean = false;
  }

  return { applyClean, hallucinationCheck, applyError };
}
