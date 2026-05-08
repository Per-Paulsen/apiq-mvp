/**
 * Secret-Scanner Module — Stage A, Welle A T8 (Module-Class).
 *
 * Sources: TruffleHog (https://github.com/trufflesecurity/trufflehog)
 *          + Gitleaks (https://github.com/gitleaks/gitleaks)
 *          + OWASP API3:2023 (Broken Object Property Level Authorization)
 *          + Cloudflare PII-detection guidance
 *            (https://developers.cloudflare.com/api-shield/security/sensitive-data-detection/)
 *          + RFC 7515/7519 (JWT) + RSA/SSH/PGP key-format specs
 * Patterns: 35 SECRET-class regexes (Stripe sk_live, AWS AKIA, GitHub PATs,
 *           Google AIza, Slack xox*, OpenAI sk-, Anthropic, GitLab, RSA/SSH/PGP)
 *           + 4 PII-class (SSN, CC-Luhn, passport, bare-email) +
 *           Shannon-entropy heuristic (40+ char base64-ish strings)
 * Lens: 1 (Threat-Modeling), 6 (Privacy/Data-Class)
 * Round: 2 (Welle A)
 *
 * Maps to rules-brainstorm.md: TM-A11 (privilege-escalation field-names),
 * TM-A15 (PII-named fields response, Lens-6 cornerstone), TM-A42 (error-schema
 * stack-trace), L6-1/L6-3/L6-4 (PII parameters/path-binding/financial-account-id).
 *
 * Walks an OpenAPI spec and applies a curated catalog of TruffleHog +
 * Gitleaks regex-patterns against every value-bearing site where authors
 * historically leak real secrets and PII as illustrations:
 *
 *   - default values on schemas / parameters
 *   - example (singular) on schemas / parameters / media-types
 *   - examples-map (OAS 3.x examples object map) on parameters /
 *     request-bodies / responses / media-types
 *   - description prose anywhere it lives in the spec — secrets get
 *     pasted into descriptive narratives ("e.g. AKIA…")
 *
 * What it detects:
 *   1. Confirmed-format secrets: Stripe sk_live_*, AWS access keys
 *      (AKIA…/ASIA…), GitHub PATs (ghp_X / gho_X / ghs_X / ghu_X),
 *      Google API keys (AIza*), Slack bot tokens (xox[abprs]-*),
 *      OpenAI / Anthropic API keys, GitLab PATs, RSA/SSH/PGP private keys
 *      embedded in description-prose. → severity error.
 *   2. PII patterns: SSN, credit-card (Luhn-checked), passport-number,
 *      bare email-addresses unmasked. → severity warn.
 *   3. Generic high-entropy heuristic: ≥40-char Base64-ish strings in
 *      unexpected places. → warn.
 *
 * What it deliberately does NOT do:
 *   - No vendor-specific knowledge of which paths or fields are secret-
 *     bearing — purely regex-catalog application against value-sites.
 *   - No live verification (TruffleHogs verifier stage is out of scope —
 *     we would need network calls; spec-time-only).
 *   - Not the full 950+ catalog — we ship the ~50 most load-bearing
 *     patterns by real-world hit-rate. The catalog is documented inline so
 *     extending it is an additive change.
 *
 * Pattern catalog provenance (snapshot 2026-05-06):
 *   - TruffleHog regex catalog: https://github.com/trufflesecurity/trufflehog
 *   - Gitleaks rules: https://github.com/gitleaks/gitleaks/blob/master/config/gitleaks.toml
 *   - PII patterns: standard CC / SSN / passport regexes (publicly-established).
 *
 * To extend the catalog:
 *   - Add a SecretPattern to SECRET_PATTERNS (confirmed secrets) or
 *     PII_PATTERNS (PII shapes).
 *   - Confirmed secrets must have a tight regex with a low false-positive
 *     rate; the entire match is reported back. Use word-boundaries where possible.
 *   - PII patterns should pass the Luhn-or-similar validity-check where
 *     applicable (CC, SSN-area-validation).
 *
 * Public API:
 *   runSecretScanner(spec, opts) => Promise<DetectorFinding[]>
 *   scanString(text, location) => SecretMatch[] (exported for tests)
 *   SECRET_PATTERNS, PII_PATTERNS (exported for tests / extension)
 *
 * CLI:
 *   npx tsx deterministic/secret-scanner.ts <spec-name>
 */

import type { DetectorFinding, DetectorOptions } from "./types.js";
import {
  type RuleMetadata,
  validateMetadata,
} from "./severity-schema.js";

// =============================================================================
// 1. Pattern catalog
// =============================================================================

