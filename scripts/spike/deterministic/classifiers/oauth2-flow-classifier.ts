/**
 * OAuth2-Flow-Classifier Module — Stage A, Welle B T12 (Classifier per
 * Plan-Doc §13). Renamed + relocated from `modules/oauth2-flow-validator.ts`
 * during T12 classifier-promotion. Output-shape DetectorFinding[] mirrors
 * `json-schema-draft-detector.ts` (also in classifiers/) — Stage-1 spec-axis
 * checks that produce direct findings rather than gating other detectors.
 *
 * Sources: RFC 9700 BCP-240 (2025-Jan, OAuth 2.0 Security Best Current Practice)
 *          + RFC 6749 (OAuth 2.0 Authorization Framework, §3.1 verbatim TLS)
 *          + RFC 8725 (JWT Best Current Practices)
 *          + RFC 7636 (PKCE) — recommended for authorizationCode
 *          + APIMatic / Stoplight OpenIdConnect-validation guidance
 * Patterns: ~8 OAuth2-class checks (Y-5/Y-7 + RFC2-58..65 + TM-A6/A7);
 *           BCP-240 forbids implicit + password flows (verbatim "MUST NOT")
 * Lens: 1 (Threat-Modeling), 2 (Standards-Compliance), 3 (Evolution-Friction)
 * Round: 2 (Welle B / T12)
 *
 * Maps to rules-brainstorm.md: Y-5 (OAuth2 tokenUrl HTTPS, P1), Y-7 (implicit/
 * password forbidden BCP-240, P1, severity-upgrade Round-2), TM-A6 (OpenIdConnect
 * URL HTTPS), TM-A7 (authCode + PKCE), RFC2-58 (JWT bearerFormat), RFC2-60-65
 * (BCP-240 + scope-descriptions + clientCredentials).
 *
 * Spec-agnostic - works on any OpenAPI 3.x spec. No vendor knowledge.
 *
 * Patterns covered (per
 *   `specs/big-spec-architecture-spike-stage-a-implementation-priority.md` T12,
 *   `specs/big-spec-architecture-spike-stage-a-mining-round2-threat.md` TM-A6/A7,
 *   `specs/big-spec-architecture-spike-stage-a-mining-round2-standards.md`
 *     RFC2-58..65):
 *
 *   Y-5  / RFC2-62  OAuth2 *Url MUST be HTTPS         (RFC 6749 sec3.1, MUST)  -> error
 *   Y-7  / RFC2-60  implicit flow declarations         (RFC 9700 sec2.1.2 MUST NOT) -> error
 *   Y-7  / RFC2-61  password flow declarations         (RFC 9700 sec2.1.2 MUST NOT) -> error
 *   Y-6  / RFC2-63  authorizationCode SHOULD declare
 *                   refreshUrl (token-rotation)        (RFC 9700 sec4.1.5 RECOMMENDED) -> hint
 *   TM-A7/ RFC2-64  authorizationCode SHOULD declare
 *                   PKCE in description / extension    (RFC 9700 sec2.1)        -> warn
 *   RFC2-65         scopes MUST have non-empty
 *                   human-readable descriptions        (RFC 6749 sec3.3 + OAS-3) -> warn
 *   TM-A6           openIdConnectUrl MUST be HTTPS    (mirror of Y-5/RFC 6749) -> error
 *   Y-8  / RFC2-58  bearerFormat:JWT description SHOULD
 *                   mention RFC 8725 / "alg" / "none"  (RFC 8725 sec3.1/sec3.2) -> warn
 *
 * Detection-feasibility: pure mech (single-pass over
 * `spec.components.securitySchemes`). Cycle-safe. No HTTP / runtime probing.
 *
 * Public API:
 *   `runOAuth2FlowClassifier(spec, opts) => Promise<DetectorFinding[]>`
 *   `validateOAuth2Schemes(spec) => Array<RawIssue>`  (exported for tests)
 *
 * CLI:
 *   `npx tsx deterministic/classifiers/oauth2-flow-classifier.ts <spec-name>`
 */

import type { DetectorFinding, DetectorOptions } from "../infra/types.js";
import type { Severity, Lens } from "../infra/severity-schema.js";

