/**
 * Tests for walkRateLimitTier (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkRateLimitTier } from '../../deterministic/aggregators/info-tier-rate-limit-tier.js';

describe('walkRateLimitTier (Welle F)', () => {
  it('emits 0 findings when no operations carry x-rate-limit-tier', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': {
          get: { responses: { '200': { description: 'ok' } } },
          post: { responses: { '201': { description: 'created' } } },
        },
      },
    };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when paths are missing', async () => {
    const spec = { openapi: '3.0.0' };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when x-rate-limit-tier value is empty string', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': {
          get: { 'x-rate-limit-tier': '', responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding for an operation declaring x-rate-limit-tier as string', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': {
          get: {
            'x-rate-limit-tier': 'Tier 2',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe(
      'walker:info-tier:rate-limit-tier-metadata-presence',
    );
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.tier).toBe('Tier 2');
    expect(findings[0]?.affectedEndpoints).toContainEqual({ path: '/widgets', method: 'get' });
  });

  it('emits one finding per operation that declares the tier', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': {
          get: {
            'x-rate-limit-tier': 'Tier 1',
            responses: { '200': { description: 'ok' } },
          },
          post: {
            'x-rate-limit-tier': 'Tier 3',
            responses: { '201': { description: 'created' } },
          },
        },
        '/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(2);
    const tiers = findings.map((f) => f.meta?.tier).sort();
    expect(tiers).toEqual(['Tier 1', 'Tier 3']);
  });

  it('accepts numeric tier values', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': {
          get: {
            'x-rate-limit-tier': 2,
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkRateLimitTier(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.tier).toBe('2');
  });
});
