/**
 * Spec-Diff Module — Two-spec breaking-change detection (Welle A · T26).
 *
 * Closes the "1 partial" in the Putz-Niveau / Springer-Delphi 28-rule benchmark:
 * with this module, apiq covers 28/28 high-importance Springer-Delphi rules
 * (the prior gap was "single-spec breaking-change prediction" being only
 * partial — full diff between two versions was out-of-scope until the
 * 2026-05-06 user decision reclassified spec-diff as Stage-A scope).
 *
 * Lens: 3 (Evolution-Friction). Direction: drift / tighten / loosen depending
 * on the specific change-class detected. Severity: error for breaking changes,
 * warn for risky-non-breaking, hint for safe-additive.
 *
 * Public API:
 *   `runSpecDiff(baseline, current, opts?) => Promise<DetectorFinding[]>`
 *
 * Behaviour when only one spec is provided: returns `[]` (silent no-throw).
 * If `opts.logger` is provided, emits a single notice; otherwise stays silent.
 * The default logger is a no-op so the module has no implicit side-effects.
 */

import type { DetectorFinding } from './types.js';

/**
 * Library evaluation (decision: roll-our-own; 2026-05-06).
 *
 * Three options were evaluated:
 *
 * - **Option A: `openapi-diff` (Atlassian, npm 0.24.1, Apache-2.0)** — primarily
 *   a CLI tool. Output classifies into breaking/non-breaking only at coarse
 *   granularity, doesn't expose a programmatic API surface that maps cleanly
 *   onto our multi-lens DetectorFinding metadata. Pulls 9 transitive deps
 *   (axios, lodash, swagger-parser, json-schema-diff). 116 KB unpacked.
 * - **Option B: `oasdiff` (Tufin, Go binary)** — mature 450+ rule classifier.
 *   Best-in-class for CI use but requires CLI-spawn integration; adds binary
 *   distribution complexity for a Node-native deterministic layer.
 * - **Option C: `pb33f openapi-changes` (Go)** — granular per-property
 *   classification with v1.0/3.1/3.2 support. Same CLI-spawn complexity as B.
 *
 * **Decision: roll our own focused detector.** Rationale:
 *
 * 1. The breaking-change classes the task spec calls out are a SHORT,
 *    well-defined set — implementable in ~600 LOC.
 * 2. Tight integration with our multi-lens severity schema (severity-direction
 *    tighten/loosen/drift, Lens-3 tagging, breaking-change-class A-Q taxonomy
 *    from mining-round2-evolution.md).
 * 3. No new heavy npm deps. No CLI-spawn / Go-binary distribution complexity.
 * 4. Deterministic + explainable — JSON-Pointer-pair traces every finding.
 * 5. Future-fallback path remains open (oasdiff CLI-spawn or openapi-diff
 *    programmatic adapter as a SECONDARY detector if needed).
 *
 * Future fallback options (not implemented now):
 * - oasdiff CLI-spawn adapter that translates rule-IDs to our taxonomy.
 * - openapi-diff programmatic adapter for in-process Node use.
 *
 * Breaking-change classes implemented (Lens-3 taxonomy A–Q):
 * - **A** Required-field changes
 * - **B** Type changes (type swap, integer format narrowing)
 * - **C** Default-value changes (changed, removed)
 * - **D** Constraint-tightening
 * - **E** Enum-value changes
 * - **G** additionalProperties tightened (true -> false)
 * - **H** Operation removal / parameter removal
 * - **I** Status-code removed
 * - **K** Security changes
 * - **L** Content-type removed
 * - **N** Property removed / component-schema removed
 */

// =============================================================================
// Public API
// =============================================================================

export interface RunSpecDiffOptions {
  /** Caller-provided ID for the baseline spec — surfaces in `meta.diffBaselineSpecId`. */
  diffBaselineSpecId?: string;
  /** Caller-provided ID for the current spec — surfaces in `meta.diffCurrentSpecId`. */
  diffCurrentSpecId?: string;
  /** Cap on number of findings emitted (default 200). */
  maxFindings?: number;
  /** If true, emit additive (hint-tier) findings too. Default false. */
  includeAdditive?: boolean;
  /** Suppress the skip-notice when only one spec is provided. */
  silent?: boolean;
  /** Optional skip-notice logger; default is a no-op. */
  logger?: (msg: string) => void;
}

function noopLogger(_msg: string): void {
  // no-op default
}

/**
 * Run the spec-diff detector.
 *
 * @param baselineSpec  the older / "v1.0" spec (already dereferenced + parsed)
 * @param currentSpec   the newer / "v1.1" spec (already dereferenced + parsed)
 * @param opts          optional configuration
 * @returns DetectorFindings (mappable to canonical Finding via output-mapper)
 */