// =============================================================================
// Pattern-IDs (stable across rule-metadata + finding telemetry)
// =============================================================================

export const OAUTH2_PATTERN_IDS = {
  IMPLICIT_FORBIDDEN: "oauth2-implicit-forbidden",
  PASSWORD_FORBIDDEN: "oauth2-password-forbidden",
  HTTPS_REQUIRED: "oauth2-url-https-required",
  REFRESH_URL_RECOMMENDED: "oauth2-refresh-url-recommended",
  PKCE_RECOMMENDED: "oauth2-pkce-recommended",
  SCOPE_DESCRIPTIONS_REQUIRED: "oauth2-scope-descriptions-required",
  OIDC_HTTPS_REQUIRED: "oauth2-oidc-url-https-required",
  JWT_RFC8725_MENTION: "oauth2-jwt-bearer-rfc8725-mention",
} as const;
export type OAuth2PatternId =
  (typeof OAUTH2_PATTERN_IDS)[keyof typeof OAUTH2_PATTERN_IDS];

// =============================================================================
// Raw issue type (pre-mapping). Exposed for tests.
// =============================================================================

export interface RawIssue {
  patternId: OAuth2PatternId;
  /** RFC 9700 BCP-240 / RFC 6749 / RFC 8725 verbatim severity. */
  severity: Severity;
  /** Lens-tags per the 10-lens framework. */
  lenses: Lens[];
  /** Pretty-name of the offending securityScheme. */
  schemeName: string;
  /** OAuth2 flow name; undefined for non-flow patterns. */
  flowName?: string;
  /** JSON-Pointer-style path into the spec. */
  sourcePath: string;
  /** Optional extra detail (e.g. the offending URL or scope-name). */
  detail?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Strict HTTPS check. We only accept https:// (case-insensitive scheme).
 * Per RFC 6749 sec3.1 the requirement is "MUST utilize TLS".
 */
function isHttpsUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0) return false;
  return /^https:\/\//i.test(trimmed);
}

/**
 * Heuristic: does the description-text indicate PKCE-awareness?
 * Looks for the literal "PKCE", code_challenge, S256, or RFC 9700 in description.
 * Also accepts the convention `x-usePkce: true` extension on the flow object.
 */
function mentionsPkce(flow: Record<string, unknown>): boolean {
  const ext = flow["x-usePkce"];
  if (ext === true) return true;
  const desc = flow.description;
  if (typeof desc === "string" && desc.length > 0) {
    if (/\bPKCE\b/i.test(desc)) return true;
    if (/\bcode_challenge\b/i.test(desc)) return true;
    if (/\bS256\b/.test(desc)) return true;
    if (/RFC\s*9700/i.test(desc)) return true;
  }
  return false;
}

/**
 * Heuristic: does the bearer-scheme description-text indicate RFC 8725 / JWT-BCP
 * awareness? Looks for the literal "RFC 8725", "JWT BCP", or "alg" co-occurring
 * with "none" (the canonical JWT-alg-confusion mitigation).
 */
function mentionsRfc8725(description: unknown): boolean {
  if (typeof description !== "string" || description.length === 0) return false;
  if (/RFC\s*8725/i.test(description)) return true;
  if (/JWT\s*BCP/i.test(description)) return true;
  if (/\balg\b/i.test(description) && /\bnone\b/i.test(description)) return true;
  return false;
}

