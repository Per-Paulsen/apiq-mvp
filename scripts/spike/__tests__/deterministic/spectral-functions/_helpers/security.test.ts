import { describe, it, expect } from 'vitest';
import { effectiveSecurityFor } from '../../../../deterministic/spectral-functions/_helpers/security.js';

describe('security helper — effectiveSecurityFor', () => {
  it('detects operation-level non-empty security', () => {
    const op = { security: [{ bearer: [] }] };
    const doc = {};
    const e = effectiveSecurityFor(op, doc);
    expect(e.hasOperationLevel).toBe(true);
    expect(e.isEmpty).toBe(false);
    expect(e.hasSpecLevel).toBe(false);
    expect(e.schemes).toEqual(['bearer']);
  });

  it('detects intentional opt-out (op.security: [])', () => {
    const op = { security: [] };
    const doc = { security: [{ apiKey: [] }] };
    const e = effectiveSecurityFor(op, doc);
    expect(e.hasOperationLevel).toBe(false);
    expect(e.isEmpty).toBe(true);
    expect(e.hasSpecLevel).toBe(true);
    expect(e.schemes).toEqual(['apiKey']);
  });

  it('detects spec-level fallback when op has no security key', () => {
    const op = {};
    const doc = { security: [{ oauth2: ['read'] }] };
    const e = effectiveSecurityFor(op, doc);
    expect(e.hasOperationLevel).toBe(false);
    expect(e.isEmpty).toBe(false);
    expect(e.hasSpecLevel).toBe(true);
    expect(e.schemes).toEqual(['oauth2']);
  });

  it('returns all-false when neither has security', () => {
    expect(effectiveSecurityFor({}, {})).toEqual({
      hasOperationLevel: false,
      hasSpecLevel: false,
      isEmpty: false,
      schemes: [],
    });
  });

  it('unions scheme-names from op + doc requirement objects (deduped)', () => {
    const op = { security: [{ bearer: [] }, { apiKey: [] }] };
    const doc = { security: [{ bearer: [] }, { oauth2: ['read'] }] };
    const e = effectiveSecurityFor(op, doc);
    expect(e.schemes.sort()).toEqual(['apiKey', 'bearer', 'oauth2']);
  });

  it('tolerates non-object op / doc and non-array security values', () => {
    expect(effectiveSecurityFor(null, null).hasOperationLevel).toBe(false);
    expect(effectiveSecurityFor({ security: 'invalid' }, {}).hasOperationLevel).toBe(false);
    expect(effectiveSecurityFor({}, { security: 'invalid' }).hasSpecLevel).toBe(false);
  });
});
