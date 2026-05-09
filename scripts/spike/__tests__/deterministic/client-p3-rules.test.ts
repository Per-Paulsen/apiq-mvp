/**
 * Tests for the Welle D P3 Client-Friction Spectral ruleset
 * (`apiq-ruleset-client-p3.yaml`).
 *
 * Coverage matrix:
 *   - YAML loads cleanly + has all 32 expected pattern-IDs
 *     (CL-3/8/10/14/16/19/23/27/28/30/32/34/38/39/41/42/43/44/47/51/52/53/61/62/65/67/72/74/75/78/79/80)
 *   - apiq-meta block coverage 100% on all rules per Welle-F-Schema
 *   - F7 per-target codegen-tagging audit (≥50% concrete-list)
 *
 * Note: spectral-runner integration is owned by Phase 3 Integration (Task #9).
 * Until then, this test verifies the YAML structure/content directly without
 * invoking the runner.
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
  'apiq-ruleset-client-p3.yaml'
);

interface ApiqMeta {
  'pattern-id'?: string;
  lenses?: string[];
  sources?: unknown[];
  stakeholders?: string[];
  'lifecycle-phase'?: string;
  'defect-class'?: string;
  iso25010?: string[];
  'codegen-targets'?: unknown[];
  'cost-impact'?: string;
  'mttr-impact'?: string;
  'agent-readiness-impact'?: string;
}

interface YamlRule {
  description?: string;
  message?: string;
  severity?: string | number;
  given?: string | string[];
  then?: { function: string } | { function: string }[];
  'apiq-meta'?: ApiqMeta;
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

describe('apiq-ruleset-client-p3.yaml — load + completeness', () => {
  it('YAML file exists', () => {
    expect(fs.existsSync(YAML_PATH)).toBe(true);
  });

  it('YAML parses cleanly without errors', () => {
    const parsed = loadRuleset();
    expect(parsed).toBeDefined();
    expect(parsed.rules).toBeDefined();
    expect(typeof parsed.rules).toBe('object');
  });

  it('loads >=32 rule-codes (32 P3 patterns)', () => {
    const parsed = loadRuleset();
    const codes = Object.keys(parsed.rules);
    expect(codes.length).toBeGreaterThanOrEqual(32);
  });

  it('every loaded rule-code is prefixed `apiq-cl`', () => {
    const parsed = loadRuleset();
    for (const code of Object.keys(parsed.rules)) {
      expect(code).toMatch(/^apiq-cl\d+/);
    }
  });

  // Expected P3-Client pattern-IDs (from spec line 26)
  const REQUIRED_CL_PATTERN_IDS = [
    'CL-3',
    'CL-8',
    'CL-10',
    'CL-14',
    'CL-16',
    'CL-19',
    'CL-23',
    'CL-27',
    'CL-28',
    'CL-30',
    'CL-32',
    'CL-34',
    'CL-38',
    'CL-39',
    'CL-41',
    'CL-42',
    'CL-43',
    'CL-44',
    'CL-47',
    'CL-51',
    'CL-52',
    'CL-53',
    'CL-61',
    'CL-62',
    'CL-65',
    'CL-67',
    'CL-72',
    'CL-74',
    'CL-75',
    'CL-78',
    'CL-79',
    'CL-80',
  ];

  it.each(REQUIRED_CL_PATTERN_IDS)(
    'has rule for CL pattern %s',
    (id) => {
      const parsed = loadRuleset();
      const matching = Object.values(parsed.rules).filter(
        (r) => r['apiq-meta']?.['pattern-id'] === id
      );
      expect(matching.length).toBeGreaterThan(0);
    }
  );
});

// =============================================================================
// SECTION 2 — apiq-meta block coverage (100% on all P3 client rules)
// =============================================================================

describe('apiq-ruleset-client-p3.yaml — apiq-meta coverage', () => {
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

  it('every rule carries an apiq-meta block', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      expect(rule['apiq-meta'], `rule ${name} missing apiq-meta`).toBeDefined();
    }
  });

  it('every apiq-meta block has all required fields', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const meta = rule['apiq-meta'];
      expect(meta, `rule ${name} apiq-meta missing`).toBeDefined();
      for (const f of REQUIRED_FIELDS) {
        expect(
          meta,
          `rule ${name} apiq-meta missing field "${f}"`
        ).toHaveProperty(f);
      }
    }
  });

  it('every source has type + verifiedAt when carrying a verifiable quote', () => {
    // Welle-D Phase-3 schema-split: `verifiedAt` is only meaningful when the
    // source carries a verifiable `quote` (or legacy `verbatim`). Sources that
    // carry only a `summary` (paraphrase, non-auditable) MUST NOT have
    // `verifiedAt` since T25 doesn't audit them.
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const sources = rule['apiq-meta']?.sources;
      expect(Array.isArray(sources), `rule ${name} sources not array`).toBe(true);
      for (const s of sources!) {
        const src = s as Record<string, unknown>;
        expect(src.type, `rule ${name} source missing type`).toBeDefined();
        const hasQuote =
          typeof src.quote === 'string' || typeof src.verbatim === 'string';
        if (src.type !== 'mining' && hasQuote) {
          expect(
            src.verifiedAt,
            `rule ${name} non-mining source with quote missing verifiedAt`
          ).toBeDefined();
        }
      }
    }
  });
});

// =============================================================================
// SECTION 3 — F7 per-target codegen-tagging audit (≥50% concrete-list)
// =============================================================================

describe('apiq-ruleset-client-p3.yaml — F7 per-target codegen-tagging', () => {
  it('at least 50% of rules tag concrete codegen-targets (not just `*`)', () => {
    const parsed = loadRuleset();
    const allRules = Object.values(parsed.rules);
    let perTargetCount = 0;
    for (const rule of allRules) {
      const targets = rule['apiq-meta']?.['codegen-targets'];
      if (
        Array.isArray(targets) &&
        targets.length > 0 &&
        !(targets.length === 1 && targets[0] === '*')
      ) {
        perTargetCount++;
      }
    }
    const ratio = perTargetCount / allRules.length;
    expect(
      ratio,
      `Only ${perTargetCount}/${allRules.length} rules have concrete codegen-targets — need ≥50%`
    ).toBeGreaterThanOrEqual(0.5);
  });

  it('every rule has a non-empty codegen-targets array', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const targets = rule['apiq-meta']?.['codegen-targets'];
      expect(Array.isArray(targets), `${name} codegen-targets not array`).toBe(true);
      expect((targets ?? []).length, `${name} codegen-targets empty`).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// SECTION 4 — Severity discipline
// =============================================================================

describe('apiq-ruleset-client-p3.yaml — severity discipline', () => {
  it('no P3 rule uses `error` severity (P3 = hint or warn only)', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const sev = rule.severity;
      expect(sev, `${name} severity should be hint or warn, not error`).not.toBe(
        'error'
      );
      expect(sev, `${name} severity should not be 0 (error)`).not.toBe(0);
    }
  });
});

// =============================================================================
// SECTION 5 — Every rule has Lens 4 (client-friction)
// =============================================================================

describe('apiq-ruleset-client-p3.yaml — lens membership', () => {
  it('every rule has client-friction lens (Lens 4)', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const lenses = rule['apiq-meta']?.lenses;
      expect(
        lenses,
        `${name} lenses missing client-friction`
      ).toContain('client-friction');
    }
  });
});

// =============================================================================
// SECTION 6 — agent-readiness-impact populated for all rules
// =============================================================================

describe('apiq-ruleset-client-p3.yaml — agent-readiness-impact', () => {
  const VALID_VALUES = ['none', 'low', 'medium', 'high'];
  it('every rule has valid agent-readiness-impact', () => {
    const parsed = loadRuleset();
    for (const [name, rule] of Object.entries(parsed.rules)) {
      const ari = rule['apiq-meta']?.['agent-readiness-impact'];
      expect(VALID_VALUES, `${name} agent-readiness-impact=${ari}`).toContain(
        ari
      );
    }
  });
});
