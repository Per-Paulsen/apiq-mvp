/**
 * Walker: Operational-Metadata Coverage (Lens 10) — Welle B / Task T20.
 *
 * Implements 7 patterns surfaced in Mining-Round-2 Phase F (the 10th and final
 * lens identified in Round-2; cross-domain evidence: Zimmermann MAP, SLA4OAI,
 * FAPI, TM Forum, OpenAI rate-limit-headers, FHIR CapabilityStatement, IETF
 * draft-ratelimit-headers, RFC 8594 Sunset).
 *
 * Lens 10 detects whether the spec documents the operational-metadata that
 * runtime consumers (oncall, SRE, infra, agentic clients) need: rate-limit
 * declarations, deprecation timelines with Sunset headers, capability-discovery
 * endpoints, and substantive contact / license metadata.
 *
 * Patterns (priority + lens-tags from implementation-priority.md):
 *   - L10-1 (P1, Lens 10+7+1):  429 declared without ANY rate-limit signaling
 *   - L10-2 (P2, Lens 10+4+8):  Cross-op rate-limit-header consistency
 *   - L10-3 (P2, Lens 10+3):    deprecated:true op without sunset/Sunset header
 *   - L10-4 / F-9 (P3, Lens 10+4+9): Capability-discovery endpoint (positive marker, info)
 *   - L10-5 / F-8 (P3, Lens 10+4+9): info.contact substantive (positive marker, info)
 *   - L10-6 / F-8 (P3, Lens 10+4+9): info.license substantive (positive marker, info)
 *   - F-7 (P2, Lens 7+10):      RateLimit-* headers when 429 declared
 *
 * Source-distinction: the non-positive findings (L10-1, L10-2, L10-3, F-7) emit
 * `walker-statistical` findings with the standard severity tiers; positive
 * markers (L10-4/5/6) emit `info`-severity observations (Round-2 Phase F: the
 * apiq UI distinguishes `info` from real findings).
 *
 * Public API:
 *   - walkOperationalMetadata(spec, opts) => Promise of DetectorFinding[]
 *   - OPERATIONAL_METADATA_RULES — RuleMetadata for each detector-id
 *
 * Sources:
 *   - `specs/big-spec-architecture-spike-stage-a-mining-round2-meta.md`
 *     (Phase F Lens 10 definition + F-7..F-10 + F-16 patterns)
 *   - `specs/big-spec-architecture-spike-stage-a-meta-insights.md`
 *     (Lens 10 cube-cell: SRE × Runtime-at-scale × Operational-metadata-missing)
 *   - `specs/big-spec-architecture-spike-stage-a-implementation-priority.md`
 *     (T20 description, P1/P2/P3 allocation, multi-lens-tags)
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';
import type { RuleMetadata } from '../infra/severity-schema.js';
import { validateMetadata } from '../infra/severity-schema.js';
import { walkOperations, formatExamples } from './_shared.js';

// =============================================================================
// Constants — header-name allowlists + capability-discovery path-templates.
// =============================================================================

/**
 * Headers that count as "rate-limit signaling" on a 429 response. Matches the
 * IETF `draft-ietf-httpapi-ratelimit-headers` `RateLimit-*` family, the legacy
 * `X-RateLimit-*` family used by GitHub / Stripe / OpenAI / cross-industry, and
 * `Retry-After` (RFC 9110 §10.2.3 / RFC 6585).
 */
const ANY_RATE_LIMIT_HEADERS: ReadonlyArray<RegExp> = [
  /^retry-after$/i,
  /^ratelimit-(limit|remaining|reset|policy)$/i,
  /^x-ratelimit-(limit|remaining|reset|used|resource)$/i,
  /^x-rate-limit-(limit|remaining|reset)$/i,
];

/**
 * Subset of rate-limit headers that are the "RateLimit-* family" specifically
 * — used by F-7 (the IETF-draft + cross-vendor convention). Excludes plain
 * `Retry-After` because Retry-After alone covers L10-1 but not F-7.
 */
const RATE_LIMIT_FAMILY_HEADERS: ReadonlyArray<RegExp> = [
  /^ratelimit-(limit|remaining|reset|policy)$/i,
  /^x-ratelimit-(limit|remaining|reset|used|resource)$/i,
  /^x-rate-limit-(limit|remaining|reset)$/i,
];

