/**
 * IANA Media Types Registry — snapshot (top-level types) + RFC 6838 validator.
 *
 * Source: https://www.iana.org/assignments/media-types/media-types.xhtml
 * Snapshot date: 2026-05-06.
 *
 * The full IANA media-type registry has thousands of entries — too large to
 * hardcode and changes frequently. Instead we capture:
 *   1. The 9 IANA top-level types (RFC 6838 §3 + multimodal additions).
 *   2. Standard structured-suffixes (+json, +xml, +zip, +cbor, etc.).
 *   3. Standard vendor/personal tree prefixes (vnd. and prs.) per RFC 6838 §3.
 *   4. A validator that parses media-type / and verifies subtype-tree shape.
 *
 * Walkers / Spectral rules can use:
 *   - isRegisteredTopLevelType(top)  -> validate the prefix
 *   - validateMediaType(s)           -> full RFC 6838 §4.2 grammar check
 *   - parseMediaType(s)              -> structured decomposition for inspection
 *
 * Coverage: T13 media-type-IANA-validator, RFC2-78 (no star-slash-star), RFC2-79 (top-level
 * IANA-registered), RFC2-80 (charset on application/json redundant), RFC2-75/76
 * (custom JSON / vendor-tree), RFC2-77 (prs. tree in production = smell).
 */

/** RFC 6838 §3 + multipart/multimodal additions. */
export const MEDIA_TOP_LEVEL_TYPES: ReadonlySet<string> = new Set([
  "application",
  "audio",
  "font",
  "example",
  "image",
  "message",
  "model",
  "multipart",
  "text",
  "video",
  "haptics",
]);

/**
 * RFC 6838 §4.2.8 standard structured-suffix tree.
 * (registry: https://www.iana.org/assignments/media-type-structured-suffix/)
 */
export const MEDIA_STRUCTURED_SUFFIXES: ReadonlySet<string> = new Set([
  "xml",
  "json",
  "ber",
  "der",
  "fastinfoset",
  "wbxml",
  "zip",
  "tlv",
  "json-seq",
  "sqlite3",
  "jwt",
  "gzip",
  "cbor",
  "cbor-seq",
  "tar",
  "yaml",
]);

/** RFC 6838 §3 facets: vnd. (vendor) and prs. (personal). */
export const MEDIA_TYPE_FACETS: ReadonlySet<string> = new Set([
  "vnd.",
  "prs.",
  "x.", // unregistered; explicit x- prefix is RFC 6838 §3.4 deprecated
]);

export interface ParsedMediaType {
  /** Original input, lowercased and trimmed. */
  raw: string;
  /** Top-level type, e.g. "application". */
  topLevel: string;
  /** Sub-type with no parameters, e.g. "vnd.acme.foo+json". */
  subtype: string;
  /** RFC 6838 §3 facet detected on subtype: vnd | prs | x | undefined. */
  facet?: "vnd" | "prs" | "x";
  /** RFC 6838 §4.2.8 structured suffix (after +), e.g. "json". */
  suffix?: string;
  /** Parameter map (Content-Type charset/profile etc.), keys lowercased. */
  parameters: Record<string, string>;
  /** True if input was the wildcard star-slash-star form (RFC2-78 catch). */
  isWildcard: boolean;
}

