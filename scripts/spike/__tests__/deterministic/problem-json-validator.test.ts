/**
 * Tests for the problem-json-validator Module (Task T11, Wave 2).
 *
 * Covers RFC 9457 / 7807 conformance + apiq-USP RFC2-5 cross-class
 * type-URI uniqueness check.
 *
 * Test cases:
 *   1. RFC2-1 - declared problem+json without `type` -> error finding
 *   2. RFC2-1 - declared problem+json without `title`/`status` -> warn findings
 *   3. RFC2-2 - non-URI `type` value (free-form string) -> error finding
 *   4. RFC2-2 - non-URI in enum -> error finding
 *   5. RFC2-3 - `status` example mismatches HTTP status key -> error finding
 *   6. RFC2-4 - reserved `status` member redeclared as string -> error finding
 *   7. RFC2-5 (apiq-USP) - same type-URI declared on 2 distinct problem-classes -> finding
 *   8. RFC2-5 - same type-URI used identically across ops -> NO finding (not a collision)
 *   9. EV-11 / K2 - many ad-hoc error-shapes, no problem+json -> warn finding
 *  10. EV-11 - few error-shapes -> NO finding (below threshold)
 *  11. EV-11 - error-shapes plus problem+json declaration -> NO finding
 *  12. Output validates against FindingSchema (via output-mapper)
 *  13. Empty / no-paths spec -> empty result
 *  14. Internal isUriLike helper recognises common URI forms
 */

import { describe, it, expect } from "vitest";
import {
  validateProblemJson,
  __test__,
} from "../../deterministic/problem-json-validator.js";
import { mapDetectorFinding } from "../../deterministic/output-mapper.js";

const { isUriLike } = __test__;

// =============================================================================
// Spec builders
// =============================================================================

function specWithResponses(
  responses: Record<string, Record<string, unknown>>,
  path = "/items",
  method = "get"
): object {
  return {
    openapi: "3.0.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      [path]: {
        [method]: {
          responses,
        },
      },
    },
  };
}

function problemJsonResponse(schema: Record<string, unknown>): Record<string, unknown> {
  return {
    description: "Problem-Details response",
    content: {
      "application/problem+json": { schema },
    },
  };
}

function adhocErrorResponse(
  schema: Record<string, unknown>
): Record<string, unknown> {
  return {
    description: "Ad-hoc error response",
    content: {
      "application/json": { schema },
    },
  };
}

// =============================================================================
// isUriLike helper tests
// =============================================================================

describe("isUriLike", () => {
  it("accepts about:blank, absolute URIs, relative paths", () => {
    expect(isUriLike("about:blank")).toBe(true);
    expect(isUriLike("https://example.com/probs/test")).toBe(true);
    expect(isUriLike("http://example.com/x")).toBe(true);
    expect(isUriLike("urn:example:foo")).toBe(true);
    expect(isUriLike("tag:example.com,2024:bar")).toBe(true);
    expect(isUriLike("/relative/path")).toBe(true);
    expect(isUriLike("./relative")).toBe(true);
  });

  it("rejects non-URI strings", () => {
    expect(isUriLike("invalid_request")).toBe(false);
    expect(isUriLike("ERROR_42")).toBe(false);
    expect(isUriLike("")).toBe(false);
    expect(isUriLike("   ")).toBe(false);
    expect(isUriLike("has space")).toBe(false);
    expect(isUriLike("plain-text")).toBe(false);
  });
});

// =============================================================================
// validateProblemJson tests
// =============================================================================