export async function runSpecDiff(
  baselineSpec: object | null | undefined,
  currentSpec: object | null | undefined,
  opts: RunSpecDiffOptions = {}
): Promise<DetectorFinding[]> {
  const log = opts.logger ?? noopLogger;
  if (!baselineSpec || !currentSpec) {
    if (!opts.silent) {
      log('[spec-diff] notice: requires both baseline and current spec');
    }
    return [];
  }
  if (typeof baselineSpec !== 'object' || typeof currentSpec !== 'object') {
    if (!opts.silent) {
      log('[spec-diff] notice: both inputs must be objects');
    }
    return [];
  }

  const ctx: DiffCtx = {
    baseline: baselineSpec as Record<string, unknown>,
    current: currentSpec as Record<string, unknown>,
    findings: [],
    maxFindings: opts.maxFindings ?? 200,
    includeAdditive: opts.includeAdditive ?? false,
    diffBaselineSpecId: opts.diffBaselineSpecId,
    diffCurrentSpecId: opts.diffCurrentSpecId,
  };

  diffOperations(ctx);
  diffComponentSchemas(ctx);
  diffSecuritySchemes(ctx);

  return ctx.findings.slice(0, ctx.maxFindings);
}

// =============================================================================
// Internals
// =============================================================================

interface DiffCtx {
  baseline: Record<string, unknown>;
  current: Record<string, unknown>;
  findings: DetectorFinding[];
  maxFindings: number;
  includeAdditive: boolean;
  diffBaselineSpecId?: string;
  diffCurrentSpecId?: string;
}

const HTTP_METHODS = new Set([
  'get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace',
]);

type BreakingClass =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'G' | 'H' | 'I' | 'K' | 'L' | 'N';

type Direction = 'tighten' | 'loosen' | 'drift';

function escJsonPointer(s: string): string {
  return s.replace(/~/g, '~0').replace(/\//g, '~1');
}

function getRecord(o: unknown): Record<string, unknown> | null {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    return o as Record<string, unknown>;
  }
  return null;
}

function pushFinding(
  ctx: DiffCtx,
  args: {
    detectorId: string;
    title: string;
    narration: string;
    rationale: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    scope: 'spec' | 'endpoint';
    affectedEndpoints?: Array<{ path: string; method: string }>;
    baselinePointer: string;
    currentPointer: string;
    breakingClass: BreakingClass;
    direction: Direction;
    severityTier: 'error' | 'warn' | 'hint';
  }
): void {
  if (ctx.findings.length >= ctx.maxFindings) return;
  ctx.findings.push({
    detectorId: args.detectorId,
    layer: 'walker-statistical',
    title: args.title,
    narration: args.narration,
    rationale: args.rationale,
    category: 'correctness',
    severity: args.severity,
    scope: args.scope,
    affectedEndpoints: args.affectedEndpoints ?? [],
    patchOps: [],
    patchSummary: 'No automatic patch — review the breaking change manually.',
    sourcePath: args.currentPointer,
    meta: {
      diffBaselineSpecId: ctx.diffBaselineSpecId,
      diffCurrentSpecId: ctx.diffCurrentSpecId,
      diffBreakingClass: args.breakingClass,
      baselinePointer: args.baselinePointer,
      currentPointer: args.currentPointer,
      severityDirection: args.direction,
      severityTier: args.severityTier,
      lens: ['evolution-friction'],
    },
  });
}

// =============================================================================
// Operation-level diff (paths.*.<method>)
// =============================================================================

interface OpEntry {
  path: string;
  method: string;
  op: Record<string, unknown>;
  pointer: string;
}

function collectOperations(spec: Record<string, unknown>): Map<string, OpEntry> {
  const out = new Map<string, OpEntry>();
  const paths = getRecord(spec.paths);
  if (!paths) return out;
  for (const [path, pathItemRaw] of Object.entries(paths)) {
    const pathItem = getRecord(pathItemRaw);
    if (!pathItem) continue;
    for (const [key, opRaw] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(key.toLowerCase())) continue;
      const op = getRecord(opRaw);
      if (!op) continue;
      const method = key.toLowerCase();
      out.set(`${method} ${path}`, {
        path,
        method,
        op,
        pointer: `/paths/${escJsonPointer(path)}/${method}`,
      });
    }
  }
  return out;
}