const SUNSET_HEADERS: ReadonlyArray<RegExp> = [
  /^sunset$/i,
  /^deprecation$/i,
];

/**
 * Path-template fragments that signal a capability-discovery / server self-
 * description endpoint (FHIR CapabilityStatement, MCP `/.well-known/...`,
 * Kubernetes-style `/metadata`, OpenAPI `/openapi`, etc.).
 *
 * Patterns are anchored at the root or after a version prefix (`/v1`,
 * `/2024-01-01`) to avoid false positives on paths that merely contain
 * `metadata` or `health` as a sub-segment (e.g. `/orgs/{org}/health-check/`).
 */
const CAPABILITY_PATH_PATTERNS: ReadonlyArray<RegExp> = [
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/_?capabilities?(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/_?metadata(\/|$)/i,
  /\/\.well-known\//i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/openapi(\.(json|yaml))?(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/swagger(\.(json|yaml))?(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/health(z)?(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/_?status(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/discovery(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/server-?info(\/|$)/i,
  /^(\/(?:v\d+(?:[._-]\d+)*|\d{4}-\d{2}-\d{2}))?\/api-docs(\/|$)/i,
];

/**
 * SLA / quota vendor-extension keys (OpenAPI Initiative SLA4OAI plus de-facto
 * conventions). Presence is a positive marker for Lens 10 (see F-10 in
 * mining-round2-meta.md).
 */
const SLA_EXTENSION_KEYS: ReadonlyArray<string> = [
  'x-sla',
  'x-sla4oai',
  'x-rate-limit',
  'x-ratelimit',
  'x-quota',
  'x-quotas',
  'x-throttle',
  'x-throttling',
];

// =============================================================================
// RuleMetadata — Severity-Schema-Final tagging for each detector-id.
// =============================================================================

export const OPERATIONAL_METADATA_RULES: Record<string, RuleMetadata> = {
  'walker:operational-metadata:l10-1-no-rate-limit-signaling': validateMetadata({
    severity: 'warn',
    lenses: ['operational-metadata', 'operations', 'threat-modeling'],
    sources: [
      { type: 'rfc', number: 6585, section: '4' },
      { type: 'rfc', number: 9110, section: '10.2.3' },
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'IETF-draft-ratelimit-headers' },
    ],
    stakeholders: ['operations', 'client-dev', 'security'],
    lifecyclePhase: 'runtime-at-scale',
    defectClass: 'incomplete',
    iso25010: ['reliability'],
    priority: 'P1',
    patternId: 'L10-1',
  }),
  'walker:operational-metadata:l10-2-rate-limit-coverage-inconsistent': validateMetadata({
    severity: 'hint',
    lenses: ['operational-metadata', 'client-friction', 'internal-consistency'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'OpenAI-rate-limit-headers' },
      { type: 'vendor', name: 'GitHub-rate-limit-headers' },
      { type: 'vendor', name: 'Stripe-rate-limit-headers' },
    ],
    stakeholders: ['operations', 'client-dev'],
    lifecyclePhase: 'runtime-at-scale',
    defectClass: 'semantic',
    iso25010: ['reliability'],
    priority: 'P2',
    patternId: 'L10-2',
  }),
  'walker:operational-metadata:l10-3-deprecated-without-sunset': validateMetadata({
    severity: 'warn',
    lenses: ['operational-metadata', 'evolution-friction'],
    sources: [
      { type: 'rfc', number: 8594 },
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'OWASP-API9-2023' },
    ],
    stakeholders: ['client-dev', 'spec-author', 'operations'],
    lifecyclePhase: 'evolution-time',
    defectClass: 'incomplete',
    iso25010: ['maintainability'],
    priority: 'P2',
    patternId: 'L10-3',
  }),
  'walker:operational-metadata:l10-4-capability-discovery-present': validateMetadata({
    severity: 'info',
    lenses: ['operational-metadata', 'client-friction', 'ai-agent-consumability'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'FHIR-CapabilityStatement' },
      { type: 'vendor', name: 'MCP-well-known' },
    ],
    stakeholders: ['operations', 'codegen-tool'],
    lifecyclePhase: 'runtime-happy',
    defectClass: 'incomplete',
    iso25010: ['compatibility'],
    priority: 'P3',
    patternId: 'L10-4',
  }),
  'walker:operational-metadata:l10-5-info-contact-substantive': validateMetadata({
    severity: 'info',
    lenses: ['operational-metadata', 'client-friction', 'ai-agent-consumability'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'FAIR-principles' },
      { type: 'vendor', name: 'Postman-discoverability' },
    ],
    stakeholders: ['client-dev', 'docs-tool'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L10-5',
  }),
  'walker:operational-metadata:l10-6-info-license-substantive': validateMetadata({
    severity: 'info',
    lenses: ['operational-metadata', 'client-friction', 'ai-agent-consumability'],
    sources: [
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
      { type: 'vendor', name: 'FAIR-principles' },
      { type: 'vendor', name: 'Postman-discoverability' },
    ],
    stakeholders: ['client-dev', 'docs-tool'],
    lifecyclePhase: 'documentation-time',
    defectClass: 'incomplete',
    iso25010: ['usability'],
    priority: 'P3',
    patternId: 'L10-6',
  }),
  'walker:operational-metadata:f-7-no-ratelimit-family-on-429': validateMetadata({
    severity: 'hint',
    lenses: ['operations', 'operational-metadata'],
    sources: [
      { type: 'vendor', name: 'IETF-draft-ratelimit-headers' },
      { type: 'vendor', name: 'OpenAI-rate-limit-headers' },
      { type: 'vendor', name: 'GitHub-rate-limit-headers' },
      { type: 'vendor', name: 'Stripe-rate-limit-headers' },
      { type: 'mining', phase: 'round2', subagent: 'phase-f-meta' },
    ],
    stakeholders: ['operations', 'client-dev'],
    lifecyclePhase: 'runtime-at-scale',
    defectClass: 'incomplete',
    iso25010: ['reliability'],
    priority: 'P2',
    patternId: 'F-7',
  }),
};

