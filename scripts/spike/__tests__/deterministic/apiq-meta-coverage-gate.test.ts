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
const RULES_DIR = path.resolve(DETERMINISTIC_DIR, 'rules');

// Welle C (2026-05-08) — added P2 rulesets `apiq-ruleset-threat-p2.yaml` +
// `apiq-ruleset-client-p2.yaml`.
// Welle D (2026-05-09) — added P3 rulesets `apiq-ruleset-threat-p3.yaml`,
// `apiq-ruleset-client-p3.yaml`, `apiq-ruleset-evolution-p3.yaml`,
// `apiq-ruleset-standards-p3.yaml`, `apiq-ruleset-other-p3.yaml`. We filter
// to existing files at module-load to keep the test resilient against
// partial parallel execution during /dev.
const ALL_YAML_FILES = [
  'apiq-ruleset.yaml',
  'apiq-ruleset-threat-p1.yaml',
  'apiq-ruleset-client-p1.yaml',
  'apiq-ruleset-evolution.yaml',
  'apiq-ruleset-threat-p2.yaml',
  'apiq-ruleset-client-p2.yaml',
  'apiq-ruleset-threat-p3.yaml',
  'apiq-ruleset-client-p3.yaml',
  'apiq-ruleset-evolution-p3.yaml',
  'apiq-ruleset-standards-p3.yaml',
  'apiq-ruleset-other-p3.yaml',
] as const;
const YAML_FILES = ALL_YAML_FILES.filter((f) =>
  fs.existsSync(path.join(RULES_DIR, f))
);

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
  const yamlPath = path.join(RULES_DIR, yamlFile);
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

  it('combined: >=95% of all rules (110+ baseline; ~342 post-Welle-D) across all YAMLs have apiq-meta', () => {
    let totalRules = 0;
    let totalWithMeta = 0;
    for (const yamlFile of YAML_FILES) {
      const parsed = loadRuleset(yamlFile);
      for (const rule of Object.values(parsed.rules)) {
        totalRules++;
        if (rule['apiq-meta']) totalWithMeta++;
      }
    }
    // Pre-Welle-D baseline: 110 rules across 6 yamls. Welle D adds 5 yamls
    // (P3) bringing the count to ~342. The lower bound stays 110 so the test
    // remains robust against partial parallel execution during /dev.
    expect(totalRules).toBeGreaterThanOrEqual(250);
    expect(totalWithMeta / totalRules).toBeGreaterThanOrEqual(0.95);
  });

  /**
   * T-F7 — Welle D codegen-targets coverage on language-affinity rules.
   *
   * Heuristic for "language-affinity": rule is in Lens 4 (client-friction).
   * Such rules typically have language-specific implications (type-narrowing,
   * regex-engine, identifier-validity, SDK-class-collisions, reserved-keyword
   * collisions cross-language) and SHOULD declare concrete `codegen-targets`
   * (e.g. ['typescript', 'python', 'java']) rather than the universal `['*']`.
   *
   * Genuine-universal rules (security RFC-compliance, schema-validity,
   * OAS3-conformance) keep `['*']` and are not in Lens 4 — they're skipped.
   *
   * Target: ≥80% of language-affinity rules have non-`['*']` codegen-targets.
   */
  it('codegen-targets coverage on language-affinity (Lens-4) rules >=80%', () => {
    let langAffinityCount = 0;
    let langAffinityWithConcrete = 0;
    const offenders: string[] = [];
    for (const yamlFile of YAML_FILES) {
      const parsed = loadRuleset(yamlFile);
      for (const [name, rule] of Object.entries(parsed.rules)) {
        const meta = rule['apiq-meta'] as Record<string, unknown> | undefined;
        if (!meta) continue;
        const lenses = (meta.lenses as string[] | undefined) ?? [];
        const isLensFour = lenses.includes('client-friction');
        if (!isLensFour) continue;
        langAffinityCount++;
        const targets = (meta['codegen-targets'] as string[] | undefined) ?? [];
        const isConcrete = !(targets.length === 1 && targets[0] === '*');
        if (isConcrete) {
          langAffinityWithConcrete++;
        } else {
          offenders.push(`${yamlFile}:${name}`);
        }
      }
    }
    expect(langAffinityCount).toBeGreaterThan(0);
    const ratio = langAffinityWithConcrete / langAffinityCount;
    expect(
      ratio,
      `lang-affinity codegen-targets coverage ${(ratio * 100).toFixed(1)}% ` +
        `(${langAffinityWithConcrete}/${langAffinityCount}); offenders with ['*']: ` +
        offenders.join(', ')
    ).toBeGreaterThanOrEqual(0.8);
  });
});
