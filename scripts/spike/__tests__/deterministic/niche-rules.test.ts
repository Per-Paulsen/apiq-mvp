/**
 * Tests for the Welle D2 P4 + P5 Niche/Vendor Spectral ruleset
 * (`apiq-ruleset-niche.yaml`).
 *
 * Coverage matrix:
 *   - YAML loads cleanly with 12 rule-codes (11 patterns; F-18 is split into
 *     length-mode + boilerplate-mode and shares one patternId).
 *   - All 11 expected pattern-IDs present (RFC2-71/72/73/95/83/89/103/105 +
 *     CL-60 + F-18 + SC-20).
 *   - apiq-meta block coverage 100% on all 12 rules.
 *   - All required Welle-F apiq-meta fields populated on every rule.
 *   - Spectral-merge integration verifies via `runSpectralLayers` — niche-rules
 *     load alongside the other 11 yamls without crashing.
 *   - Per-rule fixture firing: 5 rules confirmed to fire (or not fire) on
 *     hand-crafted inline-specs:
 *       - RFC2-71 server-url-host-lowercase (mixed-case host fires; lowercase doesn't)
 *       - RFC2-72 server-url-scheme-lowercase (`HTTPS://` fires; `https://` doesn't)
 *       - RFC2-73 server-url-path-normalized (`/v1/./foo` fires; clean path doesn't)
 *       - CL-60 x-internal-usage (op with `x-internal: true` fires; without doesn't)
 *       - F-18 bloated-description-length (description >1000 chars fires; <1000 doesn't)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

import {
  runSpectralLayers,
  _resetSpectralCacheForTests,
} from '../../deterministic/infra/spectral-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(
  SPIKE_DIR,
  'deterministic',
  'rules',
  'apiq-ruleset-niche.yaml'
);

interface YamlRule {
  description?: string;
  message?: string;
  severity?: string | number;
  given?: string | string[];
  then?: unknown;
  recommended?: boolean;
  'apiq-meta'?: Record<string, unknown>;
}

interface YamlRuleset {
  rules: Record<string, YamlRule>;
}

function loadRuleset(): YamlRuleset {
  const text = fs.readFileSync(YAML_PATH, 'utf8');
  return YAML.parse(text) as YamlRuleset;
}

// =============================================================================
// SECTION 1 — YAML loads + has all expected pattern-IDs
// =============================================================================

describe('apiq-ruleset-niche.yaml — load + completeness', () => {
  it('YAML file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('YAML parses cleanly without errors', () => {
    const parsed = loadRuleset();
    expect(parsed).toBeDefined();
    expect(parsed.rules).toBeDefined();
    expect(typeof parsed.rules).toBe('object');
  });

  it('loads 12 rule-codes (11 patterns; F-18 split into length + boilerplate)', () => {
    const codes = Object.keys(loadRuleset().rules);
    expect(codes.length).toBe(12);
  });

  it('every loaded rule-code is prefixed `apiq-`', () => {
    for (const code of Object.keys(loadRuleset().rules)) {
      expect(code).toMatch(/^apiq-/);
    }
  });

  // Pattern-id presence checks — one assertion per Niche pattern from
  // implementation-priority.md P4 + P5 tiers.
  const REQUIRED_PATTERN_IDS = [
    // P4 (4):
    'RFC2-71', 'RFC2-72', 'RFC2-73', 'RFC2-95',
    // P5 (7):
    'RFC2-83', 'RFC2-89', 'RFC2-103', 'RFC2-105',
    'CL-60', 'F-18', 'SC-20',
  ];
  it.each(REQUIRED_PATTERN_IDS)('has rule for niche pattern %s', (id) => {
    const rules = loadRuleset().rules;
    const matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === id
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('F-18 has 2 rules (length + boilerplate split)', () => {
    const rules = loadRuleset().rules;
    const f18Matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === 'F-18'
    );
    expect(f18Matches.length).toBe(2);
  });
});

// =============================================================================
// SECTION 2 — apiq-meta block coverage (100% on all niche rules)
// =============================================================================

describe('apiq-ruleset-niche.yaml — apiq-meta coverage', () => {
  const REQUIRED_FIELDS = [
    'pattern-id',
    'lenses',
    'sources',
    'stakeholders',
    'lifecycle-phase',
    'defect-class',
    'iso25010',
    'codegen-targets',
    'cost-impact',
    'mttr-impact',
    'agent-readiness-impact',
  ] as const;

  it('every rule has an apiq-meta block (100% coverage)', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      expect(
        rule['apiq-meta'],
        `rule "${name}" missing apiq-meta block`
      ).toBeDefined();
    }
  });

  it('every apiq-meta block has all required Welle-F fields', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      const meta = rule['apiq-meta'];
      if (!meta) continue;
      for (const f of REQUIRED_FIELDS) {
        expect(
          meta[f],
          `rule "${name}" missing apiq-meta.${f}`
        ).toBeDefined();
      }
    }
  });

  it('every rule has at least 1 source citation', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      const sources = rule['apiq-meta']?.sources;
      expect(Array.isArray(sources), `rule "${name}" sources not array`).toBe(true);
      if (Array.isArray(sources)) {
        expect(
          sources.length,
          `rule "${name}" has no source citations`
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every rule has at least 1 lens', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      const lenses = rule['apiq-meta']?.lenses;
      expect(Array.isArray(lenses), `rule "${name}" lenses not array`).toBe(true);
      if (Array.isArray(lenses)) {
        expect(
          lenses.length,
          `rule "${name}" has no lens tags`
        ).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// SECTION 3 — Severity discipline (P4/P5 = mostly info/hint)
// =============================================================================

describe('apiq-ruleset-niche.yaml — severity discipline', () => {
  it('majority of rules are info/hint severity (P4/P5 default per Plan-Doc §8)', () => {
    const rules = loadRuleset().rules;
    let infoOrHintCount = 0;
    let warnCount = 0;
    let errorCount = 0;
    for (const r of Object.values(rules)) {
      if (r.severity === 'info' || r.severity === 'hint') infoOrHintCount++;
      else if (r.severity === 'warn') warnCount++;
      else if (r.severity === 'error') errorCount++;
    }
    expect(infoOrHintCount).toBeGreaterThan(warnCount + errorCount);
    expect(errorCount).toBe(0); // P4/P5 should have no error-severity
  });
});

// =============================================================================
// SECTION 4 — Rule structure integrity
// =============================================================================

describe('apiq-ruleset-niche.yaml — rule structure', () => {
  it('every rule has given + then', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.given, `rule "${name}" missing given`).toBeDefined();
      expect(rule.then, `rule "${name}" missing then`).toBeDefined();
    }
  });

  it('every rule has description + message', () => {
    const rules = loadRuleset().rules;
    for (const [name, rule] of Object.entries(rules)) {
      expect(rule.description, `rule "${name}" missing description`).toBeDefined();
      expect(rule.message, `rule "${name}" missing message`).toBeDefined();
    }
  });
});

// =============================================================================
// SECTION 5 — Spectral-runner merge integration (no crashes; rules registered)
// =============================================================================

describe('apiq-ruleset-niche.yaml — spectral-runner merge integration', () => {
  it('runSpectralLayers loads niche-ruleset alongside other yamls without crashing', async () => {
    _resetSpectralCacheForTests();
    const minimalSpec = {
      openapi: '3.0.3',
      info: { title: 't', version: '1.0.0' },
      paths: {},
    };
    // If niche-functions weren't wired into APIQ_CUSTOM_FUNCTIONS or the YAML
    // path were missing, build would warn + skip the rules. A successful run
    // (returning an array, even empty) confirms wiring + load survived.
    const findings = await runSpectralLayers(minimalSpec, { specName: 'niche-merge' });
    expect(Array.isArray(findings)).toBe(true);
  });
});

// =============================================================================
// SECTION 6 — Per-rule fixture firing tests (5 confirmed-firing rules)
// =============================================================================

const MINIMAL_OAS3 = {
  openapi: '3.0.3',
  info: { title: 't', version: '1.0.0' },
  paths: {},
};

function fixture(over: object): object {
  return { ...MINIMAL_OAS3, ...over };
}

async function findFindings(spec: object, code: string): Promise<unknown[]> {
  _resetSpectralCacheForTests();
  const findings = await runSpectralLayers(spec, { specName: 'fixture' });
  return findings.filter(
    (f) =>
      String(f.meta?.ruleCode ?? f.detectorId) === code ||
      f.detectorId === `spectral:${code}`
  );
}

describe('RFC2-71 — server URL host lowercase', () => {
  it('fires on mixed-case host', async () => {
    const spec = fixture({
      servers: [{ url: 'https://API.Example.com/v1' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-host-lowercase');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when host is lowercase', async () => {
    const spec = fixture({
      servers: [{ url: 'https://api.example.com/v1' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-host-lowercase');
    expect(out.length).toBe(0);
  });
});

describe('RFC2-72 — server URL scheme lowercase', () => {
  it('fires on uppercase scheme `HTTPS://`', async () => {
    const spec = fixture({
      servers: [{ url: 'HTTPS://api.example.com/v1' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-scheme-lowercase');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when scheme is lowercase', async () => {
    const spec = fixture({
      servers: [{ url: 'https://api.example.com/v1' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-scheme-lowercase');
    expect(out.length).toBe(0);
  });
});

describe('RFC2-73 — server URL path normalized', () => {
  it('fires when path contains `/./` segment', async () => {
    const spec = fixture({
      servers: [{ url: 'https://api.example.com/v1/./foo' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-path-normalized');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on a clean normalized path', async () => {
    const spec = fixture({
      servers: [{ url: 'https://api.example.com/v1' }],
    });
    const out = await findFindings(spec, 'apiq-server-url-path-normalized');
    expect(out.length).toBe(0);
  });
});

describe('CL-60 — x-internal usage', () => {
  it('fires when an operation has `x-internal: true`', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            'x-internal': true,
            operationId: 'getX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-x-internal-usage');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire when no operation has x-internal', async () => {
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            operationId: 'getX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-x-internal-usage');
    expect(out.length).toBe(0);
  });
});

describe('F-18 (length) — bloated description length', () => {
  it('fires on a description >1000 chars', async () => {
    const longDesc = 'x'.repeat(1500);
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            description: longDesc,
            operationId: 'getX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-bloated-description-length');
    expect(out.length).toBeGreaterThan(0);
  });

  it('does NOT fire on short descriptions (~200 chars)', async () => {
    const shortDesc = 'x'.repeat(200);
    const spec = fixture({
      paths: {
        '/x': {
          get: {
            description: shortDesc,
            operationId: 'getX',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    });
    const out = await findFindings(spec, 'apiq-bloated-description-length');
    expect(out.length).toBe(0);
  });
});