/**
 * One entry in the secret/PII catalog.
 *
 * regex is matched against value-strings; the validate callback (when set)
 * gates the match — used for Luhn-checked CC numbers, SSN area-code
 * validity, etc., to keep false-positive rate low.
 */
export interface SecretPattern {
  /** Stable detector-id suffix; final id is "secret-scanner:<id>". */
  id: string;
  /** Human-readable name for finding-titles. */
  name: string;
  /** Lens 1 = threat-modeling (confirmed secret). Lens 6 = privacy. */
  lens: "threat-modeling" | "privacy-data-class";
  /** Severity tier (rule-tagging layer, error/warn/hint/info). */
  severity: "error" | "warn" | "hint";
  /** Regex applied to value-strings. Use g flag for multi-match per value. */
  regex: RegExp;
  /** Optional validator — runs against the full match, returns true to keep. */
  validate?: (match: string) => boolean;
  /** Where this pattern was sourced. */
  source: "trufflehog" | "gitleaks" | "standard-pii";
  /** Free-form description for the finding-narration. */
  description: string;
}

/**
 * Confirmed-secret patterns (TruffleHog + Gitleaks). All error severity —
 * a real-world API key in an OpenAPI example is reputation-load-bearing.
 *
 * Pattern selection: we pick the ~30 most-cited patterns by hit-rate from
 * TruffleHog/Gitleaks issue-trackers. Long-tail (Mailgun, Twilio, etc.)
 * is added on demand via this same file.
 */
