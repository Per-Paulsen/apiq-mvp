/**
 * Tests for path-template-parser detector (Task #4 — P3+P4+J3+G6+S2+S3+S4+S8).
 *
 * Validates one finding-class per test case (eight in total — one per
 * acceptance-criterion finding-class plus one mapper / schema-validation case
 * and one sanity-check on the four reference specs).
 *
 * Public expectations:
 *   - module exports `walkPathTemplates(spec) => Promise<DetectorFinding[]>`
 *   - findings carry the agreed `walker:*` detectorIds and survive
 *     `mapDetectorFindings` against `FindingSchema`
 *   - the parser is spec-agnostic: no vendor branches, no Stripe / PD / GitHub
 *     paths hard-coded
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walkPathTemplates } from '../../deterministic/path-template-parser.js';
import { mapDetectorFindings } from '../../deterministic/output-mapper.js';
import { FindingSchema } from '../../schema.js';
import type { DetectorFinding } from '../../deterministic/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

function findById(findings: DetectorFinding[], detectorId: string): DetectorFinding | undefined {
  return findings.find((f) => f.detectorId === detectorId);
}

// =============================================================================
// (1) P3 — path-template without parameter-definition
// =============================================================================

describe('walker:path-template-without-parameter-definition (P3)', () => {
  it('flags a path with `{id}` slot when no `in: path` parameter is declared', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          get: {
            // NOTE: no parameters at all → P3 should fire
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-template-without-parameter-definition');
    expect(f).toBeDefined();
    expect(f!.affectedEndpoints).toContainEqual({ path: '/users/{id}', method: 'get' });
    expect(f!.meta?.count).toBe(1);
  });

  it('does NOT fire when the templated slot is properly declared at operation OR path level', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    expect(
      findById(findings, 'walker:path-template-without-parameter-definition')
    ).toBeUndefined();
  });
});

// =============================================================================
// (2) P4 — declared path-parameter without template-position
// =============================================================================

describe('walker:path-parameter-without-template-position (P4)', () => {
  it('flags a declared `in: path` parameter that the path key does not template', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {
            parameters: [
              { name: 'orphan', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-parameter-without-template-position');
    expect(f).toBeDefined();
    expect(f!.meta?.count).toBe(1);
    expect(f!.affectedEndpoints).toContainEqual({ path: '/users', method: 'get' });
  });
});

// =============================================================================
// (3) J3+G6 — naming-style drift across resources
// =============================================================================

describe('walker:path-parameter-naming-inconsistent (J3+G6)', () => {
  it('flags `{user_id}` and `{userId}` co-existing in the same spec', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/teams/{user_id}/role': {
          parameters: [{ name: 'user_id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/orgs/{userId}/audit': {
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-parameter-naming-inconsistent');
    expect(f).toBeDefined();
    expect(f!.meta?.groupCount).toBe(1);
    // Both spellings should appear in narration / examples.
    expect(f!.narration).toMatch(/user_id/);
    expect(f!.narration).toMatch(/userId/);
  });

  it('does NOT fire when only one casing style is used', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/teams/{user_id}': {
          parameters: [{ name: 'user_id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/orgs/{org_id}': {
          parameters: [{ name: 'org_id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    expect(findById(findings, 'walker:path-parameter-naming-inconsistent')).toBeUndefined();
  });
});

// =============================================================================
// (4) S2 — depth statistics
// =============================================================================

describe('walker:path-depth-excessive (S2)', () => {
  it('flags paths with more than 5 segments (excluding leading version prefix)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/orgs/{org}/teams/{team}/projects/{proj}/issues/{id}/comments': {
          // 8 segments after stripping `/v1`
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/v1/users': {
          // 1 segment after stripping `/v1` — should not contribute to breach
          get: { responses: { '200': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-depth-excessive');
    expect(f).toBeDefined();
    expect(f!.meta?.breachCount).toBe(1);
    expect(f!.meta?.maxDepth).toBeGreaterThanOrEqual(7);
    expect(f!.meta?.threshold).toBe(5);
  });
});

// =============================================================================
// (5) S3 — trailing-slash inconsistency
// =============================================================================

describe('walker:path-trailing-slash-inconsistency (S3)', () => {
  it('flags a spec mixing `/users` and `/orders/`', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/orders/': { get: { responses: { '200': { description: 'ok' } } } },
        '/products': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-trailing-slash-inconsistency');
    expect(f).toBeDefined();
    expect(f!.meta?.trailingCount).toBe(1);
    expect(f!.meta?.noTrailingCount).toBe(2);
    expect(f!.meta?.minorityStyle).toBe('trailing-slash');
  });

  it('does NOT fire when every path uses the same convention', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/orders': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkPathTemplates(spec);
    expect(findById(findings, 'walker:path-trailing-slash-inconsistency')).toBeUndefined();
  });
});

// =============================================================================
// (6) S8 — RPC-style verb segments (heuristic)
// =============================================================================

describe('walker:path-rpc-style (S8)', () => {
  it('flags high-confidence RPC-verb segments like `getUserById`', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/getUserById/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/createOrder': {
          post: { responses: { '201': { description: 'ok' } } },
        },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-rpc-style');
    expect(f).toBeDefined();
    expect(f!.meta?.confidence).toBe('high');
    expect(f!.meta?.pathCount).toBe(2);
  });

  it('does NOT flag idiomatic control-verb leaves like `/users/search` or `/sessions/login`', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users/search': { get: { responses: { '200': { description: 'ok' } } } },
        '/sessions/login': { post: { responses: { '200': { description: 'ok' } } } },
        '/tokens/refresh': { post: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkPathTemplates(spec);
    // High-confidence finding must NOT fire (only acceptable control verbs).
    expect(findById(findings, 'walker:path-rpc-style')).toBeUndefined();
  });
});

// =============================================================================
// (7) S4 — mixed versioning
// =============================================================================

describe('walker:path-mixed-versioning (S4)', () => {
  it('flags spec where /v1/ paths coexist with non-versioned paths', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/v1/orders': { get: { responses: { '200': { description: 'ok' } } } },
        '/products': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-mixed-versioning');
    expect(f).toBeDefined();
    expect(f!.meta?.isMixedPresence).toBe(true);
    expect(f!.meta?.versionedCount).toBe(2);
    expect(f!.meta?.unversionedCount).toBe(1);
  });

  it('flags spec where multiple version prefixes coexist (`/v1/x` + `/v2/y`)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/v2/orders': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkPathTemplates(spec);
    const f = findById(findings, 'walker:path-mixed-versioning');
    expect(f).toBeDefined();
    expect(f!.meta?.isMixedPrefix).toBe(true);
    expect(f!.meta?.distinctPrefixes).toEqual(expect.arrayContaining(['v1', 'v2']));
  });
});

// =============================================================================
// Output validates against canonical FindingSchema
// =============================================================================

describe('output-mapper validates against FindingSchema', () => {
  it('maps every emitted finding through FindingSchema without throwing', async () => {
    // A spec that triggers every finding-class so we exercise the full mapper path.
    const spec = {
      openapi: '3.0.0',
      paths: {
        // P3 (template `{id}` not declared)
        '/v1/users/{id}': {
          get: { responses: { '200': { description: 'ok' } } },
        },
        // P4 (declared `in: path` parameter `orphan` not in template)
        '/v1/audit': {
          get: {
            parameters: [
              { name: 'orphan', in: 'path', required: true, schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
        // J3 (camel + snake mixed)
        '/v1/teams/{userId}': {
          parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        '/v1/orgs/{user_id}': {
          parameters: [{ name: 'user_id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        // S2 (>5 segments)
        '/v1/a/{p1}/b/{p2}/c/{p3}/d': {
          parameters: [
            { name: 'p1', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'p2', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'p3', in: 'path', required: true, schema: { type: 'string' } },
          ],
          get: { responses: { '200': { description: 'ok' } } },
        },
        // S3 (trailing-slash mix already triggered by `/v1/users/{id}` no slash + entry below)
        '/v1/legacy/': { get: { responses: { '200': { description: 'ok' } } } },
        // S8 (RPC-style)
        '/v1/getThings/{id}': {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          get: { responses: { '200': { description: 'ok' } } },
        },
        // S4 — `/v1/` versioned mixed with `/healthz` unversioned
        '/healthz': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };

    const findings = await walkPathTemplates(spec);
    expect(findings.length).toBeGreaterThanOrEqual(7);
    const mapped = mapDetectorFindings(findings);
    expect(mapped.length).toBe(findings.length);
    for (const f of mapped) {
      expect(() => FindingSchema.parse(f)).not.toThrow();
      expect(f.title.length).toBeGreaterThan(0);
      expect(f.title.length).toBeLessThanOrEqual(200);
      expect(f.narration.length).toBeGreaterThanOrEqual(50);
      expect(f.narration.length).toBeLessThanOrEqual(2000);
      expect(f.rationale.length).toBeGreaterThanOrEqual(20);
      expect(f.rationale.length).toBeLessThanOrEqual(1000);
      expect(f.patchSummary.length).toBeGreaterThanOrEqual(1);
      expect(f.patchSummary.length).toBeLessThanOrEqual(200);
    }
  });
});

// =============================================================================
// Sanity-check on real example specs
// =============================================================================

const REFERENCE_SPECS = ['stripe-full', 'pagerduty-full', 'dnd5eapi', 'github-rest'];

describe('runs cleanly on reference specs', () => {
  for (const specName of REFERENCE_SPECS) {
    it(`runs on ${specName} without throwing and produces schema-valid output`, async () => {
      const specPath = path.join(EXAMPLES_DIR, specName, 'spec.json');
      if (!fs.existsSync(specPath)) {
        // If the fixture isn't checked in for this spec, skip rather than fail.
        return;
      }
      const raw = fs.readFileSync(specPath, 'utf8');
      const spec = JSON.parse(raw) as object;

      const findings = await walkPathTemplates(spec, { specName });
      const mapped = mapDetectorFindings(findings);
      expect(mapped.length).toBe(findings.length);
      for (const f of mapped) {
        expect(() => FindingSchema.parse(f)).not.toThrow();
      }
    }, 30_000);
  }
});