function diffOperations(ctx: DiffCtx): void {
  const baseOps = collectOperations(ctx.baseline);
  const currOps = collectOperations(ctx.current);

  for (const [key, baseEntry] of baseOps.entries()) {
    if (!currOps.has(key)) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:operation-removed',
        title: `Operation removed: ${baseEntry.method.toUpperCase()} ${baseEntry.path}`,
        narration: `The operation `+'`'+`${baseEntry.method.toUpperCase()} ${baseEntry.path}`+'`'+` exists in the baseline but is missing in the current spec. Removing an endpoint is a breaking change (class H). Clients will receive 404/405.`,
        rationale: 'Endpoint removal is disruptive. Provide a deprecation period (deprecated:true + Sunset header / RFC 8594) before removal.',
        severity: 'critical',
        scope: 'endpoint',
        affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
        baselinePointer: baseEntry.pointer,
        currentPointer: '(removed)',
        breakingClass: 'H',
        direction: 'loosen',
        severityTier: 'error',
      });
    }
  }

  if (ctx.includeAdditive) {
    for (const [key, currEntry] of currOps.entries()) {
      if (!baseOps.has(key)) {
        pushFinding(ctx, {
          detectorId: 'spec-diff:operation-added',
          title: `Operation added: ${currEntry.method.toUpperCase()} ${currEntry.path}`,
          narration: `New operation ${currEntry.method.toUpperCase()} ${currEntry.path} introduced in the current spec. Adding endpoints is safe-additive (hint).`,
          rationale: 'New endpoints are non-breaking additive changes.',
          severity: 'low',
          scope: 'endpoint',
          affectedEndpoints: [{ path: currEntry.path, method: currEntry.method }],
          baselinePointer: '(absent)',
          currentPointer: currEntry.pointer,
          breakingClass: 'H',
          direction: 'tighten',
          severityTier: 'hint',
        });
      }
    }
  }

  for (const [key, baseEntry] of baseOps.entries()) {
    const currEntry = currOps.get(key);
    if (!currEntry) continue;
    diffOperationParameters(ctx, baseEntry, currEntry);
    diffOperationRequestBody(ctx, baseEntry, currEntry);
    diffOperationResponses(ctx, baseEntry, currEntry);
    diffOperationSecurity(ctx, baseEntry, currEntry);
  }
}

// Parameters

interface ParamEntry {
  name: string;
  in: string;
  required: boolean;
  schema: Record<string, unknown> | null;
  raw: Record<string, unknown>;
  pointerSuffix: string;
}

function collectParameters(op: Record<string, unknown>): Map<string, ParamEntry> {
  const out = new Map<string, ParamEntry>();
  const params = op.parameters;
  if (!Array.isArray(params)) return out;
  params.forEach((p, idx) => {
    const pr = getRecord(p);
    if (!pr) return;
    const name = typeof pr.name === 'string' ? pr.name : null;
    const inLoc = typeof pr.in === 'string' ? pr.in : null;
    if (!name || !inLoc) return;
    out.set(`${inLoc}:${name}`, {
      name,
      in: inLoc,
      required: pr.required === true,
      schema: getRecord(pr.schema),
      raw: pr,
      pointerSuffix: `/parameters/${idx}`,
    });
  });
  return out;
}

function diffOperationParameters(
  ctx: DiffCtx,
  baseEntry: OpEntry,
  currEntry: OpEntry
): void {
  const baseParams = collectParameters(baseEntry.op);
  const currParams = collectParameters(currEntry.op);

  for (const [key, baseP] of baseParams.entries()) {
    if (!currParams.has(key)) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:parameter-removed',
        title: `Parameter removed: ${baseP.name} (in: ${baseP.in})`,
        narration: `Parameter ${baseP.name} (in: ${baseP.in}) on ${baseEntry.method.toUpperCase()} ${baseEntry.path} was present in the baseline but is missing in the current spec. Removing parameters is a breaking change (class H).`,
        rationale: 'Even optional parameters may be relied on by existing clients (e.g., feature flags, analytics tags). Deprecate before removal.',
        severity: 'high',
        scope: 'endpoint',
        affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
        baselinePointer: `${baseEntry.pointer}${baseP.pointerSuffix}`,
        currentPointer: '(removed)',
        breakingClass: 'H',
        direction: 'loosen',
        severityTier: 'error',
      });
    }
  }

  for (const [key, baseP] of baseParams.entries()) {
    const currP = currParams.get(key);
    if (!currP) continue;

    const basePointer = `${baseEntry.pointer}${baseP.pointerSuffix}`;
    const currPointer = `${currEntry.pointer}${currP.pointerSuffix}`;

    if (!baseP.required && currP.required) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:parameter-optional-to-required',
        title: `Parameter became required: ${baseP.name}`,
        narration: `Parameter ${baseP.name} (in: ${baseP.in}) on ${baseEntry.method.toUpperCase()} ${baseEntry.path} was optional in the baseline and is now required. Existing clients omitting it will start failing (class A).`,
        rationale: 'Tightening required-status is a breaking change for any client that previously omitted the parameter.',
        severity: 'critical',
        scope: 'endpoint',
        affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'A',
        direction: 'tighten',
        severityTier: 'error',
      });
    }

    if (baseP.required && !currP.required && ctx.includeAdditive) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:parameter-required-to-optional',
        title: `Parameter became optional: ${baseP.name}`,
        narration: `Parameter ${baseP.name} (in: ${baseP.in}) was required and is now optional. Safe-additive (hint).`,
        rationale: 'Loosening required to optional is non-breaking but worth surfacing for changelog visibility.',
        severity: 'low',
        scope: 'endpoint',
        affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'A',
        direction: 'loosen',
        severityTier: 'hint',
      });
    }

    if (baseP.schema && currP.schema) {
      diffSchemaShape(ctx, baseP.schema, currP.schema, basePointer, currPointer, {
        path: baseEntry.path,
        method: baseEntry.method,
        location: `parameter ${baseP.name}`,
        scope: 'endpoint',
        side: 'request',
      });
    }
  }
}

