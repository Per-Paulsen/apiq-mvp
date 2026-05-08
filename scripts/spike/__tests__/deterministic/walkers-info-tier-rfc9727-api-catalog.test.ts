/**
 * Tests for walkRfc9727ApiCatalog (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkRfc9727ApiCatalog } from '../../deterministic/walkers/info-tier-rfc9727-api-catalog.js';

describe('walkRfc9727ApiCatalog (Welle F)', () => {
  it('emits 0 findings when no /.well-known/api-catalog path', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when paths is missing', async () => {
    const spec = { openapi: '3.0.0' };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT match /.well-known/api-catalog-extra (strict)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/api-catalog-extra': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT match /api-catalog (without .well-known prefix)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/api-catalog': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding for /.well-known/api-catalog', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/api-catalog': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:info-tier:rfc-9727-api-catalog-presence');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.rfc).toBe(9727);
    expect(findings[0]?.title).toContain('RFC 9727');
  });

  it('matches with trailing slash', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/api-catalog/': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9727ApiCatalog(spec);
    expect(findings).toHaveLength(1);
  });
});