/** Escape `~` and `/` in JSON-Pointer path segments per RFC 6901. */
function jsonPointerEscape(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

// =============================================================================
// Core validation - produces RawIssue[]
// =============================================================================

const FLOW_NAMES = ["implicit", "password", "clientCredentials", "authorizationCode"] as const;

/**
 * Walk spec.components.securitySchemes and emit RawIssue for every
 * RFC 9700 / RFC 6749 / RFC 8725 violation discovered.
 *
 * Pure / synchronous / no I/O. Returns [] when the spec has no securitySchemes
 * - handles dnd5eapi-style "no auth declared" gracefully.
 */
export function validateOAuth2Schemes(spec: object): RawIssue[] {
  const issues: RawIssue[] = [];
  const root = spec as Record<string, unknown>;
  const components = root.components as Record<string, unknown> | undefined;
  if (!components || typeof components !== "object") return issues;
  const schemes = components.securitySchemes as Record<string, unknown> | undefined;
  if (!schemes || typeof schemes !== "object") return issues;

  for (const [schemeName, rawScheme] of Object.entries(schemes)) {
    if (!rawScheme || typeof rawScheme !== "object" || Array.isArray(rawScheme)) continue;
    const scheme = rawScheme as Record<string, unknown>;
    const type = typeof scheme.type === "string" ? scheme.type : "";

    const baseSchemePath = `/components/securitySchemes/${jsonPointerEscape(schemeName)}`;

    // -------- TM-A6: openIdConnect openIdConnectUrl HTTPS-only --------
    if (type === "openIdConnect") {
      const oidcUrl = scheme.openIdConnectUrl;
      if (!isHttpsUrl(oidcUrl)) {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.OIDC_HTTPS_REQUIRED,
          severity: "error",
          lenses: ["threat-modeling", "standards-compliance"],
          schemeName,
          sourcePath: `${baseSchemePath}/openIdConnectUrl`,
          detail:
            typeof oidcUrl === "string" && oidcUrl.trim().length > 0
              ? oidcUrl
              : "(missing or empty)",
        });
      }
    }

    // -------- RFC2-58 / Y-8: bearerFormat:JWT description SHOULD mention RFC 8725 --------
    if (type === "http") {
      const httpScheme = typeof scheme.scheme === "string" ? scheme.scheme.toLowerCase() : "";
      const bearerFormat = scheme.bearerFormat;
      if (
        httpScheme === "bearer" &&
        typeof bearerFormat === "string" &&
        /^jwt$/i.test(bearerFormat) &&
        !mentionsRfc8725(scheme.description)
      ) {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.JWT_RFC8725_MENTION,
          severity: "warn",
          lenses: ["threat-modeling", "standards-compliance"],
          schemeName,
          sourcePath: `${baseSchemePath}/description`,
        });
      }
    }

    // -------- OAuth2-specific patterns --------
    if (type !== "oauth2") continue;
    const flows = scheme.flows as Record<string, unknown> | undefined;
    if (!flows || typeof flows !== "object") continue;

    for (const flowName of FLOW_NAMES) {
      const rawFlow = flows[flowName];
      if (!rawFlow || typeof rawFlow !== "object" || Array.isArray(rawFlow)) continue;
      const flow = rawFlow as Record<string, unknown>;
      const flowPath = `${baseSchemePath}/flows/${flowName}`;

      // RFC2-60 / Y-7: implicit forbidden by RFC 9700 BCP-240.
      if (flowName === "implicit") {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.IMPLICIT_FORBIDDEN,
          severity: "error",
          lenses: ["threat-modeling", "standards-compliance", "evolution-friction"],
          schemeName,
          flowName,
          sourcePath: flowPath,
        });
      }

      // RFC2-61 / Y-7: password (resource-owner-password-credentials) forbidden.
      if (flowName === "password") {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.PASSWORD_FORBIDDEN,
          severity: "error",
          lenses: ["threat-modeling", "standards-compliance", "evolution-friction"],
          schemeName,
          flowName,
          sourcePath: flowPath,
        });
      }

      // RFC2-62 / Y-5: authorizationUrl / tokenUrl / refreshUrl MUST be HTTPS.
      const urlFields = ["authorizationUrl", "tokenUrl", "refreshUrl"] as const;
      for (const urlField of urlFields) {
        if (!(urlField in flow)) continue;
        const urlValue = flow[urlField];
        if (!isHttpsUrl(urlValue)) {
          issues.push({
            patternId: OAUTH2_PATTERN_IDS.HTTPS_REQUIRED,
            severity: "error",
            lenses: ["threat-modeling", "standards-compliance"],
            schemeName,
            flowName,
            sourcePath: `${flowPath}/${urlField}`,
            detail:
              typeof urlValue === "string" && urlValue.trim().length > 0
                ? `${urlField}=${urlValue}`
                : `${urlField} (missing or empty)`,
          });
        }
      }

      // RFC2-64 / TM-A7: authorizationCode SHOULD declare PKCE.
      if (flowName === "authorizationCode" && !mentionsPkce(flow)) {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED,
          severity: "warn",
          lenses: ["threat-modeling", "standards-compliance"],
          schemeName,
          flowName,
          sourcePath: flowPath,
        });
      }

      // RFC2-63 / Y-6: authorizationCode SHOULD declare a refreshUrl.
      if (flowName === "authorizationCode" && !("refreshUrl" in flow)) {
        issues.push({
          patternId: OAUTH2_PATTERN_IDS.REFRESH_URL_RECOMMENDED,
          severity: "hint",
          lenses: ["threat-modeling", "evolution-friction"],
          schemeName,
          flowName,
          sourcePath: flowPath,
        });
      }

      // RFC2-65: every scope MUST have a non-empty human-readable description.
      const scopes = flow.scopes;
      if (scopes && typeof scopes === "object" && !Array.isArray(scopes)) {
        for (const [scopeName, scopeDesc] of Object.entries(
          scopes as Record<string, unknown>,
        )) {
          if (typeof scopeDesc !== "string" || scopeDesc.trim().length === 0) {
            issues.push({
              patternId: OAUTH2_PATTERN_IDS.SCOPE_DESCRIPTIONS_REQUIRED,
              severity: "warn",
              lenses: ["standards-compliance", "client-friction"],
              schemeName,
              flowName,
              sourcePath: `${flowPath}/scopes/${jsonPointerEscape(scopeName)}`,
              detail: scopeName,
            });
          }
        }
      }
    }
  }

  // Stable order - by sourcePath so test assertions are reproducible.
  issues.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  return issues;
}