// requestBody diff
function diffOperationRequestBody(
  ctx: DiffCtx,
  baseEntry: OpEntry,
  currEntry: OpEntry
): void {
  const baseRB = getRecord(baseEntry.op.requestBody);
  const currRB = getRecord(currEntry.op.requestBody);
  if (!baseRB || !currRB) return;
  const baseContent = getRecord(baseRB.content);
  const currContent = getRecord(currRB.content);
  if (!baseContent || !currContent) return;

  for (const [media, baseMediaRaw] of Object.entries(baseContent)) {
    const baseMedia = getRecord(baseMediaRaw);
    const currMedia = getRecord(currContent[media]);
    if (!baseMedia || !currMedia) {
      if (baseMedia && !currMedia) {
        pushFinding(ctx, {
          detectorId: 'spec-diff:request-content-type-removed',
          title: `Request content-type removed: ${media}`,
          narration: `Request content-type ${media} on ${baseEntry.method.toUpperCase()} ${baseEntry.path} was present in the baseline and is missing in the current spec. Clients sending this content-type will receive 415 Unsupported Media Type (class L).`,
          rationale: 'Removing a supported content-type is a breaking change.',
          severity: 'high',
          scope: 'endpoint',
          affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
          baselinePointer: `${baseEntry.pointer}/requestBody/content/${escJsonPointer(media)}`,
          currentPointer: '(removed)',
          breakingClass: 'L',
          direction: 'loosen',
          severityTier: 'error',
        });
      }
      continue;
    }
    const baseSchema = getRecord(baseMedia.schema);
    const currSchema = getRecord(currMedia.schema);
    if (!baseSchema || !currSchema) continue;
    diffSchemaShape(
      ctx,
      baseSchema,
      currSchema,
      `${baseEntry.pointer}/requestBody/content/${escJsonPointer(media)}/schema`,
      `${currEntry.pointer}/requestBody/content/${escJsonPointer(media)}/schema`,
      {
        path: baseEntry.path,
        method: baseEntry.method,
        location: `request body (${media})`,
        scope: 'endpoint',
        side: 'request',
      }
    );
  }
}

// responses diff
function diffOperationResponses(
  ctx: DiffCtx,
  baseEntry: OpEntry,
  currEntry: OpEntry
): void {
  const baseResponses = getRecord(baseEntry.op.responses);
  const currResponses = getRecord(currEntry.op.responses);
  if (!baseResponses || !currResponses) return;

  for (const code of Object.keys(baseResponses)) {
    if (!(code in currResponses)) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:response-status-removed',
        title: `Response status removed: ${code}`,
        narration: `Response ${code} on ${baseEntry.method.toUpperCase()} ${baseEntry.path} was declared in the baseline and is missing in the current spec. Clients with branch logic on this status code will misbehave (class I).`,
        rationale: 'Removing a documented status code is a breaking change for clients that handle it (e.g., 429/503 retry logic, 304 caching).',
        severity: 'high',
        scope: 'endpoint',
        affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
        baselinePointer: `${baseEntry.pointer}/responses/${code}`,
        currentPointer: '(removed)',
        breakingClass: 'I',
        direction: 'loosen',
        severityTier: 'error',
      });
    }
  }

  for (const [code, baseRespRaw] of Object.entries(baseResponses)) {
    const baseResp = getRecord(baseRespRaw);
    const currResp = getRecord(currResponses[code]);
    if (!baseResp || !currResp) continue;
    const baseContent = getRecord(baseResp.content);
    const currContent = getRecord(currResp.content);
    if (!baseContent || !currContent) continue;
    for (const media of Object.keys(baseContent)) {
      if (!(media in currContent)) {
        pushFinding(ctx, {
          detectorId: 'spec-diff:response-content-type-removed',
          title: `Response content-type removed: ${code} ${media}`,
          narration: `Response ${code} content-type ${media} on ${baseEntry.method.toUpperCase()} ${baseEntry.path} was declared in the baseline and is missing now. Clients with Accept-headers requesting this type will fail content-negotiation (class L).`,
          rationale: 'Removing a response content-type breaks clients that requested it via Accept negotiation.',
          severity: 'high',
          scope: 'endpoint',
          affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
          baselinePointer: `${baseEntry.pointer}/responses/${code}/content/${escJsonPointer(media)}`,
          currentPointer: '(removed)',
          breakingClass: 'L',
          direction: 'loosen',
          severityTier: 'error',
        });
      }
    }

    for (const [media, baseMediaRaw] of Object.entries(baseContent)) {
      const baseMedia = getRecord(baseMediaRaw);
      const currMedia = getRecord(currContent[media]);
      if (!baseMedia || !currMedia) continue;
      const baseSchema = getRecord(baseMedia.schema);
      const currSchema = getRecord(currMedia.schema);
      if (!baseSchema || !currSchema) continue;
      diffSchemaShape(
        ctx,
        baseSchema,
        currSchema,
        `${baseEntry.pointer}/responses/${code}/content/${escJsonPointer(media)}/schema`,
        `${currEntry.pointer}/responses/${code}/content/${escJsonPointer(media)}/schema`,
        {
          path: baseEntry.path,
          method: baseEntry.method,
          location: `response ${code} (${media})`,
          scope: 'endpoint',
          side: 'response',
        }
      );
    }
  }
}