export const SECRET_PATTERNS: SecretPattern[] = [
  // -------- Stripe --------
  {
    id: "stripe-live-secret-key",
    name: "Stripe live secret key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bsk_live_[0-9a-zA-Z]{24,99}\b/g,
    source: "gitleaks",
    description:
      "Stripe secret key in sk_live_ format leaked in a spec value. " +
      "These are production-grade credentials; rotate immediately.",
  },
  {
    id: "stripe-restricted-key",
    name: "Stripe restricted live key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\brk_live_[0-9a-zA-Z]{24,99}\b/g,
    source: "gitleaks",
    description: "Stripe restricted live key (rk_live_…) — production credential.",
  },
  {
    id: "stripe-publishable-live-key",
    name: "Stripe publishable live key",
    lens: "threat-modeling",
    severity: "warn",
    regex: /\bpk_live_[0-9a-zA-Z]{24,99}\b/g,
    source: "gitleaks",
    description:
      "Stripe publishable live key (pk_live_…). Publishable keys are " +
      "designed for client-side embedding and are technically lower-risk, " +
      "but leakage in a spec still indicates secrets-discipline gaps.",
  },

  // -------- AWS --------
  {
    id: "aws-access-key-id",
    name: "AWS Access Key ID",
    lens: "threat-modeling",
    severity: "error",
    regex: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASCA)[0-9A-Z]{16}\b/g,
    source: "trufflehog",
    description:
      "AWS Access Key ID (AKIA*/ASIA*/etc.). When paired with the secret " +
      "access key it grants programmatic AWS access — high-impact leak.",
  },
  {
    id: "aws-secret-access-key",
    name: "AWS Secret Access Key (likely)",
    lens: "threat-modeling",
    severity: "error",
    regex: /\b(?:aws[_-]?(?:secret|access)[_-]?key[\s:="]+)([A-Za-z0-9\/+=]{40})\b/gi,
    source: "trufflehog",
    description:
      "AWS Secret Access Key context-tagged (40-char base64 next to " +
      "aws_secret_… / aws_access_…). Rotate.",
  },

  // -------- GitHub --------
  {
    id: "github-pat",
    name: "GitHub Personal Access Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bghp_[0-9A-Za-z]{36,255}\b/g,
    source: "gitleaks",
    description: "GitHub Personal Access Token (ghp_…). High-impact leak.",
  },
  {
    id: "github-oauth",
    name: "GitHub OAuth Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bgho_[0-9A-Za-z]{36,255}\b/g,
    source: "gitleaks",
    description: "GitHub OAuth token (gho_…).",
  },
  {
    id: "github-app-server",
    name: "GitHub App Server-to-Server Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bghs_[0-9A-Za-z]{36,255}\b/g,
    source: "gitleaks",
    description: "GitHub App server-to-server token (ghs_…).",
  },
  {
    id: "github-user-server",
    name: "GitHub App User-to-Server Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bghu_[0-9A-Za-z]{36,255}\b/g,
    source: "gitleaks",
    description: "GitHub App user-to-server token (ghu_…).",
  },
  {
    id: "github-refresh",
    name: "GitHub Refresh Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bghr_[0-9A-Za-z]{36,255}\b/g,
    source: "gitleaks",
    description: "GitHub refresh token (ghr_…).",
  },

  // -------- GitLab --------
  {
    id: "gitlab-pat",
    name: "GitLab Personal Access Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bglpat-[0-9a-zA-Z_-]{20,40}\b/g,
    source: "gitleaks",
    description: "GitLab Personal Access Token (glpat-…).",
  },

  // -------- Google --------
  {
    id: "google-api-key",
    name: "Google API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    source: "gitleaks",
    description:
      "Google API Key (AIza… 39 chars). Used across Google Cloud APIs; " +
      "often quota-bound but can carry billing-relevant access.",
  },
  {
    id: "google-oauth",
    name: "Google OAuth Access Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bya29\.[0-9A-Za-z_-]{20,250}\b/g,
    source: "trufflehog",
    description: "Google OAuth access token (ya29.…).",
  },

  // -------- Slack --------
  {
    id: "slack-bot-token",
    name: "Slack Bot Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,40}\b/g,
    source: "gitleaks",
    description: "Slack bot token (xoxb-…).",
  },
  {
    id: "slack-user-token",
    name: "Slack User Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,40}\b/g,
    source: "gitleaks",
    description: "Slack user token (xoxp-…).",
  },
  {
    id: "slack-webhook",
    name: "Slack Incoming Webhook URL",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bhttps:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}\b/g,
    source: "gitleaks",
    description: "Slack incoming-webhook URL — anyone can post messages.",
  },

  // -------- AI providers --------
  {
    id: "openai-api-key",
    name: "OpenAI API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}\b/g,
    source: "trufflehog",
    description: "OpenAI API key (sk-…T3BlbkFJ…).",
  },
  {
    id: "anthropic-api-key",
    name: "Anthropic API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bsk-ant-[A-Za-z0-9_-]{40,}\b/g,
    source: "trufflehog",
    description: "Anthropic API key (sk-ant-…).",
  },

  // -------- Generic credentials --------
  {
    id: "jwt-token",
    name: "JSON Web Token (likely real)",
    lens: "threat-modeling",
    severity: "warn",
    // Header.payload.signature; common header eyJ for {"alg":… in base64.
    regex: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    source: "gitleaks",
    description:
      "JSON Web Token in a value-site. JWTs in examples are usually fine but " +
      "sometimes real session tokens get pasted. Decode and verify safely.",
  },
  {
    id: "private-key-rsa",
    name: "RSA Private Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]{20,}-----END (?:RSA )?PRIVATE KEY-----/g,
    source: "trufflehog",
    description: "RSA private-key block embedded in spec text.",
  },
  {
    id: "private-key-openssh",
    name: "OpenSSH Private Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /-----BEGIN OPENSSH PRIVATE KEY-----[\s\S]{20,}-----END OPENSSH PRIVATE KEY-----/g,
    source: "trufflehog",
    description: "OpenSSH private-key block embedded in spec text.",
  },
  {
    id: "private-key-pgp",
    name: "PGP Private Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]{20,}-----END PGP PRIVATE KEY BLOCK-----/g,
    source: "trufflehog",
    description: "PGP private-key block embedded in spec text.",
  },
  {
    id: "private-key-ec",
    name: "EC Private Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /-----BEGIN EC PRIVATE KEY-----[\s\S]{20,}-----END EC PRIVATE KEY-----/g,
    source: "trufflehog",
    description: "EC private-key block embedded in spec text.",
  },

  // -------- Cloud / SaaS --------
  {
    id: "azure-storage-connection",
    name: "Azure Storage Connection String",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bDefaultEndpointsProtocol=https?;AccountName=[a-z0-9]{3,24};AccountKey=[A-Za-z0-9+\/=]{60,100}\b/g,
    source: "gitleaks",
    description: "Azure Storage connection string (DefaultEndpointsProtocol=…).",
  },
  {
    id: "mailgun-key",
    name: "Mailgun API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bkey-[a-z0-9]{32}\b/g,
    source: "gitleaks",
    description: "Mailgun API key (key-… 32 hex).",
  },
  {
    id: "sendgrid-key",
    name: "SendGrid API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g,
    source: "gitleaks",
    description: "SendGrid API key (SG.…).",
  },
  {
    id: "twilio-account-sid",
    name: "Twilio Account SID",
    lens: "threat-modeling",
    severity: "warn",
    regex: /\bAC[a-f0-9]{32}\b/g,
    source: "gitleaks",
    description:
      "Twilio Account SID (AC… 34 chars). Public identifier on its own, but " +
      "pairs with the auth-token to grant API access; treat as sensitive.",
  },
  {
    id: "twilio-api-key",
    name: "Twilio API Key",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bSK[a-f0-9]{32}\b/g,
    source: "gitleaks",
    description: "Twilio API Key (SK… 34 chars).",
  },
  {
    id: "square-access-token",
    name: "Square Access Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bsq0(?:atp|csp|idp)-[A-Za-z0-9_-]{22,43}\b/g,
    source: "gitleaks",
    description: "Square access/personal/company token (sq0…).",
  },
  {
    id: "heroku-api-key",
    name: "Heroku API Key (UUID-format)",
    lens: "threat-modeling",
    severity: "warn",
    regex: /\bheroku[\s_-]{0,3}(?:api[_-]?key|token)[\s:="]+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
    source: "gitleaks",
    description: "Heroku API key tagged via context (heroku_api_key=<uuid>).",
  },
  {
    id: "npm-token",
    name: "NPM Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bnpm_[A-Za-z0-9]{36}\b/g,
    source: "gitleaks",
    description: "NPM access token (npm_…). Can publish under your account.",
  },
  {
    id: "pypi-token",
    name: "PyPI Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/g,
    source: "gitleaks",
    description: "PyPI upload token (pypi-AgEIcHlwaS5vcmc…).",
  },
  {
    id: "discord-bot-token",
    name: "Discord Bot Token",
    lens: "threat-modeling",
    severity: "error",
    regex: /\b[MN][A-Za-z0-9]{23}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}\b/g,
    source: "gitleaks",
    description: "Discord bot token (3-part dot-separated).",
  },
  {
    id: "cloudflare-api-token",
    name: "Cloudflare API Token (likely)",
    lens: "threat-modeling",
    severity: "warn",
    // Context-tagged: Cloudflare API tokens are 40-char base64-ish.
    regex: /\b(?:cloudflare|cf)[\s_-]{0,3}(?:api[_-]?token|api[_-]?key)[\s:="]+([A-Za-z0-9_-]{37,40})\b/gi,
    source: "gitleaks",
    description: "Cloudflare API token tagged via context.",
  },

  // -------- Generic password/token in URL or context --------
  {
    id: "basic-auth-in-url",
    name: "Basic-Auth credentials in URL",
    lens: "threat-modeling",
    severity: "error",
    regex: /\b(?:https?|ftp|ssh):\/\/[^\s\/@:]+:[^\s\/@:]{4,}@[^\s\/]+/g,
    source: "gitleaks",
    description:
      "URL contains userinfo (scheme://user:password@host). RFC 3986 " +
      "permits this but RFC 7235 §2.1 deprecates it; passwords in URLs " +
      "leak via logs, history, and Referer.",
  },
];

// =============================================================================
// 2. PII patterns (Lens 6 — Privacy / Data-Classification)
// =============================================================================

export const PII_PATTERNS: SecretPattern[] = [
  {
    id: "pii-ssn-us",
    name: "US Social Security Number",
    lens: "privacy-data-class",
    severity: "warn",
    // SSN: AAA-GG-SSSS, with area-code 001-665 / 667-899 (excludes 666, 000,
    // and 900+). Require dashes to avoid matching arbitrary 9-digit IDs
    // (avatar URLs, GitHub user-ids, etc.).
    regex: /\b(?!000|666|9\d\d)\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    validate: (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length !== 9) return false;
      const area = parseInt(digits.slice(0, 3), 10);
      const group = parseInt(digits.slice(3, 5), 10);
      const serial = parseInt(digits.slice(5, 9), 10);
      if (area === 0 || area === 666 || area >= 900) return false;
      if (group === 0) return false;
      if (serial === 0) return false;
      return true;
    },
    source: "standard-pii",
    description:
      "String matches US Social Security Number shape (AAA-GG-SSSS). If used " +
      "as an example, prefer obviously-fake placeholders like 000-00-0000 " +
      "or XXX-XX-XXXX.",
  },
  {
    id: "pii-credit-card",
    name: "Credit-Card Number (Luhn-valid)",
    lens: "privacy-data-class",
    severity: "warn",
    // 13-19 digit groups, optionally hyphen/space separated.
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
    validate: (m) => luhnValid(m.replace(/\D/g, "")),
    source: "standard-pii",
    description:
      "String passes Luhn checksum and is in credit-card-number length range. " +
      "Use test-card numbers (e.g. Stripe 4242 4242 4242 4242) — those " +
      "pass Luhn but are documented as test data.",
  },
  {
    id: "pii-email-real",
    name: "Real-looking email address",
    lens: "privacy-data-class",
    severity: "hint",
    // RFC 5322 simplified — covers practical cases. Filter common test
    // domains in validate().
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,24}\b/g,
    validate: (m) => {
      const lower = m.toLowerCase();
      // Exempt obviously-test-or-doc-domains (RFC 2606).
      const testDomains = [
        "example.com", "example.org", "example.net",
        "test.com", "localhost",
        "foo.com", "bar.com", "baz.com",
        "acme.com", "company.com", "yourcompany.com",
        "mycompany.com", "mail.example",
      ];
      const placeholderUsers = [
        "user", "test", "foo", "bar", "baz", "noreply", "no-reply",
        "admin", "example", "demo", "sample", "placeholder",
      ];
      const [user, domain] = lower.split("@");
      if (!user || !domain) return false;
      if (testDomains.some((d) => domain === d || domain.endsWith("." + d))) return false;
      if (placeholderUsers.includes(user)) return false;
      return true;
    },
    source: "standard-pii",
    description:
      "Email-address-shaped string that does not match common test/example " +
      "domains (example.com / test.com / RFC 2606) or placeholder users. " +
      "Use RFC-2606 reserved domains in examples.",
  },
  {
    id: "pii-passport-us",
    name: "US Passport Number",
    lens: "privacy-data-class",
    severity: "warn",
    // US passports: 9 digits, sometimes prefixed by a letter.
    // Tagged via context-keyword to avoid catching all 9-digit numbers.
    regex: /\bpassport[\s_-]?(?:no|num|number|#)?[\s:="]+([A-Z]?\d{9})\b/gi,
    source: "standard-pii",
    description:
      "String tagged with passport context resembles US passport-number " +
      "shape. Use synthetic placeholders.",
  },
];

