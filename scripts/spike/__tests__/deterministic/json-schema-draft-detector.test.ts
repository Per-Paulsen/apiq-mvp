/**
 * Tests for json-schema-draft-detector module (Stage A T14, Welle A).
 *
 * Validates:
 *   - OAS-version detection (3.0.x, 3.1.x, swagger-2.0, malformed, missing).
 *   - RFC2-84: 2020-12-only keywords inside an OAS 3.0 spec are flagged as error.
 *   - RFC2-85: 2020-12 keywords inside an OAS 3.1 spec without explicit
 *     jsonSchemaDialect emit a hint.
 *   - RFC2-86 / RFC2-87: porting smells (definitions, id) flagged as hints.
 *   - RFC2-88 / X4: boolean exclusiveMinimum/Maximum in 3.1 flagged as error.
 *   - RFC2-89: contentEncoding/contentMediaType in 3.0 flagged as hint.
 *   - X1: nullable:true in 3.1 flagged as warn.
 *   - X2: type:[..., null] array-form in 3.0 flagged as error.
 *   - X3: example AND examples on same node flagged as hint.
 *   - X5: top-level webhooks declared in 3.0 flagged as error.
 *   - Mixed: nullable:true AND type:[..., null] together flagged as error.
 *   - Findings survive the Finding-Schema mapper.
 *   - Detector runs cleanly against the 4 reference specs (all 3.0.x).
 *   - The keyword catalog is data-table shaped per acceptance criterion.
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectOasVersion,
  oasToBoundDraft,
  runJsonSchemaDraftDetector,
  isTwentyTwentyOnly,
  requiresDraft07OrNewer,
  KEYWORD_CATALOG,
} from "../../deterministic/classifiers/json-schema-draft-detector.js";
import { mapDetectorFindings } from "../../deterministic/infra/output-mapper.js";
import { FindingSchema } from "../../schema.js";
import type { DetectorFinding } from "../../deterministic/infra/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

function findById(findings: DetectorFinding[], detectorId: string): DetectorFinding | undefined {
  return findings.find((f) => f.detectorId === detectorId);
}

// =============================================================================
// detectOasVersion + oasToBoundDraft
// =============================================================================

describe("detectOasVersion", () => {
  it("detects OpenAPI 3.0.x", () => {
    expect(detectOasVersion({ openapi: "3.0.0" })).toEqual({ major: 3, minor: 0, patch: 0, raw: "3.0.0" });
    expect(detectOasVersion({ openapi: "3.0.3" })).toEqual({ major: 3, minor: 0, patch: 3, raw: "3.0.3" });
  });

  it("detects OpenAPI 3.1.x", () => {
    expect(detectOasVersion({ openapi: "3.1.0" })).toEqual({ major: 3, minor: 1, patch: 0, raw: "3.1.0" });
    expect(detectOasVersion({ openapi: "3.1.1" })).toEqual({ major: 3, minor: 1, patch: 1, raw: "3.1.1" });
  });

  it("detects Swagger 2.0", () => {
    const v = detectOasVersion({ swagger: "2.0" });
    expect(v).toEqual({ major: 2, minor: 0, patch: 0, raw: "2.0" });
  });

  it("returns null when openapi field is missing", () => {
    expect(detectOasVersion({})).toBeNull();
  });

  it("returns null when openapi field is malformed", () => {
    expect(detectOasVersion({ openapi: "not-a-version" })).toBeNull();
    expect(detectOasVersion({ openapi: 3.0 })).toBeNull();
  });

  it("oasToBoundDraft maps 3.0 -> draft-04-extended, 3.1 -> 2020-12", () => {
    expect(oasToBoundDraft({ major: 3, minor: 0, patch: 0, raw: "3.0.0" })).toBe("draft-04-extended");
    expect(oasToBoundDraft({ major: 3, minor: 1, patch: 0, raw: "3.1.0" })).toBe("2020-12");
  });
});

// =============================================================================
// KEYWORD_CATALOG (data-table per acceptance criterion)
// =============================================================================

describe("KEYWORD_CATALOG", () => {
  it("is shaped as a data-table of { keyword, supportedIn }", () => {
    expect(Array.isArray(KEYWORD_CATALOG)).toBe(true);
    for (const entry of KEYWORD_CATALOG) {
      expect(typeof entry.keyword).toBe("string");
      expect(Array.isArray(entry.supportedIn)).toBe(true);
      expect(entry.supportedIn.length).toBeGreaterThan(0);
    }
  });

  it("identifies $dynamicRef / prefixItems as 2020-12-only", () => {
    expect(isTwentyTwentyOnly("$dynamicRef")).toBe(true);
    expect(isTwentyTwentyOnly("prefixItems")).toBe(true);
    expect(isTwentyTwentyOnly("contentSchema")).toBe(true);
  });

  it("identifies if/then/else as draft-07+ (not in 3.0)", () => {
    expect(requiresDraft07OrNewer("if")).toBe(true);
    expect(requiresDraft07OrNewer("then")).toBe(true);
    expect(requiresDraft07OrNewer("else")).toBe(true);
  });

  it("does NOT misclassify common keywords (type, properties)", () => {
    expect(isTwentyTwentyOnly("type")).toBe(false);
    expect(isTwentyTwentyOnly("properties")).toBe(false);
  });
});

// =============================================================================
// RFC2-84 — 3.0-spec-with-2020-keyword (silent-ignore class)
// =============================================================================

describe("RFC2-84 — OAS 3.0 + 2020-12-only keywords", () => {
  it("flags unevaluatedProperties on a 3.0 spec as error (high)", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: {
            type: "object",
            properties: { id: { type: "string" } },
            unevaluatedProperties: false,
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-84");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
    expect(f1!.category).toBe("correctness");
    expect(f1!.meta?.offendingKeywords).toContain("unevaluatedProperties");
    expect(f1!.meta?.boundDraft).toBe("draft-04-extended");
  });

  it("flags multiple 2020-12 keywords (prefixItems, dependentRequired, $dynamicRef, if)", async () => {
    const spec = {
      openapi: "3.0.3",
      components: {
        schemas: {
          A: { type: "array", prefixItems: [{ type: "string" }] },
          B: { type: "object", dependentRequired: { foo: ["bar"] } },
          C: { $dynamicRef: "#node" },
          D: { type: "string", if: { minLength: 1 }, then: { maxLength: 10 } },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-84");
    expect(f1).toBeDefined();
    const offenders = f1!.meta?.offendingKeywords as string[];
    expect(offenders).toContain("prefixItems");
    expect(offenders).toContain("dependentRequired");
    expect(offenders).toContain("$dynamicRef");
    expect(offenders).toContain("if");
  });

  it("does NOT flag the SAME keywords on a 3.1 spec (3.1 binds 2020-12)", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: {
            type: "object",
            properties: { id: { type: "string" } },
            unevaluatedProperties: false,
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:rfc2-84")).toBeUndefined();
  });
});

// =============================================================================
// RFC2-85 — 3.1-spec with 2020-12 keyword + missing jsonSchemaDialect
// =============================================================================

describe("RFC2-85 — OAS 3.1 with 2020-12 keywords + missing jsonSchemaDialect", () => {
  it("flags as hint when jsonSchemaDialect is absent", async () => {
    const spec = {
      openapi: "3.1.0",
      // NOTE: no jsonSchemaDialect declared
      components: {
        schemas: {
          Foo: { type: "object", unevaluatedProperties: false },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-85");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
    expect(f1!.category).toBe("clarity");
  });

  it("does NOT flag when jsonSchemaDialect is declared explicitly", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: { type: "object", unevaluatedProperties: false },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:rfc2-85")).toBeUndefined();
  });
});

// =============================================================================
// 3.1 clean (no findings) and basic 3.0 clean
// =============================================================================

describe("clean specs", () => {
  it("3.1 spec with explicit dialect + 2020-12 keywords emits no draft-mismatch findings", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: {
            type: ["string", "null"],
            prefixItems: [{ type: "string" }],
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findings).toHaveLength(0);
  });

  it("3.0 spec without 2020-12 keywords emits no findings", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: {
            type: "object",
            properties: { id: { type: "string", nullable: true } },
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// X1 — nullable:true in 3.1 (warn)
// =============================================================================

describe("X1 — nullable:true in OAS 3.1", () => {
  it("flags nullable:true as warn (medium) in a 3.1 spec", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: { type: "string", nullable: true },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:x1");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("medium");
  });
});

// =============================================================================
// X2 — type:[..., "null"] in 3.0 (error)
// =============================================================================

describe("X2 — type-array form in OAS 3.0", () => {
  it("flags type:[string, null] as error (high) in a 3.0 spec", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: { type: ["string", "null"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:x2");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
    expect(f1!.category).toBe("correctness");
  });
});

// =============================================================================
// Mixed — nullable:true AND type:[..., null] together (error)
// =============================================================================

describe("Mixed-draft signal — nullable + type-array on same node", () => {
  it("flags as error (high) regardless of OAS version", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: { type: ["string", "null"], nullable: true },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:mixed-nullable");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
  });
});

// =============================================================================
// RFC2-88 / X4 — boolean exclusiveMin/Max in 3.1 (error)
// =============================================================================

describe("RFC2-88 / X4 — boolean exclusiveMin/Max in OAS 3.1", () => {
  it("flags boolean exclusiveMinimum:true as error in a 3.1 spec", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: { type: "integer", minimum: 0, exclusiveMinimum: true },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-88-x4");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
  });

  it("does NOT flag NUMBER form of exclusiveMinimum (the correct 3.1 syntax)", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: { type: "integer", exclusiveMinimum: 0 },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:rfc2-88-x4")).toBeUndefined();
  });
});

// =============================================================================
// RFC2-86 / RFC2-87 / RFC2-89 / X3 / X5 — porting smells
// =============================================================================

describe("RFC2-86 — definitions inside sub-schema (porting smell)", () => {
  it("flags as hint (low)", async () => {
    const spec = {
      openapi: "3.0.3",
      components: {
        schemas: {
          Foo: {
            type: "object",
            definitions: { Bar: { type: "string" } },
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-86");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
  });
});

describe("RFC2-87 — bare id keyword (draft-04 porting smell)", () => {
  it("flags id presence as hint", async () => {
    const spec = {
      openapi: "3.0.3",
      components: {
        schemas: {
          Foo: { type: "object", id: "http://example.com/foo" },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-87");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
  });

  it("draft-04 residue example: catches id on 3.1 spec too (also a porting smell)", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: { type: "object", id: "http://example.com/foo" },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-87");
    expect(f1).toBeDefined();
  });
});

describe("RFC2-89 — contentEncoding/contentMediaType in OAS 3.0", () => {
  it("flags contentEncoding on 3.0 schema as hint", async () => {
    const spec = {
      openapi: "3.0.3",
      components: {
        schemas: {
          Blob: { type: "string", contentEncoding: "base64" },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:rfc2-89");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
  });
});

describe("X3 — example AND examples on same node", () => {
  it("flags as hint", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: { type: "string", example: "a", examples: ["a", "b"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:x3");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
  });
});

describe("X5 — top-level webhooks in 3.0", () => {
  it("flags as error (high)", async () => {
    const spec = {
      openapi: "3.0.0",
      webhooks: { someEvent: { post: { responses: { "200": { description: "ok" } } } } },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:x5");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
  });

  it("does NOT fire on 3.1 (webhooks legal there)", async () => {
    const spec = {
      openapi: "3.1.0",
      webhooks: { someEvent: { post: { responses: { "200": { description: "ok" } } } } },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:x5")).toBeUndefined();
  });
});

// =============================================================================
// CL-24 (Welle D / T-Sentinels) — unconstrained multi-type schemas
// =============================================================================

describe("CL-24 — unconstrained multi-type in OAS 3.0", () => {
  it("flags type:[string, integer] in 3.0 as error (high) — multi-type without oneOf", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: { type: ["string", "integer"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:cl-24-30");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("high");
    expect(f1!.category).toBe("correctness");
    expect(f1!.meta?.patternId).toBe("CL-24");
  });

  it("does NOT flag type:[string, null] (that is X2 territory, not CL-24)", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: { type: ["string", "null"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-30")).toBeUndefined();
  });

  it("does NOT flag multi-type that is constrained by oneOf", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          Foo: {
            type: ["string", "integer"],
            oneOf: [
              { type: "string", maxLength: 10 },
              { type: "integer", minimum: 0 },
            ],
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-30")).toBeUndefined();
  });
});

describe("CL-24 — unconstrained multi-type in OAS 3.1", () => {
  it("flags type:[string, integer] in 3.1 as hint (low) — codegen-hostile", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: { type: ["string", "integer"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    const f1 = findById(findings, "module:json-schema-draft-detector:cl-24-31");
    expect(f1).toBeDefined();
    expect(f1!.severity).toBe("low");
    expect(f1!.category).toBe("design");
    expect(f1!.meta?.patternId).toBe("CL-24");
    expect(f1!.meta?.agentReadinessImpact).toBe("medium");
  });

  it("does NOT flag type:[string, null] in 3.1 (canonical nullable form)", async () => {
    const spec = {
      openapi: "3.1.0",
      jsonSchemaDialect: "https://spec.openapis.org/oas/3.1/dialect/base",
      components: {
        schemas: {
          Foo: { type: ["string", "null"] },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-31")).toBeUndefined();
  });

  it("does NOT flag multi-type with anyOf branches", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: {
            type: ["string", "integer", "boolean"],
            anyOf: [
              { type: "string" },
              { type: "integer" },
              { type: "boolean" },
            ],
          },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-31")).toBeUndefined();
  });

  it("does NOT flag single-type schemas", async () => {
    const spec = {
      openapi: "3.1.0",
      components: {
        schemas: {
          Foo: { type: "string" },
        },
      },
    };
    const findings = await runJsonSchemaDraftDetector(spec);
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-31")).toBeUndefined();
    expect(findById(findings, "module:json-schema-draft-detector:cl-24-30")).toBeUndefined();
  });
});

// =============================================================================
// Output-mapper compatibility — findings survive FindingSchema validation
// =============================================================================

describe("Finding-Schema mapper compatibility", () => {
  it("emitted findings parse cleanly through mapDetectorFindings + FindingSchema", async () => {
    const spec = {
      openapi: "3.0.0",
      components: {
        schemas: {
          A: { type: "object", unevaluatedProperties: false },
          B: { type: ["string", "null"] },
          C: { type: "string", contentEncoding: "base64" },
          D: { type: "object", id: "x" },
          E: { type: "string", example: "a", examples: ["a"] },
        },
      },
    };
    const detectorFindings = await runJsonSchemaDraftDetector(spec);
    expect(detectorFindings.length).toBeGreaterThan(0);
    const mapped = mapDetectorFindings(detectorFindings);
    // Every emitted finding must validate against FindingSchema.
    expect(mapped.length).toBe(detectorFindings.length);
    for (const m of mapped) {
      const parsed = FindingSchema.safeParse(m);
      expect(parsed.success).toBe(true);
    }
  });
});

// =============================================================================
// Sanity-check on 4 reference specs
// =============================================================================

describe("reference specs — does not throw, OAS-version detected", () => {
  const SPECS = ["openweathermap", "stripe", "github-rest", "dnd5eapi"];

  for (const name of SPECS) {
    it(`runs cleanly against ${name}`, async () => {
      const specPath = path.join(EXAMPLES_DIR, name, "spec.json");
      if (!fs.existsSync(specPath)) {
        // Skip silently if the slice is not on disk locally.
        return;
      }
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = JSON.parse(raw) as object;
      const version = detectOasVersion(spec);
      expect(version).not.toBeNull();
      expect(version!.major).toBe(3);

      const findings = await runJsonSchemaDraftDetector(spec, { specName: name });
      // Findings must validate against the FindingSchema.
      const mapped = mapDetectorFindings(findings);
      for (const m of mapped) {
        expect(FindingSchema.safeParse(m).success).toBe(true);
      }
    }, 15000);
  }
});

// =============================================================================
// Edge cases
// =============================================================================

describe("edge cases", () => {
  it("returns empty findings array for a non-spec object", async () => {
    const findings = await runJsonSchemaDraftDetector({ random: "object" });
    expect(findings).toEqual([]);
  });

  it("returns empty findings array for swagger-2 (delegated to EV-34 elsewhere)", async () => {
    const findings = await runJsonSchemaDraftDetector({ swagger: "2.0" });
    expect(findings).toEqual([]);
  });

  it("does NOT throw on cyclic schema graph", async () => {
    const a: Record<string, unknown> = { type: "object", properties: {} };
    (a.properties as Record<string, unknown>).self = a; // cycle
    const spec = { openapi: "3.0.0", components: { schemas: { A: a } } };
    await expect(runJsonSchemaDraftDetector(spec)).resolves.toBeDefined();
  });
});