// Operation-level security diff
function diffOperationSecurity(
  ctx: DiffCtx,
  baseEntry: OpEntry,
  currEntry: OpEntry
): void {
  const baseSec = baseEntry.op.security;
  const currSec = currEntry.op.security;
  if (baseSec === undefined && currSec === undefined) return;
  if (JSON.stringify(baseSec ?? null) === JSON.stringify(currSec ?? null)) return;
  pushFinding(ctx, {
    detectorId: 'spec-diff:operation-security-changed',
    title: `Security requirement changed on ${baseEntry.method.toUpperCase()} ${baseEntry.path}`,
    narration: `The security requirement on ${baseEntry.method.toUpperCase()} ${baseEntry.path} differs between baseline and current. Changes to operation-level security (adding required scheme, swapping schemes, adding scopes) are breaking for clients (class K).`,
    rationale: 'Adding or replacing security requirements forces existing clients to re-authenticate or obtain new credentials/scopes.',
    severity: 'high',
    scope: 'endpoint',
    affectedEndpoints: [{ path: baseEntry.path, method: baseEntry.method }],
    baselinePointer: `${baseEntry.pointer}/security`,
    currentPointer: `${currEntry.pointer}/security`,
    breakingClass: 'K',
    direction: 'drift',
    severityTier: 'warn',
  });
}

// =============================================================================
// Schema-shape diff (recursive on properties + type / default / enum / constraints)
// =============================================================================

interface SchemaDiffCtx {
  path: string;
  method: string;
  location: string;
  scope: 'spec' | 'endpoint';
  side: 'request' | 'response';
}

function diffSchemaShape(
  ctx: DiffCtx,
  base: Record<string, unknown>,
  curr: Record<string, unknown>,
  basePointer: string,
  currPointer: string,
  scx: SchemaDiffCtx
): void {
  const baseType = typeof base.type === 'string' ? base.type : null;
  const currType = typeof curr.type === 'string' ? curr.type : null;
  if (baseType && currType && baseType !== currType) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:schema-type-changed',
      title: `Schema type changed: ${baseType} -> ${currType} (${scx.location})`,
      narration: `The type on ${scx.location} changed from ${baseType} to ${currType}. Type changes are breaking for clients with statically-typed deserialization (class B).`,
      rationale: 'Wire-format type changes force codegen consumers to regenerate. Even widening (integer -> number) breaks strict deserializers.',
      severity: 'critical',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'B',
      direction: 'drift',
      severityTier: 'error',
    });
  }

  const baseFormat = typeof base.format === 'string' ? base.format : null;
  const currFormat = typeof curr.format === 'string' ? curr.format : null;
  if (baseType === currType && baseType === 'integer') {
    if (baseFormat !== currFormat) {
      const narrowing = !baseFormat && !!currFormat;
      pushFinding(ctx, {
        detectorId: 'spec-diff:integer-format-changed',
        title: `Integer format changed: ${baseFormat ?? '(none)'} -> ${currFormat ?? '(none)'} (${scx.location})`,
        narration: narrowing
          ? `Integer format on ${scx.location} narrowed from (none) to ${currFormat}. Adding a format narrows the value-range, so existing clients sending values outside int32/int64 bounds will fail (class B).`
          : `Integer format on ${scx.location} changed from ${baseFormat ?? '(none)'} to ${currFormat ?? '(none)'}. Format changes can cause precision loss or codegen-class drift.`,
        rationale: 'OAS integer format declares the wire-encoding range. Narrowing today rejects payloads previously accepted.',
        severity: 'high',
        scope: scx.scope,
        affectedEndpoints: [{ path: scx.path, method: scx.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'B',
        direction: narrowing ? 'tighten' : 'drift',
        severityTier: 'warn',
      });
    }
  }

  const baseHasDefault = 'default' in base;
  const currHasDefault = 'default' in curr;
  if (baseHasDefault && currHasDefault) {
    if (JSON.stringify(base.default) !== JSON.stringify(curr.default)) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:default-value-changed',
        title: `Default value changed (${scx.location})`,
        narration: `The default on ${scx.location} changed from ${JSON.stringify(base.default)} to ${JSON.stringify(curr.default)}. Clients relying on the old default will see different behavior (class C).`,
        rationale: 'Default-value changes are documented as breaking by Stripe/Microsoft/Zalando versioning policies.',
        severity: 'medium',
        scope: scx.scope,
        affectedEndpoints: [{ path: scx.path, method: scx.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'C',
        direction: 'drift',
        severityTier: 'warn',
      });
    }
  } else if (baseHasDefault && !currHasDefault) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:default-value-removed',
      title: `Default value removed (${scx.location})`,
      narration: `The default on ${scx.location} was ${JSON.stringify(base.default)} in the baseline but is missing in the current spec. Removing a default forces clients to supply the field explicitly (class C).`,
      rationale: 'Default removal is breaking under all major vendor versioning policies (Stripe, Microsoft Graph, Zalando).',
      severity: 'medium',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'C',
      direction: 'tighten',
      severityTier: 'warn',
    });
  }

  diffEnumValues(ctx, base, curr, basePointer, currPointer, scx);
  diffConstraints(ctx, base, curr, basePointer, currPointer, scx);
  diffAdditionalProperties(ctx, base, curr, basePointer, currPointer, scx);
  diffPropertiesAndRequired(ctx, base, curr, basePointer, currPointer, scx);
}