// =============================================================================
// 3. Generic high-entropy heuristic (separate — not a strict regex)
// =============================================================================

/**
 * Shannon-entropy in bits per character (range 0..log2(alphabet-size)).
 *
 * For a base64-ish 64-character alphabet, log2(64) = 6 bits/char ceiling.
 * Real secrets typically score >4.5 bits/char; English prose scores ~3.5.
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of freq.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Heuristic: a string is "high-entropy" if it is >= minLen chars,
 * base64-ish (alphabet [A-Za-z0-9+/=_-]), and has Shannon entropy
 * >= minEntropy bits/char.
 */
export function isHighEntropy(s: string, minLen = 40, minEntropy = 4.5): boolean {
  if (s.length < minLen) return false;
  if (!/^[A-Za-z0-9+\/=_-]+$/.test(s)) return false;
  return shannonEntropy(s) >= minEntropy;
}

// =============================================================================
// 4. Match-result + Walker
// =============================================================================

export interface SecretMatch {
  patternId: string;
  patternName: string;
  lens: "threat-modeling" | "privacy-data-class";
  severity: "error" | "warn" | "hint";
  /** The matched substring (with simple length-clamp for huge matches). */
  match: string;
  /** JSON-Pointer-style path to the value-site. */
  pointer: string;
  /** Which value-site flavour: default / example / examples-map / description. */
  site: "default" | "example" | "examples-map" | "description" | "value";
  source: SecretPattern["source"] | "high-entropy-heuristic";
}