// =============================================================================
// Finding-builders - RawIssue -> DetectorFinding
// =============================================================================

interface FindingTemplate {
  title: (i: RawIssue) => string;
  narration: (i: RawIssue) => string;
  rationale: string;
  category: "clarity" | "design" | "risk" | "correctness";
  /** LLM-Finding severity scale (separate from rule-tagging severity). */
  llmSeverity: "critical" | "high" | "medium" | "low";
  patchSummary: (i: RawIssue) => string;
}

const TPL_IMPLICIT: FindingTemplate = {
  title: (i) =>
    "OAuth2 implicit flow declared on " + i.schemeName +
    " is forbidden by RFC 9700 (BCP 240, 2025)",
  narration: (i) =>
    "The security-scheme " + i.schemeName + " declares the OAuth2 implicit flow. " +
    "RFC 9700 (BCP 240, 2025) - the OAuth 2.0 Security Best Current Practice - says " +
    "verbatim: Clients MUST NOT use the OAuth Implicit grant (sec2.1.2). The implicit " +
    "flow exposes access-tokens via the URL fragment, where they leak to browser " +
    "history, referrer headers, and HTTP server logs. It also has no token-substitution " +
    "protection, leaving it open to token-injection attacks. Replace with " +
    "authorizationCode plus PKCE.",
  rationale:
    "RFC 9700 sec2.1.2 (BCP 240, 2025) explicitly forbids the OAuth2 implicit grant; " +
    "this is one of the highest-severity OAuth misconfigurations because the access-token " +
    "leakage paths are passive (logs, history, referrer) rather than active.",
  category: "risk",
  llmSeverity: "high",
  patchSummary: (i) =>
    "Remove implicit flow from " + i.schemeName + " and migrate to authorizationCode + PKCE.",
};

const TPL_PASSWORD: FindingTemplate = {
  title: (i) =>
    "OAuth2 password (ROPC) flow declared on " + i.schemeName +
    " is forbidden by RFC 9700",
  narration: (i) =>
    "The security-scheme " + i.schemeName + " declares the OAuth2 password flow " +
    "(Resource Owner Password Credentials grant). RFC 9700 (BCP 240, 2025) sec2.1.2 " +
    "says verbatim: Clients MUST NOT use the resource-owner-password-credentials grant. " +
    "This grant requires the client to handle the user password directly, defeating the " +
    "entire delegation premise of OAuth2 and making MFA / federated login impossible. " +
    "Replace with authorizationCode plus PKCE.",
  rationale:
    "RFC 9700 sec2.1.2 (BCP 240, 2025) explicitly forbids the Resource-Owner-Password-" +
    "Credentials grant; this is a fundamental OAuth-2.0 anti-pattern that survives in " +
    "specs as a legacy of RFC 6749 (2012).",
  category: "risk",
  llmSeverity: "high",
  patchSummary: (i) =>
    "Remove password flow from " + i.schemeName + " and migrate to authorizationCode + PKCE.",
};

