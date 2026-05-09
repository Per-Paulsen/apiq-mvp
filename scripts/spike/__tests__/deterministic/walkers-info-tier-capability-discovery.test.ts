/**
 * Tests for walkCapabilityDiscoveryEndpoint (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkCapabilityDiscoveryEndpoint } from '../../deterministic/aggregators/info-tier-capability-discovery.js';

describe('walkCapabilityDiscoveryEndpoint (Welle F)', () => {
  it('emits 0 findings when no /capabilities or /.well-known/capabilities path', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': { get: { responses: { '200': { description: 'ok' } } } },
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when paths is missing', async () => {
    const spec = { openapi: '3.0.0' };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT match /capabilities-list (strict end-of-segment)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/capabilities-list': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding for /capabilities path', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/capabilities': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:info-tier:capability-discovery-endpoint');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.positiveMarker).toBe(true);
    expect(findings[0]?.meta?.count).toBe(1);
  });

  it('emits info-tier finding for /.well-known/capabilities path', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/capabilities': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.endpoints).toContain('/.well-known/capabilities');
  });

  it('matches /v1/capabilities (with version-prefix)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/capabilities': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkCapabilityDiscoveryEndpoint(spec);
    expect(findings).toHaveLength(1);
  });
});