/**
 * Scan one string against all catalog patterns + the high-entropy heuristic.
 * Returns 0+ matches.
 *
 * Caller supplies pointer and site for finding-location attribution.
 */
export function scanString(
  text: string,
  ctx: { pointer: string; site: SecretMatch["site"]; treatAsDescription?: boolean }
): SecretMatch[] {
  const out: SecretMatch[] = [];
  if (typeof text !== "string" || text.length === 0) return out;

  // 1. Confirmed-secret regex catalog.
  for (const p of SECRET_PATTERNS) {
    // Reset lastIndex on global regex - the catalog is re-used across calls.
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      const matched = m[0];
      if (p.validate && !p.validate(matched)) continue;
      out.push({
        patternId: p.id,
        patternName: p.name,
        lens: p.lens,
        severity: p.severity,
        match: clampMatch(matched),
        pointer: ctx.pointer,
        site: ctx.site,
        source: p.source,
      });
      // Guard against zero-width matches that cause infinite-loops.
      if (m.index === p.regex.lastIndex) p.regex.lastIndex++;
    }
  }

  // 2. PII patterns.
  for (const p of PII_PATTERNS) {
    p.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.regex.exec(text)) !== null) {
      const matched = m[0];
      if (p.validate && !p.validate(matched)) continue;
      out.push({
        patternId: p.id,
        patternName: p.name,
        lens: p.lens,
        severity: p.severity,
        match: clampMatch(matched),
        pointer: ctx.pointer,
        site: ctx.site,
        source: p.source,
      });
      if (m.index === p.regex.lastIndex) p.regex.lastIndex++;
    }
  }

  // 3. High-entropy heuristic - only on standalone tokens (not on prose
  //    description, which is full of high-entropy noise like long sentences).
  if (!ctx.treatAsDescription) {
    if (isHighEntropy(text)) {
      // Avoid double-reporting if a confirmed-secret already covers it.
      const alreadyMatched = out.some((existing) => existing.match === text);
      if (!alreadyMatched) {
        out.push({
          patternId: "high-entropy-token",
          patternName: "High-entropy token (>=40 chars, >=4.5 bits/char)",
          lens: "threat-modeling",
          severity: "warn",
          match: clampMatch(text),
          pointer: ctx.pointer,
          site: ctx.site,
          source: "high-entropy-heuristic",
        });
      }
    }
  }

  return out;
}

