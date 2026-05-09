/**
 * Tests for webhook-signature Module (Task T9 / Welle 2 — TM-A50 + TM-A51 + CL-74).
 *
 * Coverage:
 *   - Stripe-style detection: Stripe-Signature header recognised; no finding.
 *   - GitHub-style detection: X-Hub-Signature-256 header recognised; no finding.
 *   - Missing-signature flag (TM-A50 fires) + path-based detection.
 *   - OAS 3.1 webhooks-block top-level entries detected.
 *   - Operation-level callbacks block detected.
 *   - Format-not-documented (TM-A51 fires when description has no HMAC mention).
 *   - Format-documented (TM-A51 silent when description mentions HMAC-SHA256).
 *   - Payload-schema-undocumented (CL-74 fires when requestBody has no schema).
 *   - Output validates against canonical FindingSchema.
 *   - 4 reference specs from openapi-examples don't crash.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWebhookSignature, WEBHOOK_SIGNATURE_RULES } from '../../deterministic/modules/webhook-signature.js';
import { mapDetectorFindings } from '../../deterministic/infra/output-mapper.js';
import type { DetectorFinding } from '../../deterministic/infra/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

function findById(findings: DetectorFinding[], detectorId: string): DetectorFinding | undefined {
  return findings.find((f) => f.detectorId === detectorId);
}

// =============================================================================
// (1) Stripe-style detection — Stripe-Signature recognised, no finding
// =============================================================================

describe('webhook-signature: Stripe-style signature header detection', () => {
  it('accepts Stripe-Signature header on a /webhooks/* path (no missing-sig finding)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/webhooks/incoming': {
          post: {
            parameters: [
              {
                name: 'Stripe-Signature',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex signature with t=,v1= scheme over the raw body.',
              },
            ],
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:missing-signature-header')).toBeUndefined();
    expect(findById(findings, 'module:webhook-signature:format-not-documented')).toBeUndefined();
    expect(findById(findings, 'module:webhook-signature:payload-schema-undocumented')).toBeUndefined();
  });
});

// =============================================================================
// (2) GitHub-style detection — X-Hub-Signature-256 recognised
// =============================================================================

describe('webhook-signature: GitHub-style signature header detection', () => {
  it('accepts X-Hub-Signature-256 header (no missing-sig finding)', async () => {
    const spec = {
      openapi: '3.1.0',
      webhooks: {
        push: {
          post: {
            parameters: [
              {
                name: 'X-Hub-Signature-256',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'GitHub-style HMAC-SHA256 hex digest of the raw request body.',
              },
            ],
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:missing-signature-header')).toBeUndefined();
    expect(findById(findings, 'module:webhook-signature:format-not-documented')).toBeUndefined();
    expect(findById(findings, 'module:webhook-signature:payload-schema-undocumented')).toBeUndefined();
  });

  it('also accepts custom names that contain "signature" or "hmac" (case-insensitive)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/hooks/in': {
          post: {
            parameters: [
              {
                name: 'X-Acme-Webhook-Signature-V2',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex over body, base64-encoded for transport.',
              },
            ],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:missing-signature-header')).toBeUndefined();
  });
});

// =============================================================================
// (3) Missing-signature flag (TM-A50)
// =============================================================================

describe('webhook-signature: missing-signature-header (TM-A50)', () => {
  it('flags a /webhooks/* endpoint that declares no signature header at all', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/incoming': {
          post: {
            parameters: [
              { name: 'Content-Type', in: 'header', schema: { type: 'string' } },
            ],
            requestBody: {
              content: { 'application/json': { schema: { type: 'object' } } },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    const f = findById(findings, 'module:webhook-signature:missing-signature-header');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('high');
    expect(f!.affectedEndpoints).toContainEqual({ path: '/webhooks/incoming', method: 'post' });
    expect(f!.meta?.count).toBe(1);
    expect((f!.meta as Record<string, unknown>).patternId).toBe('TM-A50');
  });

  it('flags multiple webhook endpoints + reports count + bySource breakdown', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/event-a': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/hooks/event-b': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/callbacks/event-c': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        // Unrelated path that should NOT be flagged
        '/users': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    const f = findById(findings, 'module:webhook-signature:missing-signature-header');
    expect(f).toBeDefined();
    expect(f!.meta?.count).toBe(3);
    const bySource = (f!.meta as Record<string, unknown>).bySource as Record<string, number>;
    expect(bySource.paths).toBe(3);
  });

  it('does NOT fire on non-webhook paths', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': {
          post: { responses: { '201': { description: 'ok' } } },
        },
        '/orders': {
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// (4) OAS 3.1 webhooks-block detection
// =============================================================================

describe('webhook-signature: OAS 3.1 webhooks-block detection', () => {
  it('flags a webhooks-block entry that has no signature header', async () => {
    const spec = {
      openapi: '3.1.0',
      webhooks: {
        newPet: {
          post: {
            requestBody: {
              content: {
                'application/json': { schema: { type: 'object' } },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    const f = findById(findings, 'module:webhook-signature:missing-signature-header');
    expect(f).toBeDefined();
    expect(f!.meta?.count).toBe(1);
    const bySource = (f!.meta as Record<string, unknown>).bySource as Record<string, number>;
    expect(bySource['webhooks-block']).toBe(1);
  });

  it('detects OAS 3.0 callbacks block as webhook target', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/subscribers': {
          post: {
            responses: { '201': { description: 'subscribed' } },
            callbacks: {
              eventNotification: {
                '{$request.body#/callbackUrl}': {
                  post: {
                    requestBody: {
                      content: { 'application/json': { schema: { type: 'object' } } },
                    },
                    responses: { '200': { description: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    const f = findById(findings, 'module:webhook-signature:missing-signature-header');
    expect(f).toBeDefined();
    const bySource = (f!.meta as Record<string, unknown>).bySource as Record<string, number>;
    expect(bySource.callback).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// (5) TM-A51 — format-not-documented
// =============================================================================

describe('webhook-signature: format-not-documented (TM-A51)', () => {
  it('flags a signature header whose description does NOT mention HMAC/SHA256/hex/base64', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/in': {
          post: {
            parameters: [
              {
                name: 'X-Signature',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'Signature for verification.',
              },
            ],
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:missing-signature-header')).toBeUndefined();
    const f = findById(findings, 'module:webhook-signature:format-not-documented');
    expect(f).toBeDefined();
    expect((f!.meta as Record<string, unknown>).patternId).toBe('TM-A51');
  });

  it('does NOT fire when description mentions HMAC-SHA256', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/in': {
          post: {
            parameters: [
              {
                name: 'X-Signature',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex of the raw body, computed with the shared secret.',
              },
            ],
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:format-not-documented')).toBeUndefined();
  });
});

// =============================================================================
// (6) CL-74 — payload-schema-undocumented
// =============================================================================

describe('webhook-signature: payload-schema-undocumented (CL-74)', () => {
  it('flags POST webhook without requestBody schema', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/in': {
          post: {
            parameters: [
              {
                name: 'X-Hub-Signature-256',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex.',
              },
            ],
            // requestBody intentionally absent
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    const f = findById(findings, 'module:webhook-signature:payload-schema-undocumented');
    expect(f).toBeDefined();
    expect((f!.meta as Record<string, unknown>).patternId).toBe('CL-74');
    expect(f!.severity).toBe('medium');
  });

  it('does NOT fire when requestBody declares a schema', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/in': {
          post: {
            parameters: [
              {
                name: 'X-Hub-Signature-256',
                in: 'header',
                required: true,
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex.',
              },
            ],
            requestBody: {
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { event: { type: 'string' } } },
                },
              },
            },
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findById(findings, 'module:webhook-signature:payload-schema-undocumented')).toBeUndefined();
  });
});

// =============================================================================
// (7) Output validates against canonical FindingSchema
// =============================================================================

describe('webhook-signature: output validates against FindingSchema', () => {
  it('every emitted finding maps cleanly through FindingSchema (no zod throw)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/webhooks/no-sig': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/webhooks/sig-no-format': {
          post: {
            parameters: [
              {
                name: 'X-Webhook-Signature',
                in: 'header',
                schema: { type: 'string' },
                description: 'A signature.',
              },
            ],
            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
            responses: { '200': { description: 'ok' } },
          },
        },
        '/webhooks/no-payload': {
          post: {
            parameters: [
              {
                name: 'Stripe-Signature',
                in: 'header',
                schema: { type: 'string' },
                description: 'HMAC-SHA256 hex.',
              },
            ],
            // no requestBody
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await runWebhookSignature(spec);
    expect(findings.length).toBeGreaterThanOrEqual(3);
    const mapped = mapDetectorFindings(findings);
    // mapDetectorFindings drops findings that fail validation. Expect all to survive.
    expect(mapped.length).toBe(findings.length);
  });
});

// =============================================================================
// (8) RuleMetadata exported correctly
// =============================================================================

describe('webhook-signature: RuleMetadata tagging', () => {
  it('exports RuleMetadata for each detector-id with correct lens + severity', () => {
    const tmA50 = WEBHOOK_SIGNATURE_RULES['module:webhook-signature:missing-signature-header'];
    expect(tmA50.severity).toBe('error');
    expect(tmA50.lenses).toContain('threat-modeling');
    expect(tmA50.lenses).toContain('standards-compliance');
    expect(tmA50.patternId).toBe('TM-A50');
    expect(tmA50.priority).toBe('P1');

    const tmA51 = WEBHOOK_SIGNATURE_RULES['module:webhook-signature:format-not-documented'];
    expect(tmA51.severity).toBe('warn');
    expect(tmA51.patternId).toBe('TM-A51');

    const cl74 = WEBHOOK_SIGNATURE_RULES['module:webhook-signature:payload-schema-undocumented'];
    expect(cl74.severity).toBe('hint');
    expect(cl74.lenses).toContain('client-friction');
    expect(cl74.patternId).toBe('CL-74');
  });
});

// =============================================================================
// (9) Reference specs don't crash
// =============================================================================

describe('webhook-signature: reference specs run without crash', () => {
  const REFERENCE_SPECS = ['openweathermap', 'stripe', 'pagerduty', 'dnd5eapi'];

  for (const specName of REFERENCE_SPECS) {
    it(`runs against ${specName} without throwing`, async () => {
      const specDir = path.join(EXAMPLES_DIR, specName);
      let specPath: string | null = null;
      for (const ext of ['json', 'yaml', 'yml']) {
        const candidate = path.join(specDir, `spec.${ext}`);
        if (fs.existsSync(candidate)) {
          specPath = candidate;
          break;
        }
      }
      if (!specPath) {
        // skip if missing — informational
        return;
      }
      const raw = fs.readFileSync(specPath, 'utf8');
      const spec = specPath.endsWith('.json')
        ? JSON.parse(raw)
        : (await import('yaml')).parse(raw);
      const findings = await runWebhookSignature(spec);
      expect(Array.isArray(findings)).toBe(true);
    });
  }
});
