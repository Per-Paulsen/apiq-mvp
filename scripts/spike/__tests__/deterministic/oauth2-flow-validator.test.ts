/**
 * Tests for oauth2-flow-validator (T12) - RFC 9700 BCP-240 + RFC 6749 + RFC 8725
 * compliance.
 *
 * Coverage targets per the implementation-priority spec:
 *   - implicit flow flagged (error per RFC 9700 sec2.1.2)
 *   - password flow flagged (error per RFC 9700 sec2.1.2)
 *   - non-HTTPS tokenUrl flagged (error per RFC 6749 sec3.1)
 *   - missing scope description flagged (warn per RFC 6749 sec3.3)
 *   - valid authorizationCode + PKCE: no PKCE-rec finding
 *   - valid clientCredentials: no implicit/password finding
 *
 * Plus edge cases:
 *   - non-HTTPS openIdConnectUrl (TM-A6)
 *   - bearerFormat:JWT description without RFC 8725 mention (RFC2-58 / Y-8)
 *   - bearerFormat:JWT description WITH RFC 8725 mention (no finding)
 *   - dnd5eapi / no-securitySchemes spec returns []
 *   - stable output ordering
 *   - output validates against canonical FindingSchema via output-mapper
 *   - runs cleanly on all 4 reference specs
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  runOAuth2FlowValidator,
  validateOAuth2Schemes,
  OAUTH2_PATTERN_IDS,
} from "../../deterministic/oauth2-flow-validator.js";
import { mapDetectorFindings } from "../../deterministic/output-mapper.js";
import { FindingSchema } from "../../schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(SPIKE_DIR, "..", "..");
const EXAMPLES_DIR = path.join(REPO_ROOT, "openapi-examples");

// =============================================================================
// Implicit / password flow flagging (RFC 9700 BCP-240, error)
// =============================================================================

describe("validateOAuth2Schemes - implicit flow forbidden (RFC 9700 sec2.1.2)", () => {
  it("flags implicit flow as error", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              implicit: {
                authorizationUrl: "https://example.com/auth",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const implicit = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.IMPLICIT_FORBIDDEN,
    );
    expect(implicit).toHaveLength(1);
    expect(implicit[0].severity).toBe("error");
    expect(implicit[0].lenses).toContain("threat-modeling");
    expect(implicit[0].lenses).toContain("standards-compliance");
    expect(implicit[0].schemeName).toBe("oauth");
    expect(implicit[0].flowName).toBe("implicit");
  });
});

describe("validateOAuth2Schemes - password flow forbidden (RFC 9700 sec2.1.2)", () => {
  it("flags password flow as error", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              password: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const pwd = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.PASSWORD_FORBIDDEN,
    );
    expect(pwd).toHaveLength(1);
    expect(pwd[0].severity).toBe("error");
    expect(pwd[0].lenses).toContain("threat-modeling");
    expect(pwd[0].schemeName).toBe("oauth");
  });
});

// =============================================================================
// HTTPS requirement on flow URLs (RFC 6749 sec3.1, error)
// =============================================================================

describe("validateOAuth2Schemes - HTTPS required on flow URLs (RFC 6749 sec3.1)", () => {
  it("flags non-HTTPS tokenUrl as error", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "http://example.com/token",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const https = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.HTTPS_REQUIRED,
    );
    expect(https).toHaveLength(1);
    expect(https[0].severity).toBe("error");
    expect(https[0].sourcePath).toContain("tokenUrl");
    expect(https[0].detail).toContain("http://");
  });

  it("flags non-HTTPS authorizationUrl AND tokenUrl independently", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "http://example.com/auth",
                tokenUrl: "http://example.com/token",
                description: "Uses PKCE / S256.",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const https = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.HTTPS_REQUIRED,
    );
    expect(https).toHaveLength(2);
  });

  it("does NOT flag HTTPS tokenUrl", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const https = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.HTTPS_REQUIRED,
    );
    expect(https).toHaveLength(0);
  });
});

// =============================================================================
// Scope descriptions required (RFC 6749 sec3.3, warn)
// =============================================================================

describe("validateOAuth2Schemes - scopes MUST have descriptions (RFC 6749 sec3.3)", () => {
  it("flags scope with empty description", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "", write: "Write access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const scope = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.SCOPE_DESCRIPTIONS_REQUIRED,
    );
    expect(scope).toHaveLength(1);
    expect(scope[0].severity).toBe("warn");
    expect(scope[0].detail).toBe("read");
  });

  it("flags scope with whitespace-only description", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "   " },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const scope = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.SCOPE_DESCRIPTIONS_REQUIRED,
    );
    expect(scope).toHaveLength(1);
  });
});

// =============================================================================
// PKCE recommendation (RFC 9700 sec2.1, warn)
// =============================================================================

describe("validateOAuth2Schemes - authorizationCode SHOULD declare PKCE (RFC 9700)", () => {
  it("emits PKCE-recommended finding when authorizationCode flow lacks PKCE mention", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://example.com/auth",
                tokenUrl: "https://example.com/token",
                refreshUrl: "https://example.com/refresh",
                description: "Standard OAuth2 authorization code flow.",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const pkce = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED,
    );
    expect(pkce).toHaveLength(1);
    expect(pkce[0].severity).toBe("warn");
  });

  it("valid authorizationCode + PKCE: no PKCE-rec finding when description mentions PKCE", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://example.com/auth",
                tokenUrl: "https://example.com/token",
                refreshUrl: "https://example.com/refresh",
                description: "OAuth2 authorization-code flow with PKCE (S256).",
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const pkce = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED,
    );
    expect(pkce).toHaveLength(0);
  });

  it("valid authorizationCode + PKCE: no PKCE-rec finding when x-usePkce extension is true", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://example.com/auth",
                tokenUrl: "https://example.com/token",
                refreshUrl: "https://example.com/refresh",
                "x-usePkce": true,
                scopes: { read: "Read access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const pkce = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED,
    );
    expect(pkce).toHaveLength(0);
  });
});

// =============================================================================
// clientCredentials valid case
// =============================================================================

describe("validateOAuth2Schemes - valid clientCredentials", () => {
  it("valid clientCredentials: no implicit / password / PKCE / refreshUrl findings", () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "Read access", write: "Write access" },
              },
            },
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    expect(
      issues.find(
        (i) => i.patternId === OAUTH2_PATTERN_IDS.IMPLICIT_FORBIDDEN,
      ),
    ).toBeUndefined();
    expect(
      issues.find(
        (i) => i.patternId === OAUTH2_PATTERN_IDS.PASSWORD_FORBIDDEN,
      ),
    ).toBeUndefined();
    expect(
      issues.find(
        (i) => i.patternId === OAUTH2_PATTERN_IDS.PKCE_RECOMMENDED,
      ),
    ).toBeUndefined();
    expect(
      issues.find(
        (i) => i.patternId === OAUTH2_PATTERN_IDS.REFRESH_URL_RECOMMENDED,
      ),
    ).toBeUndefined();
    expect(
      issues.find(
        (i) => i.patternId === OAUTH2_PATTERN_IDS.HTTPS_REQUIRED,
      ),
    ).toBeUndefined();
  });
});

// =============================================================================
// openIdConnect HTTPS (TM-A6)
// =============================================================================

describe("validateOAuth2Schemes - openIdConnect URL must be HTTPS (TM-A6)", () => {
  it("flags non-HTTPS openIdConnectUrl as error", () => {
    const spec = {
      components: {
        securitySchemes: {
          oidc: {
            type: "openIdConnect",
            openIdConnectUrl: "http://example.com/.well-known/openid-configuration",
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const oidc = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.OIDC_HTTPS_REQUIRED,
    );
    expect(oidc).toHaveLength(1);
    expect(oidc[0].severity).toBe("error");
  });

  it("does NOT flag HTTPS openIdConnectUrl", () => {
    const spec = {
      components: {
        securitySchemes: {
          oidc: {
            type: "openIdConnect",
            openIdConnectUrl: "https://example.com/.well-known/openid-configuration",
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    expect(issues).toHaveLength(0);
  });
});

// =============================================================================
// bearerFormat:JWT description should mention RFC 8725 (RFC2-58 / Y-8)
// =============================================================================

describe("validateOAuth2Schemes - bearerFormat:JWT description SHOULD mention RFC 8725", () => {
  it("flags bearer JWT scheme without RFC 8725 mention", () => {
    const spec = {
      components: {
        securitySchemes: {
          bearerJwt: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Use a bearer token to authenticate.",
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const jwt = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.JWT_RFC8725_MENTION,
    );
    expect(jwt).toHaveLength(1);
    expect(jwt[0].severity).toBe("warn");
  });

  it("does NOT flag when description mentions RFC 8725", () => {
    const spec = {
      components: {
        securitySchemes: {
          bearerJwt: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Use a bearer JWT signed with RS256. Tokens with alg none are rejected per RFC 8725.",
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const jwt = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.JWT_RFC8725_MENTION,
    );
    expect(jwt).toHaveLength(0);
  });

  it("does NOT flag bearer scheme without bearerFormat: JWT", () => {
    const spec = {
      components: {
        securitySchemes: {
          bearerOpaque: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "opaque",
          },
        },
      },
    };
    const issues = validateOAuth2Schemes(spec);
    const jwt = issues.filter(
      (i) => i.patternId === OAUTH2_PATTERN_IDS.JWT_RFC8725_MENTION,
    );
    expect(jwt).toHaveLength(0);
  });
});

// =============================================================================
// Empty / edge cases
// =============================================================================

describe("validateOAuth2Schemes - empty / edge cases", () => {
  it("returns no issues for spec with no components", () => {
    const spec = { openapi: "3.0.0", paths: {} };
    expect(validateOAuth2Schemes(spec)).toEqual([]);
  });

  it("returns no issues for spec with no securitySchemes", () => {
    const spec = { openapi: "3.0.0", components: {} };
    expect(validateOAuth2Schemes(spec)).toEqual([]);
  });

  it("returns no issues for spec with only apiKey schemes (dnd5eapi-style)", () => {
    const spec = {
      components: {
        securitySchemes: {
          apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        },
      },
    };
    expect(validateOAuth2Schemes(spec)).toEqual([]);
  });
});

// =============================================================================
// FindingSchema validation
// =============================================================================

describe("runOAuth2FlowValidator - output validates against FindingSchema", () => {
  it("produces canonical Finding-shape that round-trips through output-mapper", async () => {
    const spec = {
      components: {
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              implicit: {
                authorizationUrl: "http://insecure.example.com/auth",
                scopes: { read: "" },
              },
              password: {
                tokenUrl: "https://example.com/token",
                scopes: { write: "Write access" },
              },
            },
          },
        },
      },
    };
    const detectorFindings = await runOAuth2FlowValidator(spec);
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
        securitySchemes: {
          oauth: {
            type: "oauth2",
            flows: {
              implicit: {
                authorizationUrl: "https://example.com/auth",
                scopes: { read: "Read" },
              },
            },
          },
        },
      },
    };
    const detectorFindings = await runOAuth2FlowValidator(spec);
    const llm = mapDetectorFindings(detectorFindings);
    expect(llm.length).toBeGreaterThan(0);
    for (const f of llm) {
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
// Stable ordering
// =============================================================================

describe("validateOAuth2Schemes - stable output ordering", () => {
  it("emits issues sorted by sourcePath for reproducibility", () => {
    const spec = {
      components: {
        securitySchemes: {
          z_oauth: {
            type: "oauth2",
            flows: {
              implicit: {
                authorizationUrl: "https://example.com/auth",
                scopes: { read: "Read" },
              },
            },
          },
          a_oauth: {
            type: "oauth2",
            flows: {
              password: {
                tokenUrl: "https://example.com/token",
                scopes: { read: "Read" },
              },
            },
          },
        },
      },
    };
    const issues1 = validateOAuth2Schemes(spec);
    const issues2 = validateOAuth2Schemes(spec);
    expect(issues1.map((i) => i.sourcePath)).toEqual(
      issues2.map((i) => i.sourcePath),
    );
    // Sorted ascending by sourcePath
    const paths = issues1.map((i) => i.sourcePath);
    const sortedPaths = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sortedPaths);
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
        return;
      }
      const raw = fs.readFileSync(specPath, "utf8");
      const spec = JSON.parse(raw) as object;

      const findings = await runOAuth2FlowValidator(spec, { specName });
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 30_000);
  }
});

