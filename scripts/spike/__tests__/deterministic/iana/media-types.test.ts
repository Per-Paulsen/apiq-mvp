import { describe, it, expect } from "vitest";
import {
  MEDIA_TOP_LEVEL_TYPES,
  MEDIA_STRUCTURED_SUFFIXES,
  parseMediaType,
  validateMediaType,
  isRegisteredTopLevelType,
  isRegisteredStructuredSuffix,
  isCatchAllMediaType,
} from "../../../deterministic/iana/media-types.js";

describe("MEDIA_TOP_LEVEL_TYPES set (RFC 6838)", () => {
  it("includes the standard 9 top-levels", () => {
    for (const t of ["application","audio","font","example","image","message","model","multipart","text","video"]) {
      expect(MEDIA_TOP_LEVEL_TYPES.has(t)).toBe(true);
    }
  });

  it("does not include made-up types", () => {
    expect(MEDIA_TOP_LEVEL_TYPES.has("frobnicate")).toBe(false);
  });
});

describe("parseMediaType", () => {
  it("parses simple types", () => {
    const p = parseMediaType("application/json");
    expect(p).toBeDefined();
    expect(p!.topLevel).toBe("application");
    expect(p!.subtype).toBe("json");
    expect(p!.facet).toBeUndefined();
    expect(p!.suffix).toBeUndefined();
    expect(p!.isWildcard).toBe(false);
  });

  it("detects vendor-tree (vnd.) per RFC 6838 §3.2 + structured-suffix", () => {
    const p = parseMediaType("application/vnd.acme.foo+json");
    expect(p).toBeDefined();
    expect(p!.facet).toBe("vnd");
    expect(p!.suffix).toBe("json");
  });

  it("detects personal-tree (prs.) and unregistered (x.)", () => {
    expect(parseMediaType("application/prs.foo")!.facet).toBe("prs");
    expect(parseMediaType("application/x.experimental")!.facet).toBe("x");
    expect(parseMediaType("application/x-bin")!.facet).toBe("x");
  });

  it("parses parameters and lowercases keys", () => {
    const p = parseMediaType("application/json; CharSet=utf-8; profile=\"https://x\"");
    expect(p).toBeDefined();
    expect(p!.parameters.charset).toBe("utf-8");
    expect(p!.parameters.profile).toBe("https://x");
  });

  it("flags wildcard forms", () => {
    expect(parseMediaType("*/*")!.isWildcard).toBe(true);
    expect(parseMediaType("image/*")!.isWildcard).toBe(true);
  });

  it("rejects malformed inputs", () => {
    expect(parseMediaType("")).toBeUndefined();
    expect(parseMediaType("notatype")).toBeUndefined();
    expect(parseMediaType("/")).toBeUndefined();
    expect(parseMediaType("application/")).toBeUndefined();
  });
});

describe("validateMediaType", () => {
  it("flags top-level not-registered (frobnicate/json)", () => {
    const v = validateMediaType("frobnicate/json");
    expect(v.valid).toBe(true);
    expect(v.topLevelRegistered).toBe(false);
  });

  it("approves application/vnd.acme+json fully", () => {
    const v = validateMediaType("application/vnd.acme+json");
    expect(v.valid).toBe(true);
    expect(v.topLevelRegistered).toBe(true);
    expect(v.vendorTree).toBe(true);
    expect(v.registeredSuffix).toBe(true);
  });

  it("flags malformed input as invalid (no parsed)", () => {
    const v = validateMediaType("not a media type");
    expect(v.valid).toBe(false);
    expect(v.parsed).toBeUndefined();
  });
});

describe("helpers", () => {
  it("isRegisteredTopLevelType is case-insensitive", () => {
    expect(isRegisteredTopLevelType("APPLICATION")).toBe(true);
    expect(isRegisteredTopLevelType("text")).toBe(true);
    expect(isRegisteredTopLevelType("madeup")).toBe(false);
  });

  it("isRegisteredStructuredSuffix recognises +zip, +cbor, +xml", () => {
    expect(isRegisteredStructuredSuffix("zip")).toBe(true);
    expect(isRegisteredStructuredSuffix("cbor")).toBe(true);
    expect(isRegisteredStructuredSuffix("xml")).toBe(true);
    expect(isRegisteredStructuredSuffix("madeup")).toBe(false);
  });

  it("isCatchAllMediaType only true for star-slash-star (apiq L-MIN-2 / RFC2-78)", () => {
    expect(isCatchAllMediaType("*/*")).toBe(true);
    expect(isCatchAllMediaType("image/*")).toBe(false);
    expect(isCatchAllMediaType("application/json")).toBe(false);
  });
});
