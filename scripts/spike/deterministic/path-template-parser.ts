/**
 * Path-Template-Parser — Stage-A deterministic walker (Task #4).
 *
 * Single-pass module that parses every path-key in a spec, extracts the
 * `{template}` parameter slots, and cross-checks them against
 * operation- and path-level `parameters` definitions. It also computes a
 * handful of cross-resource statistics (naming-convention drift, depth
 * distribution, trailing-slash mix, RPC-verb prevalence, mixed-versioning).
 *
 * Spec-agnostic: no vendor-specific knowledge. Heuristics are tuned against
 * `openapi-examples/{stripe-full,pagerduty-full,dnd5eapi,github-rest}/spec.json`.
 *
 * Emits up to seven `DetectorFinding` records (one per finding-class):
 *
 *   1. P3  path-template-without-parameter-definition
 *      Path key contains `{x}` but no operation- or path-level parameter
 *      named `x` with `in: path`.
 *
 *   2. P4  path-parameter-without-template-position
 *      Operation declares `in: path` parameter named `x` but the path-key
 *      has no `{x}` template slot.
 *
 *   3. J3+G6 path-parameter-naming-inconsistent
 *      The same conceptual id ({user_id} vs {userId}, {team-id} vs {teamId})
 *      appears in different casing styles across resources.
 *
 *   4. S2  path-depth-statistics
 *      One or more paths exceed 5 segment levels (excluding leading slash and
 *      version prefix), which usually signals over-modelled hierarchy.
 *
 *   5. S3  trailing-slash-inconsistency
 *      Some paths end with `/` and some don't.
 *
 *   6. S8  rpc-style-paths
 *      Path segments contain verbs that signal RPC-style design rather than
 *      resource-style. Heuristic with confidence-tagging — common control
 *      verbs (search, login, reset, refresh, ...) are tolerated; obvious
 *      RPC-smell (`getById`, `doStuff`, `processPayment`, ...) is flagged
 *      with high confidence.
 *
 *   7. S4  mixed-versioning
 *      The spec mixes `/v{N}/...` versioned paths with non-versioned paths
 *      (or mixes major versions at the path-prefix layer).
 *
 * Public API:
 *   `walkPathTemplates(spec, opts) => Promise<DetectorFinding[]>`
 *
 * CLI:
 *   `npx tsx deterministic/path-template-parser.ts <spec-name>`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { DetectorFinding, DetectorOptions } from './types.js';
import { walkOperations, formatExamples } from './walkers/_shared.js';

// =============================================================================
// Constants — heuristic tuning parameters.
// =============================================================================

/** Path-segment-count above which we flag depth as a smell. */
const DEPTH_THRESHOLD = 5;

/**
 * Verbs that frequently appear as the LAST segment of an otherwise resource-
 * style path. They are usually acceptable (HTTP GET on `/users/search` is a
 * common "filter" pattern; `/sessions/login` is widespread; `/tokens/refresh`
 * is RFC-6749 idiomatic). Flagged at low confidence so reviewers can decide.
 */
const ACCEPTABLE_CONTROL_VERBS = new Set([
  'search',
  'login',
  'logout',
  'reset',
  'refresh',
  'verify',
  'confirm',
  'cancel',
  'register',
  'subscribe',
  'unsubscribe',
  'send',
  'export',
  'import',
  'download',
  'upload',
  'preview',
  'validate',
  'activate',
  'deactivate',
  'enable',
  'disable',
  'sync',
  'invite',
  'archive',
  'unarchive',
  'restore',
  'duplicate',
  'clone',
  'lock',
  'unlock',
  'merge',
  'sign',
  'pay',
  'capture',
  'refund',
  'render',
  'finalize',
  'finalise',
  'submit',
  'publish',
  'unpublish',
  'approve',
  'reject',
  'count',
  'stats',
  'ping',
  'health',
  'me',
  // Generic CRUD-shorthand that are conventional even if RPC-flavoured.
  'batch',
  'bulk',
]);

