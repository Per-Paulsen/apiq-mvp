/**
 * Tests for AI-Agent-Consumability Walker (Task T19 / Welle B — Lens 9).
 *
 * Coverage matrix (≥ 16 cases — at least one positive + one negative + one
 * edge case per L9-* pattern, plus rule-metadata + smoke-run on real specs):
 *
 *   L9-1 examples-coverage:        2 (fires when examples missing; silent when present)
 *   L9-2 tool-name-compat:         3 (too long; invalid chars; cryptic; positive)
 *   L9-3 description-completeness: 2 (no summary AND no description; with both)
 *   L9-4 parameter-description:    2 (missing/stub fires; populated does not)
 *   L9-5 response-shape:           2 (oneOf-no-discriminator; typeless schema)
 *   L9-6 llm-friendly-discover:    2 (untagged + cryptic; tagged + verb-noun)
 *   L9-7 capability-discovery:     2 (info-tier fires when present; absent silent)
 *   L9-8 function-calling-compat:  3 (top-level oneOf; ref-sibling; positive)
 *   Rule-metadata + smoke-run:     2 (validateMetadata; 4 reference specs)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  walkAiAgentConsumability,
  AI_AGENT_CONSUMABILITY_RULES,
} from '../../deterministic/aggregators/ai-agent-consumability.js';
import type { DetectorFinding } from '../../deterministic/infra/types.js';
import { RuleMetadataSchema } from '../../deterministic/infra/severity-schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SPIKE_DIR, '..', '..');
const EXAMPLES_DIR = path.join(REPO_ROOT, 'openapi-examples');

function findById(findings: DetectorFinding[], detectorIdSuffix: string): DetectorFinding | undefined {
  return findings.find((f) => f.detectorId.endsWith(detectorIdSuffix));
}

// =============================================================================
// L9-1 examples-coverage
// =============================================================================

describe('L9-1 examples-coverage on operations', () => {
  it('fires when >50% of operations carry NO examples on request or response', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'ok' } } } },
        '/b': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'ok' } } } },
        '/c': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-1-examples-coverage');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.patternId).toBe('L9-1');
    expect(meta.total).toBe(3);
    expect(meta.withAnyExample).toBe(0);
  });

  it('does NOT fire when most operations have examples', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' }, example: { x: 1 } } } },
            responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' }, example: { y: 2 } } } } },
          },
        },
        '/b': {
          post: {
            requestBody: { content: { 'application/json': { schema: { type: 'object' }, examples: { ok: { value: { foo: 'bar' } } } } } },
            responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'object' }, example: { y: 2 } } } } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-1-examples-coverage')).toBeUndefined();
  });
});

// =============================================================================
// L9-2 operationId-as-tool-name
// =============================================================================

describe('L9-2 operationId-as-tool-name', () => {
  it('flags operationIds longer than 64 chars (OpenAI tool-name limit)', async () => {
    const veryLong = 'a' + 'b'.repeat(70);
    const spec = {
      openapi: '3.0.0',
      paths: { '/a': { get: { operationId: veryLong, responses: { '200': { description: 'ok' } } } } },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-2-tool-name-compat');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.tooLong).toBe(1);
    expect(meta.patternId).toBe('L9-2');
  });

  it('flags operationIds with characters outside [A-Za-z0-9_-]', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'list users', responses: { '200': { description: 'ok' } } } }, // space
        '/b': { get: { operationId: 'create.user', responses: { '200': { description: 'ok' } } } }, // dot
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-2-tool-name-compat');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.invalidChars).toBe(2);
  });

  it('does NOT fire on well-formed operationIds', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'listUsers', responses: { '200': { description: 'ok' } } } },
        '/b': { post: { operationId: 'createUser', responses: { '201': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-2-tool-name-compat')).toBeUndefined();
  });
});

// =============================================================================
// L9-3 description-completeness
// =============================================================================

describe('L9-3 description-completeness', () => {
  it('fires when >50% of operations have NEITHER summary NOR description', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'getA', responses: { '200': { description: 'ok' } } } },
        '/b': { get: { operationId: 'getB', responses: { '200': { description: 'ok' } } } },
        '/c': { get: { operationId: 'getC', summary: 'Get C', description: 'Returns the C resource', responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-3-description-completeness');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.noSummaryNoDescription).toBe(2);
  });

  it('does NOT fire when all operations have summary AND description', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { summary: 'Get a thing', description: 'Returns the a-resource by id', responses: { '200': { description: 'ok' } } } },
        '/b': { post: { summary: 'Create a thing', description: 'Creates a new a-resource', responses: { '201': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-3-description-completeness')).toBeUndefined();
  });
});

// =============================================================================
// L9-4 parameter-description quality
// =============================================================================

describe('L9-4 parameter-description quality', () => {
  it('fires when >50% of parameters lack descriptions', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            parameters: [
              { name: 'id', in: 'query', schema: { type: 'string' } }, // no description
              { name: 'limit', in: 'query', schema: { type: 'integer' } }, // no description
              { name: 'cursor', in: 'query', description: 'Pagination cursor returned by previous call', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-4-parameter-description-quality');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.flagged).toBe(2);
  });

  it('does NOT fire when parameters have substantive descriptions', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            parameters: [
              { name: 'id', in: 'query', description: 'Resource identifier (UUID v4)', schema: { type: 'string' } },
              { name: 'limit', in: 'query', description: 'Page-size — maximum results returned', schema: { type: 'integer' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-4-parameter-description-quality')).toBeUndefined();
  });
});

// =============================================================================
// L9-5 response-shape predictability
// =============================================================================

describe('L9-5 response-shape predictability', () => {
  it('fires when a 2xx response uses oneOf without discriminator', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [
                        { type: 'object', properties: { kind: { const: 'a' } } },
                        { type: 'object', properties: { kind: { const: 'b' } } },
                      ],
                      // no discriminator!
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-5-response-shape-predictability');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    const reasons = meta.reasons as Record<string, number>;
    expect(reasons.polymorphicNoDiscriminator).toBe(1);
  });

  it('fires when 2xx response schema is typeless / shapeless', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {}, // no type, no $ref, no properties — typeless
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-5-response-shape-predictability');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    const reasons = meta.reasons as Record<string, number>;
    expect(reasons.emptyOrTypeless).toBe(1);
  });

  it('does NOT fire on a discriminated polymorphic response', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      oneOf: [{ type: 'object' }, { type: 'object' }],
                      discriminator: { propertyName: 'kind' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-5-response-shape-predictability')).toBeUndefined();
  });
});

// =============================================================================
// L9-6 LLM-friendly-API patterns
// =============================================================================

describe('L9-6 LLM-friendly-discoverability', () => {
  it('fires when >25% of ops are simultaneously untagged AND cryptic-opId', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': { get: { operationId: 'gtX', responses: { '200': { description: 'ok' } } } }, // no vowel - cryptic
        '/b': { get: { operationId: 'pX', responses: { '200': { description: 'ok' } } } }, // short
        '/c': { get: { operationId: 'listUsers', tags: ['users'], responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-6-llm-friendly-discoverability');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.flagged).toBeGreaterThanOrEqual(2);
  });

  it('does NOT fire when ops are tagged AND verb-noun', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': { get: { operationId: 'listUsers', tags: ['users'], responses: { '200': { description: 'ok' } } } },
        '/users/{id}': { get: { operationId: 'getUser', tags: ['users'], responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-6-llm-friendly-discoverability')).toBeUndefined();
  });
});

// =============================================================================
// L9-7 capability-discovery (positive marker / info-tier)
// =============================================================================

describe('L9-7 capability-discovery endpoint present (info-tier)', () => {
  it('fires positive marker when /.well-known/openapi or /openapi.json present', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/.well-known/openapi': { get: { responses: { '200': { description: 'spec' } } } },
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-7-capability-discovery-present');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('low'); // info-tier maps to lowest DetectorFinding severity
    const meta = f!.meta as Record<string, unknown>;
    expect(meta.tier).toBe('info');
    expect(meta.patternId).toBe('L9-7');
    expect(Array.isArray(meta.paths)).toBe(true);
  });

  it('does NOT fire when no capability-discovery endpoint is present', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/orders': { post: { responses: { '201': { description: 'ok' } } } },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-7-capability-discovery-present')).toBeUndefined();
  });
});

// =============================================================================
// L9-8 function-calling MCP compat
// =============================================================================

describe('L9-8 OpenAI/MCP function-calling compat', () => {
  it('flags parameters with top-level oneOf/anyOf', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            parameters: [
              {
                name: 'q',
                in: 'query',
                schema: { oneOf: [{ type: 'string' }, { type: 'integer' }] },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-8-function-calling-compat');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    const reasons = meta.reasons as Record<string, number>;
    expect(reasons.paramTopLevelPolymorphism).toBe(1);
  });

  it('flags parameter schemas with $ref siblings (OAS 3.0 violation; converters drop)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            parameters: [
              {
                name: 'q',
                in: 'query',
                schema: { $ref: '#/components/schemas/Foo', maxLength: 32 },
              },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    const f = findById(findings, 'l9-8-function-calling-compat');
    expect(f).toBeDefined();
    const meta = f!.meta as Record<string, unknown>;
    const reasons = meta.reasons as Record<string, number>;
    expect(reasons.paramRefSibling).toBe(1);
  });

  it('does NOT fire on clean parameter schemas', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/a': {
          get: {
            parameters: [
              { name: 'id', in: 'query', schema: { type: 'string' } },
              { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100 } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const findings = await walkAiAgentConsumability(spec);
    expect(findById(findings, 'l9-8-function-calling-compat')).toBeUndefined();
  });
});

// =============================================================================
// Rule-metadata + smoke-run
// =============================================================================

describe('Rule-metadata + Severity-Schema-Final tagging', () => {
  it('every detectorId in AI_AGENT_CONSUMABILITY_RULES validates against RuleMetadataSchema', () => {
    const ids = Object.keys(AI_AGENT_CONSUMABILITY_RULES);
    expect(ids.length).toBe(8); // 8 patterns: L9-1 through L9-8
    for (const id of ids) {
      const meta = AI_AGENT_CONSUMABILITY_RULES[id]!;
      const parsed = RuleMetadataSchema.safeParse(meta);
      expect(parsed.success).toBe(true);
      // Every rule MUST have ai-agent-consumability lens.
      expect(meta.lenses).toContain('ai-agent-consumability');
      // L9-7 is positive info-tier per spec.
      if (id.endsWith('l9-7-capability-discovery-present')) {
        expect(meta.severity).toBe('info');
      }
    }
  });
});

describe('Smoke-run on 4 reference openapi-examples', () => {
  const candidates = ['openweathermap', 'stripe', 'pagerduty', 'dnd5eapi', 'github-rest'];
  for (const name of candidates) {
    it(`does not crash on ${name}`, async () => {
      const dir = path.join(EXAMPLES_DIR, name);
      if (!fs.existsSync(dir)) {
        // Spec missing locally — skip (no failure).
        return;
      }
      let specPath: string | null = null;
      for (const ext of ['json', 'yaml', 'yml']) {
        const p = path.join(dir, `spec.${ext}`);
        if (fs.existsSync(p)) {
          specPath = p;
          break;
        }
      }
      if (!specPath) return;
      const raw = fs.readFileSync(specPath, 'utf8');
      let spec: object;
      if (specPath.endsWith('.json')) {
        spec = JSON.parse(raw);
      } else {
        const YAML = (await import('yaml')).default;
        spec = YAML.parse(raw) as object;
      }
      const findings = await walkAiAgentConsumability(spec);
      // Findings are an array; every finding has the right detectorId-prefix.
      expect(Array.isArray(findings)).toBe(true);
      for (const f of findings) {
        expect(f.detectorId.startsWith('walker:ai-agent-consumability:')).toBe(true);
      }
    });
  }
});
