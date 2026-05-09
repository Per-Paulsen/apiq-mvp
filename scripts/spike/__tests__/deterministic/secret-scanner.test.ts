/**
 * Tests for the secret-scanner module (Stage A, Welle A T8).
 *
 * Validates:
 *   - Confirmed-secret regexes match real-world key shapes
 *     (Stripe sk_live, AWS AKIA, GitHub ghp_, Google AIza, Slack xoxb,
 *     OpenAI sk-…T3BlbkFJ).
 *   - PII patterns (SSN with area-code validation, Luhn-valid CC,
 *     real-looking email — filtering RFC-2606 reserved domains).
 *   - High-entropy heuristic emits for opaque base64-ish tokens but
 *     not for obviously-structured strings (UUIDs, ISO dates).
 *   - No-false-positives on legit UUIDs / ISO dates / placeholder
 *     emails.
 *   - Walker visits default / example / examples-map / description sites.
 *   - Output validates against canonical FindingSchema via output-mapper.
 *   - Detector runs cleanly on all 4 reference specs without crashing.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SECRET_PATTERNS,
  PII_PATTERNS,
  scanString,
  shannonEntropy,
  isHighEntropy,
  luhnValid,
  runSecretScanner,
} from "../../deterministic/modules/secret-scanner.js";
import { mapDetectorFindings } from "../../deterministic/infra/output-mapper.js";
import { FindingSchema } from "../../schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

// =============================================================================
// Pattern catalog presence
// =============================================================================

describe("pattern catalog completeness", () => {
  it("ships >= 30 confirmed-secret patterns", () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(30);
  });

  it("ships >= 4 PII patterns", () => {
    expect(PII_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  it("every confirmed-secret pattern is tagged threat-modeling lens", () => {
    for (const p of SECRET_PATTERNS) {
      expect(p.lens).toBe("threat-modeling");
    }
  });

  it("every PII pattern is tagged privacy-data-class lens", () => {
    for (const p of PII_PATTERNS) {
      expect(p.lens).toBe("privacy-data-class");
    }
  });

  it("every regex has the global flag for multi-match per value", () => {
    for (const p of [...SECRET_PATTERNS, ...PII_PATTERNS]) {
      expect(p.regex.flags).toContain("g");
    }
  });

  it("pattern-ids are unique within and across catalogs", () => {
    const ids = [...SECRET_PATTERNS, ...PII_PATTERNS].map((p) => p.id);
    const set = new Set(ids);
    expect(set.size).toBe(ids.length);
  });
});

// =============================================================================
// scanString — confirmed-secret matches
// =============================================================================

describe("scanString — confirmed real-world secrets", () => {
  it("matches a Stripe live secret key", () => {
    const text = "Use sk_live_51HABC123DEF456GHI789JKL0 to authenticate.";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const stripe = matches.find((m) => m.patternId === "stripe-live-secret-key");
    expect(stripe).toBeDefined();
    expect(stripe?.severity).toBe("error");
    expect(stripe?.lens).toBe("threat-modeling");
  });

  it("matches an AWS Access Key ID (AKIA prefix)", () => {
    const text = "aws_access_key_id = AKIAIOSFODNN7EXAMPLE";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const aws = matches.find((m) => m.patternId === "aws-access-key-id");
    expect(aws).toBeDefined();
    expect(aws?.severity).toBe("error");
    expect(aws?.match).toContain("AKIA");
  });

  it("matches a GitHub Personal Access Token (ghp_ prefix)", () => {
    const text = "Authorization: token ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789";
    const matches = scanString(text, { pointer: "/x", site: "default" });
    const gh = matches.find((m) => m.patternId === "github-pat");
    expect(gh).toBeDefined();
    expect(gh?.severity).toBe("error");
  });

  it("matches a Google API Key (AIza prefix, 39 chars)", () => {
    const text = "GOOGLE_API_KEY=AIzaSyDabcdefghijklmnopqrstuvwxyz012345";
    const matches = scanString(text, { pointer: "/x", site: "default" });
    const goog = matches.find((m) => m.patternId === "google-api-key");
    expect(goog).toBeDefined();
  });

  it("matches a Slack bot token (xoxb-...)", () => {
    const text = "slack_token = xoxb-1234567890123-1234567890123-aBcDeFgHiJkLmNoPqRsTuVwX";
    const matches = scanString(text, { pointer: "/x", site: "default" });
    const slack = matches.find((m) => m.patternId === "slack-bot-token");
    expect(slack).toBeDefined();
  });

  it("matches an OpenAI API key (T3BlbkFJ middle)", () => {
    const text = "OPENAI_KEY = sk-AbcDef1234567890ZyXwVuT3BlbkFJZyXwVuTsRqPoNmLkJiHgFeDcBa1234567890";
    const matches = scanString(text, { pointer: "/x", site: "default" });
    const oa = matches.find((m) => m.patternId === "openai-api-key");
    expect(oa).toBeDefined();
  });

  it("matches a Slack incoming-webhook URL", () => {
    const text = "POST to https://hooks.slack.com/services/T01ABCDEFGH/B01ABCDEFGH/abcd1234efgh5678ijkl9012";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const sw = matches.find((m) => m.patternId === "slack-webhook");
    expect(sw).toBeDefined();
    expect(sw?.severity).toBe("error");
  });

  it("matches RSA private-key block in description prose", () => {
    const text = `Sample key:
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAabcd1234efghijklmnopqrstuvwxyz0123456789
-----END RSA PRIVATE KEY-----
end of sample.`;
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const rsa = matches.find((m) => m.patternId === "private-key-rsa");
    expect(rsa).toBeDefined();
    expect(rsa?.severity).toBe("error");
  });

  it("matches a basic-auth credential in URL", () => {
    const text = "Connect to https://admin:supersecret@example.com/api for testing.";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const ba = matches.find((m) => m.patternId === "basic-auth-in-url");
    expect(ba).toBeDefined();
  });
});

// =============================================================================
// scanString — PII patterns
// =============================================================================

describe("scanString — PII patterns", () => {
  it("matches a US SSN with valid area-code", () => {
    const text = "Social Security: 123-45-6789";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const ssn = matches.find((m) => m.patternId === "pii-ssn-us");
    expect(ssn).toBeDefined();
    expect(ssn?.severity).toBe("warn");
    expect(ssn?.lens).toBe("privacy-data-class");
  });

  it("does NOT flag SSN with reserved area-code 666", () => {
    const text = "fake_ssn: 666-12-3456";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const ssn = matches.find((m) => m.patternId === "pii-ssn-us");
    expect(ssn).toBeUndefined();
  });

  it("does NOT flag SSN with reserved area-code 900+", () => {
    const text = "id: 900-12-3456";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const ssn = matches.find((m) => m.patternId === "pii-ssn-us");
    expect(ssn).toBeUndefined();
  });

  it("matches a Luhn-valid Visa test card", () => {
    // Stripe test card 4242 4242 4242 4242 — passes Luhn.
    const text = "Test card: 4242 4242 4242 4242";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const cc = matches.find((m) => m.patternId === "pii-credit-card");
    expect(cc).toBeDefined();
  });

  it("does NOT flag a Luhn-invalid 16-digit string", () => {
    const text = "Invoice: 1234 5678 9012 3456";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    const cc = matches.find((m) => m.patternId === "pii-credit-card");
    expect(cc).toBeUndefined();
  });

  it("matches a real-looking email address", () => {
    const text = "Contact john.smith@gmail.com for support.";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const email = matches.find((m) => m.patternId === "pii-email-real");
    expect(email).toBeDefined();
    expect(email?.severity).toBe("hint");
  });

  it("does NOT flag RFC-2606 example.com email", () => {
    const text = "Contact admin@example.com";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const email = matches.find((m) => m.patternId === "pii-email-real");
    expect(email).toBeUndefined();
  });

  it("does NOT flag placeholder users like noreply@gmail.com", () => {
    const text = "From: noreply@gmail.com";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    const email = matches.find((m) => m.patternId === "pii-email-real");
    expect(email).toBeUndefined();
  });
});

// =============================================================================
// shannonEntropy / isHighEntropy / luhnValid
// =============================================================================

describe("entropy + luhn helpers", () => {
  it("shannonEntropy is 0 for empty string", () => {
    expect(shannonEntropy("")).toBe(0);
  });

  it("shannonEntropy is low for repeated characters", () => {
    expect(shannonEntropy("aaaaaaaaaa")).toBe(0);
  });

  it("shannonEntropy is high for pseudo-random base64", () => {
    const random = "aB3xY7z9PqRsTuVwLmNoKjHgFeDcBaZ0";
    expect(shannonEntropy(random)).toBeGreaterThan(4);
  });

  it("isHighEntropy returns true for >=40-char base64-ish string", () => {
    const longRandom = "aB3xY7z9PqRsTuVwLmNoKjHgFeDcBaZ0123456789AB";
    expect(isHighEntropy(longRandom)).toBe(true);
  });

  it("isHighEntropy returns false for short strings", () => {
    expect(isHighEntropy("abc123")).toBe(false);
  });

  it("isHighEntropy returns false for low-entropy strings (UUID is borderline)", () => {
    // Plain English prose has entropy ~3.5 bits/char.
    const prose = "The quick brown fox jumps over the lazy dog repeatedly today.";
    expect(isHighEntropy(prose, 40, 4.5)).toBe(false);
  });

  it("luhnValid returns true for Stripe Visa test card", () => {
    expect(luhnValid("4242424242424242")).toBe(true);
  });

  it("luhnValid returns false for 1234-1234-1234-1234", () => {
    expect(luhnValid("1234123412341234")).toBe(false);
  });

  it("luhnValid returns false for too-short strings", () => {
    expect(luhnValid("12345")).toBe(false);
  });
});

// =============================================================================
// No-false-positive checks on legit specs
// =============================================================================

describe("no false positives on common legit values", () => {
  it("does NOT flag a regular UUID as a confirmed-secret", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const matches = scanString(uuid, { pointer: "/x", site: "example" });
    const confirmed = matches.filter((m) => m.severity === "error");
    expect(confirmed).toHaveLength(0);
  });

  it("does NOT flag an ISO 8601 timestamp", () => {
    const ts = "2026-05-06T12:34:56.789Z";
    const matches = scanString(ts, { pointer: "/x", site: "example" });
    expect(matches.filter((m) => m.severity === "error")).toHaveLength(0);
  });

  it("does NOT flag a placeholder Stripe test key (sk_test_...)", () => {
    const text = "sk_test_4eC39HqLyjWDarjtT1zdp7dc";
    const matches = scanString(text, { pointer: "/x", site: "example" });
    // The catalog only matches sk_live_, so sk_test_ should produce no
    // confirmed-secret hits (high-entropy heuristic might fire — that is
    // its job; but no error-tier match).
    const errs = matches.filter((m) => m.severity === "error");
    expect(errs).toHaveLength(0);
  });

  it("does NOT flag plain English prose", () => {
    const text = "This endpoint returns a list of all customers in the workspace.";
    const matches = scanString(text, { pointer: "/x", site: "description", treatAsDescription: true });
    expect(matches).toHaveLength(0);
  });
});

// =============================================================================
// runSecretScanner — walker visits all value-sites
// =============================================================================

describe("runSecretScanner — full-spec walking", () => {
  it("finds a Stripe key embedded in a parameter example", async () => {
    const spec = {
      openapi: "3.0.0",
      paths: {
        "/charges": {
          post: {
            parameters: [
              {
                name: "api_key",
                in: "header",
                schema: { type: "string" },
                example: "sk_live_51HABC123DEF456GHI789JKL0",
              },
            ],
          },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    const stripe = findings.find((f) => f.detectorId === "secret-scanner:stripe-live-secret-key");
    expect(stripe).toBeDefined();
    expect(stripe?.severity).toBe("critical");
  });

  it("finds a key in default value of a schema field", async () => {
    const spec = {
      components: {
        schemas: {
          Config: {
            type: "object",
            properties: {
              github_token: {
                type: "string",
                default: "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789",
              },
            },
          },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    const gh = findings.find((f) => f.detectorId === "secret-scanner:github-pat");
    expect(gh).toBeDefined();
  });

  it("finds a key in OAS 3.x examples-map value", async () => {
    const spec = {
      paths: {
        "/x": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: {
                  "application/json": {
                    examples: {
                      sample: {
                        value: "AKIAIOSFODNN7EXAMPLE",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    const aws = findings.find((f) => f.detectorId === "secret-scanner:aws-access-key-id");
    expect(aws).toBeDefined();
  });

  it("finds an SSN in a description", async () => {
    const spec = {
      paths: {
        "/users": {
          get: {
            description: "Returns user with SSN 123-45-6789 for testing.",
            responses: {},
          },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    const ssn = findings.find((f) => f.detectorId === "secret-scanner:pii-ssn-us");
    expect(ssn).toBeDefined();
  });

  it("aggregates multiple occurrences of the same pattern into one finding", async () => {
    const spec = {
      components: {
        schemas: {
          A: { type: "string", example: "sk_live_51HABC123DEF456GHI789JKL0" },
          B: { type: "string", example: "sk_live_51XYZ987UVW654RST321QPO0" },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    const stripe = findings.find((f) => f.detectorId === "secret-scanner:stripe-live-secret-key");
    expect(stripe).toBeDefined();
    expect(stripe?.meta?.occurrences).toBe(2);
    expect((stripe?.meta?.examplePointers as string[] | undefined)?.length).toBeGreaterThanOrEqual(2);
  });

  it("returns an empty array on a clean spec", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Clean", version: "1.0" },
      paths: {
        "/health": {
          get: {
            description: "Returns service health status.",
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await runSecretScanner(spec);
    expect(findings).toEqual([]);
  });

  it("is cycle-safe (does not infinite-loop on self-referential structures)", async () => {
    const spec: Record<string, unknown> = { paths: {} };
    spec.self = spec;
    const findings = await runSecretScanner(spec);
    expect(Array.isArray(findings)).toBe(true);
  });
});

// =============================================================================
// FindingSchema validation via output-mapper
// =============================================================================

describe("output validates against FindingSchema", () => {
  it("produces canonical Finding-shape that round-trips through output-mapper", async () => {
    const spec = {
      components: {
        schemas: {
          Bad: { type: "string", example: "sk_live_51HABC123DEF456GHI789JKL0" },
        },
      },
    };
    const detectorFindings = await runSecretScanner(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);

    const llmFindings = mapDetectorFindings(detectorFindings);
    expect(llmFindings.length).toBe(detectorFindings.length);
    for (const f of llmFindings) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  });

  it("emits findings with non-empty title/narration/rationale within schema bounds", async () => {
    const spec = {
      components: {
        schemas: {
          Bad: { type: "string", example: "ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789" },
        },
      },
    };
    const detectorFindings = await runSecretScanner(spec);
    const mapped = mapDetectorFindings(detectorFindings);
    expect(mapped.length).toBeGreaterThan(0);
    const f = mapped[0];
    expect(f.title.length).toBeGreaterThan(0);
    expect(f.title.length).toBeLessThanOrEqual(200);
    expect(f.narration.length).toBeGreaterThanOrEqual(50);
    expect(f.narration.length).toBeLessThanOrEqual(2000);
    expect(f.rationale.length).toBeGreaterThanOrEqual(20);
    expect(f.rationale.length).toBeLessThanOrEqual(1000);
    expect(f.patchSummary.length).toBeGreaterThanOrEqual(1);
    expect(f.patchSummary.length).toBeLessThanOrEqual(200);
  });
});

// =============================================================================
// Sanity-check on real example specs
// =============================================================================

const REFERENCE_SPECS = ["stripe-full", "pagerduty-full", "dnd5eapi", "github-rest"];

describe("runs cleanly on reference specs", () => {
  for (const specName of REFERENCE_SPECS) {
    it("runs on " + specName + " without throwing and produces schema-valid output", async () => {
      const specPath = path.join(EXAMPLES_DIR, specName, "spec.json");
      if (!fs.existsSync(specPath)) {
        // If the fixture is not checked in for this spec, skip rather than fail.
        return;
      }
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = JSON.parse(raw) as object;

      const findings = await runSecretScanner(spec, { specName });
      // Map through the output-mapper to validate against FindingSchema.
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 60_000);
  }
});
