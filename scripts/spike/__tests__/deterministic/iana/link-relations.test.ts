import { describe, it, expect } from "vitest";
import {
  LINK_RELATIONS,
  isRegisteredLinkRelation,
  isValidLinkRelationToken,
} from "../../../deterministic/iana/link-relations.js";

describe("LINK_RELATIONS set", () => {
  it("contains commonly-used IANA relations (next, prev, self, related)", () => {
    expect(LINK_RELATIONS.has("next")).toBe(true);
    expect(LINK_RELATIONS.has("prev")).toBe(true);
    expect(LINK_RELATIONS.has("self")).toBe(true);
    expect(LINK_RELATIONS.has("related")).toBe(true);
  });

  it("includes pagination + service-discovery relations (first, last, service-desc)", () => {
    expect(LINK_RELATIONS.has("first")).toBe(true);
    expect(LINK_RELATIONS.has("last")).toBe(true);
    expect(LINK_RELATIONS.has("service-desc")).toBe(true);
  });

  it("contains 100+ entries (133 at snapshot date)", () => {
    expect(LINK_RELATIONS.size).toBeGreaterThanOrEqual(100);
  });
});

describe("isRegisteredLinkRelation helper", () => {
  it("returns true for IANA-registered relations", () => {
    expect(isRegisteredLinkRelation("alternate")).toBe(true);
    expect(isRegisteredLinkRelation("canonical")).toBe(true);
  });

  it("returns false for unknown / made-up relations", () => {
    expect(isRegisteredLinkRelation("frobnicate")).toBe(false);
    expect(isRegisteredLinkRelation("")).toBe(false);
  });

  it("is case-sensitive (registry stores lowercase per RFC 8288 §2.1)", () => {
    expect(isRegisteredLinkRelation("NEXT")).toBe(false);
    expect(isRegisteredLinkRelation("Self")).toBe(false);
  });
});

describe("isValidLinkRelationToken helper (RFC 8288 §2.1)", () => {
  it("accepts registered relation names", () => {
    expect(isValidLinkRelationToken("next")).toBe(true);
    expect(isValidLinkRelationToken("self")).toBe(true);
  });

  it("accepts absolute URI-form rel-tokens", () => {
    expect(isValidLinkRelationToken("http://example.com/rels/foo")).toBe(true);
    expect(isValidLinkRelationToken("https://api.example/rels#bar")).toBe(true);
    expect(isValidLinkRelationToken("urn:example:rels:bar")).toBe(true);
  });

  it("rejects unregistered bare-tokens AND syntactically-invalid URIs", () => {
    expect(isValidLinkRelationToken("madeup-relation")).toBe(false);
    expect(isValidLinkRelationToken("http with space")).toBe(false);
    expect(isValidLinkRelationToken("")).toBe(false);
  });
});
