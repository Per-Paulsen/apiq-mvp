import { describe, it, expect } from "vitest";
import {
  PERMANENT_FIELDS,
  PROVISIONAL_FIELDS,
  DEPRECATED_FIELDS,
  OBSOLETED_FIELDS,
  isRegisteredField,
  getFieldStatus,
  isValidFieldNameSyntax,
  validateFieldName,
} from "../../../deterministic/iana/field-names.js";

describe("PERMANENT_FIELDS set", () => {
  it("includes RFC 9110 baseline fields (Accept, Authorization, Content-Type)", () => {
    expect(PERMANENT_FIELDS.has("Accept")).toBe(true);
    expect(PERMANENT_FIELDS.has("Authorization")).toBe(true);
    expect(PERMANENT_FIELDS.has("Content-Type")).toBe(true);
  });

  it("includes Allow + Retry-After + WWW-Authenticate (used by http-protocol-pairings)", () => {
    expect(PERMANENT_FIELDS.has("Allow")).toBe(true);
    expect(PERMANENT_FIELDS.has("Retry-After")).toBe(true);
    expect(PERMANENT_FIELDS.has("WWW-Authenticate")).toBe(true);
  });
});

describe("status partitions", () => {
  it("flags deprecated fields (Accept-Charset, Pragma)", () => {
    expect(DEPRECATED_FIELDS.has("Accept-Charset")).toBe(true);
    expect(DEPRECATED_FIELDS.has("Pragma")).toBe(true);
  });

  it("flags obsoleted fields (Set-Cookie2, Warning, Public, X-XSS-Protection)", () => {
    expect(OBSOLETED_FIELDS.has("Set-Cookie2")).toBe(true);
    expect(OBSOLETED_FIELDS.has("Warning")).toBe(true);
    expect(OBSOLETED_FIELDS.has("X-XSS-Protection")).toBe(true);
  });

  it("flags provisional fields (Permissions-Policy, Sec-GPC)", () => {
    expect(PROVISIONAL_FIELDS.has("Permissions-Policy")).toBe(true);
    expect(PROVISIONAL_FIELDS.has("Sec-GPC")).toBe(true);
  });
});

describe("isRegisteredField + getFieldStatus helpers", () => {
  it("is case-insensitive (RFC 9110 §5.1)", () => {
    expect(isRegisteredField("accept")).toBe(true);
    expect(isRegisteredField("ACCEPT")).toBe(true);
    expect(isRegisteredField("Content-TYPE")).toBe(true);
  });

  it("returns the right status enum", () => {
    expect(getFieldStatus("accept")).toBe("permanent");
    expect(getFieldStatus("sec-gpc")).toBe("provisional");
    expect(getFieldStatus("pragma")).toBe("deprecated");
    expect(getFieldStatus("warning")).toBe("obsoleted");
    expect(getFieldStatus("X-Frobnicator")).toBe("unregistered");
  });
});

describe("validateFieldName + isValidFieldNameSyntax", () => {
  it("accepts RFC 9110 §5.1 token chars", () => {
    expect(isValidFieldNameSyntax("X-Custom-Header")).toBe(true);
    expect(isValidFieldNameSyntax("Custom-Field-1")).toBe(true);
  });

  it("rejects whitespace and disallowed chars", () => {
    expect(isValidFieldNameSyntax("My Field")).toBe(false);
    expect(isValidFieldNameSyntax("")).toBe(false);
    expect(isValidFieldNameSyntax("X:Y")).toBe(false);
  });

  it("validateFieldName flags RFC 6648 X- prefix", () => {
    const r = validateFieldName("X-Custom");
    expect(r.validSyntax).toBe(true);
    expect(r.deprecatedXPrefix).toBe(true);
    expect(r.status).toBe("unregistered");
  });

  it("validateFieldName aggregates grammar + registry-status + X-prefix in one call", () => {
    const r = validateFieldName("X-Frame-Options");
    expect(r.validSyntax).toBe(true);
    expect(r.deprecatedXPrefix).toBe(true);
    expect(r.status).toBe("permanent"); // X-Frame-Options is registered

  });
});