const TPL_HTTPS: FindingTemplate = {
  title: (i) =>
    "OAuth2 " + (i.flowName ?? "") + " URL on " + i.schemeName +
    " is not HTTPS (RFC 6749 sec3.1 MUST)",
  narration: (i) =>
    "The OAuth2 " + (i.flowName ?? "") + " flow under " + i.schemeName +
    " declares " + (i.detail ?? "a URL") + " that is not HTTPS. " +
    "RFC 6749 sec3.1 says verbatim: The authorization server MUST utilize TLS - both " +
    "the authorization endpoint and the token endpoint require it. RFC 9700 (2025) " +
    "tightens the language. Allowing HTTP exposes the entire flow to passive " +
    "eavesdropping plus active token-injection MITM attacks.",
  rationale:
    "RFC 6749 sec3.1 (verbatim MUST utilize TLS) requires HTTPS for OAuth2 " +
    "authorization-server endpoints. Plaintext OAuth flows leak tokens trivially.",
  category: "risk",
  llmSeverity: "critical",
  patchSummary: (i) =>
    "Replace the non-HTTPS URL on " + i.schemeName + ".flows." + (i.flowName ?? "") +
    " with an https:// value.",
};

const TPL_REFRESH: FindingTemplate = {
  title: (i) =>
    "OAuth2 authorizationCode flow on " + i.schemeName +
    " lacks refreshUrl (token-rotation hint)",
  narration: (i) =>
    "The authorizationCode flow under " + i.schemeName + " does not declare a " +
    "refreshUrl. RFC 9700 sec4.1.5 RECOMMENDS that authorization-code flows support " +
    "refresh-token rotation so access-tokens can be short-lived without forcing the " +
    "user to re-authenticate. Without refreshUrl in the spec, SDK consumers cannot " +
    "reliably implement rotation and tend to hold long-lived access-tokens instead.",
  rationale:
    "RFC 9700 sec4.1.5 RECOMMENDS refresh-token rotation; declaring refreshUrl in " +
    "the OpenAPI spec lets SDK codegen and human consumers implement it correctly.",
  category: "design",
  llmSeverity: "low",
  patchSummary: (i) =>
    "Add a refreshUrl to " + i.schemeName + ".flows.authorizationCode documenting the refresh-token endpoint.",
};

const TPL_PKCE: FindingTemplate = {
  title: (i) =>
    "OAuth2 authorizationCode flow on " + i.schemeName +
    " does not document PKCE (RFC 9700 SHOULD)",
  narration: (i) =>
    "The authorizationCode flow under " + i.schemeName + " has no description-mention " +
    "of PKCE (code_challenge / S256) and no x-usePkce: true extension. " +
    "RFC 9700 (BCP 240, 2025) sec2.1 mandates PKCE for all OAuth-2.1 authorization-code " +
    "flows - public clients MUST and confidential clients SHOULD. Document the PKCE " +
    "requirement in the flow description or via the x-usePkce extension so SDK " +
    "consumers know to send a code_challenge.",
  rationale:
    "RFC 9700 (2025) sec2.1 raises PKCE from should to a mandate for the authorization-" +
    "code flow; specs that do not document the requirement leave consumers vulnerable " +
    "to authorization-code-injection attacks.",
  category: "risk",
  llmSeverity: "medium",
  patchSummary: (i) =>
    "Document PKCE on " + i.schemeName + ".flows.authorizationCode (description should mention PKCE / S256 / code_challenge).",
};

