import { describe, it, expect } from 'vitest';
import {
  analyzeCorpus,
  analyzeAll,
  STATISTICS,
  detailedStandardHeaderCoverage,
  type CorpusSpec,
} from '../../eval/api-corpus-analyzer.js';

// =============================================================================
// Fixtures — small synthetic specs covering the main detection-paths.
// =============================================================================

const fixtureApiKeyHeader: CorpusSpec = {
  id: 'fixture-apikey-header',
  doc: {
    openapi: '3.0.0',
    paths: {},
    components: {
      securitySchemes: {
        api_key: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      },
    },
  },
  metadata: { operationsCount: 0, tagsCount: 0, descriptionRate: 1 },
};

const fixtureOauth2: CorpusSpec = {
  id: 'fixture-oauth2',
  doc: {
    openapi: '3.0.0',
    paths: {},
    components: {
      securitySchemes: { oauth: { type: 'oauth2', flows: {} } },
    },
  },
  metadata: { operationsCount: 0, tagsCount: 0, descriptionRate: 1 },
};

const fixtureBearer31: CorpusSpec = {
  id: 'fixture-bearer-31',
  doc: {
    openapi: '3.1.0',
    paths: {
      '/things': {
        get: {
          operationId: 'listThings',
          parameters: [
            { name: 'offset', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
          ],
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { items: { type: 'array' } },
                  },
                },
              },
            },
            '404': {
              content: {
                'application/problem+json': {
                  schema: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      title: { type: 'string' },
                      detail: { type: 'string' },
                      status: { type: 'integer' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createThing',
          security: [{ bearer: [] }],
          requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { '201': {} },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
    },
    security: [{ bearer: [] }],
  },
  metadata: { operationsCount: 2, tagsCount: 0, descriptionRate: 1, title: 'Bearer 3.1 Fixture' },
};

const fixtureUrlVersionedRpc: CorpusSpec = {
  id: 'fixture-rpc-v1',
  doc: {
    openapi: '3.0.0',
    servers: [{ url: 'https://api.example.com/v2' }],
    paths: {
      '/v2/search': {
        post: {
          operationId: 'searchThings',
          responses: { '200': { content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
    },
  },
  metadata: { operationsCount: 1, tagsCount: 0, descriptionRate: 1 },
};

const fixtureMinimal: CorpusSpec = {
  id: 'fixture-minimal',
  doc: { openapi: '3.0.0', paths: {} },
  metadata: { operationsCount: 0, tagsCount: 0, descriptionRate: 1 },
};

// =============================================================================
// Tests
// =============================================================================

describe('api-corpus-analyzer', () => {
  it('analyzeCorpus(auth-scheme) returns valid distribution for fixture', () => {
    const result = analyzeCorpus([fixtureApiKeyHeader, fixtureOauth2], 'auth-scheme');
    expect(result.totalSpecs).toBe(2);
    expect(result.distribution.size).toBeGreaterThan(0);
    expect(result.lens.length).toBeGreaterThan(0);
    expect(result.distribution.get('apiKey-header')).toBe(1);
    expect(result.distribution.get('oauth2')).toBe(1);
    expect(result.confidenceScore).toBeCloseTo(0.5, 5);
  });

  it('analyzeAll runs all 10 statistics without throwing', () => {
    const results = analyzeAll([fixtureMinimal]);
    expect(results.length).toBe(Object.keys(STATISTICS).length);
    expect(results.length).toBe(10);
    // Each result has a patternId + lens
    for (const r of results) {
      expect(r.patternId).toMatch(/^R3-CO-/);
      expect(r.lens.length).toBeGreaterThan(0);
    }
  });

  it('analyzeCorpus(pagination) detects offset+limit on list-endpoints', () => {
    const result = analyzeCorpus([fixtureBearer31], 'pagination');
    expect(result.totalSpecs).toBe(1);
    expect(result.distribution.get('offset+limit')).toBe(1);
  });

  it('analyzeCorpus(error-shape) detects rfc-7807 from application/problem+json', () => {
    const result = analyzeCorpus([fixtureBearer31], 'error-shape');
    expect(result.totalSpecs).toBe(1);
    expect(result.distribution.get('rfc-7807')).toBe(1);
  });

  it('analyzeCorpus(versioning) detects url-path versioning', () => {
    const result = analyzeCorpus([fixtureUrlVersionedRpc], 'versioning');
    expect(result.distribution.get('url-path')).toBe(1);
  });

  it('analyzeCorpus(oas-version) buckets 3.0.x vs 3.1.x', () => {
    const result = analyzeCorpus(
      [fixtureApiKeyHeader /*3.0.0*/, fixtureBearer31 /*3.1.0*/],
      'oas-version',
    );
    expect(result.distribution.get('3.0.x')).toBe(1);
    expect(result.distribution.get('3.1.x')).toBe(1);
  });

  it('analyzeCorpus(security-coverage) reports fully-secured for fixture with global+op security', () => {
    const result = analyzeCorpus([fixtureBearer31], 'security-coverage');
    expect(result.totalSpecs).toBe(1);
    expect(result.distribution.get('fully-secured')).toBe(1);
  });

  it('analyzeCorpus is robust to malformed spec docs', () => {
    const malformed: CorpusSpec = {
      id: 'broken',
      // @ts-expect-error intentionally malformed
      doc: { openapi: '3.0.0', paths: 'not-an-object' },
      metadata: { operationsCount: 0, tagsCount: 0, descriptionRate: 0 },
    };
    // Should not throw; broken spec skipped/ignored gracefully.
    const result = analyzeAll([malformed, fixtureMinimal]);
    expect(result.length).toBe(10);
  });

  it('detailedStandardHeaderCoverage returns counts for all 12 tracked headers', () => {
    const result = detailedStandardHeaderCoverage([fixtureBearer31, fixtureMinimal]);
    expect(result.size).toBeGreaterThanOrEqual(12);
  });

  it('STATISTICS has exactly 10 entries with non-empty lens', () => {
    const names = Object.keys(STATISTICS);
    expect(names.length).toBe(10);
    for (const name of names) {
      expect(STATISTICS[name as keyof typeof STATISTICS].lens.length).toBeGreaterThan(0);
      expect(STATISTICS[name as keyof typeof STATISTICS].description.length).toBeGreaterThan(0);
    }
  });
});
