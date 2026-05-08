/**
 * Welle F Phase 3 — F5 apiq-meta coverage gate (CI build-time-test).
 *
 * Enforces the Welle-F acceptance criterion that ≥95 % of all YAML-rules
 * across the four apiq-* rulesets carry an `apiq-meta` block with the full
 * Stage-A metadata required for downstream lens / stakeholder / codegen /
 * lifecycle / cost / mttr / agent-readiness aggregation.
 *
 * Per-file gates use ≥95 % to allow up to ~5 % blocklisted rules
 * (RULE_CRASH_BLOCKLIST in spectral-runner.ts) to remain meta-less without
 * blocking CI. The combined cross-file gate also asserts ≥95 % of the
 * 110-rule baseline.
 *
 * If you migrate a new YAML-rule and Phase 1B's runtime warn-line fires,
 * this test will fail in CI and pinpoint the missing field — preventing the
 * coverage from regressing once Phase 2A-D landed it at 100 % (excl.
 * blocklist).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DETERMINISTIC_DIR = path.resolve(__dirname, '..', '..', 'deterministic');

const YAML_FILES = [
  'apiq-ruleset.yaml',
  'apiq-ruleset-threat-p1.yaml',
  'apiq-ruleset-client-p1.yaml',
  'apiq-ruleset-evolution.yaml',
] as const;

interface YamlRule {
  description?: string;
  'apiq-meta'?: Record<string, unknown>;
}

interface YamlRuleset {
  rules: Record<string, YamlRule>;
}

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

function loadRuleset(yamlFile: string): YamlRuleset {
  const yamlPath = path.join(DETERMINISTIC_DIR, yamlFile);
  const yamlText = fs.readFileSync(yamlPath, 'utf8');
  return YAML.parse(yamlText) as YamlRuleset;
}

describe('Welle F — apiq-meta coverage gate (F5)', () => {
  for (const yamlFile of YAML_FILES) {
    it(`${yamlFile} has >=95% apiq-meta coverage on non-blocklisted rules`, () => {
      const parsed = loadRuleset(yamlFile);
      const ruleNames = Object.keys(parsed.rules);
      expect(ruleNames.length).toBeGreaterThan(0);
      const rulesWithMeta = ruleNames.filter(
        (name) => !!parsed.rules[name]['apiq-meta']
      );
      const coverage = rulesWithMeta.length / ruleNames.length;
      expect(coverage).toBeGreaterThanOrEqual(0.95);
    });

    it(`${yamlFile} apiq-meta blocks have all required fields`, () => {
      const parsed = loadRuleset(yamlFile);
      for (const [ruleName, rule] of Object.entries(parsed.rules)) {
        const meta = rule['apiq-meta'];
        if (!meta) continue; // skip rules without an apiq-meta block (≤5%)
        for (const field of REQUIRED_FIELDS) {
          expect(
            meta,
            `rule "${ruleName}" in ${yamlFile} missing required apiq-meta field: ${field}`
          ).toHaveProperty(field);
          expect(
            (meta as Record<string, unknown>)[field],
            `rule "${ruleName}" in ${yamlFile} has undefined apiq-meta.${field}`
          ).toBeDefined();
        }
      }
    });
  }

  it('combined: >=95% of all 110 rules across all YAMLs have apiq-meta', () => {
    let totalRules = 0;
    let totalWithMeta = 0;
    for (const yamlFile of YAML_FILES) {
      const parsed = loadRuleset(yamlFile);
      for (const rule of Object.values(parsed.rules)) {
        totalRules++;
        if (rule['apiq-meta']) totalWithMeta++;
      }
    }
    expect(totalRules).toBeGreaterThanOrEqual(110);
    expect(totalWithMeta / totalRules).toBeGreaterThanOrEqual(0.95);
  });
});