function clampMatch(s: string, max = 120): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}

// =============================================================================
// 5. Spec-walker - visits every value-site (default/example/examples/description)
// =============================================================================

/**
 * Visit every default/example/examples-map/description value in the spec.
 * Yields { value, pointer, site }.
 *
 * Cycle-safe via WeakSet identity tracking.
 */
function* walkValueSites(
  spec: object
): Generator<{ value: unknown; pointer: string; site: SecretMatch["site"] }> {
  const seen = new WeakSet<object>();
  yield* recurse(spec, "", seen);
}

function* recurse(
  node: unknown,
  pointer: string,
  seen: WeakSet<object>
): Generator<{ value: unknown; pointer: string; site: SecretMatch["site"] }> {
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      yield* recurse(node[i], pointer + "/" + i, seen);
    }
    return;
  }

  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    const childPtr = pointer + "/" + escapePointer(k);

    if (k === "default") {
      if (typeof v === "string") {
        yield { value: v, pointer: childPtr, site: "default" };
      } else if (v && typeof v === "object") {
        yield* recurseValueLeaf(v, childPtr, seen);
      }
    } else if (k === "example") {
      if (typeof v === "string") {
        yield { value: v, pointer: childPtr, site: "example" };
      } else if (v && typeof v === "object") {
        yield* recurseValueLeaf(v, childPtr, seen);
      }
    } else if (k === "examples" && v && typeof v === "object" && !Array.isArray(v)) {
      // OAS 3.x examples-map: { name: { value: ... } }
      const exObj = v as Record<string, unknown>;
      for (const [exName, exVal] of Object.entries(exObj)) {
        const examplePtr = childPtr + "/" + escapePointer(exName);
        if (exVal && typeof exVal === "object" && !Array.isArray(exVal)) {
          const exInner = exVal as Record<string, unknown>;
          if ("value" in exInner) {
            const exValue = exInner.value;
            if (typeof exValue === "string") {
              yield { value: exValue, pointer: examplePtr + "/value", site: "examples-map" };
            } else if (exValue && typeof exValue === "object") {
              yield* recurseValueLeaf(exValue, examplePtr + "/value", seen);
            }
          }
          // Continue traversal of the example-object as well (for description etc.).
          yield* recurse(exVal, examplePtr, seen);
          continue;
        }
        yield* recurse(exVal, examplePtr, seen);
      }
      // Skip the generic recursion below (already handled).
      continue;
    } else if (k === "description" || k === "summary" || k === "title") {
      if (typeof v === "string") {
        yield { value: v, pointer: childPtr, site: "description" };
      }
    }

    // Recurse into the value regardless (sub-trees may contain more
    // default/example/description fields). Skip primitives.
    if (v && typeof v === "object") {
      yield* recurse(v, childPtr, seen);
    }
  }
}

/**
 * For default/example values that are themselves objects (e.g. JSON
 * request-body example), walk every leaf-string and yield each as a
 * generic value-site.
 */
function* recurseValueLeaf(
  node: unknown,
  pointer: string,
  seen: WeakSet<object>
): Generator<{ value: unknown; pointer: string; site: SecretMatch["site"] }> {
  if (typeof node === "string") {
    yield { value: node, pointer, site: "value" };
    return;
  }
  if (node === null || node === undefined) return;
  if (typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      yield* recurseValueLeaf(node[i], pointer + "/" + i, seen);
    }
    return;
  }
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    yield* recurseValueLeaf(v, pointer + "/" + escapePointer(k), seen);
  }
}