describe("validateProblemJson", () => {
  it("RFC2-1: flags declared problem+json schema missing the REQUIRED `type` property", async () => {
    const spec = specWithResponses({
      "400": problemJsonResponse({
        type: "object",
        properties: {
          // type missing
          title: { type: "string" },
          detail: { type: "string" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const f = findings.find((x) => x.meta?.rule === "RFC2-1" && /missing.*type/i.test(x.title + x.narration));
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
  });

  it("RFC2-1: flags declared problem+json schema missing SHOULD-supply title and status", async () => {
    const spec = specWithResponses({
      "400": problemJsonResponse({
        type: "object",
        properties: {
          type: { type: "string", format: "uri", example: "https://example.com/probs/x" },
          // title and status missing
          detail: { type: "string" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const titleMissing = findings.find((x) => x.meta?.rule === "RFC2-1" && /title/.test(x.narration));
    const statusMissing = findings.find((x) => x.meta?.rule === "RFC2-1" && /status/.test(x.narration));
    expect(titleMissing).toBeDefined();
    expect(statusMissing).toBeDefined();
    expect(titleMissing!.severity).toBe("medium");
    expect(statusMissing!.severity).toBe("medium");
  });

  it("RFC2-2: flags non-URI `type` example value", async () => {
    const spec = specWithResponses({
      "400": problemJsonResponse({
        type: "object",
        properties: {
          type: { type: "string", example: "invalid_request" }, // NOT a URI
          title: { type: "string" },
          status: { type: "integer" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const f = findings.find((x) => x.meta?.rule === "RFC2-2");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
    expect(f!.narration).toMatch(/invalid_request/);
  });

  it("RFC2-2: flags non-URI value inside enum", async () => {
    const spec = specWithResponses({
      "400": problemJsonResponse({
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["https://errors.example.com/x", "NOT_A_URI", "another_bad"],
          },
          title: { type: "string" },
          status: { type: "integer" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const enumViolations = findings.filter((x) => x.meta?.rule === "RFC2-2");
    expect(enumViolations.length).toBeGreaterThan(0);
    const all = enumViolations.map((x) => x.narration).join(" ");
    expect(all).toMatch(/NOT_A_URI|another_bad/);
  });

  it("RFC2-3: flags `status` example mismatching the HTTP response key", async () => {
    const spec = specWithResponses({
      "404": problemJsonResponse({
        type: "object",
        properties: {
          type: { type: "string", example: "https://example.com/probs/missing" },
          title: { type: "string" },
          status: { type: "integer", example: 400 }, // mismatches 404
          detail: { type: "string" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const f = findings.find((x) => x.meta?.rule === "RFC2-3");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
    expect(f!.category).toBe("correctness");
    expect(f!.narration).toMatch(/400/);
    expect(f!.narration).toMatch(/404/);
  });

  it("RFC2-4: flags reserved member redeclared with non-conforming type", async () => {
    const spec = specWithResponses({
      "500": problemJsonResponse({
        type: "object",
        properties: {
          type: { type: "string", example: "https://example.com/probs/server" },
          title: { type: "string" },
          status: { type: "string" }, // RFC9457 reserves status as integer
          detail: { type: "string" },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    const f = findings.find((x) => x.meta?.rule === "RFC2-4");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("high");
    expect(f!.narration).toMatch(/status/);
  });

  it("RFC2-5 (apiq-USP): flags same `type` URI declared on 2 structurally-distinct problem-classes", async () => {
    // Two operations both declaring problem+json schemas that share the same
    // type-URI but with structurally-different shapes (different titles +
    // different status-values + different property-sets). RFC 9457 Section 4:
    // each problem type SHOULD be registered under a unique URI.
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: {
            responses: {
              "404": problemJsonResponse({
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    example: "https://api.example.com/errors/resource-missing",
                  },
                  title: { type: "string", example: "User not found" },
                  status: { type: "integer", example: 404 },
                  detail: { type: "string" },
                  userId: { type: "string" },
                },
              }),
            },
          },
        },
        "/orders": {
          post: {
            responses: {
              "402": problemJsonResponse({
                // Same type URI, but completely different problem-class
                // (different title, different status-value, different shape).
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    example: "https://api.example.com/errors/resource-missing",
                  },
                  title: { type: "string", example: "Payment required" },
                  status: { type: "integer", example: 402 },
                  detail: { type: "string" },
                  invoiceId: { type: "string" },
                  amountDue: { type: "number" },
                },
              }),
            },
          },
        },
      },
    };

    const findings = await validateProblemJson(spec);
    const usp = findings.find((x) => x.meta?.rule === "RFC2-5");
    expect(usp).toBeDefined();
    expect(usp!.meta!.usp).toBe(true);
    expect(usp!.meta!.typeUri).toBe("https://api.example.com/errors/resource-missing");
    expect(usp!.meta!.variantCount).toBe(2);
    expect(usp!.severity).toBe("high");
    expect(usp!.narration).toMatch(/cross-class type-URI uniqueness/);
    expect(usp!.narration).toMatch(/no mature linter/);
  });

  it("RFC2-5: does NOT flag when the same URI carries identical shapes across operations", async () => {
    const sharedSchema = {
      type: "object",
      properties: {
        type: {
          type: "string",
          example: "https://api.example.com/errors/not-found",
        },
        title: { type: "string", example: "Resource not found" },
        status: { type: "integer", example: 404 },
        detail: { type: "string" },
      },
    };
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/users/{id}": {
          get: { responses: { "404": problemJsonResponse(sharedSchema) } },
        },
        "/orders/{id}": {
          get: { responses: { "404": problemJsonResponse(sharedSchema) } },
        },
      },
    };

    const findings = await validateProblemJson(spec);
    const usp = findings.find((x) => x.meta?.rule === "RFC2-5");
    expect(usp).toBeUndefined();
  });

  it("EV-11 / K2: flags spec with many ad-hoc error-shapes and no problem+json", async () => {
    // 4 operations, each with a distinct ad-hoc error-shape on a 4xx/5xx
    // response. None declares application/problem+json. Should fire EV-11.
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/a": {
          get: {
            responses: {
              "400": adhocErrorResponse({
                type: "object",
                properties: {
                  errorCode: { type: "integer" },
                  errorMessage: { type: "string" },
                },
              }),
            },
          },
        },
        "/b": {
          post: {
            responses: {
              "403": adhocErrorResponse({
                type: "object",
                properties: {
                  message: { type: "string" },
                  reason: { type: "string" },
                },
              }),
            },
          },
        },
        "/c": {
          get: {
            responses: {
              "500": adhocErrorResponse({
                type: "object",
                properties: {
                  fault: { type: "string" },
                  trace: { type: "string" },
                },
              }),
            },
          },
        },
        "/d": {
          get: {
            responses: {
              "404": adhocErrorResponse({
                type: "object",
                properties: {
                  notFoundReason: { type: "string" },
                },
              }),
            },
          },
        },
      },
    };

    const findings = await validateProblemJson(spec);
    const ev11 = findings.find((x) => x.meta?.rule === "EV-11");
    expect(ev11).toBeDefined();
    expect(ev11!.severity).toBe("medium");
    expect(ev11!.meta!.distinctShapeCount).toBeGreaterThanOrEqual(3);
    expect(ev11!.narration).toMatch(/problem\+json|application\/problem\+json/);
  });

  it("EV-11: does NOT flag spec with few error-shapes", async () => {
    const spec = specWithResponses({
      "400": adhocErrorResponse({
        type: "object",
        properties: { error: { type: "string" } },
      }),
    });

    const findings = await validateProblemJson(spec);
    const ev11 = findings.find((x) => x.meta?.rule === "EV-11");
    expect(ev11).toBeUndefined();
  });

  it("EV-11: does NOT flag spec when at least one response declares problem+json", async () => {
    // Many ad-hoc shapes, BUT one of them is problem+json -> spec is at least
    // partially RFC 9457 conformant; EV-11 is suppressed.
    const spec = {
      openapi: "3.0.0",
      info: { title: "Test", version: "1.0.0" },
      paths: {
        "/a": {
          get: {
            responses: {
              "400": problemJsonResponse({
                type: "object",
                properties: {
                  type: { type: "string", example: "https://example.com/probs/a" },
                  title: { type: "string" },
                  status: { type: "integer", example: 400 },
                },
              }),
            },
          },
        },
        "/b": {
          get: {
            responses: {
              "500": adhocErrorResponse({
                type: "object",
                properties: { fault: { type: "string" } },
              }),
            },
          },
        },
        "/c": {
          get: {
            responses: {
              "404": adhocErrorResponse({
                type: "object",
                properties: { reason: { type: "string" } },
              }),
            },
          },
        },
      },
    };

    const findings = await validateProblemJson(spec);
    const ev11 = findings.find((x) => x.meta?.rule === "EV-11");
    expect(ev11).toBeUndefined();
  });

  it("emits findings that validate against FindingSchema (via output-mapper)", async () => {
    const spec = specWithResponses({
      "400": problemJsonResponse({
        type: "object",
        properties: {
          type: { type: "string", example: "NOT_A_URI" },
          title: { type: "string" },
          status: { type: "integer", example: 400 },
        },
      }),
    });

    const findings = await validateProblemJson(spec);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(() => mapDetectorFinding(f)).not.toThrow();
    }
  });

  it("empty spec produces no findings", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "Empty", version: "1.0.0" },
      paths: {},
    };
    const findings = await validateProblemJson(spec);
    expect(findings).toEqual([]);
  });

  it("spec with no responses produces no findings", async () => {
    const spec = {
      openapi: "3.0.0",
      info: { title: "None", version: "1.0.0" },
      paths: {
        "/x": {
          get: {
            // no responses field
          },
        },
      },
    };
    const findings = await validateProblemJson(spec);
    expect(findings).toEqual([]);
  });
});
