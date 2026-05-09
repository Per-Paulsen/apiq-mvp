/**
 * Tests for walkPluralisedNodes (Welle D / T-Sentinels resolving F-14).
 */

import { describe, it, expect } from 'vitest';
import { walkPluralisedNodes } from '../../deterministic/aggregators/pluralised-nodes.js';

describe('walkPluralisedNodes (Welle D / F-14)', () => {
  it('emits 0 findings when there are no paths', async () => {
    const findings = await walkPluralisedNodes({ openapi: '3.0.0', paths: {} });
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings for a consistently-plural API', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/users': {},
        '/users/{id}': {},
        '/users/{id}/orders': {},
        '/users/{id}/orders/{orderId}': {},
        '/products': {},
        '/products/{sku}': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings for a consistently-singular RPC-style API', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/createUser': {},
        '/getUser/{id}': {},
        '/deleteOrder': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(0);
  });

  it('flags singular/plural mix on the same resource (regular -s)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/user': {},        // singular
        '/users': {},       // plural — same resource
        '/users/{id}': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:pluralised-nodes');
    expect(findings[0]?.severity).toBe('medium');
    expect(findings[0]?.meta?.apiqSeverity).toBe('warn');
    expect(findings[0]?.meta?.patternId).toBe('F-14');
    const conflicts = findings[0]?.meta?.conflicts as Array<{ singular: string; plural: string }>;
    expect(conflicts.find((c) => c.singular === 'user' && c.plural === 'users')).toBeDefined();
  });

  it('flags y → ies pluralisation conflicts (city/cities)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/cities': {},
        '/city/{id}': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    const conflicts = findings[0]?.meta?.conflicts as Array<{ singular: string; plural: string }>;
    expect(conflicts.find((c) => c.singular === 'city' && c.plural === 'cities')).toBeDefined();
  });

  it('flags es-suffix pluralisation (box/boxes)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/box': {},
        '/boxes': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    const conflicts = findings[0]?.meta?.conflicts as Array<{ singular: string; plural: string }>;
    expect(conflicts.find((c) => c.singular === 'box' && c.plural === 'boxes')).toBeDefined();
  });

  it('does NOT flag irregular nouns (data/children/people)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/data': {},
        '/data/{key}': {},
        '/datum': {}, // even though Latin plural — exempt because "data" is in the exempt-set
        '/people': {},
        '/person/{id}': {}, // person ↔ people: irregular — should NOT flag
        '/children': {},
        '/child/{id}': {}, // child ↔ children: irregular — should NOT flag
      },
    };
    const findings = await walkPluralisedNodes(spec);
    // None of these pairs should be flagged because they're irregular.
    if (findings.length > 0) {
      const conflicts = findings[0]?.meta?.conflicts as Array<{ singular: string; plural: string }>;
      for (const c of conflicts) {
        expect(['data', 'datum', 'people', 'person', 'children', 'child']).not.toContain(c.singular.toLowerCase());
        expect(['data', 'datum', 'people', 'person', 'children', 'child']).not.toContain(c.plural.toLowerCase());
      }
    }
  });

  it('does NOT flag {var}-templated segments (different namespace)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/{user}': {},     // template → skipped
        '/users': {},      // literal
        '/users/{id}': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(0);
  });

  it('reports each conflict at most once even when seen across many paths', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/user': {},
        '/user/{id}': {},
        '/user/{id}/profile': {},
        '/users': {},
        '/users/{id}': {},
        '/users/{id}/profile': {},
        '/users/{id}/avatar': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    const conflicts = findings[0]?.meta?.conflicts as Array<{
      singular: string;
      plural: string;
      singularPaths: string[];
      pluralPaths: string[];
    }>;
    const userConflict = conflicts.find((c) => c.singular === 'user');
    expect(userConflict).toBeDefined();
    expect(userConflict!.singularPaths.length).toBeGreaterThanOrEqual(3);
    expect(userConflict!.pluralPaths.length).toBeGreaterThanOrEqual(3);
  });

  it('handles multiple distinct conflicts in one spec', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/user': {},
        '/users': {},
        '/order': {},
        '/orders': {},
        '/product': {},
        '/products': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.conflictCount).toBe(3);
  });

  it('skips numeric/non-alpha segments (api versions stay alphabetic)', async () => {
    const spec = {
      openapi: '3.0.0',
      paths: {
        '/v1/users': {},
        '/v1/user': {},   // would conflict with /v1/users → expect flag
        '/v2/products': {},
      },
    };
    const findings = await walkPluralisedNodes(spec);
    expect(findings).toHaveLength(1);
    const conflicts = findings[0]?.meta?.conflicts as Array<{ singular: string }>;
    expect(conflicts.find((c) => c.singular === 'user')).toBeDefined();
  });
});
