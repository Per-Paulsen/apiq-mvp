import { describe, it, expect } from "vitest";
import {
  CACHE_DIRECTIVES,
  REQUEST_CACHE_DIRECTIVES,
  RESPONSE_CACHE_DIRECTIVES,
  isRegisteredCacheDirective,
  getCacheDirectiveContext,
  isCacheDirectiveValidIn,
} from "../../../deterministic/iana/cache-directives.js";

describe("CACHE_DIRECTIVES set", () => {
  it("contains canonical RFC 9111 directives (max-age, no-cache, no-store)", () => {
    expect(CACHE_DIRECTIVES.has("max-age")).toBe(true);
    expect(CACHE_DIRECTIVES.has("no-cache")).toBe(true);
    expect(CACHE_DIRECTIVES.has("no-store")).toBe(true);
  });

  it("contains stale-* extensions (RFC 5861) and immutable (RFC 8246)", () => {
    expect(CACHE_DIRECTIVES.has("stale-if-error")).toBe(true);
    expect(CACHE_DIRECTIVES.has("stale-while-revalidate")).toBe(true);
    expect(CACHE_DIRECTIVES.has("immutable")).toBe(true);
  });

  it("does not contain made-up directives", () => {
    expect(CACHE_DIRECTIVES.has("frobnicate")).toBe(false);
    expect(CACHE_DIRECTIVES.has("")).toBe(false);
  });
});

describe("context partition (request vs response)", () => {
  it("max-stale and only-if-cached are request-only", () => {
    expect(REQUEST_CACHE_DIRECTIVES.has("max-stale")).toBe(true);
    expect(RESPONSE_CACHE_DIRECTIVES.has("max-stale")).toBe(false);
    expect(REQUEST_CACHE_DIRECTIVES.has("only-if-cached")).toBe(true);
  });

  it("public, private, s-maxage are response-only", () => {
    expect(RESPONSE_CACHE_DIRECTIVES.has("public")).toBe(true);
    expect(REQUEST_CACHE_DIRECTIVES.has("public")).toBe(false);
    expect(RESPONSE_CACHE_DIRECTIVES.has("private")).toBe(true);
    expect(RESPONSE_CACHE_DIRECTIVES.has("s-maxage")).toBe(true);
  });

  it("max-age + no-cache + no-store appear in BOTH contexts", () => {
    for (const d of ["max-age","no-cache","no-store"]) {
      expect(REQUEST_CACHE_DIRECTIVES.has(d)).toBe(true);
      expect(RESPONSE_CACHE_DIRECTIVES.has(d)).toBe(true);
    }
  });
});

describe("isRegisteredCacheDirective + getCacheDirectiveContext helpers", () => {
  it("is case-insensitive", () => {
    expect(isRegisteredCacheDirective("MAX-AGE")).toBe(true);
    expect(isRegisteredCacheDirective("No-Cache")).toBe(true);
  });

  it("getCacheDirectiveContext returns expected enum", () => {
    expect(getCacheDirectiveContext("public")).toBe("response");
    expect(getCacheDirectiveContext("min-fresh")).toBe("request");
    expect(getCacheDirectiveContext("max-age")).toBe("both");
    expect(getCacheDirectiveContext("frobnicate")).toBeUndefined();
  });
});

describe("isCacheDirectiveValidIn helper", () => {
  it("detects misuse: public in request = invalid", () => {
    expect(isCacheDirectiveValidIn("public", "request")).toBe(false);
    expect(isCacheDirectiveValidIn("public", "response")).toBe(true);
  });

  it("max-age valid in both contexts", () => {
    expect(isCacheDirectiveValidIn("max-age", "request")).toBe(true);
    expect(isCacheDirectiveValidIn("max-age", "response")).toBe(true);
  });

  it("unregistered directive invalid in any context", () => {
    expect(isCacheDirectiveValidIn("madeup", "request")).toBe(false);
    expect(isCacheDirectiveValidIn("madeup", "response")).toBe(false);
  });
});