const TPL_SCOPE: FindingTemplate = {
  title: (i) =>
    "OAuth2 scope " + (i.detail ?? "") + " on " + i.schemeName +
    " lacks human-readable description",
  narration: (i) =>
    "The OAuth2 scope " + (i.detail ?? "") + " under " + i.schemeName + ".flows." +
    (i.flowName ?? "") + " has no description (or an empty one). RFC 6749 sec3.3 " +
    "expects scope-strings to be human-meaningful, and the OpenAPI 3.x schema " +
    "requires flows.<flow>.scopes to map each scope-name to a description-string. " +
    "Without descriptions, consent-screen generators, SDK docs, and security-review " +
    "tools cannot show users what permission they are granting.",
  rationale:
    "RFC 6749 sec3.3 plus OAS-3 flows.scopes schema both require human-readable " +
    "descriptions for OAuth2 scopes; missing descriptions break consent-screen UX " +
    "and security review.",
  category: "clarity",
  llmSeverity: "medium",
  patchSummary: (i) =>
    "Add a non-empty human-readable description for scope " + (i.detail ?? "") +
    " on " + i.schemeName + ".",
};

const TPL_OIDC_HTTPS: FindingTemplate = {
  title: (i) =>
    "OpenIdConnect openIdConnectUrl on " + i.schemeName + " is not HTTPS",
  narration: (i) =>
    "The OpenIdConnect security-scheme " + i.schemeName + " declares openIdConnectUrl " +
    "= " + (i.detail ?? "(missing)") + ", which is not HTTPS. " +
    "OpenID Connect Discovery and the underlying OAuth2 framework (RFC 6749 sec3.1, " +
    "verbatim MUST utilize TLS) require TLS for all OIDC discovery + authorization " +
    "endpoints. Allowing HTTP exposes the discovery document - and via it the entire " +
    "OAuth flow - to MITM and substitution attacks.",
  rationale:
    "OpenID Connect Discovery + RFC 6749 sec3.1 require TLS for OIDC discovery + " +
    "authorization endpoints; non-HTTPS openIdConnectUrl defeats the entire trust " +
    "model of the discovery document.",
  category: "risk",
  llmSeverity: "critical",
  patchSummary: (i) =>
    "Change " + i.schemeName + ".openIdConnectUrl to an https:// URL.",
};

const TPL_JWT_RFC8725: FindingTemplate = {
  title: (i) =>
    "Bearer scheme " + i.schemeName + " declares bearerFormat:JWT but description " +
    "does not mention RFC 8725 (JWT BCP)",
  narration: (i) =>
    "The HTTP Bearer scheme " + i.schemeName + " declares bearerFormat: JWT but its " +
    "description does not mention RFC 8725 (JWT Best Current Practices), the alg " +
    "header policy, or alg none rejection. RFC 8725 sec3.1 says implementations MUST " +
    "validate the algorithm used for each token, and sec3.2 says tokens with alg: none " +
    "must be rejected - the canonical JWT-alg-confusion mitigation. Documenting the " +
    "algorithm policy in the spec lets consumers verify their JWT library is correctly " +
    "configured.",
  rationale:
    "RFC 8725 (JWT BCP, 2020) sec3.1/sec3.2 mandates explicit alg validation + " +
    "alg:none rejection; specs that declare bearerFormat: JWT without documenting the " +
    "policy leave consumers vulnerable to JWT-alg-confusion attacks.",
  category: "risk",
  llmSeverity: "medium",
  patchSummary: (i) =>
    "Mention RFC 8725 / the algorithm policy / alg: none rejection in the description " +
    "of " + i.schemeName + ".",
};

const TEMPLATES: Record<OAuth2PatternId, FindingTemplate> = {
  [OAUTH2_PATTERN_IDS.IMPLICIT_FORBIDDEN]: TPL_IMPLICIT,
  [OAUTH2_PATTERN_IDS.PASSWORD_FORBIDDEN]: TPL_PASSWORD,
  [OAUTH2_PATTERN_IDS.HTTPS_REQUIRED]: TPL_HTTPS,
  [OAUTH2_PATTERN_IDS.REFRESH_URL_RECOMMENDED]: TPL_REFRESH,
  [OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED]: TPL_PKCE,
  [OAUTH2_PATTERN_IDS.SCOPE_DESCRIPTIONS_REQUIRED]: TPL_SCOPE,
  [OAUTH2_PATTERN_IDS.OIDC_HTTPS_REQUIRED]: TPL_OIDC_HTTPS,
  [OAUTH2_PATTERN_IDS.JWT_RFC8725_MENTION]: TPL_JWT_RFC8725,
};