function diffEnumValues(
  ctx: DiffCtx,
  base: Record<string, unknown>,
  curr: Record<string, unknown>,
  basePointer: string,
  currPointer: string,
  scx: SchemaDiffCtx
): void {
  const baseEnum = Array.isArray(base.enum) ? base.enum : null;
  const currEnum = Array.isArray(curr.enum) ? curr.enum : null;
  if (!baseEnum || !currEnum) return;
  const baseSet = new Set(baseEnum.map((v) => JSON.stringify(v)));
  const currSet = new Set(currEnum.map((v) => JSON.stringify(v)));
  const removed: string[] = [];
  const added: string[] = [];
  for (const v of Array.from(baseSet)) if (!currSet.has(v)) removed.push(v);
  for (const v of Array.from(currSet)) if (!baseSet.has(v)) added.push(v);

  if (scx.side === 'response' && removed.length > 0) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:enum-value-removed-response',
      title: `Enum value(s) removed from response: ${removed.join(', ')} (${scx.location})`,
      narration: `Response enum on ${scx.location} dropped value(s) ${removed.join(', ')}. Strict clients that exhaustively switch on enum will hit unhandled-default branches when servers stop returning these (class E).`,
      rationale: 'Per OASDIFF/OPTIC: removing enum values from response is breaking for strict clients.',
      severity: 'high',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'E',
      direction: 'loosen',
      severityTier: 'error',
    });
  }
  if (scx.side === 'request' && removed.length > 0) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:enum-value-removed-request',
      title: `Enum value(s) removed from request: ${removed.join(', ')} (${scx.location})`,
      narration: `Request enum on ${scx.location} dropped value(s) ${removed.join(', ')}. Server now rejects requests that previously sent these values (class E).`,
      rationale: 'Per OASDIFF: removing accepted enum values from request is a breaking change.',
      severity: 'critical',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'E',
      direction: 'tighten',
      severityTier: 'error',
    });
  }

  if (scx.side === 'response' && added.length > 0) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:enum-value-added-response',
      title: `Enum value(s) added to response: ${added.join(', ')} (${scx.location})`,
      narration: `Response enum on ${scx.location} added value(s) ${added.join(', ')}. Clients without an x-extensible-enum hook may break on the new value (class E - risky-non-breaking).`,
      rationale: 'Adding enum values is breaking for strict clients without extensibility. Mitigate with x-extensible-enum / description hint.',
      severity: 'medium',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'E',
      direction: 'loosen',
      severityTier: 'warn',
    });
  }
}