const TOKEN_RE = /^[!#$%&'*+-.^_`|~0-9A-Za-z]+$/;

/**
 * Parse a media-type string per RFC 9110 §8.3.1 / RFC 6838 §4.2 grammar. Returns
 * undefined for syntactically invalid inputs. Wildcards are accepted but flagged
 * via isWildcard so callers can apply RFC2-78 (forbid star-slash-star) on a separate axis.
 */
export function parseMediaType(input: string): ParsedMediaType | undefined {
  if (!input || typeof input !== "string") return undefined;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return undefined;

  const [typeAndSub, ...paramParts] = trimmed.split(";").map((p) => p.trim());
  if (!typeAndSub) return undefined;
  const slashIdx = typeAndSub.indexOf("/");
  if (slashIdx < 0) return undefined;
  const topLevel = typeAndSub.slice(0, slashIdx);
  const subtype = typeAndSub.slice(slashIdx + 1);
  if (!topLevel || !subtype) return undefined;

  const isWildcard = topLevel === "*" || subtype === "*";
  if (!isWildcard) {
    if (!TOKEN_RE.test(topLevel)) return undefined;
    // subtype may contain + and . per RFC 6838 — same TOKEN grammar permits both.
    if (!TOKEN_RE.test(subtype)) return undefined;
  }

  // Detect facet prefix on subtype.
  let facet: "vnd" | "prs" | "x" | undefined;
  if (subtype.startsWith("vnd.")) facet = "vnd";
  else if (subtype.startsWith("prs.")) facet = "prs";
  else if (subtype.startsWith("x.") || subtype.startsWith("x-")) facet = "x";

  // Detect +suffix per RFC 6838 §4.2.8.
  const plusIdx = subtype.lastIndexOf("+");
  const suffix = plusIdx > 0 ? subtype.slice(plusIdx + 1) : undefined;

  const parameters: Record<string, string> = {};
  for (const p of paramParts) {
    const eqIdx = p.indexOf("=");
    if (eqIdx < 0) continue;
    const k = p.slice(0, eqIdx).trim().toLowerCase();
    let v = p.slice(eqIdx + 1).trim();
    if (v.startsWith("\"") && v.endsWith("\"")) v = v.slice(1, -1);
    if (k) parameters[k] = v;
  }

  return { raw: trimmed, topLevel, subtype, facet, suffix, parameters, isWildcard };
}

export interface MediaTypeValidation {
  /** Was the input grammatically valid per RFC 6838 §4.2? */
  valid: boolean;
  /** Was the top-level type a registered IANA top-level (or wildcard)? */
  topLevelRegistered: boolean;
  /** True if subtype is in the vendor-tree (vnd.) per RFC 6838 §3.2. */
  vendorTree: boolean;
  /** True if subtype is in the personal-tree (prs.) per RFC 6838 §3.3. */
  personalTree: boolean;
  /** True if subtype uses deprecated x- / x. unregistered prefix (RFC 6838 §3.4). */
  unregisteredTree: boolean;
  /** True if structured-suffix is present and registered. */
  registeredSuffix: boolean;
  /** Parsed structure for downstream callers. */
  parsed?: ParsedMediaType;
}

/**
 * Full RFC 6838 / RFC 9110 media-type validator.
 *
 * Exists so detectors can answer with one call: "is this a syntactically valid
 * IANA-aligned media-type, and what tree is it in?". Useful for:
 *   - RFC2-79: top-level IANA-registered
 *   - RFC2-75/76: custom JSON / vendor-tree
 *   - RFC2-77: prs. tree in production = smell
 *   - RFC2-78: forbid star-slash-star
 *   - apiq L-MIN-2: star-slash-star media-type
 */
export function validateMediaType(input: string): MediaTypeValidation {
  const parsed = parseMediaType(input);
  if (!parsed) {
    return {
      valid: false,
      topLevelRegistered: false,
      vendorTree: false,
      personalTree: false,
      unregisteredTree: false,
      registeredSuffix: false,
    };
  }

  const topLevelRegistered =
    parsed.isWildcard || MEDIA_TOP_LEVEL_TYPES.has(parsed.topLevel);

  return {
    valid: true,
    topLevelRegistered,
    vendorTree: parsed.facet === "vnd",
    personalTree: parsed.facet === "prs",
    unregisteredTree: parsed.facet === "x",
    registeredSuffix: parsed.suffix ? MEDIA_STRUCTURED_SUFFIXES.has(parsed.suffix) : false,
    parsed,
  };
}

/** Quick predicate for top-level. */
export function isRegisteredTopLevelType(top: string): boolean {
  return MEDIA_TOP_LEVEL_TYPES.has(top.toLowerCase());
}

/** Whether a structured-suffix (after +) is in the IANA registry. */
export function isRegisteredStructuredSuffix(suffix: string): boolean {
  return MEDIA_STRUCTURED_SUFFIXES.has(suffix.toLowerCase());
}

/**
 * Whether a media-type is the catch-all wildcard star-slash-star (RFC 9110) — used by
 * apiq L-MIN-2 / RFC2-78 to flag overly-permissive content negotiation in OAS.
 */
export function isCatchAllMediaType(input: string): boolean {
  const parsed = parseMediaType(input);
  if (!parsed) return false;
  return parsed.topLevel === "*" && parsed.subtype === "*";
}