// =============================================================================
// Helpers — response-header introspection.
// =============================================================================

interface ResponseHeadersCtx {
  /** All header-names declared on the response (lowercased for matching). */
  headerNames: string[];
  /** Whether the response object has any documented headers at all. */
  hasResponse: boolean;
}

/**
 * Extract the names of headers declared on a response object. Handles both
 * direct `headers: { Name: { ... } }` and `headers: { Name: { $ref: ... } }`
 * forms; ref-resolution is best-effort and falls back to the declared key.
 */
function getResponseHeaderNames(
  response: unknown,
): ResponseHeadersCtx {
  if (!response || typeof response !== 'object') {
    return { headerNames: [], hasResponse: false };
  }
  const respObj = response as Record<string, unknown>;
  const headers = respObj.headers;
  if (!headers || typeof headers !== 'object') {
    return { headerNames: [], hasResponse: true };
  }
  const names: string[] = [];
  for (const key of Object.keys(headers)) {
    names.push(key.toLowerCase());
  }
  return { headerNames: names, hasResponse: true };
}

function matchesAny(name: string, patterns: ReadonlyArray<RegExp>): boolean {
  return patterns.some((re) => re.test(name));
}

function hasAnyRateLimitHeader(headerNames: string[]): boolean {
  return headerNames.some((n) => matchesAny(n, ANY_RATE_LIMIT_HEADERS));
}

function hasRateLimitFamilyHeader(headerNames: string[]): boolean {
  return headerNames.some((n) => matchesAny(n, RATE_LIMIT_FAMILY_HEADERS));
}

function hasSunsetHeader(headerNames: string[]): boolean {
  return headerNames.some((n) => matchesAny(n, SUNSET_HEADERS));
}

/** Same logic for the entire operation: collect headers from ALL responses. */
function collectAllResponseHeaderNames(
  operation: Record<string, unknown>,
): string[] {
  const responses = operation.responses;
  if (!responses || typeof responses !== 'object') return [];
  const out: string[] = [];
  for (const r of Object.values(responses as Record<string, unknown>)) {
    const ctx = getResponseHeaderNames(r);
    out.push(...ctx.headerNames);
  }
  return out;
}

// =============================================================================
// Helpers — info.contact / info.license substantive checks.
// =============================================================================

