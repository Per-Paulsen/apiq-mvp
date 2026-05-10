/**
 * Welle I — I1 smoke-test for `build-inventory.ts`.
 *
 * Asserts that the static-analysis extraction produces the canonical
 * inventory.json shape with sane totals. Other Welle-I agents (I3/I4/I5)
 * consume this schema, so we lock the top-level keys + minimum totals here.
 */

import { describe, it, expect } from 'vitest';
import { buildInventory } from '../../eval/build-inventory.js';

describe('build-inventory (Welle I — I1)', () => {
  const inv = buildInventory();

  it('exposes all top-level inventory keys', () => {
    expect(inv).toHaveProperty('generated_at');
    expect(inv).toHaveProperty('yaml_rules');
    expect(inv).toHaveProperty('modules');
    expect(inv).toHaveProperty('aggregators');
    expect(inv).toHaveProperty('classifiers');
    expect(inv).toHaveProperty('custom_functions');
    expect(inv).toHaveProperty('test_files');
    expect(inv).toHaveProperty('patterns_substrate');
    expect(inv).toHaveProperty('totals');
  });

  it('generated_at is a valid ISO timestamp', () => {
    expect(() => new Date(inv.generated_at).toISOString()).not.toThrow();
    expect(new Date(inv.generated_at).toString()).not.toBe('Invalid Date');
  });

  it('extracts >300 yaml-rules (Welle Arch+ baseline ~342, current ~354)', () => {
    expect(inv.totals.yaml_rules).toBeGreaterThan(300);
    expect(inv.yaml_rules.length).toBe(inv.totals.yaml_rules);
  });

  it('extracts 13+ module-classes', () => {
    expect(inv.totals.modules).toBeGreaterThanOrEqual(13);
    expect(inv.modules.length).toBe(inv.totals.modules);
  });

  it('extracts 25+ aggregators (walkers)', () => {
    expect(inv.totals.aggregators).toBeGreaterThanOrEqual(25);
    expect(inv.aggregators.length).toBe(inv.totals.aggregators);
  });

  it('extracts 4 classifiers', () => {
    expect(inv.totals.classifiers).toBe(4);
    expect(inv.classifiers.length).toBe(4);
  });

  it('counts >100 registered custom-functions (CLAUDE.md baseline 116, current 127)', () => {
    expect(inv.totals.custom_functions).toBeGreaterThan(100);
  });

  it('extracts custom-function source-files', () => {
    expect(inv.totals.custom_function_files).toBeGreaterThanOrEqual(10);
    expect(inv.custom_functions.length).toBe(inv.totals.custom_function_files);
  });

  it('extracts >50 test-files', () => {
    expect(inv.totals.test_files).toBeGreaterThan(50);
    expect(inv.test_files.length).toBe(inv.totals.test_files);
  });

  it('patterns substrate has >900 entries (CLAUDE.md baseline 959, current 972)', () => {
    expect(inv.patterns_substrate.total).toBeGreaterThan(900);
    expect(inv.patterns_substrate.stage_a_count).toBeGreaterThan(0);
    expect(Object.keys(inv.patterns_substrate.by_lens).length).toBeGreaterThan(0);
  });

  it('every yaml-rule has the canonical shape (name, file, severity, given, function, apiq_meta)', () => {
    for (const r of inv.yaml_rules.slice(0, 50)) {
      expect(r).toHaveProperty('name');
      expect(typeof r.name).toBe('string');
      expect(r.file).toMatch(/scripts\/spike\/deterministic\/rules\/.*\.yaml$/);
      expect(r).toHaveProperty('severity');
      expect(r).toHaveProperty('given');
      expect(r).toHaveProperty('function'); // may be null
      expect(r.apiq_meta).toBeDefined();
      expect(typeof r.apiq_meta).toBe('object');
    }
  });

  it('every detector entry has wired_in_index boolean', () => {
    for (const d of [...inv.modules, ...inv.aggregators, ...inv.classifiers]) {
      expect(typeof d.wired_in_index).toBe('boolean');
      expect(Array.isArray(d.exports)).toBe(true);
      expect(Array.isArray(d.pattern_ids_handled)).toBe(true);
    }
  });

  it('spec-diff module is present but flagged as orphan (not wired)', () => {
    const specDiff = inv.modules.find((m) => m.file.endsWith('spec-diff.ts'));
    expect(specDiff, 'spec-diff.ts should be present in modules/').toBeDefined();
    expect(specDiff!.wired_in_index).toBe(false);
  });

  it('http-protocol-pairings module is wired and handles known patternIds', () => {
    const mod = inv.modules.find((m) => m.file.endsWith('http-protocol-pairings.ts'));
    expect(mod).toBeDefined();
    expect(mod!.wired_in_index).toBe(true);
    expect(mod!.pattern_ids_handled.length).toBeGreaterThan(0);
    // RFC2-40 (POST→201/200/202) is one of the canonical patterns it handles.
    expect(mod!.pattern_ids_handled).toContain('RFC2-40');
  });

  it('niche-functions exports are referenced by yaml rules', () => {
    const niche = inv.custom_functions.find((f) =>
      f.file.endsWith('niche-functions.ts')
    );
    expect(niche).toBeDefined();
    expect(niche!.exports.length).toBeGreaterThan(5);
    // Welle D2 niche-functions are wired by apiq-ruleset-niche.yaml.
    expect(niche!.used_by_yaml_rules.length).toBeGreaterThan(0);
  });
});