/** LLM-Finding severity (DetectorFinding.severity scale). */
function llmSeverityFor(patternId: OAuth2PatternId): "critical" | "high" | "medium" | "low" {
  return TEMPLATES[patternId].llmSeverity;
}

function buildFinding(issue: RawIssue): DetectorFinding {
  const t = TEMPLATES[issue.patternId];
  const detailSuffix = issue.detail ? ":" + issue.detail : "";
  const flowSuffix = issue.flowName ? ":" + issue.flowName : "";
  return {
    detectorId:
      "oauth2-flow-validator:" + issue.patternId + ":" + issue.schemeName +
      flowSuffix + detailSuffix,
    layer: "walker-statistical",
    title: t.title(issue),
    narration: t.narration(issue),
    rationale: t.rationale,
    category: t.category,
    severity: llmSeverityFor(issue.patternId),
    scope: "spec",
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: t.patchSummary(issue),
    sourcePath: issue.sourcePath,
    meta: {
      patternId: issue.patternId,
      ruleSeverity: issue.severity,
      lenses: issue.lenses,
      schemeName: issue.schemeName,
      ...(issue.flowName ? { flowName: issue.flowName } : {}),
      ...(issue.detail ? { detail: issue.detail } : {}),
    },
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Run the OAuth2-flow validator. Returns DetectorFindings ready for the
 * canonical output-mapper.
 *
 * Handles all four reference specs gracefully:
 *   - openweathermap: apiKey-only       -> 0 findings
 *   - stripe-full:    basic + bearer    -> 0 oauth2 findings
 *   - pagerduty-full: apiKey-only       -> 0 findings
 *   - dnd5eapi / github-rest: no securitySchemes -> 0 findings
 */
export async function runOAuth2FlowClassifier(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const issues = validateOAuth2Schemes(spec);
  return issues.map(buildFinding);
}

// =============================================================================
// CLI
// =============================================================================

async function main(): Promise<void> {
  const path = await import("node:path");
  const fs = await import("node:fs");
  const { fileURLToPath } = await import("node:url");

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const SPIKE_DIR = path.resolve(__dirname, "..");
  const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
  const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

  const specName = process.argv[2];
  if (!specName) {
    console.error("Usage: tsx deterministic/classifiers/oauth2-flow-classifier.ts <spec-name>");
    console.error("  e.g. tsx deterministic/classifiers/oauth2-flow-classifier.ts stripe-full");
    process.exit(1);
  }

  const specDir = path.join(EXAMPLES_DIR, specName);
  if (!fs.existsSync(specDir)) {
    console.error("Spec directory not found: " + specDir);
    process.exit(1);
  }

  let specPath: string | null = null;
  for (const ext of ["json", "yaml", "yml"]) {
    const candidate = path.join(specDir, "spec." + ext);
    if (fs.existsSync(candidate)) {
      specPath = candidate;
      break;
    }
  }
  if (!specPath) {
    console.error("No spec.{json,yaml,yml} found in " + specDir);
    process.exit(1);
  }

  const raw = fs.readFileSync(specPath, "utf8");
  let spec: object;
  if (specPath.endsWith(".json")) {
    spec = JSON.parse(raw);
  } else {
    const YAML = (await import("yaml")).default;
    spec = YAML.parse(raw) as object;
  }

  console.log("Loaded spec: " + specPath);
  const startedAt = Date.now();
  const findings = await runOAuth2FlowClassifier(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(
    "Ran in " + durationMs + "ms - emitted " + findings.length + " OAuth2-flow finding(s).",
  );
  console.log("");
  if (findings.length === 0) {
    console.log("(No OAuth2-flow findings - spec may have no securitySchemes, or only apiKey/Bearer.)");
    return;
  }
  for (const f of findings) {
    console.log("[" + f.detectorId + "]");
    console.log("  title: " + f.title);
    if (f.meta) {
      console.log("  meta:  " + JSON.stringify(f.meta));
    }
    console.log("");
  }
}

{
  const { pathToFileURL } = await import("node:url");
  if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}