/**
 * Strong RPC-smell verb prefixes. If any path segment starts with one of
 * these (camel or snake-cased), we flag with HIGH confidence. These are verbs
 * that have no idiomatic resource-noun usage and are a clear sign the spec
 * was generated from an RPC service.
 *
 * Deliberately EXCLUDED:
 *   - `post`, `put`, `patch`, `add` — these double as resource nouns
 *     (`post_updates`, `put_options`) and as HTTP-method-aliases. Including
 *     them produces too many false positives on real-world specs.
 *   - bare `get` / `set` are still flagged via camelCase / snake_case
 *     continuation rules so e.g. `getUserById` fires but `gettable_resources`
 *     does not (the rule requires next-char to be `[A-Z]` or `_<lower>` AND
 *     additionally that the verb is not the entire segment).
 */
const STRONG_RPC_VERB_PREFIXES = [
  'get',
  'set',
  'do',
  'fetch',
  'retrieve',
  'list',
  'find',
  'lookup',
  'load',
  'save',
  'store',
  'compute',
  'calculate',
  'process',
  'handle',
  'perform',
  'execute',
  'invoke',
  'trigger',
  'make',
  'create',
  'update',
  'delete',
  'remove',
];

// =============================================================================
// Helpers — path parsing.
// =============================================================================

/** Extract `{name}` template slots from a path. */
function extractTemplateNames(pathKey: string): string[] {
  const names: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pathKey)) !== null) {
    names.push(m[1]);
  }
  return names;
}

/** Split path into non-empty segments. */
function pathSegments(pathKey: string): string[] {
  return pathKey.split('/').filter((s) => s.length > 0);
}

/** Strip leading version-prefix segment (`v1`, `v2`, `2024-01-01`, ...). */
function isVersionSegment(seg: string): boolean {
  // /v1, /v2, /v10
  if (/^v\d+$/i.test(seg)) return true;
  // /api (often used as version-equivalent prefix)
  if (seg.toLowerCase() === 'api') return false; // don't strip — counts as depth
  // /2024-01-01 (Stripe-style date-versioning at path level — rare)
  if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) return true;
  return false;
}

/** Normalise a parameter-name to a canonical bag-of-words for naming-style comparison. */
function normaliseParamName(name: string): string {
  // user_id → userid; userId → userid; user-id → userid
  return name.replace(/[_-]+/g, '').toLowerCase();
}

/** Detect the casing-style of a parameter name. */
function paramNameStyle(name: string): 'snake' | 'kebab' | 'camel' | 'pascal' | 'lower' | 'mixed' {
  const hasUnderscore = name.includes('_');
  const hasDash = name.includes('-');
  const hasUpper = /[A-Z]/.test(name);
  const hasLower = /[a-z]/.test(name);

  if (hasUnderscore && !hasDash && !hasUpper) return 'snake';
  if (hasDash && !hasUnderscore && !hasUpper) return 'kebab';
  if (!hasUnderscore && !hasDash && hasUpper && hasLower) {
    return /^[A-Z]/.test(name) ? 'pascal' : 'camel';
  }
  if (!hasUnderscore && !hasDash && !hasUpper && hasLower) return 'lower';
  return 'mixed';
}

/**
 * Resolve a `{$ref: "#/components/parameters/foo"}` against the spec root.
 * Returns the inline parameter object, or null if the ref is malformed or
 * points outside `components.parameters`. Non-internal refs (e.g. external
 * file refs) are deliberately not followed — they produce a null result and
 * the caller treats them as undeclared. dnd5eapi-style internal refs are the
 * common case and are fully supported.
 */
function resolveParamRef(
  ref: string,
  components: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!components) return null;
  const m = /^#\/components\/parameters\/(.+)$/.exec(ref.trim());
  if (!m) return null;
  const name = m[1].replace(/~1/g, '/').replace(/~0/g, '~');
  const params = components.parameters as Record<string, unknown> | undefined;
  if (!params) return null;
  const target = params[name];
  if (!target || typeof target !== 'object') return null;
  return target as Record<string, unknown>;
}

