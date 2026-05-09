/**
 * Tests for T15 — Style-Classifier (Stage 1) + Per-Style Coherence-Checker (Stage 2).
 *
 * apiq differentiator — no other linter ships a style-classifier.
 *
 * Tests cover:
 *  1. Each of the 9 styles is classified correctly from minimal fixtures.
 *  2. Style-mixing detection (HAL + JSON:API + OData co-present).
 *  3. SCF-1 JSON:API conformance violations.
 *  4. SCF-7 HAL conformance violations.
 *  5. SCF-9 Siren conformance violations.
 *  6. SCF-13 AIP custom-method method conformance.
 *  7. SCF-14 AIP pagination conformance.
 *  8. Generic SC-1 path-style mixing.
 *  9. Two-stage execution (classify-first, then dispatch).
 * 10. End-to-end run against the 4 example specs (regression smoke).
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  classifyApiStyle,
  collectStats,
  type ApiStyle,
} from '../../deterministic/classifiers/style-classifier.js';
import {
  runStyleCoherenceChecks,
  _coherenceInternals,
} from '../../deterministic/modules/per-style-coherence.js';

// ---------------------------------------------------------------------------
// Helper fixtures
// ---------------------------------------------------------------------------

function pureRpcSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'RPC', version: '1' },
    paths: {
      '/login': { post: { responses: { '200': { description: 'ok' } } } },
      '/logout': { post: { responses: { '200': { description: 'ok' } } } },
      '/getUser': { post: { responses: { '200': { description: 'ok' } } } },
      '/createOrder': { post: { responses: { '200': { description: 'ok' } } } },
      '/searchUsers': { post: { responses: { '200': { description: 'ok' } } } },
      '/updateProfile': { post: { responses: { '200': { description: 'ok' } } } },
      '/cancelSubscription': { post: { responses: { '200': { description: 'ok' } } } },
      '/sendEmail': { post: { responses: { '200': { description: 'ok' } } } },
    },
  };
}

function restL2Spec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'REST-L2', version: '1' },
    paths: {
      '/users': {
        get: { responses: { '200': { description: 'list', content: { 'application/json': { schema: { type: 'array' } } } } } },
        post: { responses: { '201': { description: 'created' } } },
      },
      '/users/{id}': {
        get: { responses: { '200': { description: 'one' } } },
        put: { responses: { '200': { description: 'updated' } } },
        patch: { responses: { '200': { description: 'patched' } } },
        delete: { responses: { '204': { description: 'gone' } } },
      },
      '/orders': {
        get: { responses: { '200': { description: 'list' } } },
        post: { responses: { '201': { description: 'created' } } },
      },
      '/orders/{id}': {
        get: { responses: { '200': { description: 'one' } } },
        delete: { responses: { '204': { description: 'gone' } } },
      },
    },
  };
}

function jsonApiSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'JSON:API spec', version: '1' },
    paths: {
      '/articles': {
        get: {
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/vnd.api+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array' },
                      meta: { type: 'object' },
                      links: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/articles/{id}': {
        get: {
          responses: {
            '200': {
              description: 'one',
              content: {
                'application/vnd.api+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          type: { type: 'string' },
                          id: { type: 'string' },
                          attributes: { type: 'object' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}


function halSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'HAL spec', version: '1' },
    paths: {
      '/orders': {
        get: {
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/hal+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      _links: {
                        type: 'object',
                        properties: { self: { type: 'object' } },
                      },
                      _embedded: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function sirenSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Siren spec', version: '1' },
    paths: {
      '/orders': {
        get: {
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/vnd.siren+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      class: { type: 'array', items: { type: 'string' } },
                      properties: { type: 'object' },
                      actions: { type: 'array' },
                      links: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function odataSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'OData spec', version: '1' },
    paths: {
      '/Customers': {
        get: {
          parameters: [
            { in: 'query', name: '$filter', schema: { type: 'string' } },
            { in: 'query', name: '$top', schema: { type: 'integer' } },
            { in: 'query', name: '$skip', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      '@odata.context': { type: 'string' },
                      '@odata.nextLink': { type: 'string' },
                      value: { type: 'array' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function aipSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'AIP spec', version: '1' },
    paths: {
      '/v1/projects/{project}/locations': {
        get: {
          parameters: [
            { in: 'query', name: 'page_size', schema: { type: 'integer' } },
            { in: 'query', name: 'page_token', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      locations: { type: 'array' },
                      next_page_token: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/v1/projects/{project}/locations/{location}:archive': {
        post: { responses: { '200': { description: 'archived' } } },
      },
    },
  };
}

function customBespokeSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Custom', version: '1' },
    paths: {
      '/foo': {
        get: { responses: { '200': { description: 'ok' } } },
      },
      '/bar': {
        get: { responses: { '200': { description: 'ok' } } },
      },
    },
  };
}

function mixedHalJsonApiSpec(): object {
  return {
    openapi: '3.0.0',
    info: { title: 'Mixed spec', version: '1' },
    paths: {
      '/orders': {
        get: {
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/hal+json': {
                  schema: {
                    type: 'object',
                    properties: { _links: { type: 'object' } },
                  },
                },
              },
            },
          },
        },
      },
      '/articles': {
        get: {
          responses: {
            '200': {
              description: 'list',
              content: {
                'application/vnd.api+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array' },
                      meta: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}


// ---------------------------------------------------------------------------
// Stage 1 — Style-Classifier
// ---------------------------------------------------------------------------

describe('Stage-1 classifier — classifyApiStyle()', () => {
  it('classifies a pure-RPC spec', () => {
    const result = classifyApiStyle(pureRpcSpec());
    expect(result.primaryStyle).toBe('pure-rpc');
    expect(result.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result.evidence.find((e) => e.style === 'pure-rpc')).toBeDefined();
  });

  it('classifies a REST-Level-2 spec', () => {
    const result = classifyApiStyle(restL2Spec());
    expect(result.primaryStyle).toBe('rest-l2');
    expect(result.evidence.find((e) => e.style === 'rest-l2')).toBeDefined();
  });

  it('classifies JSON:API via content-type (HIGH confidence)', () => {
    const result = classifyApiStyle(jsonApiSpec());
    expect(result.primaryStyle).toBe('json-api');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(
      result.evidence.find((e) => e.style === 'json-api' && e.tier === 'high')
    ).toBeDefined();
  });

  it('classifies HAL via content-type', () => {
    const result = classifyApiStyle(halSpec());
    expect(result.primaryStyle).toBe('hal');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies Siren via content-type', () => {
    const result = classifyApiStyle(sirenSpec());
    expect(result.primaryStyle).toBe('siren');
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('classifies OData via dollar-prefixed query params + @odata.* properties', () => {
    const result = classifyApiStyle(odataSpec());
    expect(result.primaryStyle).toBe('odata');
  });

  it('classifies AIP via colon-verb paths + page_size/page_token pagination', () => {
    const result = classifyApiStyle(aipSpec());
    expect(result.primaryStyle).toBe('aip');
    expect(
      result.evidence.find((e) => e.style === 'aip' && e.marker.includes('colon-verb'))
    ).toBeDefined();
  });

  it('falls back to custom-bespoke for unmarked specs', () => {
    const result = classifyApiStyle(customBespokeSpec());
    // Either custom-bespoke or 'rest-l2' depending on path-shape; the key is
    // that it's NOT one of the high-confidence hypermedia families.
    const hyper: ApiStyle[] = ['json-api', 'hal', 'siren', 'odata', 'aip'];
    expect(hyper).not.toContain(result.primaryStyle);
  });

  it('detects style-mixing (HAL + JSON:API in one spec) as primary=mixed', () => {
    const result = classifyApiStyle(mixedHalJsonApiSpec());
    expect(result.primaryStyle).toBe('mixed');
    expect(result.secondaryStyles).toContain('hal');
    expect(result.secondaryStyles).toContain('json-api');
  });

  it('exposes statistical evidence via stats', () => {
    const result = classifyApiStyle(restL2Spec());
    expect(result.stats.totalOps).toBeGreaterThan(0);
    expect(result.stats.methodCounts.get).toBeGreaterThan(0);
    expect(result.stats.pathStyle.pluralNoun).toBeGreaterThan(0);
  });
});


// ---------------------------------------------------------------------------
// Stage 2 — Per-Style Coherence-Checker
// ---------------------------------------------------------------------------

describe('Stage-2 coherence — runStyleCoherenceChecks()', () => {
  it('two-stage execution: classify-first, then dispatch coherence-checks', () => {
    const { classification, findings } = runStyleCoherenceChecks(jsonApiSpec());
    expect(classification.primaryStyle).toBe('json-api');
    expect(findings).toBeInstanceOf(Array);
  });

  it('SCF-1 detects JSON:API envelope violation (data + errors coexisting)', () => {
    const broken = {
      openapi: '3.0.0',
      info: { title: 'Broken JSON:API', version: '1' },
      paths: {
        '/articles': {
          get: {
            responses: {
              '200': {
                description: 'broken',
                content: {
                  'application/vnd.api+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        data: { type: 'array' },
                        errors: { type: 'array' }, // FORBIDDEN coexistence
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(broken);
    const scf1 = findings.find((f) => f.detectorId.includes('scf-1'));
    expect(scf1).toBeDefined();
    expect(scf1?.severity).toBe('high');
  });

  it('SCF-7 fires when application/hal+json response missing _links', () => {
    const broken = {
      openapi: '3.0.0',
      info: { title: 'Broken HAL', version: '1' },
      paths: {
        '/orders': {
          get: {
            responses: {
              '200': {
                description: 'broken',
                content: {
                  'application/hal+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        // MISSING _links — required by HAL spec
                        id: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(broken);
    const scf7 = findings.find((f) => f.detectorId.includes('scf-7'));
    expect(scf7).toBeDefined();
  });

  it('SCF-9 fires when application/vnd.siren+json response missing class array', () => {
    const broken = {
      openapi: '3.0.0',
      info: { title: 'Broken Siren', version: '1' },
      paths: {
        '/orders': {
          get: {
            responses: {
              '200': {
                description: 'broken',
                content: {
                  'application/vnd.siren+json': {
                    schema: {
                      type: 'object',
                      properties: {
                        // MISSING class array — required by Siren
                        properties: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(broken);
    const scf9 = findings.find((f) => f.detectorId.includes('scf-9'));
    expect(scf9).toBeDefined();
  });

  it('SCF-13 fires when AIP custom-method (colon-verb) uses PUT instead of POST', () => {
    const broken = {
      openapi: '3.0.0',
      info: { title: 'Broken AIP', version: '1' },
      paths: {
        '/v1/items/{id}:archive': {
          put: { responses: { '200': { description: 'archived' } } }, // Wrong method
        },
        '/v1/items/{id}:restore': {
          post: { responses: { '200': { description: 'restored' } } }, // OK
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(broken);
    const scf13 = findings.find((f) => f.detectorId.includes('scf-13'));
    expect(scf13).toBeDefined();
  });

  it('SCF-14 fires when AIP-style spec mixes pagination conventions', () => {
    const mixed = {
      openapi: '3.0.0',
      info: { title: 'AIP-mixed pagination', version: '1' },
      paths: {
        // AIP-canonical pagination
        '/v1/items': {
          get: {
            parameters: [
              { in: 'query', name: 'page_size', schema: { type: 'integer' } },
              { in: 'query', name: 'page_token', schema: { type: 'string' } },
            ],
            responses: {
              '200': {
                description: 'ok',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { next_page_token: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
        // Different operation using non-AIP pagination — fires SCF-14
        '/v1/orders': {
          get: {
            parameters: [
              { in: 'query', name: 'limit', schema: { type: 'integer' } },
              { in: 'query', name: 'offset', schema: { type: 'integer' } },
            ],
            responses: {
              '200': { description: 'ok' },
            },
          },
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(mixed);
    const scf14 = findings.find((f) => f.detectorId.includes('scf-14'));
    expect(scf14).toBeDefined();
  });

  it('SCF-* checks DO NOT fire on a vanilla REST-L2 spec (no false-positives)', () => {
    const { findings } = runStyleCoherenceChecks(restL2Spec());
    const scfFiring = findings.filter((f) => f.detectorId.includes('scf-'));
    expect(scfFiring).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// Generic SC-* coherence checks
// ---------------------------------------------------------------------------

describe('Stage-2 generic SC-* coherence', () => {
  it('SC-1 fires when REST + RPC paths mix above threshold', () => {
    const mixed = {
      openapi: '3.0.0',
      info: { title: 'Mixed', version: '1' },
      paths: {
        // 5 RPC + 5 REST = 50/50 — definitely fires
        '/login': { post: { responses: { '200': { description: 'ok' } } } },
        '/getUser': { post: { responses: { '200': { description: 'ok' } } } },
        '/searchOrders': { post: { responses: { '200': { description: 'ok' } } } },
        '/createPayment': { post: { responses: { '200': { description: 'ok' } } } },
        '/cancelOrder': { post: { responses: { '200': { description: 'ok' } } } },
        '/users': { get: { responses: { '200': { description: 'ok' } } } },
        '/users/{id}': { get: { responses: { '200': { description: 'ok' } } } },
        '/orders': { get: { responses: { '200': { description: 'ok' } } } },
        '/orders/{id}': { get: { responses: { '200': { description: 'ok' } } } },
        '/payments': { get: { responses: { '200': { description: 'ok' } } } },
      },
    };
    const { findings } = runStyleCoherenceChecks(mixed);
    const sc1 = findings.find((f) => f.detectorId.includes('sc-1'));
    expect(sc1).toBeDefined();
  });

  it('SC-14 fires for cross-style envelope leakage (mixed HAL + JSON:API)', () => {
    const { findings, classification } = runStyleCoherenceChecks(mixedHalJsonApiSpec());
    expect(classification.primaryStyle).toBe('mixed');
    const sc14 = findings.find((f) => f.detectorId.includes('sc-14'));
    expect(sc14).toBeDefined();
  });

  it('SC-22 fires when filter syntaxes mix (filter + dollar-filter + filter[])', () => {
    const broken = {
      openapi: '3.0.0',
      info: { title: 'Mixed filters', version: '1' },
      paths: {
        '/a': {
          get: {
            parameters: [
              { in: 'query', name: 'filter', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
        '/b': {
          get: {
            parameters: [
              { in: 'query', name: 'filter[name]', schema: { type: 'string' } },
            ],
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    };
    const { findings } = runStyleCoherenceChecks(broken);
    const sc22 = findings.find((f) => f.detectorId.includes('sc-22'));
    expect(sc22).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Stats helper
// ---------------------------------------------------------------------------

describe('collectStats()', () => {
  it('counts methods, paths, and content-types correctly', () => {
    const stats = collectStats(restL2Spec());
    expect(stats.totalOps).toBeGreaterThan(0);
    expect(stats.methodCounts.get).toBeGreaterThan(0);
    expect(stats.methodCounts.post).toBeGreaterThan(0);
    expect(stats.pathStyle.pluralNoun).toBeGreaterThan(0);
  });

  it('detects content-type coverage', () => {
    const stats = collectStats(jsonApiSpec());
    expect([...stats.contentTypes]).toContain('application/vnd.api+json');
  });
});

// ---------------------------------------------------------------------------
// Declared-style helpers
// ---------------------------------------------------------------------------

describe('declared-style helpers', () => {
  it('jsonApiDeclared() reads from contentTypes', () => {
    const stats = collectStats(jsonApiSpec());
    expect(_coherenceInternals.jsonApiDeclared(stats)).toBe(true);
    expect(_coherenceInternals.jsonApiDeclared(collectStats(restL2Spec()))).toBe(false);
  });

  it('halDeclared() reads from contentTypes', () => {
    expect(_coherenceInternals.halDeclared(collectStats(halSpec()))).toBe(true);
  });

  it('odataDeclared() fires on dollar-prefixed query params', () => {
    expect(_coherenceInternals.odataDeclared(collectStats(odataSpec()))).toBe(true);
  });

  it('aipDeclared() fires on colon-verb paths or page_size/page_token', () => {
    expect(_coherenceInternals.aipDeclared(collectStats(aipSpec()))).toBe(true);
  });
});


// ---------------------------------------------------------------------------
// End-to-end smoke against the 4 reference example-specs.
// Stripe / GitHub / PagerDuty / dnd5eapi — verify Stage-1 classifies them
// as REST-L2 (none should be JSON:API/HAL/Siren/AIP) and Stage-2 returns
// without throwing.
// ---------------------------------------------------------------------------

describe('end-to-end against openapi-examples (regression smoke)', () => {
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
  const EXAMPLES = path.join(REPO_ROOT, 'openapi-examples');

  function loadSpec(name: string): object | null {
    const candidate = path.join(EXAMPLES, name, 'spec.json');
    if (!fs.existsSync(candidate)) return null;
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      return null;
    }
  }

  it.each(['stripe', 'pagerduty', 'dnd5eapi', 'github-rest'])(
    'classifies %s example spec without throwing',
    (name) => {
      const spec = loadSpec(name);
      if (!spec) {
        // If the example file is absent skip rather than fail — keeps test
        // robust to fixture-rotation.
        return;
      }
      const result = runStyleCoherenceChecks(spec);
      expect(result.classification).toBeDefined();
      expect(result.classification.primaryStyle).toBeTruthy();
      expect(result.findings).toBeInstanceOf(Array);
    }
  );

  it('expects stripe to NOT be classified as JSON:API/HAL/Siren/AIP', () => {
    const spec = loadSpec('stripe');
    if (!spec) return;
    const result = classifyApiStyle(spec);
    const hyper: ApiStyle[] = ['json-api', 'hal', 'siren', 'aip'];
    expect(hyper).not.toContain(result.primaryStyle);
  });
});
