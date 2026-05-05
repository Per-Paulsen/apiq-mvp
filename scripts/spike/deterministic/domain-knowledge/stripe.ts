/**
 * Stripe-class pattern library for the domain-knowledge layer (Task A2).
 *
 * Catches the 4 Stripe-specific findings (F7, F9, F12, F28) that Phase-0-Bulk-Sweep
 * showed (C-i) Sonnet+Sonnet missed under v5 prompt at 0% coverage on Stripe FULL.
 * Each pattern is grounded in:
 *   - Stripe's public documentation (linked in narrations)
 *   - Empirical verification against `openapi-examples/stripe-full/spec.json`
 *     (commit 011d8e30..., version 2026-04-22.dahlia)
 *   - The reference findings file `findings.json` for severity / category /
 *     scope alignment with the spike's reference target.
 *
 * Style: conservative on heuristics — each pattern emits a single spec-level
 * finding only when the underlying signal is clear-cut on this specific spec
 * shape. False-positives are worse than misses for a domain-knowledge layer.
 */

import type { DetectorFinding, DetectorOptions } from '../types.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
const WRITE_METHODS = ['post', 'put', 'patch'] as const;

// Stripe documents its rate-limit and operational headers externally; consumers
// of the spec must rely on prose docs since the OpenAPI spec is silent on them.
const STRIPE_DOCS = {
  idempotency: 'https://docs.stripe.com/api/idempotent_requests',
  versioning: 'https://docs.stripe.com/api/versioning',
  connect: 'https://docs.stripe.com/connect/authentication',
  rateLimits: 'https://docs.stripe.com/rate-limits',
};

interface OpenAPIParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: unknown;
  description?: string;
}

interface OpenAPIOperation {
  parameters?: OpenAPIParameter[];
  responses?: Record<string, OpenAPIResponse>;
  [key: string]: unknown;
}

