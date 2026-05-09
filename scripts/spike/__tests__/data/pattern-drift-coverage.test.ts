/**
 * CI-Gate — Pattern-Drift Coverage (Welle Arch+ A1).
 *
 * Runs `lint-pattern-drift` over the real `patterns.json` + all
 * `apiq-ruleset-*.yaml` files and asserts that drift stays at-or-below the
 * captured baseline.
 *
 * Baseline (captured 2026-05-09, ratcheted after class-2 drift-fix-pass):
 *   class-1 (warn)  — 653  patterns.json entries without yaml-rule (orphan)
 *   class-2 (error) — 0    yaml-rule pattern-id NOT in patterns.json (was 15, fixed 2026-05-09)
 *   class-3 (warn)  — 18   severity hypothesis ≠ yaml severity
 *   class-4 (warn)  — 14   lens disjoint between patterns.json + apiq-meta
 *   class-5 (error) — 0    bundle sub-pattern-id NOT in patterns.json
 *
 * Class-1 is intentional (Stage-B-territory orphans, see patterns.json
 * `isStageATerritory` flag). The baseline cap on class-2/class-5 errors
 * prevents regression while leaving room for the user to ratchet down once
 * the existing drift is reconciled (follow-up tracked in the Welle Arch+
 * results-doc).
 */

import { describe, it, expect } from 'vitest';
import {
  lintPatternDrift,
  loadPatternsFromDisk,
  loadYamlRulesetsFromDisk,
} from '../../data/lint-pattern-drift.js';

describe('Welle Arch+ A1 — pattern-drift CI gate', () => {
  it('lint runs cleanly against patterns.json + all apiq-ruleset-*.yaml', () => {
    const patterns = loadPatternsFromDisk();
    const yamlFiles = loadYamlRulesetsFromDisk();
    const report = lintPatternDrift({ patterns, yamlFiles });

    expect(report.patternsCount).toBeGreaterThanOrEqual(950);
    expect(report.yamlRulesCount).toBeGreaterThanOrEqual(250);
    expect(report.yamlRulesWithMetaCount).toBeGreaterThanOrEqual(
      Math.floor(report.yamlRulesCount * 0.95)
    );
  });

  it('class-2 errors (yaml pattern-id NOT in patterns.json) at-or-below baseline', () => {
    const patterns = loadPatternsFromDisk();
    const yamlFiles = loadYamlRulesetsFromDisk();
    const report = lintPatternDrift({ patterns, yamlFiles });
    // Baseline ratcheted 15 → 0 on 2026-05-09 after Drift-Fix-Pass added the 13
    // missing patterns to patterns.json. Keep at 0 — any class-2 regression
    // means a yaml-rule references a pattern-id not yet mined.
    expect(report.byClass['class-2'].length).toBe(0);
  });

  it('class-5 errors (bundle sub-pattern-id NOT in patterns.json) stay at 0', () => {
    const patterns = loadPatternsFromDisk();
    const yamlFiles = loadYamlRulesetsFromDisk();
    const report = lintPatternDrift({ patterns, yamlFiles });
    expect(report.byClass['class-5']).toHaveLength(0);
  });

  it('class-3 severity-drift warnings at-or-below baseline', () => {
    const patterns = loadPatternsFromDisk();
    const yamlFiles = loadYamlRulesetsFromDisk();
    const report = lintPatternDrift({ patterns, yamlFiles });
    // Baseline 18 captured 2026-05-09.
    expect(report.byClass['class-3'].length).toBeLessThanOrEqual(18);
  });

  it('class-4 lens-disjoint warnings at-or-below baseline', () => {
    const patterns = loadPatternsFromDisk();
    const yamlFiles = loadYamlRulesetsFromDisk();
    const report = lintPatternDrift({ patterns, yamlFiles });
    // Baseline 14 captured 2026-05-09.
    expect(report.byClass['class-4'].length).toBeLessThanOrEqual(14);
  });
});
