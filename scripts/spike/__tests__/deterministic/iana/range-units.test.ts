import { describe, it, expect } from "vitest";
import {
  HTTP_RANGE_UNITS,
  isRegisteredRangeUnit,
} from "../../../deterministic/iana/range-units.js";

describe("HTTP_RANGE_UNITS set", () => {
  it("contains the canonical bytes + none tokens (RFC 9110 §14)", () => {
    expect(HTTP_RANGE_UNITS.has("bytes")).toBe(true);
    expect(HTTP_RANGE_UNITS.has("none")).toBe(true);
  });

  it("is small (only the canonical 2 entries)", () => {
    expect(HTTP_RANGE_UNITS.size).toBe(2);
  });
});

describe("isRegisteredRangeUnit helper", () => {
  it("is case-insensitive", () => {
    expect(isRegisteredRangeUnit("BYTES")).toBe(true);
    expect(isRegisteredRangeUnit("Bytes")).toBe(true);
  });

  it("rejects custom range-units (callers should warn, not error)", () => {
    expect(isRegisteredRangeUnit("items")).toBe(false);
    expect(isRegisteredRangeUnit("pages")).toBe(false);
  });
});
