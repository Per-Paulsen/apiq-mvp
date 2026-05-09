/**
 * Tests for walkRfc9728OauthProtectedResource (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkRfc9728OauthProtectedResource } from '../../deterministic/aggregators/info-tier-rfc9728-oauth-protected-resource.js';

describe('walkRfc9728OauthProtectedResource (Welle F)', () => {
  it('emits 0 findings when no /.well-known/oauth-protected-resource path', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/widgets': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkRfc9728OauthProtectedResource(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when paths is missing', async () => {
    const spec = { openapi: '3.0.0' };
    const findings = await walkRfc9728OauthProtectedResource(spec);
    expect(findings).toHaveLength(0);
  });

  it('does NOT match /.well-known/oauth-authorization-server (different RFC)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/oauth-authorization-server': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkRfc9728OauthProtectedResource(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding for /.well-known/oauth-protected-resource', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/oauth-protected-resource': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkRfc9728OauthProtectedResource(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe(
      'walker:info-tier:rfc-9728-oauth-protected-resource-presence',
    );
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.rfc).toBe(9728);
    expect(findings[0]?.meta?.mcpOauthFoundation).toBe(true);
    expect(findings[0]?.title).toContain('RFC 9728');
  });

  it('matches with trailing slash', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/oauth-protected-resource/': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkRfc9728OauthProtectedResource(spec);
    expect(findings).toHaveLength(1);
  });
});