interface OpenAPIResponse {
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation> | undefined>;
  components?: {
    parameters?: Record<string, OpenAPIParameter>;
    schemas?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function asSpec(spec: object): OpenAPISpec {
  return spec as OpenAPISpec;
}

/**
 * Iterate every operation in `paths.*.<method>` matching the given methods.
 * Yields `{ pathTemplate, method, op }` tuples in document order.
 */
function* iterateOperations(
  spec: OpenAPISpec,
  methods: readonly string[] = HTTP_METHODS
): Generator<{ pathTemplate: string; method: string; op: OpenAPIOperation }> {
  const paths = spec.paths ?? {};
  for (const pathTemplate of Object.keys(paths)) {
    const pathItem = paths[pathTemplate];
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      yield { pathTemplate, method, op: op as OpenAPIOperation };
    }
  }
}

/** Case-insensitive header-parameter check on an operation's `parameters` array. */
function hasHeaderParam(op: OpenAPIOperation, headerName: string): boolean {
  const params = Array.isArray(op.parameters) ? op.parameters : [];
  const wanted = headerName.toLowerCase();
  return params.some(
    (p) => p && typeof p === 'object' && p.in === 'header' && typeof p.name === 'string' && p.name.toLowerCase() === wanted
  );
}

// ---------------------------------------------------------------------------
// F7 — Idempotency-Key undeclared on POST/PUT/PATCH
// ---------------------------------------------------------------------------
function detectIdempotencyKey(spec: OpenAPISpec): DetectorFinding[] {
  let total = 0;
  let missing = 0;
  const sampleMissing: Array<{ path: string; method: string }> = [];

  for (const { pathTemplate, method, op } of iterateOperations(spec, WRITE_METHODS)) {
    total++;
    if (!hasHeaderParam(op, 'Idempotency-Key')) {
      missing++;
      if (sampleMissing.length < 5) {
        sampleMissing.push({ path: pathTemplate, method });
      }
    }
  }

  // Conservative: only emit if the *majority* of write ops lack the header. If
  // the spec is mostly compliant (e.g. 1 stray op) it's not a domain-knowledge
  // gap — Spectral's standard rules can flag the outliers.
  if (total === 0 || missing < Math.ceil(total * 0.5)) return [];

  return [
    {
      detectorId: 'domain:stripe:idempotency-key',
      layer: 'domain-knowledge',
      title: 'Idempotency-Key header is not declared on POST/PUT/PATCH operations',
      narration:
        `${missing}/${total} POST/PUT/PATCH operations do not declare an Idempotency-Key header parameter. ` +
        `Stripe's public docs document this header as the standard mechanism for retry-safe writes ` +
        `(${STRIPE_DOCS.idempotency}). Payment-creation calls without an Idempotency-Key on retry can ` +
        `result in duplicate charges, so the spec should declare this header — typically as a reusable ` +
        `parameter component referenced from every state-changing operation — so codegen tools and ` +
        `client SDKs surface the retry-safety mechanism by default.`,
      rationale:
        `RFC 7231 §4.2.2 names idempotency as a contract property of HTTP methods; for POST (which is not ` +
        `inherently idempotent) the Idempotency-Key convention pioneered by Stripe is the de-facto industry ` +
        `pattern. Omitting it from the spec means the safety pattern is invisible to consumers who only ` +
        `read the spec.`,
      category: 'risk',
      severity: 'high',
      scope: 'spec',
      affectedEndpoints: [],
      patchSummary:
        'Add Idempotency-Key as a reusable parameter component and reference it from each POST/PUT/PATCH operation',
      patchOps: [
        {
          op: 'add',
          path: '/components/parameters/IdempotencyKey',
          value: {
            in: 'header',
            name: 'Idempotency-Key',
            required: false,
            description:
              `A unique key per request to safely retry without creating duplicates. See ${STRIPE_DOCS.idempotency}.`,
            schema: {
              type: 'string',
              maxLength: 255,
            },
          },
        },
      ],
      sourcePath: '/paths',
      meta: {
        totalWriteOps: total,
        missingCount: missing,
        sampleMissing,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// F9 — x-stripeBypassValidation vendor extension exposed on enum fields
// ---------------------------------------------------------------------------
function detectStripeBypassValidation(spec: OpenAPISpec): DetectorFinding[] {
  let count = 0;
  const samplePaths: string[] = [];

  // Generic deep-walk: count every object in the spec that carries the
  // `x-stripeBypassValidation: true` flag. We don't restrict to enum-typed
  // fields explicitly because the extension's semantics ("the listed values
  // are advisory, not exhaustive") only matter on enum-shaped properties; the
  // reference data confirms 538 occurrences and all are on enum schemas, so
  // counting all flag occurrences is a faithful proxy.
  const stack: Array<{ node: unknown; path: string }> = [{ node: spec, path: '' }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { node, path } = current;
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        stack.push({ node: node[i], path: `${path}/${i}` });
      }
      continue;
    }
    const obj = node as Record<string, unknown>;
    if (obj['x-stripeBypassValidation'] === true) {
      count++;
      if (samplePaths.length < 5) samplePaths.push(path);
    }
    for (const key of Object.keys(obj)) {
      // JSON-pointer encoding for path components: ~ → ~0, / → ~1.
      const encoded = key.replace(/~/g, '~0').replace(/\//g, '~1');
      stack.push({ node: obj[key], path: `${path}/${encoded}` });
    }
  }

  // Threshold: > 100 keeps the heuristic from firing on incidental Stripe-like
  // specs that happen to use the extension a couple of times. Stripe's real
  // FULL spec carries 538 instances; the threshold is comfortably above noise.
  if (count <= 100) return [];

  return [
    {
      detectorId: 'domain:stripe:x-stripe-bypass-validation',
      layer: 'domain-knowledge',
      title: `x-stripeBypassValidation vendor extension exposed on ${count} enum fields`,
      narration:
        `${count} enum-typed fields carry the x-stripeBypassValidation: true extension. This Stripe-internal ` +
        `extension signals that the listed enum values are non-authoritative — clients should NOT rely on the ` +
        `listed values being exhaustive, because the runtime API may accept additional values. AI-codegen tools ` +
        `that emit strict-enum types based on the spec will produce TypeScript / Rust enums that exclude valid ` +
        `runtime values. The spec should either (a) remove the extension if the enums are authoritative, or ` +
        `(b) document its semantics in info.description so consumers understand the implied open-set behavior.`,
      rationale:
        `OpenAPI 3.0 §3.4 permits x- extensions but expects them to be either documented or to have semantic ` +
        `meaning visible from context. JSON Schema §6.1.2 treats enum as a closed set. A spec that emits ` +
        `closed-enum syntax while flagging the enum as non-authoritative under an undocumented vendor extension ` +
        `creates a contract gap.`,
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchSummary:
        'Either remove x-stripeBypassValidation or document its semantics in info.description',
      // Semantic decision (remove vs. document); we do not auto-patch.
      patchOps: [],
      sourcePath: '/components/schemas',
      meta: {
        occurrenceCount: count,
        samplePaths,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// F12 — Stripe-Account / Stripe-Version operational headers undeclared
// ---------------------------------------------------------------------------
function detectOperationalHeaders(spec: OpenAPISpec): DetectorFinding[] {
  let total = 0;
  let withAccount = 0;
  let withVersion = 0;

  for (const { op } of iterateOperations(spec, HTTP_METHODS)) {
    total++;
    if (hasHeaderParam(op, 'Stripe-Account')) withAccount++;
    if (hasHeaderParam(op, 'Stripe-Version')) withVersion++;
  }

  // Also check components.parameters for a reusable definition; if the spec
  // declares the headers as components but never references them, it's a
  // weaker signal — we still emit, but the heuristic must be tight: emit only
  // when BOTH headers are entirely absent.
  if (total === 0) return [];
  if (withAccount > 0 || withVersion > 0) return [];

  // Also short-circuit if components.parameters declares them — a spec that has
  // them as reusable components but doesn't reference them is a different
  // (lesser) issue best left to Spectral / walker layers.
  const componentParams = spec.components?.parameters ?? {};
  const componentParamNames = new Set(
    Object.values(componentParams)
      .filter((p): p is OpenAPIParameter => !!p && typeof p === 'object')
      .map((p) => (typeof p.name === 'string' ? p.name.toLowerCase() : ''))
  );
  if (componentParamNames.has('stripe-account') || componentParamNames.has('stripe-version')) {
    return [];
  }

  return [
    {
      detectorId: 'domain:stripe:operational-headers',
      layer: 'domain-knowledge',
      title: 'Stripe-Account and Stripe-Version headers not declared on any operation',
      narration:
        `Stripe's REST API documents two operationally-critical request headers: Stripe-Account (used by ` +
        `Connect platforms to act on behalf of a connected account, see ${STRIPE_DOCS.connect}) and ` +
        `Stripe-Version (pins the API version per request, overriding the account default, see ` +
        `${STRIPE_DOCS.versioning}). Neither header is declared on any of the spec's ${total} operations and ` +
        `neither appears in components.parameters. Codegen tools that read the spec emit SDKs without typed ` +
        `support for either header; Connect integrators and version-pinning consumers must reach for ` +
        `low-level header-injection escape hatches.`,
      rationale:
        `OpenAPI 3.0 §4.7.10 supports header parameters as first-class. Headers that are part of the documented ` +
        `API contract belong in the spec; absence of these two well-documented headers is a contract gap. ` +
        `Microsoft's REST API Guidelines §7.6 names version negotiation via header as a first-class API ` +
        `concern that should appear in the spec.`,
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchSummary: 'Add Stripe-Account and Stripe-Version as reusable parameter components',
      patchOps: [
        {
          op: 'add',
          path: '/components/parameters/StripeAccount',
          value: {
            in: 'header',
            name: 'Stripe-Account',
            required: false,
            description: `Connect platforms: ID of the connected account to act on behalf of. See ${STRIPE_DOCS.connect}.`,
            schema: { type: 'string', pattern: '^acct_' },
          },
        },
        {
          op: 'add',
          path: '/components/parameters/StripeVersion',
          value: {
            in: 'header',
            name: 'Stripe-Version',
            required: false,
            description: `Pin the API version for this request, overriding the account default. See ${STRIPE_DOCS.versioning}.`,
            schema: { type: 'string' },
          },
        },
      ],
      sourcePath: '/components/parameters',
      meta: {
        totalOps: total,
        withStripeAccount: withAccount,
        withStripeVersion: withVersion,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// F28 — Rate-limit response headers undeclared
// ---------------------------------------------------------------------------
function detectRateLimitHeaders(spec: OpenAPISpec): DetectorFinding[] {
  let totalOps = 0;
  let with429 = 0;
  const rateLimitHeaderNames = new Set([
    'retry-after',
    'x-ratelimit-remaining',
    'x-ratelimit-limit',
    'x-ratelimit-reset',
  ]);
  let rateLimitHeaderHits = 0;
  const responseHeadersSeen = new Set<string>();

  for (const { op } of iterateOperations(spec, HTTP_METHODS)) {
    totalOps++;
    const responses = op.responses ?? {};
    for (const code of Object.keys(responses)) {
      if (code === '429') with429++;
      const resp = responses[code];
      if (!resp || typeof resp !== 'object') continue;
      const headers = (resp as OpenAPIResponse).headers;
      if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
        for (const h of Object.keys(headers)) {
          const lower = h.toLowerCase();
          responseHeadersSeen.add(lower);
          if (rateLimitHeaderNames.has(lower)) rateLimitHeaderHits++;
        }
      }
    }
  }

  // Also check components.headers for reusable rate-limit declarations.
  const componentHeaders = spec.components?.headers ?? {};
  let componentRateLimitHeaders = 0;
  for (const name of Object.keys(componentHeaders)) {
    if (rateLimitHeaderNames.has(name.toLowerCase())) componentRateLimitHeaders++;
  }

  // Conservative trigger: emit only if the spec declares ZERO rate-limit
  // headers anywhere (responses or components). For Stripe specifically the
  // domain-knowledge layer applies even without 429 responses (Stripe is
  // documented as rate-limited at https://docs.stripe.com/rate-limits) — we
  // gate on the Stripe-class heuristic in the dispatcher rather than on a
  // generic "has 429" check here.
  if (rateLimitHeaderHits > 0 || componentRateLimitHeaders > 0) return [];
  if (totalOps === 0) return [];

  return [
    {
      detectorId: 'domain:stripe:rate-limit-headers',
      layer: 'domain-knowledge',
      title: 'Rate-limit response headers are not declared on any operation',
      narration:
        `Stripe's API documents rate-limiting (${STRIPE_DOCS.rateLimits}) and applies it server-side, but the ` +
        `spec declares zero rate-limit response headers (Retry-After, X-RateLimit-Remaining, X-RateLimit-Limit, ` +
        `X-RateLimit-Reset) across ${totalOps} operations${with429 === 0 ? ' and no 429 responses' : ` (${with429} ops declare 429)`}. ` +
        `Consumers building retry-with-backoff logic need these in the spec to know when to retry; SDK codegen ` +
        `tools that read response headers to build typed retry-handling code get nothing. The pattern mirrors ` +
        `the Stripe-Account / Stripe-Version gap: operationally-critical headers exist in the runtime, are ` +
        `documented externally, but are absent from the OpenAPI spec.`,
      rationale:
        `OpenAPI 3.0 §4.7.18 supports headers as a typed declaration on responses. RFC 6585 names Retry-After ` +
        `on 429 as the canonical rate-limit-signal mechanism; documenting it (and the X-RateLimit-* family ` +
        `popularized by GitHub and the IETF draft-polli-ratelimit-headers) lets generated SDKs surface retry ` +
        `semantics without manual header extraction.`,
      category: 'design',
      severity: 'medium',
      scope: 'spec',
      affectedEndpoints: [],
      patchSummary:
        'Add rate-limit response headers as reusable header components and reference them from rate-limited responses',
      patchOps: [
        {
          op: 'add',
          path: '/components/headers/RetryAfter',
          value: {
            schema: { type: 'integer' },
            description: 'Seconds to wait before retrying the request (RFC 6585 §4).',
          },
        },
        {
          op: 'add',
          path: '/components/headers/XRateLimitRemaining',
          value: {
            schema: { type: 'integer' },
            description: 'Remaining requests in the current rate window.',
          },
        },
        {
          op: 'add',
          path: '/components/headers/XRateLimitLimit',
          value: {
            schema: { type: 'integer' },
            description: 'Maximum requests permitted per rate window.',
          },
        },
        {
          op: 'add',
          path: '/components/headers/XRateLimitReset',
          value: {
            schema: { type: 'integer' },
            description: 'Unix epoch seconds at which the current rate window resets.',
          },
        },
      ],
      sourcePath: '/paths',
      meta: {
        totalOps,
        opsWith429: with429,
        responseHeadersSeen: [...responseHeadersSeen],
        componentRateLimitHeaders,
      },
    },
  ];
}

/**
 * Run all Stripe-class patterns against a parsed (already-dereferenced) spec.
 * The dispatcher in `./index.ts` is responsible for deciding whether the spec
 * is Stripe-class before invoking this function.
 */
export async function runStripePatterns(
  spec: object,
  _opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const typed = asSpec(spec);
  const findings: DetectorFinding[] = [];
  findings.push(...detectIdempotencyKey(typed));
  findings.push(...detectStripeBypassValidation(typed));
  findings.push(...detectOperationalHeaders(typed));
  findings.push(...detectRateLimitHeaders(typed));
  return findings;
}

// Exported for unit-style testing from the dispatcher CLI.
export const __testing = {
  detectIdempotencyKey,
  detectStripeBypassValidation,
  detectOperationalHeaders,
  detectRateLimitHeaders,
};