interface InfoMetaCtx {
  contactSubstantive: boolean;
  licenseSubstantive: boolean;
  contactDetail?: string;
  licenseDetail?: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function inspectInfoBlock(spec: object): InfoMetaCtx {
  const root = spec as Record<string, unknown>;
  const info = root.info;
  if (!info || typeof info !== 'object') {
    return { contactSubstantive: false, licenseSubstantive: false };
  }
  const infoObj = info as Record<string, unknown>;

  // contact: substantive if has at least one of email/url AND that value is
  // non-empty + not an obvious placeholder.
  let contactSubstantive = false;
  let contactDetail: string | undefined;
  const contact = infoObj.contact;
  if (contact && typeof contact === 'object') {
    const c = contact as Record<string, unknown>;
    const email = isNonEmptyString(c.email) ? c.email : undefined;
    const url = isNonEmptyString(c.url) ? c.url : undefined;
    const name = isNonEmptyString(c.name) ? c.name : undefined;
    const hasEmail = email !== undefined && !/example\.|stub|placeholder|todo/i.test(email);
    const hasUrl = url !== undefined && !/example\.com|localhost|stub|placeholder|todo/i.test(url);
    if (hasEmail || hasUrl) {
      contactSubstantive = true;
      contactDetail = [name, email, url].filter(Boolean).join(' / ');
    }
  }

  // license: substantive if `name` is set AND (license url OR identifier present).
  let licenseSubstantive = false;
  let licenseDetail: string | undefined;
  const license = infoObj.license;
  if (license && typeof license === 'object') {
    const l = license as Record<string, unknown>;
    const name = isNonEmptyString(l.name) ? l.name : undefined;
    const url = isNonEmptyString(l.url) ? l.url : undefined;
    const identifier = isNonEmptyString(l.identifier) ? l.identifier : undefined;
    if (name !== undefined && (url !== undefined || identifier !== undefined)) {
      licenseSubstantive = true;
      licenseDetail = [name, identifier ?? url].filter(Boolean).join(' / ');
    }
  }

  return { contactSubstantive, licenseSubstantive, contactDetail, licenseDetail };
}

// =============================================================================
// Helpers — capability-discovery endpoint detection.
// =============================================================================

function findCapabilityEndpoints(spec: object): string[] {
  const root = spec as Record<string, unknown>;
  const paths = root.paths;
  if (!paths || typeof paths !== 'object') return [];
  const matches: string[] = [];
  for (const [pathKey] of Object.entries(paths as Record<string, unknown>)) {
    if (!pathKey.startsWith('/')) continue;
    if (CAPABILITY_PATH_PATTERNS.some((re) => re.test(pathKey))) {
      matches.push(pathKey);
    }
  }
  return matches;
}

function findSlaExtensions(spec: object): string[] {
  const root = spec as Record<string, unknown>;
  const out: string[] = [];
  for (const k of Object.keys(root)) {
    if (SLA_EXTENSION_KEYS.includes(k.toLowerCase())) out.push(k);
  }
  // Also check info.* extensions.
  const info = root.info;
  if (info && typeof info === 'object') {
    for (const k of Object.keys(info as Record<string, unknown>)) {
      if (SLA_EXTENSION_KEYS.includes(k.toLowerCase())) out.push(`info.${k}`);
    }
  }
  return out;
}

// =============================================================================
// Main detector.
// =============================================================================

interface OpRateLimitInfo {
  path: string;
  method: string;
  has429: boolean;
  hasAnyRL: boolean;
  hasFamilyRL: boolean;
}

export async function walkOperationalMetadata(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const findings: DetectorFinding[] = [];

  // --------------------------------------------------------------------------
  // (1) Per-operation rate-limit + sunset analysis (basis for L10-1, L10-2,
  //     L10-3, F-7).
  // --------------------------------------------------------------------------
  const rl: OpRateLimitInfo[] = [];
  const noSignalingOn429: Array<{ path: string; method: string }> = [];
  const noFamilyOn429: Array<{ path: string; method: string }> = [];
  const deprecatedNoSunset: Array<{ path: string; method: string }> = [];

  for (const { path, method, operation } of walkOperations(spec)) {
    // (a) inspect 429 response
    const responses = operation.responses;
    let has429 = false;
    let resp429HeaderNames: string[] = [];
    if (responses && typeof responses === 'object') {
      const r = (responses as Record<string, unknown>)['429'];
      if (r) {
        has429 = true;
        resp429HeaderNames = getResponseHeaderNames(r).headerNames;
      }
    }

    // Also accept rate-limit headers documented at op-level on ANY 4xx response
    // (some specs document Retry-After on 503 + 429, others bundle it on a
    // shared error-response). For L10-1 strict signal: look only at 429 first;
    // fall back to "any response declares them" for charity.
    const allOpHeaders = collectAllResponseHeaderNames(operation);
    const hasAnyRL = hasAnyRateLimitHeader(resp429HeaderNames) || hasAnyRateLimitHeader(allOpHeaders);
    const hasFamilyRL = hasRateLimitFamilyHeader(resp429HeaderNames) || hasRateLimitFamilyHeader(allOpHeaders);

    if (has429) {
      rl.push({ path, method, has429, hasAnyRL, hasFamilyRL });
      if (!hasAnyRL) noSignalingOn429.push({ path, method });
      if (!hasFamilyRL) noFamilyOn429.push({ path, method });
    } else {
      // For consistency-check (L10-2): record op even without 429 if it declares
      // family headers somewhere — this op is "signaling-aware".
      rl.push({ path, method, has429, hasAnyRL, hasFamilyRL });
    }

    // (b) deprecated:true without sunset/Sunset
    if (operation.deprecated === true) {
      const opHeaders = collectAllResponseHeaderNames(operation);
      const hasSunset = hasSunsetHeader(opHeaders);
      // Also accept op-level vendor-extension `x-sunset` / `sunset` / `x-deprecated-on`.
      const opObj = operation as Record<string, unknown>;
      const hasVendorSunset =
        isNonEmptyString(opObj['x-sunset']) ||
        isNonEmptyString(opObj['sunset']) ||
        isNonEmptyString(opObj['x-deprecated-on']) ||
        isNonEmptyString(opObj['x-deprecation-date']);
      if (!hasSunset && !hasVendorSunset) {
        deprecatedNoSunset.push({ path, method });
      }
    }
  }

  // ---- L10-1 — 429 declared without ANY rate-limit signaling --------------
  if (noSignalingOn429.length > 0) {
    const examples = formatExamples(
      noSignalingOn429.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
      5,
    );
    findings.push({
      detectorId: 'walker:operational-metadata:l10-1-no-rate-limit-signaling',
      layer: 'walker-statistical',
      title: `${noSignalingOn429.length} operation(s) declare 429 without any rate-limit signaling header`,
      narration:
        `${noSignalingOn429.length} operation(s) document a \`429 Too Many Requests\` response ` +
        `but declare none of \`Retry-After\`, \`RateLimit-Limit\`/\`RateLimit-Remaining\`/\`RateLimit-Reset\`, ` +
        `or any \`X-RateLimit-*\` header. Examples: ${examples}. Without signaling headers, ` +
        `consumers cannot back off correctly: clients must guess wait-times, retry storms ` +
        `worsen the throttle, and SDKs cannot generate adaptive-retry middleware. RFC 9110 ` +
        `§10.2.3 mandates \`Retry-After\` for 429 / 503; the IETF \`draft-ietf-httpapi-` +
        `ratelimit-headers\` formalises the \`RateLimit-*\` family that OpenAI, GitHub, and ` +
        `Stripe already ship. A 429 contract without one of these headers is half a contract.`,
      rationale:
        'RFC 9110 §10.2.3 ("Retry-After") + RFC 6585 §4 ("429 Too Many Requests") together ' +
        'establish that a server emitting 429 is expected to advertise a wait-time. The IETF ' +
        '`draft-ietf-httpapi-ratelimit-headers` (active as of 2026) generalises this with ' +
        '`RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`. OpenAI, GitHub, and ' +
        'Stripe each ship one or both families; a 429 declaration without either is missing ' +
        'the Lens-10 operational-metadata payload that runtime consumers depend on.',
      category: 'design',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: noSignalingOn429.slice(0, 50),
      patchOps: [],
      patchSummary:
        `Declare \`Retry-After\` (and ideally \`RateLimit-Limit\` / \`-Remaining\` / \`-Reset\`) ` +
        `on the ${noSignalingOn429.length} operations that document 429.`,
      meta: {
        count: noSignalingOn429.length,
        patternId: 'L10-1',
        priority: 'P1',
        examples: noSignalingOn429.slice(0, 5),
      },
    });
  }

  // ---- F-7 — RateLimit-* family missing on 429 (companion to L10-1) -------
  // Only fire if the L10-1 fully-missing-signaling rule didn't already cover
  // this op (i.e. op has SOME signaling but lacks the RateLimit-* family).
  const f7Offenders = noFamilyOn429.filter(
    (o) => !noSignalingOn429.some((s) => s.path === o.path && s.method === o.method),
  );
  if (f7Offenders.length > 0) {
    const examples = formatExamples(
      f7Offenders.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
      5,
    );
    findings.push({
      detectorId: 'walker:operational-metadata:f-7-no-ratelimit-family-on-429',
      layer: 'walker-statistical',
      title: `${f7Offenders.length} operation(s) declare 429 without RateLimit-* family headers`,
      narration:
        `${f7Offenders.length} operation(s) document a \`429\` response with \`Retry-After\` ` +
        `but do not declare the \`RateLimit-Limit\` / \`RateLimit-Remaining\` / \`RateLimit-Reset\` ` +
        `family (or its \`X-RateLimit-*\` legacy form). Examples: ${examples}. The IETF ` +
        `\`draft-ietf-httpapi-ratelimit-headers\` is the cross-vendor convention for surfacing ` +
        `quota-state-on-every-response. OpenAI, GitHub, and Stripe each declare this family — ` +
        `agentic clients and adaptive SDKs use it for window-aware backoff decisions, not just ` +
        `single-request retry. \`Retry-After\` is sufficient for fail-after-throttle handling, ` +
        `but the RateLimit-* family enables proactive rate-shaping.`,
      rationale:
        'IETF `draft-ietf-httpapi-ratelimit-headers` (in flight as of 2026) standardises the ' +
        '`RateLimit-*` field-naming on 200 + 429 responses. OpenAI, GitHub, and Stripe ship ' +
        'either the RFC-RateLimit-* form or the legacy `X-RateLimit-*` variant. Agentic ' +
        'clients and adaptive SDKs query the family pre-emptively to avoid hitting the cap, ' +
        'so spec-side declaration is load-bearing for Lens-10 / Lens-7 ergonomics.',
      category: 'design',
      severity: 'medium',
      scope: 'endpoint',
      affectedEndpoints: f7Offenders.slice(0, 50),
      patchOps: [],
      patchSummary:
        `Declare \`RateLimit-Limit\` / \`RateLimit-Remaining\` / \`RateLimit-Reset\` headers ` +
        `(or \`X-RateLimit-*\`) on the ${f7Offenders.length} operations.`,
      meta: {
        count: f7Offenders.length,
        patternId: 'F-7',
        priority: 'P2',
        examples: f7Offenders.slice(0, 5),
      },
    });
  }

  // ---- L10-2 — Cross-op rate-limit consistency ----------------------------
  // Fires when SOME operations declare RateLimit-family headers and OTHERS do
  // not. Detects "rate-limit headers on /search but not elsewhere" type drift.
  const opsWithFamily = rl.filter((o) => o.hasFamilyRL);
  const opsWithoutFamily = rl.filter((o) => !o.hasFamilyRL);
  if (opsWithFamily.length > 0 && opsWithoutFamily.length > 0 && rl.length >= 4) {
    // Only fire when family-presence is non-trivial AND non-universal: at least
    // 2 ops with family AND at least 2 without (avoids one-off noise).
    if (opsWithFamily.length >= 2 && opsWithoutFamily.length >= 2) {
      const minority = opsWithFamily.length < opsWithoutFamily.length ? opsWithFamily : opsWithoutFamily;
      const minorityHasIt = opsWithFamily.length < opsWithoutFamily.length;
      const minorityList = formatExamples(
        minority.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
        5,
      );
      findings.push({
        detectorId: 'walker:operational-metadata:l10-2-rate-limit-coverage-inconsistent',
        layer: 'walker-statistical',
        title: `Rate-limit headers declared inconsistently: ${opsWithFamily.length}/${rl.length} operations carry RateLimit-* family headers`,
        narration:
          `${opsWithFamily.length} of ${rl.length} operations declare \`RateLimit-*\` (or ` +
          `\`X-RateLimit-*\`) family headers; ${opsWithoutFamily.length} do not. ` +
          `The minority group (${minority.length} ops, ${minorityHasIt ? 'with' : 'without'} ` +
          `family headers) is the divergent set: ${minorityList}. Cross-op inconsistency in ` +
          `rate-limit metadata is a Lens-10 + Lens-8 (internal-consistency) signal — ` +
          `consumers building generic SDKs over the spec must special-case which endpoints ` +
          `expose quota-state and which don't, and adaptive-retry middleware degenerates to ` +
          `lowest-common-denominator behaviour. Either declare uniformly or document the ` +
          `divergence intentionally.`,
        rationale:
          'Lens-10 (Operational-Metadata-Coverage) crosses Lens-8 (Internal-Consistency): the ' +
          'spec is the discoverability surface, so partial coverage of operational metadata is ' +
          'worse than uniform absence. OpenAI / GitHub / Stripe declare RateLimit-* on every ' +
          'rate-limited operation, not a subset.',
        category: 'design',
        severity: 'medium',
        scope: 'spec',
        affectedEndpoints: minority.slice(0, 50).map((o) => ({ path: o.path, method: o.method })),
        patchOps: [],
        patchSummary:
          `Declare \`RateLimit-*\` family headers on all ${rl.length} rate-limited operations, ` +
          `or document the ${minority.length} divergent operations explicitly.`,
        meta: {
          opsTotal: rl.length,
          opsWithFamily: opsWithFamily.length,
          opsWithoutFamily: opsWithoutFamily.length,
          minorityHasIt,
          patternId: 'L10-2',
          priority: 'P2',
        },
      });
    }
  }

  // ---- L10-3 — deprecated:true without sunset/Sunset header ---------------
  if (deprecatedNoSunset.length > 0) {
    const examples = formatExamples(
      deprecatedNoSunset.slice(0, 8).map((o) => `${o.method.toUpperCase()} ${o.path}`),
      5,
    );
    findings.push({
      detectorId: 'walker:operational-metadata:l10-3-deprecated-without-sunset',
      layer: 'walker-statistical',
      title: `${deprecatedNoSunset.length} deprecated operation(s) declare no Sunset / Deprecation header or sunset extension`,
      narration:
        `${deprecatedNoSunset.length} operation(s) carry \`deprecated: true\` but declare ` +
        `neither a \`Sunset\` response header (RFC 8594) nor a \`Deprecation\` header nor any ` +
        `vendor-extension sunset-date (\`x-sunset\`, \`x-deprecation-date\`). Examples: ` +
        `${examples}. \`deprecated: true\` is a flag without a deadline — consumers see "this ` +
        `is going away" but cannot plan migration windows or budget effort. RFC 8594 ` +
        `("Sunset Header") is the IETF-standard mechanism for declaring removal-dates; FAPI / ` +
        `PSD2 mandate it for regulated APIs; OWASP API9:2023 ("Improper Inventory Management") ` +
        `cites missing-deprecation-timeline as a top-10 deprecation antipattern. Pair every ` +
        `\`deprecated: true\` flag with a documented sunset date.`,
      rationale:
        'RFC 8594 §2 defines the `Sunset` HTTP header for advertising the date after which a ' +
        'resource will be removed. RFC `draft-ietf-httpapi-deprecation-header` defines the ' +
        '`Deprecation` companion header. OWASP API9:2023 prevention guidance, FAPI deprecation ' +
        'mandates, and Microsoft REST Guideline §12.4 all call for sunset-with-flag, not flag ' +
        'alone.',
      category: 'design',
      severity: 'high',
      scope: 'endpoint',
      affectedEndpoints: deprecatedNoSunset.slice(0, 50),
      patchOps: [],
      patchSummary:
        `Add a \`Sunset\` response header (or \`x-sunset\` extension) declaring the removal date ` +
        `on the ${deprecatedNoSunset.length} deprecated operation(s).`,
      meta: {
        count: deprecatedNoSunset.length,
        patternId: 'L10-3',
        priority: 'P2',
        examples: deprecatedNoSunset.slice(0, 5),
      },
    });
  }

  // --------------------------------------------------------------------------
  // (2) Positive markers — info-tier observations.
  // --------------------------------------------------------------------------

  // ---- L10-4 — Capability-discovery endpoint present ----------------------
  const capabilityPaths = findCapabilityEndpoints(spec);
  if (capabilityPaths.length > 0) {
    findings.push({
      detectorId: 'walker:operational-metadata:l10-4-capability-discovery-present',
      layer: 'walker-statistical',
      title: `Capability-discovery endpoint(s) declared: ${capabilityPaths.slice(0, 3).join(', ')}`,
      narration:
        `Spec exposes ${capabilityPaths.length} capability-discovery / server-self-description ` +
        `endpoint(s): ${capabilityPaths.slice(0, 5).join(', ')}` +
        `${capabilityPaths.length > 5 ? ` (and ${capabilityPaths.length - 5} more)` : ''}. ` +
        `Endpoints like \`/_capabilities\`, \`/.well-known/*\`, \`/openapi.json\`, \`/health\`, ` +
        `or \`/server-info\` are positive markers for Lens 10: they let agentic clients and ` +
        `infrastructure tooling introspect the API at runtime instead of relying on out-of-band ` +
        `documentation. FHIR's \`CapabilityStatement\` and MCP's \`/.well-known/ai-plugin.json\` ` +
        `are domain-specific instances of this pattern. (Informational — no action required.)`,
      rationale:
        'Round-2 Phase F (cross-domain mining) identified capability-discovery as an emerging ' +
        'cross-industry convention (FHIR, MCP, Postman/RapidAPI discoverability metadata). ' +
        'Detecting it as a positive marker (`info` severity) lets apiq surface API maturity ' +
        'without false-flagging absence as a defect.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: capabilityPaths.slice(0, 50).map((p) => ({ path: p, method: 'get' })),
      patchOps: [],
      patchSummary: '(Positive marker — no patch.)',
      meta: {
        positiveMarker: true,
        count: capabilityPaths.length,
        endpoints: capabilityPaths.slice(0, 10),
        patternId: 'L10-4',
        priority: 'P3',
        infoTier: true,
      },
    });
  }

  // ---- L10-5 / L10-6 — info.contact + info.license substantive -----------
  const infoMeta = inspectInfoBlock(spec);

  if (infoMeta.contactSubstantive) {
    findings.push({
      detectorId: 'walker:operational-metadata:l10-5-info-contact-substantive',
      layer: 'walker-statistical',
      title: 'Substantive `info.contact` present',
      narration:
        `\`info.contact\` declares a substantive value (${infoMeta.contactDetail ?? '(detail elided)'}) ` +
        `that is not a placeholder. FAIR principles + Postman/RapidAPI discoverability metadata ` +
        `treat substantive contact info as a Lens-10 positive marker — clients building ` +
        `integrations can reach maintainers, AI-agents can surface support routes to end-users. ` +
        `(Informational — no action required.)`,
      rationale:
        'FAIR (Findable / Accessible / Interoperable / Reusable) principles applied to APIs ' +
        'treat contact metadata as Lens-10 discoverability signal. Round-2 Phase F mining ' +
        '(F-8) calls for substance-checks on stub-rejection.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: '(Positive marker — no patch.)',
      meta: {
        positiveMarker: true,
        contactDetail: infoMeta.contactDetail,
        patternId: 'L10-5',
        priority: 'P3',
        infoTier: true,
      },
    });
  }

  if (infoMeta.licenseSubstantive) {
    findings.push({
      detectorId: 'walker:operational-metadata:l10-6-info-license-substantive',
      layer: 'walker-statistical',
      title: 'Substantive `info.license` present',
      narration:
        `\`info.license\` declares a substantive value (${infoMeta.licenseDetail ?? '(detail elided)'}) ` +
        `with both a name and an identifier/URL. FAIR principles + Postman/RapidAPI treat ` +
        `substantive license metadata as a Lens-10 positive marker — clients evaluating reuse ` +
        `(open-source / commercial / restricted) can decide before integrating. (Informational ` +
        `— no action required.)`,
      rationale:
        'FAIR Reusability principles call for explicit license declarations on data and APIs. ' +
        'Round-2 Phase F mining (F-8) calls for substance-checks on stub-rejection.',
      category: 'design',
      severity: 'low',
      scope: 'spec',
      affectedEndpoints: [],
      patchOps: [],
      patchSummary: '(Positive marker — no patch.)',
      meta: {
        positiveMarker: true,
        licenseDetail: infoMeta.licenseDetail,
        patternId: 'L10-6',
        priority: 'P3',
        infoTier: true,
      },
    });
  }

  // (Bonus telemetry) — if the spec declares SLA4OAI / x-sla / x-quota
  // extensions, record the presence on the L10-4 marker meta. Surfacing it as
  // a separate finding is deferred to a follow-up walker; for now we'd rather
  // keep the 7-pattern target tight.
  const slaExts = findSlaExtensions(spec);
  if (slaExts.length > 0 && findings.length > 0) {
    // Attach as meta on the first finding (informational telemetry only).
    const first = findings[0];
    if (first && first.meta) {
      first.meta = { ...first.meta, slaExtensionsPresent: slaExts };
    }
  }

  return findings;
}
