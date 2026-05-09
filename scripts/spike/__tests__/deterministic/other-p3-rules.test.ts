/**
 * Tests for the Welle D P3 Other-Lens (T-Other-Lens) Spectral ruleset.
 *
 * Coverage matrix:
 *   - YAML loads cleanly with 47 rule-codes covering 49 patterns
 *     (F-12 / F-13 / F-11 / F-14 already in apiq-ruleset-client-p2.yaml).
 *   - Each P3 pattern has a matching rule-code prefixed `apiq-sc-`,
 *     `apiq-scf-`, `apiq-l6-`, `apiq-l7-`, `apiq-l9-`, `apiq-l10-`, or
 *     `apiq-f-`.
 *   - apiq-meta block coverage 100% on all 47 rules.
 *   - All required Welle-F apiq-meta fields populated on every rule.
 *   - L9-* and L10-* rules carry non-trivial `agent-readiness-impact`
 *     per Plan-Doc §0 Strategic Vision Constants.
 *   - YAML parses without errors (no JSONPath syntax mistakes).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPIKE_DIR = path.resolve(__dirname, '..', '..');
const YAML_PATH = path.join(
  SPIKE_DIR,
  'deterministic',
  'apiq-ruleset-other-p3.yaml'
);

interface YamlRule {
  description?: string;
  message?: string;
  severity?: string | number;
  given?: string | string[];
  then?: unknown;
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

describe('apiq-ruleset-other-p3.yaml — load + completeness', () => {
  it('YAML file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('YAML parses cleanly without errors', () => {
    const parsed = loadRuleset();
    expect(parsed).toBeDefined();
    expect(parsed.rules).toBeDefined();
    expect(typeof parsed.rules).toBe('object');
  });

  it('loads 47 rule-codes (15 SC + 15 SCF + 11 L6/L7/L9/L10 + 6 F)', () => {
    const codes = Object.keys(loadRuleset().rules);
    expect(codes.length).toBe(47);
  });

  it('every loaded rule-code is prefixed `apiq-(sc|scf|l6|l7|l9|l10|f)`', () => {
    for (const code of Object.keys(loadRuleset().rules)) {
      expect(code).toMatch(/^apiq-(sc|scf|l6|l7|l9|l10|f)-?/i);
    }
  });

  // Pattern-id presence checks — one assertion per P3 pattern from
  // implementation-priority.md (excluding F-11/12/13/14 which live in
  // apiq-ruleset-client-p2.yaml).
  const REQUIRED_SC_IDS = [
    'SC-1', 'SC-2', 'SC-3', 'SC-4', 'SC-7', 'SC-12', 'SC-15', 'SC-16',
    'SC-17', 'SC-18', 'SC-19', 'SC-21', 'SC-22', 'SC-23', 'SC-25',
  ];
  it.each(REQUIRED_SC_IDS)('has rule for SC pattern %s', (id) => {
    const rules = loadRuleset().rules;
    const matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === id
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  const REQUIRED_SCF_IDS = [
    'SCF-2', 'SCF-3', 'SCF-4', 'SCF-5', 'SCF-6', 'SCF-7', 'SCF-8',
    'SCF-9', 'SCF-10', 'SCF-11', 'SCF-12', 'SCF-13', 'SCF-14', 'SCF-15',
    'SCF-17',
  ];
  it.each(REQUIRED_SCF_IDS)('has rule for SCF pattern %s', (id) => {
    const rules = loadRuleset().rules;
    const matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === id
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  const REQUIRED_LENS_IDS = [
    'L6-3', 'L7-1', 'L9-2', 'L9-3', 'L9-4', 'L9-5', 'L9-6', 'L9-8',
    'L10-4', 'L10-5', 'L10-6',
  ];
  it.each(REQUIRED_LENS_IDS)('has rule for Lens pattern %s', (id) => {
    const rules = loadRuleset().rules;
    const matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === id
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  // F-Tier — only F-2 / F-3 / F-5 / F-15 / F-19 / F-20.
  // F-11/12/13/14 are in apiq-ruleset-client-p2.yaml.
  const REQUIRED_F_IDS = ['F-2', 'F-3', 'F-5', 'F-15', 'F-19', 'F-20'];
  it.each(REQUIRED_F_IDS)('has rule for F pattern %s', (id) => {
    const rules = loadRuleset().rules;
    const matches = Object.values(rules).filter(
      (r) => r['apiq-meta']?.['pattern-id'] === id
    );
    expect(matches.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// SECTION 2 — apiq-meta block coverage (100% on all P3 rules)
// =============================================================================

describe('apiq-ruleset-other-p3.yaml — apiq-meta coverage', () => {
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
// SECTION 3 — Strategic-Vision-Coupling: L9 + L10 agent-readiness-impact
// =============================================================================

describe('apiq-ruleset-other-p3.yaml — agent-readiness coupling (Plan-Doc §0)', () => {
  it('L9-* rules carry agent-readiness-impact: high or medium (NOT none/low)', () => {
    const rules = loadRuleset().rules;
    const l9Rules = Object.entries(rules).filter(([, r]) => {
      const id = r['apiq-meta']?.['pattern-id'];
      return typeof id === 'string' && id.startsWith('L9-');
    });
    expect(l9Rules.length).toBeGreaterThan(0);
    for (const [name, rule] of l9Rules) {
      const impact = rule['apiq-meta']?.['agent-readiness-impact'];
      expect(
        ['high', 'medium'],
        `L9 rule "${name}" has agent-readiness-impact "${impact}" — Plan-Doc §0 requires high/medium`
      ).toContain(impact);
    }
  });

  it('L10-* rules carry agent-readiness-impact: high or medium (NOT none/low)', () => {
    const rules = loadRuleset().rules;
    const l10Rules = Object.entries(rules).filter(([, r]) => {
      const id = r['apiq-meta']?.['pattern-id'];
      return typeof id === 'string' && id.startsWith('L10-');
    });
    expect(l10Rules.length).toBeGreaterThan(0);
    for (const [name, rule] of l10Rules) {
      const impact = rule['apiq-meta']?.['agent-readiness-impact'];
      expect(
        ['high', 'medium'],
        `L10 rule "${name}" has agent-readiness-impact "${impact}" — Plan-Doc §0 requires high/medium`
      ).toContain(impact);
    }
  });

  it('L9 + L10 rules tag ai-agent or ai-agent-consumability', () => {
    const rules = loadRuleset().rules;
    const agentLens = Object.entries(rules).filter(([, r]) => {
      const id = r['apiq-meta']?.['pattern-id'];
      return typeof id === 'string' && (id.startsWith('L9-') || id.startsWith('L10-'));
    });
    for (const [name, rule] of agentLens) {
      const lenses = (rule['apiq-meta']?.lenses ?? []) as string[];
      const stakeholders = (rule['apiq-meta']?.stakeholders ?? []) as string[];
      const hasAgentLens =
        lenses.includes('ai-agent-consumability') ||
        lenses.includes('operational-metadata');
      const hasAgentStakeholder = stakeholders.includes('ai-agent');
      expect(
        hasAgentLens || hasAgentStakeholder,
        `rule "${name}" should tag ai-agent-consumability lens or ai-agent stakeholder`
      ).toBe(true);
    }
  });
});

// =============================================================================
// SECTION 4 — Severity discipline (P3 = mostly hint)
// =============================================================================

describe('apiq-ruleset-other-p3.yaml — severity discipline', () => {
  it('majority of rules are hint-severity (P3 default per Plan-Doc §7)', () => {
    const rules = loadRuleset().rules;
    let hintCount = 0;
    let warnCount = 0;
    let errorCount = 0;
    for (const r of Object.values(rules)) {
      if (r.severity === 'hint') hintCount++;
      else if (r.severity === 'warn') warnCount++;
      else if (r.severity === 'error') errorCount++;
    }
    expect(hintCount).toBeGreaterThan(warnCount + errorCount);
    expect(errorCount).toBe(0); // P3 should have no error-severity
  });
});

// =============================================================================
// SECTION 5 — Rule structure integrity
// =============================================================================

describe('apiq-ruleset-other-p3.yaml — rule structure', () => {
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
