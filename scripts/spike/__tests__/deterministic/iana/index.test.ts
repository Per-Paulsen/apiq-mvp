import { describe, it, expect } from "vitest";
import * as iana from "../../../deterministic/iana/index.js";

describe("iana barrel re-exports", () => {
  it("re-exports all expected sub-modules in one namespace", () => {
    expect(iana.HTTP_STATUS_CODES).toBeDefined();
    expect(iana.HTTP_METHODS_REGISTRY).toBeDefined();
    expect(iana.LINK_RELATIONS).toBeDefined();
    expect(iana.CACHE_DIRECTIVES).toBeDefined();
    expect(iana.MEDIA_TOP_LEVEL_TYPES).toBeDefined();
    expect(iana.PERMANENT_FIELDS).toBeDefined();
    expect(iana.HTTP_RANGE_UNITS).toBeDefined();
  });

  it("re-exports helpers callable through the namespace", () => {
    expect(iana.isValidStatusCode(404)).toBe(true);
    expect(iana.isRegisteredMethod("GET")).toBe(true);
    expect(iana.isRegisteredLinkRelation("self")).toBe(true);
    expect(iana.isRegisteredCacheDirective("max-age")).toBe(true);
    expect(iana.isRegisteredTopLevelType("application")).toBe(true);
    expect(iana.isRegisteredField("accept")).toBe(true);
    expect(iana.isRegisteredRangeUnit("bytes")).toBe(true);
  });

  it("sub-module sets are non-empty (sanity-check on snapshot completeness)", () => {
    expect(iana.HTTP_STATUS_CODES.size).toBeGreaterThan(50);
    expect(iana.HTTP_METHODS_REGISTRY.size).toBeGreaterThan(20);
    expect(iana.LINK_RELATIONS.size).toBeGreaterThan(100);
    expect(iana.CACHE_DIRECTIVES.size).toBeGreaterThan(10);
    expect(iana.PERMANENT_FIELDS.size).toBeGreaterThan(150);
  });
});