/**
 * Collect all `in: path` parameter names from operation + path-item levels.
 * Resolves `$ref` entries against `components.parameters` so specs that use
 * the standard reusable-parameter pattern (dnd5eapi, github-rest, ...) are
 * classified correctly without a separate dereference step.
 */
function collectPathParams(
  operation: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  components: Record<string, unknown> | undefined
): Set<string> {
  const out = new Set<string>();
  const both: unknown[] = [];
  if (Array.isArray(operation.parameters)) both.push(...operation.parameters);
  if (Array.isArray(pathItem.parameters)) both.push(...pathItem.parameters);

  for (const p of both) {
    if (!p || typeof p !== 'object') continue;
    let pp = p as Record<string, unknown>;
    if (typeof pp.$ref === 'string') {
      const resolved = resolveParamRef(pp.$ref, components);
      if (!resolved) continue;
      pp = resolved;
    }
    if (pp.in !== 'path') continue;
    if (typeof pp.name === 'string') out.add(pp.name);
  }
  return out;
}

// =============================================================================
// Walker.
// =============================================================================

interface PathRecord {
  pathKey: string;
  templateNames: string[];
  segments: string[];
  hasTrailingSlash: boolean;
  isVersioned: boolean;
  versionPrefix: string | null;
  /** Operation-id examples for narration. */
  operationIds: string[];
}

interface NamingGroup {
  /** All distinct param-name spellings that share this canonical key. */
  variants: Map<string, number>; // spelling → count
  paths: Set<string>;
}