function escapePointer(s: string): string {
  return s.replace(/~/g, "~0").replace(/\//g, "~1");
}

// =============================================================================
// 6. Luhn check (CC validation)
// =============================================================================

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits.charAt(i), 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// =============================================================================
// 7. Public API - runSecretScanner
// =============================================================================

/**
 * Build the rule-metadata for a finding. Validates against the Severity-
 * Schema so any future schema change surfaces as a test failure.
 */
function buildRuleMetadata(p: SecretMatch): RuleMetadata {
  const isHighEntropyHeuristic = p.source === "high-entropy-heuristic";
  const isPII = p.lens === "privacy-data-class";

  return validateMetadata({
    severity: p.severity,
    lenses: isPII ? ["privacy-data-class", "threat-modeling"] : ["threat-modeling"],
    sources: isHighEntropyHeuristic
      ? [{ type: "mining", phase: "round2", subagent: "secret-scanner-heuristic" } as const]
      : p.source === "standard-pii"
        ? [{ type: "mining", phase: "round2", subagent: "secret-scanner-pii" } as const]
        : [{ type: "vendor", name: p.source } as const],
    codegenTargets: ["*"],
    stakeholders: isPII ? ["security", "end-user", "spec-author"] : ["security", "spec-author"],
    lifecyclePhase: "documentation-time",
    defectClass: "semantic",
    iso25010: ["security"],
    priority: "P1",
    patternId: p.patternId,
  });
}

/**
 * Map a SecretMatch into a DetectorFinding. Aggregates across multiple
 * occurrences of the same pattern-id into a single finding with a count
 * and example-pointers in meta.
 */
function buildFinding(
  patternId: string,
  matches: SecretMatch[]
): DetectorFinding {
  const first = matches[0];
  const meta = buildRuleMetadata(first);

  // Map rule-tagging severity (error/warn/hint/info) to LLM-finding severity
  // (critical/high/medium/low). Confirmed real-world secrets => critical;
  // PII or warn-tier secrets => high; hints => low.
  const llmSeverity: "critical" | "high" | "medium" | "low" =
    first.severity === "error" && first.lens === "threat-modeling"
      ? "critical"
      : first.severity === "error"
        ? "high"
        : first.severity === "warn"
          ? "high"
          : "low";

  const examplePointers = matches.slice(0, 5).map((m) => m.pointer);
  const examplePointersFmt =
    examplePointers.length === matches.length
      ? examplePointers.join(", ")
      : examplePointers.join(", ") + " (and " + (matches.length - examplePointers.length) + " more)";

  const sites = Array.from(new Set(matches.map((m) => m.site))).sort();
  const sitesPretty = sites.join(", ");

  // Redact matched samples for narration.
  const redactedSamples = matches
    .slice(0, 3)
    .map((m) => redactSample(m.match, first.lens === "threat-modeling"))
    .join(", ");

  const titleText =
    first.lens === "privacy-data-class"
      ? "PII pattern detected (" + first.patternName + ") in " + matches.length + " value-site(s)"
      : "Likely real secret leaked: " + first.patternName + " in " + matches.length + " value-site(s)";

  const narrationText =
    first.lens === "privacy-data-class"
      ? "Found " + matches.length + " occurrence(s) of " + first.patternName + " in spec " +
        "value-sites (" + sitesPretty + "). Sample matches (redacted): " + redactedSamples + ". " +
        "Locations: " + examplePointersFmt + ". " +
        "Privacy regulations (GDPR Art. 4(1), CCPA section 1798.140) treat such data as " +
        "personal information; including realistic-looking PII in API specs as defaults / " +
        "examples / descriptions undermines data-minimisation discipline and can confuse " +
        "code-generators / AI-agents into treating the example as canonical test data. " +
        "Replace with synthetic placeholders that obviously fail validation (e.g. " +
        "000-00-0000 for SSN, 4242 4242 4242 4242 for CC, RFC-2606 reserved " +
        "domains for emails)."
      : "Found " + matches.length + " occurrence(s) of " + first.patternName + " in spec " +
        "value-sites (" + sitesPretty + "). Sample matches (redacted): " + redactedSamples + ". " +
        "Locations: " + examplePointersFmt + ". " +
        "This regex is high-confidence: real-world API keys of this format are issued by " +
        "the upstream provider and the substring shape uniquely identifies them. If the " +
        "match is genuine, ROTATE THE CREDENTIAL IMMEDIATELY (the spec is likely public " +
        "or shared) and replace with an obviously-fake placeholder (<YOUR_API_KEY>, " +
        "sk_test_…, etc.). If this is a test/sandbox key, prefer the providers " +
        "documented placeholder convention.";

  const rationaleText =
    first.lens === "privacy-data-class"
      ? "Privacy regulations (GDPR Art. 4(1), CCPA section 1798.140) classify the matched " +
        "shape as personal information. OpenAPI examples are documentation that gets " +
        "rendered, indexed by search-engines, and consumed by code-gen / AI agents - " +
        "real PII does not belong there."
      : "OWASP Top 10 A07 (Identification & Authentication Failures) and OWASP Secure " +
        "Coding Practices both flag credential-leakage in version-controlled artefacts. " +
        "OpenAPI specs are routinely committed to public repositories; a real key here " +
        "is reachable by every secret-scanner crawling the network.";

  const patchSummaryText =
    first.lens === "privacy-data-class"
      ? "Replace " + matches.length + " PII-shaped example(s) of " + first.patternName + " with synthetic placeholders."
      : "Rotate leaked " + first.patternName + " credential(s) and replace " + matches.length + " value-site(s) with placeholders.";

  return {
    detectorId: "secret-scanner:" + patternId,
    layer: "walker-statistical",
    title: titleText,
    narration: narrationText,
    rationale: rationaleText,
    category: "risk",
    severity: llmSeverity,
    scope: "spec",
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: patchSummaryText,
    sourcePath: examplePointers[0],
    meta: {
      patternId,
      lens: first.lens,
      severity: first.severity,
      ruleMetadata: meta,
      occurrences: matches.length,
      sites,
      examplePointers,
    },
  };
}

/**
 * Redact a matched secret for safe inclusion in narration text. For
 * threat-modeling matches we keep ~6 leading and 4 trailing chars;
 * everything else becomes asterisks. For PII we redact to shape only.
 */
function redactSample(s: string, isSecret: boolean): string {
  if (isSecret) {
    if (s.length <= 12) return s.slice(0, 2) + "***";
    return s.slice(0, 6) + "***" + s.slice(-4);
  }
  return s.replace(/[A-Za-z]/g, "X").replace(/\d/g, "#");
}

/**
 * Group matches by pattern-id so the output is one finding per pattern
 * (with count aggregating occurrences) - avoids overwhelming the UI
 * when a single leaked key appears in 30 examples.
 */
function groupByPatternId(matches: SecretMatch[]): Map<string, SecretMatch[]> {
  const out = new Map<string, SecretMatch[]>();
  for (const m of matches) {
    const arr = out.get(m.patternId) ?? [];
    arr.push(m);
    out.set(m.patternId, arr);
  }
  return out;
}

export async function runSecretScanner(
  spec: object,
  _opts: DetectorOptions = {}
): Promise<DetectorFinding[]> {
  const allMatches: SecretMatch[] = [];

  for (const { value, pointer, site } of walkValueSites(spec)) {
    if (typeof value !== "string") continue;
    const treatAsDescription = site === "description";
    const matches = scanString(value, { pointer, site, treatAsDescription });
    allMatches.push(...matches);
  }

  const grouped = groupByPatternId(allMatches);
  const findings: DetectorFinding[] = [];
  for (const [patternId, matches] of grouped) {
    findings.push(buildFinding(patternId, matches));
  }
  // Stable sort: by severity (critical first) then patternId.
  const sevOrder: Record<DetectorFinding["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  findings.sort((a, b) => {
    const s = sevOrder[a.severity] - sevOrder[b.severity];
    if (s !== 0) return s;
    return a.detectorId.localeCompare(b.detectorId);
  });
  return findings;
}