function diffConstraints(
  ctx: DiffCtx,
  base: Record<string, unknown>,
  curr: Record<string, unknown>,
  basePointer: string,
  currPointer: string,
  scx: SchemaDiffCtx
): void {
  const maxFields: Array<'maxLength' | 'maxItems' | 'maximum'> = [
    'maxLength', 'maxItems', 'maximum',
  ];
  for (const key of maxFields) {
    const b = base[key];
    const c = curr[key];
    if (typeof b === 'number' && typeof c === 'number' && c < b) {
      pushFinding(ctx, {
        detectorId: `spec-diff:${key}-decreased`,
        title: `${key} decreased: ${b} -> ${c} (${scx.location})`,
        narration: `The ${key} on ${scx.location} decreased from ${b} to ${c}. Server now rejects values that were previously accepted (class D - constraint-tightening).`,
        rationale: 'OASDIFF flags constraint-tightening as breaking.',
        severity: 'high',
        scope: scx.scope,
        affectedEndpoints: [{ path: scx.path, method: scx.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'D',
        direction: 'tighten',
        severityTier: 'warn',
      });
    }
  }

  const minFields: Array<'minLength' | 'minItems' | 'minimum'> = [
    'minLength', 'minItems', 'minimum',
  ];
  for (const key of minFields) {
    const b = base[key];
    const c = curr[key];
    if (typeof b === 'number' && typeof c === 'number' && c > b) {
      pushFinding(ctx, {
        detectorId: `spec-diff:${key}-increased`,
        title: `${key} increased: ${b} -> ${c} (${scx.location})`,
        narration: `The ${key} on ${scx.location} increased from ${b} to ${c}. Server now rejects values that were previously accepted (class D).`,
        rationale: 'Increasing a minimum tightens accepted range; existing clients submitting values below the new floor break.',
        severity: 'high',
        scope: scx.scope,
        affectedEndpoints: [{ path: scx.path, method: scx.method }],
        baselinePointer: basePointer,
        currentPointer: currPointer,
        breakingClass: 'D',
        direction: 'tighten',
        severityTier: 'warn',
      });
    }
  }
  if (typeof base.pattern === 'string' && typeof curr.pattern === 'string' && base.pattern !== curr.pattern) {
    pushFinding(ctx, {
      detectorId: 'spec-diff:pattern-changed',
      title: `Pattern changed (${scx.location})`,
      narration: `The pattern on ${scx.location} changed: ${base.pattern} -> ${curr.pattern}. Pattern changes are typically tightening (class D); a strict regex-equivalence check is out of scope.`,
      rationale: 'Pattern changes commonly narrow accepted values. Without runtime sampling we cannot prove super/sub-set, so flag as warn.',
      severity: 'medium',
      scope: scx.scope,
      affectedEndpoints: [{ path: scx.path, method: scx.method }],
      baselinePointer: basePointer,
      currentPointer: currPointer,
      breakingClass: 'D',
      direction: 'tighten',
      severityTier: 'warn',
    });
  }
}

function diffAdditionalProperties(
  ctx: DiffCtx,
  base: Record<string, unknown>,
  curr: Record<string, unknown>,
  basePointer: string,
  currPointer: string,
  scx: SchemaDiffCtx
): void {
  const b = base.additionalProperties;
  const c = curr.additionalProperties;
  if (b === undefined || c === undefined) return;
  if (b === c) return;
  const tightening = b === true && c === false;
  if (!tightening) return;
  pushFinding(ctx, {
    detectorId: 'spec-diff:additionalProperties-tightened',
    title: `additionalProperties tightened: true -> false (${scx.location})`,
    narration: `The additionalProperties on ${scx.location} changed from true to false. Server (or strict client) now rejects payloads containing fields outside the declared property set (class G).`,
    rationale: 'Per OASDIFF + Stripe / MS-AZ policy: tightening additionalProperties from true to false is breaking.',
    severity: 'high',
    scope: scx.scope,
    affectedEndpoints: [{ path: scx.path, method: scx.method }],
    baselinePointer: basePointer,
    currentPointer: currPointer,
    breakingClass: 'G',
    direction: 'tighten',
    severityTier: 'error',
  });
}

function diffPropertiesAndRequired(
  ctx: DiffCtx,
  base: Record<string, unknown>,
  curr: Record<string, unknown>,
  basePointer: string,
  currPointer: string,
  scx: SchemaDiffCtx
): void {
  const baseProps = getRecord(base.properties);
  const currProps = getRecord(curr.properties);
  const baseRequired = Array.isArray(base.required)
    ? new Set(base.required.filter((x): x is string => typeof x === 'string'))
    : new Set<string>();
  const currRequired = Array.isArray(curr.required)
    ? new Set(curr.required.filter((x): x is string => typeof x === 'string'))
    : new Set<string>();

  for (const propName of Array.from(currRequired)) {
    if (!baseRequired.has(propName)) {
      const wasInBase = baseProps && propName in baseProps;
      pushFinding(ctx, {
        detectorId: wasInBase ? 'spec-diff:property-became-required' : 'spec-diff:new-required-property-added',
        title: wasInBase
          ? `Property became required: ${propName} (${scx.location})`
          : `New required property added: ${propName} (${scx.location})`,
        narration: (wasInBase
          ? `Property ${propName} on ${scx.location} was optional in the baseline and is now required.`
          : `Property ${propName} was added to ${scx.location} AND marked required in the current spec.`) + ' Clients omitting it will fail validation (class A).',
        rationale: 'Adding required-status (or adding a new required field) is one of the canonical breaking changes per OASDIFF/Stripe/MS-AZ policy.',
        severity: 'critical',
        scope: scx.scope,
        affectedEndpoints: [{ path: scx.path, method: scx.method }],
        baselinePointer: `${basePointer}/required`,
        currentPointer: `${currPointer}/properties/${escJsonPointer(propName)}`,
        breakingClass: 'A',
        direction: 'tighten',
        severityTier: 'error',
      });
    }
  }

  if (ctx.includeAdditive) {
    for (const propName of Array.from(baseRequired)) {
      if (!currRequired.has(propName)) {
        pushFinding(ctx, {
          detectorId: 'spec-diff:property-required-removed',
          title: `Property no longer required: ${propName} (${scx.location})`,
          narration: `Property ${propName} on ${scx.location} was required in the baseline and is now optional. Safe-additive (hint).`,
          rationale: 'Loosening required to optional is non-breaking; surface for changelog visibility.',
          severity: 'low',
          scope: scx.scope,
          affectedEndpoints: [{ path: scx.path, method: scx.method }],
          baselinePointer: `${basePointer}/required`,
          currentPointer: `${currPointer}/required`,
          breakingClass: 'A',
          direction: 'loosen',
          severityTier: 'hint',
        });
      }
    }
  }

  if (baseProps) {
    for (const propName of Object.keys(baseProps)) {
      if (!currProps || !(propName in currProps)) {
        const isResponse = scx.side === 'response';
        pushFinding(ctx, {
          detectorId: 'spec-diff:property-removed',
          title: `Property removed: ${propName} (${scx.location})`,
          narration: `Property ${propName} on ${scx.location} was declared in the baseline and is missing in the current spec.` + (isResponse
            ? ' Clients reading this field will see undefined / parse errors (class N).'
            : ' Server may now reject or silently ignore this field (class N).'),
          rationale: isResponse
            ? 'Response property removal is breaking for any client deserializer that expected the field.'
            : 'Request property removal is contract-breaking even if server is permissive.',
          severity: isResponse ? 'critical' : 'high',
          scope: scx.scope,
          affectedEndpoints: [{ path: scx.path, method: scx.method }],
          baselinePointer: `${basePointer}/properties/${escJsonPointer(propName)}`,
          currentPointer: '(removed)',
          breakingClass: 'N',
          direction: isResponse ? 'loosen' : 'tighten',
          severityTier: 'error',
        });
      }
    }
  }

  if (baseProps && currProps) {
    for (const [propName, baseSubRaw] of Object.entries(baseProps)) {
      const currSubRaw = currProps[propName];
      const baseSub = getRecord(baseSubRaw);
      const currSub = getRecord(currSubRaw);
      if (!baseSub || !currSub) continue;
      diffSchemaShape(
        ctx,
        baseSub,
        currSub,
        `${basePointer}/properties/${escJsonPointer(propName)}`,
        `${currPointer}/properties/${escJsonPointer(propName)}`,
        { ...scx, location: `${scx.location} -> ${propName}` }
      );
    }
  }

  const baseItems = getRecord(base.items);
  const currItems = getRecord(curr.items);
  if (baseItems && currItems) {
    diffSchemaShape(ctx, baseItems, currItems, `${basePointer}/items`, `${currPointer}/items`,
      { ...scx, location: `${scx.location}[items]` });
  }
}

// =============================================================================
// Component-schemas + global securitySchemes diff
// =============================================================================

function diffComponentSchemas(ctx: DiffCtx): void {
  const baseComponents = getRecord(ctx.baseline.components);
  const currComponents = getRecord(ctx.current.components);
  if (!baseComponents || !currComponents) return;
  const baseSchemas = getRecord(baseComponents.schemas);
  const currSchemas = getRecord(currComponents.schemas);
  if (!baseSchemas || !currSchemas) return;

  for (const [name, baseSchemaRaw] of Object.entries(baseSchemas)) {
    const baseSchema = getRecord(baseSchemaRaw);
    const currSchema = getRecord(currSchemas[name]);
    if (!baseSchema) continue;
    if (!currSchema) {
      pushFinding(ctx, {
        detectorId: 'spec-diff:component-schema-removed',
        title: `Component schema removed: ${name}`,
        narration: `Component schema ${name} was declared in baseline.components.schemas but is missing in the current spec. Any operation that referenced it via $ref will fail to resolve (class N).`,
        rationale: 'Component-schema removal cascades through every $ref consumer.',
        severity: 'critical',
        scope: 'spec',
        baselinePointer: `/components/schemas/${escJsonPointer(name)}`,
        currentPointer: '(removed)',
        breakingClass: 'N',
        direction: 'loosen',
        severityTier: 'error',
      });
      continue;
    }
    diffSchemaShape(
      ctx, baseSchema, currSchema,
      `/components/schemas/${escJsonPointer(name)}`,
      `/components/schemas/${escJsonPointer(name)}`,
      { path: '*', method: '*', location: `component schema ${name}`, scope: 'spec', side: 'response' }
    );
  }
}

function diffSecuritySchemes(ctx: DiffCtx): void {
  const baseComponents = getRecord(ctx.baseline.components);
  const currComponents = getRecord(ctx.current.components);
  const baseSchemes = baseComponents ? getRecord(baseComponents.securitySchemes) : null;
  const currSchemes = currComponents ? getRecord(currComponents.securitySchemes) : null;
  if (!baseSchemes && !currSchemes) return;
  if (JSON.stringify(baseSchemes ?? null) === JSON.stringify(currSchemes ?? null)) return;
  pushFinding(ctx, {
    detectorId: 'spec-diff:security-schemes-changed',
    title: 'Global securitySchemes changed',
    narration: 'The components.securitySchemes block differs between baseline and current. Adding, removing, or replacing schemes (apiKey/http/oauth2/openIdConnect) forces clients to re-authenticate or re-implement the auth flow (class K).',
    rationale: 'Auth-scheme changes are documented as breaking by OASDIFF, Stripe, and Microsoft Graph versioning policies.',
    severity: 'high',
    scope: 'spec',
    baselinePointer: '/components/securitySchemes',
    currentPointer: '/components/securitySchemes',
    breakingClass: 'K',
    direction: 'drift',
    severityTier: 'warn',
  });
}

export type { DetectorFinding } from './types.js';
