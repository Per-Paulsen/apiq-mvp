import { describe, it, expect } from "vitest";
import {
  HTTP_METHODS_REGISTRY,
  SAFE_METHODS,
  IDEMPOTENT_METHODS,
  BODY_ALLOWED_METHODS,
  isRegisteredMethod,
  isSafeMethod,
  isIdempotentMethod,
  isBodyAllowedMethod,
  getMethodEntry,
} from "../../../deterministic/iana/methods.js";

describe("HTTP method registry", () => {
  it("includes all RFC 9110 core methods", () => {
    for (const m of ["GET","HEAD","POST","PUT","DELETE","CONNECT","OPTIONS","TRACE"]) {
      expect(HTTP_METHODS_REGISTRY.has(m)).toBe(true);
    }
  });

  it("includes PATCH (RFC 5789) and QUERY (httpbis safe-method-w-body)", () => {
    expect(HTTP_METHODS_REGISTRY.has("PATCH")).toBe(true);
    expect(HTTP_METHODS_REGISTRY.has("QUERY")).toBe(true);
  });

  it("includes WebDAV methods (PROPFIND, MKCOL, LOCK)", () => {
    expect(HTTP_METHODS_REGISTRY.has("PROPFIND")).toBe(true);
    expect(HTTP_METHODS_REGISTRY.has("MKCOL")).toBe(true);
    expect(HTTP_METHODS_REGISTRY.has("LOCK")).toBe(true);
  });
});

describe("safety / idempotency partition", () => {
  it("matches RFC 9110 §9.2: GET HEAD OPTIONS TRACE QUERY are safe", () => {
    for (const m of ["GET","HEAD","OPTIONS","TRACE","QUERY"]) {
      expect(SAFE_METHODS.has(m)).toBe(true);
      expect(isSafeMethod(m)).toBe(true);
      expect(isSafeMethod(m.toLowerCase())).toBe(true);
    }
  });

  it("POST/PATCH/CONNECT are NOT safe and NOT idempotent", () => {
    for (const m of ["POST","PATCH","CONNECT"]) {
      expect(isSafeMethod(m)).toBe(false);
      expect(isIdempotentMethod(m)).toBe(false);
    }
  });

  it("PUT and DELETE are idempotent but not safe", () => {
    expect(isSafeMethod("PUT")).toBe(false);
    expect(isIdempotentMethod("PUT")).toBe(true);
    expect(isSafeMethod("DELETE")).toBe(false);
    expect(isIdempotentMethod("DELETE")).toBe(true);
  });

  it("every safe method is also idempotent (RFC 9110 §9.2.2)", () => {
    for (const m of SAFE_METHODS) {
      expect(IDEMPOTENT_METHODS.has(m)).toBe(true);
    }
  });
});

describe("body-allowed semantics", () => {
  it("GET / HEAD / DELETE: body NOT allowed (OAS-3 + RFC2-8)", () => {
    expect(isBodyAllowedMethod("GET")).toBe(false);
    expect(isBodyAllowedMethod("HEAD")).toBe(false);
    expect(isBodyAllowedMethod("DELETE")).toBe(false);
  });

  it("POST / PUT / PATCH / QUERY: body allowed", () => {
    for (const m of ["POST","PUT","PATCH","QUERY"]) {
      expect(isBodyAllowedMethod(m)).toBe(true);
      expect(BODY_ALLOWED_METHODS.has(m)).toBe(true);
    }
  });
});

describe("isRegisteredMethod + getMethodEntry helpers", () => {
  it("is case-insensitive on input", () => {
    expect(isRegisteredMethod("get")).toBe(true);
    expect(isRegisteredMethod("Get")).toBe(true);
    expect(isRegisteredMethod("GET")).toBe(true);
  });

  it("rejects fictional verbs", () => {
    expect(isRegisteredMethod("FROBNICATE")).toBe(false);
  });

  it("getMethodEntry returns the full record for known methods", () => {
    const e = getMethodEntry("PATCH");
    expect(e).toBeDefined();
    expect(e!.name).toBe("PATCH");
    expect(e!.idempotent).toBe(false);
    expect(e!.bodyAllowed).toBe(true);
    expect(e!.reference).toMatch(/RFC5789/);
  });
});