// =============================================================================
// 8. CLI
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
    console.error("Usage: tsx deterministic/secret-scanner.ts <spec-name>");
    console.error("  e.g. tsx deterministic/secret-scanner.ts stripe-full");
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
  const findings = await runSecretScanner(spec, { specName });
  const durationMs = Date.now() - startedAt;

  const byLens = new Map<string, number>();
  for (const f of findings) {
    const lens = (f.meta?.lens as string) ?? "unknown";
    byLens.set(lens, (byLens.get(lens) ?? 0) + 1);
  }
  const lensSummary = [...byLens.entries()].map(([l, c]) => l + "=" + c).join(", ") || "none";
  console.log(
    "Ran in " + durationMs + "ms - emitted " + findings.length + " findings (by lens: " + lensSummary + ")"
  );
  console.log("");
  if (findings.length === 0) {
    console.log("(No secret/PII findings.)");
    return;
  }
  for (const f of findings) {
    console.log("[" + f.detectorId + "] (" + f.severity + ")");
    console.log("  title: " + f.title);
    if (f.meta?.examplePointers) {
      console.log("  pointers: " + (f.meta.examplePointers as string[]).slice(0, 3).join(", "));
    }
    if (f.meta?.occurrences) {
      console.log("  occurrences: " + f.meta.occurrences);
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
