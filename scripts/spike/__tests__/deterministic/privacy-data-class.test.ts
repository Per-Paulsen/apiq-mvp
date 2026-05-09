/**
 * Tests for the Privacy / Data-Classification walker (Stage A, Welle B T21).
 *
 * Covers:
 *   - L6-1 PII-named path/query-parameter detection (warn + hint tiers).
 *   - L6-2 vendor-extension positive marker (info-tier).
 *   - L6-3 HIPAA-relevance heuristic (conservative — multi-shape gate +
 *     no-data-class-annotation gate).
 *   - L6-4 cross-reference marker emitted as info-tier.
 *   - Output validates against the canonical FindingSchema via output-mapper.
 *   - Smoke-run on the four reference specs (no crashes, schema-valid output).
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PII_FIELD_NAME_PATTERNS,
  PHI_FIELD_NAME_PATTERNS,
  DATA_CLASS_VENDOR_EXTENSIONS,
  walkPrivacyDataClass,
} from "../../deterministic/aggregators/privacy-data-class.js";
import { mapDetectorFindings } from "../../deterministic/infra/output-mapper.js";
import { FindingSchema } from "../../schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

// =============================================================================
// 1. Catalog presence
// =============================================================================

describe("privacy-data-class catalog completeness", () => {
  it("ships >= 10 PII field-name patterns", () => {
    expect(PII_FIELD_NAME_PATTERNS.length).toBeGreaterThanOrEqual(10);
  });

  it("ships >= 6 PHI field-name patterns", () => {
    expect(PHI_FIELD_NAME_PATTERNS.length).toBeGreaterThanOrEqual(6);
  });

  it("recognises >= 10 data-class vendor-extensions", () => {
    expect(DATA_CLASS_VENDOR_EXTENSIONS.size).toBeGreaterThanOrEqual(10);
    expect(DATA_CLASS_VENDOR_EXTENSIONS.has("x-pii")).toBe(true);
    expect(DATA_CLASS_VENDOR_EXTENSIONS.has("x-data-class")).toBe(true);
    expect(DATA_CLASS_VENDOR_EXTENSIONS.has("x-redact-in-audit")).toBe(true);
  });

  it("PII patterns split into high + medium confidence tiers", () => {
    const high = PII_FIELD_NAME_PATTERNS.filter((p) => p.confidence === "high");
    const med = PII_FIELD_NAME_PATTERNS.filter((p) => p.confidence === "medium");
    expect(high.length).toBeGreaterThan(0);
    expect(med.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 2. L6-1 — PII-named path/query parameters
// =============================================================================

describe("L6-1 — PII-named parameters in path/query", () => {
  it("flags `ssn` query parameter as warn", async () => {
    const spec = {
      paths: {
        "/users/lookup": {
          get: {
            parameters: [
              { name: "ssn", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-1");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("high"); // warn -> high
    expect(f?.affectedEndpoints).toHaveLength(1);
    expect(f?.affectedEndpoints[0].path).toBe("/users/lookup");
  });

  it("flags `passport_number` path parameter as warn", async () => {
    const spec = {
      paths: {
        "/citizens/{passport_number}": {
          parameters: [
            { name: "passport_number", in: "path", required: true, schema: { type: "string" } },
          ],
          get: { responses: { "200": { description: "ok" } } },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-1");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("high");
  });

  it("flags `email` query parameter as hint (medium confidence)", async () => {
    const spec = {
      paths: {
        "/search": {
          get: {
            parameters: [
              { name: "email", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find(
      (x) => x.detectorId === "walker:privacy-data-class:l6-1-medium-conf"
    );
    expect(f).toBeDefined();
    expect(f?.severity).toBe("medium"); // hint -> medium
  });

  it("does NOT flag plain `id` parameter (no PII shape)", async () => {
    const spec = {
      paths: {
        "/users/{id}": {
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          get: { responses: { "200": { description: "ok" } } },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId.startsWith("walker:privacy-data-class:l6-1"));
    expect(f).toBeUndefined();
  });

  it("does NOT flag header parameters (only path/query carry leakage risk)", async () => {
    const spec = {
      paths: {
        "/x": {
          get: {
            parameters: [
              { name: "X-Customer-Email", in: "header", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId.startsWith("walker:privacy-data-class:l6-1"));
    expect(f).toBeUndefined();
  });

  it("aggregates multiple PII-named parameters into a single finding", async () => {
    const spec = {
      paths: {
        "/a": {
          get: {
            parameters: [
              { name: "ssn", in: "query", schema: { type: "string" } },
              { name: "passport_no", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
        "/b": {
          get: {
            parameters: [
              { name: "credit_card_number", in: "query", schema: { type: "string" } },
            ],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-1");
    expect(f).toBeDefined();
    expect((f?.meta?.hitCount as number)).toBeGreaterThanOrEqual(3);
    expect(f?.affectedEndpoints.length).toBe(3);
  });
});

// =============================================================================
// 3. L6-2 — Positive marker (vendor-extension)
// =============================================================================

describe("L6-2 — vendor-extension positive marker", () => {
  it("emits info-tier finding when `x-pii` is present", async () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              email: { type: "string", "x-pii": true },
            },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-2");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("low"); // info -> low
    expect((f?.meta?.distinctKeys as string[]).includes("x-pii")).toBe(true);
  });

  it("emits info-tier finding when `x-redact-in-audit` is present (Cloudflare-style)", async () => {
    const spec = {
      paths: {
        "/users": {
          get: {
            "x-redact-in-audit": ["email", "phone"],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-2");
    expect(f).toBeDefined();
  });

  it("does NOT emit L6-2 when no annotations exist", async () => {
    const spec = {
      components: { schemas: { User: { type: "object", properties: {} } } },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-2");
    expect(f).toBeUndefined();
  });
});

// =============================================================================
// 4. L6-3 — HIPAA conservative heuristic
// =============================================================================

describe("L6-3 — HIPAA-relevance conservative heuristic", () => {
  it("fires when >= 2 PHI-shape categories appear AND no data-class annotation", async () => {
    const spec = {
      components: {
        schemas: {
          PatientChart: {
            type: "object",
            properties: {
              medical_record_number: { type: "string" },
              diagnosis_code: { type: "string" },
              prescription_id: { type: "string" },
            },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-3");
    expect(f).toBeDefined();
    expect(f?.severity).toBe("low"); // hint -> low
    expect((f?.meta?.phiHitCount as number)).toBeGreaterThanOrEqual(3);
  });

  it("does NOT fire when only ONE PHI category is present (single shape too noisy)", async () => {
    const spec = {
      components: {
        schemas: {
          AutomotiveDiagnosis: {
            type: "object",
            // Only "diagnosis_code" — could legitimately be auto-fault codes.
            properties: { diagnosis_code: { type: "string" } },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-3");
    expect(f).toBeUndefined();
  });

  it("does NOT fire when a data-class annotation exists anywhere in the spec", async () => {
    const spec = {
      components: {
        schemas: {
          PatientChart: {
            "x-data-class": "PHI",
            type: "object",
            properties: {
              medical_record_number: { type: "string" },
              diagnosis_code: { type: "string" },
            },
          },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-3");
    // Suppressed because data-class annotation present.
    expect(f).toBeUndefined();
    // L6-2 fires instead.
    const positive = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-2");
    expect(positive).toBeDefined();
  });
});

// =============================================================================
// 5. L6-4 — cross-reference marker
// =============================================================================

describe("L6-4 — cross-reference marker", () => {
  it("always emits the L6-4 cross-ref so secret-scanner coverage is auditable", async () => {
    const spec = { openapi: "3.0.0", info: { title: "Empty", version: "1.0" }, paths: {} };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-4-crossref");
    expect(f).toBeDefined();
    expect(f?.meta?.crossRefModule).toBe("secret-scanner");
    expect((f?.meta?.crossRefPatterns as string[]).includes("TM-A15")).toBe(true);
  });
});

// =============================================================================
// 6. Cycle-safety + edge cases
// =============================================================================

describe("walker robustness", () => {
  it("is cycle-safe (does not infinite-loop on self-referential structures)", async () => {
    const spec: Record<string, unknown> = { paths: {} };
    spec.self = spec;
    const findings = await walkPrivacyDataClass(spec);
    expect(Array.isArray(findings)).toBe(true);
  });

  it("handles missing paths / components gracefully", async () => {
    const findings = await walkPrivacyDataClass({});
    expect(Array.isArray(findings)).toBe(true);
  });

  it("scans path-item-level parameters (not only operation-level)", async () => {
    const spec = {
      paths: {
        "/x": {
          parameters: [
            { name: "ssn", in: "query", schema: { type: "string" } },
          ],
          get: { responses: { "200": { description: "ok" } } },
          post: { responses: { "200": { description: "ok" } } },
        },
      },
    };
    const findings = await walkPrivacyDataClass(spec);
    const f = findings.find((x) => x.detectorId === "walker:privacy-data-class:l6-1");
    expect(f).toBeDefined();
    // Both GET and POST should be marked since the param is path-item level.
    expect(f?.affectedEndpoints.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// 7. FindingSchema validation
// =============================================================================

describe("output validates against FindingSchema", () => {
  it("produces canonical Finding-shape that round-trips through output-mapper", async () => {
    const spec = {
      paths: {
        "/users/{ssn}": {
          parameters: [
            { name: "ssn", in: "path", required: true, schema: { type: "string" } },
          ],
          get: { responses: { "200": { description: "ok" } } },
        },
      },
    };
    const detectorFindings = await walkPrivacyDataClass(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);
    const llmFindings = mapDetectorFindings(detectorFindings);
    for (const f of llmFindings) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
    }
  });

  it("emits findings with non-empty title/narration/rationale within schema bounds", async () => {
    const spec = {
      paths: {
        "/x": {
          get: {
            parameters: [{ name: "passport_no", in: "query", schema: { type: "string" } }],
            responses: { "200": { description: "ok" } },
          },
        },
      },
    };
    const detectorFindings = await walkPrivacyDataClass(spec);
    const mapped = mapDetectorFindings(detectorFindings);
    expect(mapped.length).toBeGreaterThan(0);
    for (const f of mapped) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.title.length).toBeLessThanOrEqual(200);
      expect(f.narration.length).toBeGreaterThanOrEqual(50);
      expect(f.narration.length).toBeLessThanOrEqual(2000);
      expect(f.rationale.length).toBeGreaterThanOrEqual(20);
      expect(f.rationale.length).toBeLessThanOrEqual(1000);
      expect(f.patchSummary.length).toBeGreaterThanOrEqual(1);
      expect(f.patchSummary.length).toBeLessThanOrEqual(200);
    }
  });
});

// =============================================================================
// 8. Sanity-check on real example specs
// =============================================================================

const REFERENCE_SPECS = ["stripe", "pagerduty", "dnd5eapi", "openweathermap"];

describe("runs cleanly on reference specs", () => {
  for (const specName of REFERENCE_SPECS) {
    it("runs on " + specName + " without throwing and produces schema-valid output", async () => {
      const specPath = path.join(EXAMPLES_DIR, specName, "spec.json");
      if (!fs.existsSync(specPath)) {
        // Some fixtures are not checked in; skip rather than fail.
        return;
      }
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = JSON.parse(raw) as object;
      const detectorFindings = await walkPrivacyDataClass(spec);
      expect(Array.isArray(detectorFindings)).toBe(true);
      const mapped = mapDetectorFindings(detectorFindings);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    });
  }
});