export async function walkPathTemplates(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;
  const paths = root.paths as Record<string, unknown> | undefined;
  if (!paths || typeof paths !== 'object') return [];
  const components = root.components as Record<string, unknown> | undefined;

  // ---------------------------------------------------------------------------
  // Pass 1 — collect path records and parameter mismatches.
  // ---------------------------------------------------------------------------

  const records: PathRecord[] = [];

  // P3: template-name appears in path but no parameter-definition matches.
  // P4: path parameter-definition declares `in: path` name not in template.
  const p3Misses: Array<{ path: string; method: string; templateName: string }> = [];
  const p4Misses: Array<{ path: string; method: string; paramName: string }> = [];

  // J3/G6: cross-resource naming inconsistency.
  const namingGroups = new Map<string, NamingGroup>();

  for (const [pathKey, pathItemRaw] of Object.entries(paths)) {
    if (!pathItemRaw || typeof pathItemRaw !== 'object') continue;
    if (!pathKey.startsWith('/')) continue;

    const templateNames = extractTemplateNames(pathKey);
    const segments = pathSegments(pathKey);
    const hasTrailingSlash = pathKey.length > 1 && pathKey.endsWith('/');
    const versionSeg = segments[0];
    const isVersioned = !!versionSeg && isVersionSegment(versionSeg);

    records.push({
      pathKey,
      templateNames,
      segments,
      hasTrailingSlash,
      isVersioned,
      versionPrefix: isVersioned ? versionSeg : null,
      operationIds: [],
    });

    // Track naming variants for J3/G6.
    for (const name of templateNames) {
      const canonical = normaliseParamName(name);
      let g = namingGroups.get(canonical);
      if (!g) {
        g = { variants: new Map(), paths: new Set() };
        namingGroups.set(canonical, g);
      }
      g.variants.set(name, (g.variants.get(name) ?? 0) + 1);
      g.paths.add(pathKey);
    }
  }

  // Walk every operation to compare path-template slots against parameter
  // definitions (P3 + P4) and to collect operationIds (used for RPC heuristic).
  for (const { path: opPath, method, operation, pathItem } of walkOperations(spec)) {
    const record = records.find((r) => r.pathKey === opPath);
    if (!record) continue;
    if (typeof operation.operationId === 'string') {
      record.operationIds.push(operation.operationId);
    }

    const declared = collectPathParams(operation, pathItem, components);
    const templateSet = new Set(record.templateNames);

    // P3 — template-name with no matching declared param.
    for (const t of record.templateNames) {
      if (!declared.has(t)) {
        p3Misses.push({ path: opPath, method, templateName: t });
      }
    }

    // P4 — declared `in: path` param without matching template-slot.
    for (const d of declared) {
      if (!templateSet.has(d)) {
        p4Misses.push({ path: opPath, method, paramName: d });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Pass 2 — derive findings.
  // ---------------------------------------------------------------------------

  const findings: DetectorFinding[] = [];

  // ----- (1) P3 — template without parameter-definition --------------------
  if (p3Misses.length > 0) {
    const examples = formatExamples(
      p3Misses
        .slice(0, 5)
        .map((m) => `${m.method.toUpperCase()} ${m.path} (missing \`${m.templateName}\`)`)
    );
    const affected = dedupeAffected(p3Misses.map((m) => ({ path: m.path, method: m.method })));
    findings.push({
      detectorId: 'walker:path-template-without-parameter-definition',
      layer: 'walker-statistical',
      title: `${p3Misses.length} path-template slot(s) lack a matching parameter definition`,
      narration:
        `The path key contains \`{name}\` template slots that no operation or path-item ` +
        `parameter declares with \`in: path\`. ` +
        `Affected occurrences: ${p3Misses.length}. Examples: ${examples}. ` +
        `Without a matching parameter-definition, codegen tools cannot infer the slot's ` +
        `type, validators cannot enforce its format, and the OpenAPI document violates ` +
        `the OAS 3 §4.7.8 ("Path Templating") requirement that every templated section MUST ` +
        `correspond to a path parameter.`,
      rationale:
        'OpenAPI 3.0 §4.7.8 requires every `{name}` placeholder in a path key to have a ' +
        'matching `parameter` object with `in: path` and `required: true`. Spectral\'s ' +
        '`path-declarations-must-exist` covers the opposite direction (declared param without ' +
        'a slot); this finding covers the missing-declaration direction at aggregate level.',
      category: 'correctness',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: affected,
      patchOps: [],
      patchSummary:
        'Declare each templated path-segment as a `parameter` with `in: path` and `required: true`.',
      meta: { count: p3Misses.length, examples: p3Misses.slice(0, 5) },
    });
  }

  // ----- (2) P4 — declared path-param without template-slot ----------------
  if (p4Misses.length > 0) {
    const examples = formatExamples(
      p4Misses
        .slice(0, 5)
        .map((m) => `${m.method.toUpperCase()} ${m.path} (declared \`${m.paramName}\`)`)
    );
    const affected = dedupeAffected(p4Misses.map((m) => ({ path: m.path, method: m.method })));
    findings.push({
      detectorId: 'walker:path-parameter-without-template-position',
      layer: 'walker-statistical',
      title: `${p4Misses.length} declared path parameter(s) have no matching template slot`,
      narration:
        `One or more operations declare a parameter with \`in: path\` whose \`name\` does ` +
        `not appear as a \`{template}\` slot in the path key. ` +
        `Affected occurrences: ${p4Misses.length}. Examples: ${examples}. ` +
        `Codegen and validators rely on the 1-to-1 correspondence between declared path ` +
        `parameters and template slots; an extra declaration usually means a stale parameter ` +
        `was left behind during a path-rename, or a parameter was given the wrong \`in:\` value.`,
      rationale:
        'OpenAPI 3.0 §4.7.8 ("Path Templating") and Spectral\'s built-in ' +
        '`path-declarations-must-exist` rule both treat this as a hard error: every declared ' +
        'path parameter must correspond to a template slot in the path key.',
      category: 'correctness',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: affected,
      patchOps: [],
      patchSummary:
        'Remove path parameters that have no template slot, or add the missing `{name}` placeholder.',
      meta: { count: p4Misses.length, examples: p4Misses.slice(0, 5) },
    });
  }

  // ----- (3) J3+G6 — naming-style drift across resources -------------------
  const inconsistentGroups: Array<{
    canonical: string;
    variants: Array<{ spelling: string; count: number; style: string }>;
    paths: string[];
  }> = [];

  for (const [canonical, group] of namingGroups) {
    if (group.variants.size < 2) continue;
    // Need >1 distinct spelling to be inconsistent; ignore single-letter cases.
    if (canonical.length < 2) continue;
    const variants = [...group.variants.entries()]
      .map(([spelling, count]) => ({ spelling, count, style: paramNameStyle(spelling) }))
      .sort((a, b) => b.count - a.count);
    inconsistentGroups.push({
      canonical,
      variants,
      paths: [...group.paths],
    });
  }

  if (inconsistentGroups.length > 0) {
    inconsistentGroups.sort((a, b) => b.variants.length - a.variants.length);
    const examples = inconsistentGroups
      .slice(0, 5)
      .map(
        (g) =>
          `\`${g.canonical}\`: ${g.variants
            .map((v) => `${v.spelling} (×${v.count})`)
            .join(' vs ')}`
      )
      .join('; ');
    const affectedPaths = new Set<string>();
    for (const g of inconsistentGroups) {
      for (const p of g.paths) affectedPaths.add(p);
    }
    findings.push({
      detectorId: 'walker:path-parameter-naming-inconsistent',
      layer: 'walker-statistical',
      title: `${inconsistentGroups.length} path-parameter name(s) use mixed casing styles`,
      narration:
        `${inconsistentGroups.length} conceptual path-parameter id(s) appear in more than ` +
        `one casing style across the spec — e.g. ${examples}. ` +
        `SDK codegens that map path parameters to method-arguments produce mixed-style ` +
        `argument names (\`getUser(user_id)\` next to \`getOrder(orderId)\`), which forces ` +
        `consumers to remember which spelling each call uses. Standardise on a single ` +
        `convention (snake_case or camelCase) and apply it to every path parameter.`,
      rationale:
        'OpenAPI 3.0 has no parameter-naming requirement, but the OpenAPI Initiative\'s ' +
        'API Design Style Guide and Microsoft REST §9 ("Naming") both call out cross-resource ' +
        'naming consistency as a primary lever for predictable SDKs and human-readable specs. ' +
        'Mixed casing is a common merge-artefact when teams concatenate independently-authored ' +
        'sub-specs without a style-pass.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Pick one casing style (snake_case or camelCase) and rename divergent path parameters spec-wide.',
      meta: {
        groupCount: inconsistentGroups.length,
        examples: inconsistentGroups.slice(0, 5),
        affectedPathCount: affectedPaths.size,
      },
    });
  }

  // ----- (4) S2 — depth statistics -----------------------------------------
  const depthBreaches: Array<{ path: string; depth: number }> = [];
  let maxDepth = 0;
  let totalDepth = 0;
  for (const r of records) {
    const effective = r.isVersioned ? r.segments.length - 1 : r.segments.length;
    totalDepth += effective;
    if (effective > maxDepth) maxDepth = effective;
    if (effective > DEPTH_THRESHOLD) {
      depthBreaches.push({ path: r.pathKey, depth: effective });
    }
  }
  const meanDepth = records.length > 0 ? totalDepth / records.length : 0;

  if (depthBreaches.length > 0) {
    depthBreaches.sort((a, b) => b.depth - a.depth);
    const examples = formatExamples(
      depthBreaches.slice(0, 5).map((b) => `${b.path} (depth ${b.depth})`)
    );
    findings.push({
      detectorId: 'walker:path-depth-excessive',
      layer: 'walker-statistical',
      title: `${depthBreaches.length} path(s) exceed ${DEPTH_THRESHOLD}-segment depth threshold`,
      narration:
        `${depthBreaches.length} path(s) have more than ${DEPTH_THRESHOLD} segments after ` +
        `stripping any leading version prefix. Deepest path has ${maxDepth} segments; mean ` +
        `depth across the spec is ${meanDepth.toFixed(1)}. Examples: ${examples}. ` +
        `Deep nesting usually signals over-modelled hierarchy — consumers must remember the ` +
        `full ancestry to construct any URL, and renames at intermediate levels invalidate ` +
        `every descendant. Consider either flattening (move sub-resources to top-level with ` +
        `composite ids) or providing a "by-id" shortcut for leaf resources.`,
      rationale:
        'No OpenAPI rule caps path depth, but the API design literature converges on 4-5 ' +
        'segments as the practical readability ceiling. Microsoft REST §7.1, the Google API ' +
        'Improvement Proposal AIP-122 ("Resource names"), and the API Stylebook all ' +
        'discourage deep hierarchies because they make URL composition error-prone.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Flatten over-deep resource hierarchies (max ~5 segments) or add a "by-id" shortcut for leaf resources.',
      meta: {
        breachCount: depthBreaches.length,
        maxDepth,
        meanDepth: Math.round(meanDepth * 10) / 10,
        threshold: DEPTH_THRESHOLD,
        examples: depthBreaches.slice(0, 5),
      },
    });
  }

  // ----- (5) S3 — trailing-slash inconsistency -----------------------------
  const trailing = records.filter((r) => r.hasTrailingSlash);
  const noTrailing = records.filter((r) => !r.hasTrailingSlash && r.pathKey !== '/');

  if (trailing.length > 0 && noTrailing.length > 0) {
    const minority = trailing.length < noTrailing.length ? trailing : noTrailing;
    const minorityHas = minority === trailing;
    const minorityExamples = formatExamples(minority.slice(0, 5).map((r) => r.pathKey));
    findings.push({
      detectorId: 'walker:path-trailing-slash-inconsistency',
      layer: 'walker-statistical',
      title: `${minority.length} path(s) use ${minorityHas ? 'trailing-slash' : 'no-trailing-slash'} while the rest do not`,
      narration:
        `The spec mixes paths with and without trailing slashes. ${trailing.length} path(s) end ` +
        `with \`/\`, ${noTrailing.length} do not. The minority ` +
        `(${minorityHas ? 'trailing-slash' : 'no-trailing-slash'}) examples: ${minorityExamples}. ` +
        `RFC 3986 §6.2.3 treats \`/x\` and \`/x/\` as syntactically distinct identifiers; many ` +
        `proxy / gateway stacks normalise them, but consumers building URLs from the spec must ` +
        `match exactly. Pick one convention spec-wide and apply it.`,
      rationale:
        'OpenAPI 3.0 makes no normative statement on trailing slashes, but Spectral\'s ' +
        '`path-keys-no-trailing-slash` rule (recommended by the default OAS3 ruleset) ' +
        'reflects the de-facto convention: omit the trailing slash. Inconsistency forces ' +
        'consumers and codegen-tools to special-case each variant.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: `Normalise to a single trailing-slash convention (recommend: omit) across all path keys.`,
      meta: {
        trailingCount: trailing.length,
        noTrailingCount: noTrailing.length,
        minorityStyle: minorityHas ? 'trailing-slash' : 'no-trailing-slash',
      },
    });
  }

  // ----- (6) S8 — RPC-style detection (heuristic) --------------------------
  const rpcHits: Array<{ path: string; segment: string; confidence: 'high' | 'low' }> = [];
  for (const r of records) {
    for (const seg of r.segments) {
      if (seg.startsWith('{')) continue; // template-slot — not a verb candidate
      const lc = seg.toLowerCase();
      // Skip versioned prefix segments.
      if (isVersionSegment(seg)) continue;
      // Detect: starts with strong RPC-verb prefix AND has a non-verb continuation
      // (e.g. `getUserById`, `createOrder` — but not the bare verb `get`, which
      // would also catch HTTP-method-like nouns).
      const strongMatch = STRONG_RPC_VERB_PREFIXES.find((v) => {
        if (lc === v) return false; // bare verb is too aggressive (could be a resource called "get")
        // camelCase: getUserById — starts with verb followed by uppercase letter
        if (seg.length > v.length && seg.toLowerCase().startsWith(v)) {
          const next = seg.charAt(v.length);
          if (/[A-Z]/.test(next)) return true;
          // snake_case: get_user_by_id — verb followed by underscore + lowercase
          if (next === '_' && /[a-z]/.test(seg.charAt(v.length + 1) ?? '')) return true;
        }
        return false;
      });

      if (strongMatch) {
        rpcHits.push({ path: r.pathKey, segment: seg, confidence: 'high' });
        continue;
      }

      // Low-confidence: bare control-verb segment (search, login, ...).
      // We emit these only as a separate low-confidence finding (see below) so
      // the high-confidence finding stays signal-rich.
      if (ACCEPTABLE_CONTROL_VERBS.has(lc)) {
        rpcHits.push({ path: r.pathKey, segment: seg, confidence: 'low' });
      }
    }
  }

  const highRpc = rpcHits.filter((h) => h.confidence === 'high');
  if (highRpc.length > 0) {
    const dedupedPaths = [...new Set(highRpc.map((h) => h.path))];
    const examples = formatExamples(
      highRpc.slice(0, 5).map((h) => `${h.path} (segment \`${h.segment}\`)`)
    );
    findings.push({
      detectorId: 'walker:path-rpc-style',
      layer: 'walker-statistical',
      title: `${dedupedPaths.length} path(s) contain RPC-style verb segments`,
      narration:
        `${dedupedPaths.length} path(s) contain segments that look like RPC method names ` +
        `(verb-prefixed identifiers like \`getUserById\` or \`createOrder\`) rather than ` +
        `resource nouns. Examples: ${examples}. ` +
        `RESTful design pushes the verb into the HTTP method (\`GET /users/{id}\`, ` +
        `\`POST /orders\`) and reserves path segments for resource identifiers. RPC-style ` +
        `paths typically appear when the spec was machine-generated from a gRPC / Thrift ` +
        `service or hand-translated from an internal RPC interface. Confidence: HIGH — these ` +
        `verb-prefixes have no idiomatic resource-style usage.`,
      rationale:
        'The OpenAPI Initiative Style Guide, Microsoft REST §7.1, and the Google AIP series ' +
        '(AIP-121, AIP-122, AIP-136) all treat resource-noun paths as a foundational REST ' +
        'principle. RPC-style paths break SDK ergonomics (the verb is duplicated in the ' +
        'method name and the path) and confuse caching layers that key on the verb-method ' +
        'pair.',
      category: 'design',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: dedupedPaths.map((p) => ({ path: p, method: 'get' })),
      patchOps: [],
      patchSummary:
        'Rewrite RPC-style paths to resource-noun shape (e.g. `getUserById` → `/users/{id}`).',
      meta: {
        confidence: 'high',
        hitCount: highRpc.length,
        pathCount: dedupedPaths.length,
        examples: highRpc.slice(0, 5),
      },
    });
  }

  // ----- (7) S4 — mixed versioning -----------------------------------------
  const versioned = records.filter((r) => r.isVersioned);
  const unversioned = records.filter((r) => !r.isVersioned && r.pathKey !== '/');
  const versionPrefixes = new Set(
    versioned.map((r) => r.versionPrefix!).filter((v): v is string => !!v)
  );

  // Two failure modes: (a) versioned + unversioned mixed, (b) >1 distinct
  // version-prefix.
  const isMixedPresence = versioned.length > 0 && unversioned.length > 0;
  const isMixedPrefix = versionPrefixes.size > 1;

  if (isMixedPresence || isMixedPrefix) {
    const reasons: string[] = [];
    if (isMixedPresence) {
      reasons.push(
        `${versioned.length} path(s) carry a version prefix while ${unversioned.length} do not`
      );
    }
    if (isMixedPrefix) {
      reasons.push(
        `${versionPrefixes.size} distinct version prefixes coexist: ${[...versionPrefixes]
          .map((v) => `\`/${v}/\``)
          .join(', ')}`
      );
    }
    const versionedExamples = formatExamples(versioned.slice(0, 3).map((r) => r.pathKey));
    const unversionedExamples = formatExamples(unversioned.slice(0, 3).map((r) => r.pathKey));
    findings.push({
      detectorId: 'walker:path-mixed-versioning',
      layer: 'walker-statistical',
      title: `Mixed path-versioning detected: ${reasons.join('; ')}`,
      narration:
        `${reasons.join('. ')}. ` +
        (isMixedPresence
          ? `Versioned examples: ${versionedExamples}. Unversioned examples: ${unversionedExamples}. `
          : '') +
        `Mixed path-versioning is one of the more confusing patterns for API consumers: when ` +
        `most paths are \`/v1/...\` and a handful are top-level, consumers must learn the ` +
        `exception list, and codegen base-path handling becomes ambiguous. The two ` +
        `idiomatic alternatives are (a) move every path under the same version prefix, or ` +
        `(b) move the version into a header / server-URL component and remove path-level ` +
        `versioning altogether.`,
      rationale:
        'OpenAPI 3.0 §4.7.5 ("Server Object") models version as part of the server URL or ' +
        'as a server variable; embedding `/v{N}` in path keys is a widely-used alternative, ' +
        'but the OpenAPI Initiative Style Guide and Microsoft REST §12 ("Versioning") both ' +
        'require internal consistency: either every path carries a version prefix or none ' +
        'do. Mixing styles fragments the contract.',
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary:
        'Standardise versioning: move every path under one prefix, or move version into a header / server URL.',
      meta: {
        versionedCount: versioned.length,
        unversionedCount: unversioned.length,
        distinctPrefixes: [...versionPrefixes],
        isMixedPresence,
        isMixedPrefix,
      },
    });
  }

  return findings;
}

// =============================================================================
// Helpers
// =============================================================================

function dedupeAffected(
  list: Array<{ path: string; method: string }>
): Array<{ path: string; method: string }> {
  const seen = new Set<string>();
  const out: Array<{ path: string; method: string }> = [];
  for (const e of list) {
    const k = `${e.method.toLowerCase()} ${e.path}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ path: e.path, method: e.method.toLowerCase() });
  }
  return out;
}

// =============================================================================
// CLI
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

async function main(): Promise<void> {
  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: npx tsx deterministic/path-template-parser.ts <spec-name>');
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  let specPath: string | null = null;
  for (const ext of ['json', 'yaml', 'yml']) {
    const candidate = path.join(specDir, `spec.${ext}`);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error(`No spec.{json,yaml,yml} found in ${specDir}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, 'utf8');
  let spec: object;
  if (specPath.endsWith('.json')) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import('yaml')).default;
    spec = YAML.parse(raw) as object;
  }

  console.log(`Loaded spec: ${specPath}`);
  console.log('');

  const startedAt = Date.now();
  const findings = await walkPathTemplates(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`path-template-parser ran, ${findings.length} findings emitted (${durationMs}ms)`);
  console.log('');
  if (findings.length === 0) {
    console.log('(No path-template findings.)');
    return;
  }
  for (const f of findings) {
    console.log(`[${f.detectorId}]`);
    console.log(`  title: ${f.title}`);
    if (f.meta) console.log(`  meta:  ${JSON.stringify(f.meta)}`);
    if (f.affectedEndpoints.length > 0) {
      console.log(`  affectedEndpoints: ${f.affectedEndpoints.length}`);
    }
    console.log('');
  }
}

const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    process.exit(1);
  });
}
