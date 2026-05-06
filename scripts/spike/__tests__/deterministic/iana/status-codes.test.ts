import { describe, it, expect } from "vitest";
import {
  HTTP_STATUS_CODES,
  HTTP_STATUS_PHRASE,
  HTTP_STATUS_REFERENCE,
  isValidStatusCode,
  getStatusCategory,
  getStatusPhrase,
  isUnusedOrObsoleteStatus,
} from "../../../deterministic/iana/status-codes.js";

describe("HTTP_STATUS_CODES set", () => {
  it("contains the canonical RFC 9110 codes (200, 404, 500)", () => {
    expect(HTTP_STATUS_CODES.has(200)).toBe(true);
    expect(HTTP_STATUS_CODES.has(404)).toBe(true);
    expect(HTTP_STATUS_CODES.has(500)).toBe(true);
  });

  it("includes WebDAV/extension codes (207, 423, 451)", () => {
    expect(HTTP_STATUS_CODES.has(207)).toBe(true);
    expect(HTTP_STATUS_CODES.has(423)).toBe(true);
    expect(HTTP_STATUS_CODES.has(451)).toBe(true);
  });

  it("excludes unassigned ranges (e.g. 599, 999, 0)", () => {
    expect(HTTP_STATUS_CODES.has(599)).toBe(false);
    expect(HTTP_STATUS_CODES.has(999)).toBe(false);
    expect(HTTP_STATUS_CODES.has(0)).toBe(false);
  });

  it("has phrase + reference for every code", () => {
    for (const code of HTTP_STATUS_CODES) {
      expect(HTTP_STATUS_PHRASE.get(code)).toBeTruthy();
      expect(HTTP_STATUS_REFERENCE.get(code)).toBeTruthy();
    }
  });
});

describe("isValidStatusCode helper", () => {
  it("accepts numeric and string inputs uniformly (OAS keys are strings)", () => {
    expect(isValidStatusCode(200)).toBe(true);
    expect(isValidStatusCode("200")).toBe(true);
    expect(isValidStatusCode("404")).toBe(true);
  });

  it("rejects non-numeric / out-of-range inputs", () => {
    expect(isValidStatusCode("2XX")).toBe(false);
    expect(isValidStatusCode("default")).toBe(false);
    expect(isValidStatusCode(199.5)).toBe(false);
  });
});

describe("getStatusCategory helper", () => {
  it("buckets known codes correctly", () => {
    expect(getStatusCategory(100)).toBe("1xx");
    expect(getStatusCategory(204)).toBe("2xx");
    expect(getStatusCategory(301)).toBe("3xx");
    expect(getStatusCategory(404)).toBe("4xx");
    expect(getStatusCategory(500)).toBe("5xx");
  });

  it("buckets unregistered numeric codes (apiq tolerance for custom 599)", () => {
    expect(getStatusCategory(599)).toBe("5xx");
    expect(getStatusCategory("422")).toBe("4xx");
  });

  it("returns invalid for non-numeric input", () => {
    expect(getStatusCategory("default")).toBe("invalid");
    expect(getStatusCategory("2XX")).toBe("invalid");
  });
});

describe("getStatusPhrase + isUnusedOrObsoleteStatus helpers", () => {
  it("returns the canonical reason-phrase", () => {
    expect(getStatusPhrase(200)).toBe("OK");
    expect(getStatusPhrase("418")).toBe("(Unused)");
  });

  it("flags 306 / 418 / 510 as unused-or-obsolete", () => {
    expect(isUnusedOrObsoleteStatus(306)).toBe(true);
    expect(isUnusedOrObsoleteStatus(418)).toBe(true);
    expect(isUnusedOrObsoleteStatus(510)).toBe(true);
  });

  it("does not flag everyday codes", () => {
    expect(isUnusedOrObsoleteStatus(200)).toBe(false);
    expect(isUnusedOrObsoleteStatus(404)).toBe(false);
    expect(isUnusedOrObsoleteStatus("500")).toBe(false);
  });
});
