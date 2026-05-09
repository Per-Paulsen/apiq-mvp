/**
 * Welle F Phase 1B — apiq-meta-block read + propagation tests.
 *
 * Phase 1B installs the infrastructure that:
 *   1. reads `apiq-meta` blocks from YAML-rule definitions at load-time;
 *   2. exposes them via `getApiqMetaForRule(ruleCode)` for downstream consumers;
 *   3. propagates them into `DetectorFinding.meta.apiqMeta` when Spectral fires
 *      a diagnostic for the rule;
 *   4. logs an apiq-meta-coverage line on every buildSpectral call, with a
 *      <95%-coverage warning that flips off once Phase 2 (F4) lands.
 *
 * These tests cover the structural pre-conditions — they do NOT yet verify
 * propagation against a live YAML-rule with an `apiq-meta` block (no rule has
 * one yet pre-F4). Phase 3 (F5) adds the comprehensive coverage tests once at
 * least one YAML-rule actually declares `apiq-meta`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  _resetSpectralCacheForTests,
  getApiqMetaForRule,
  runSpectralLayers,
  mapDiagnosticToDetectorFinding,
  type ApiqMetaYamlBlock,
} from '../../deterministic/infra/spectral-runner.js';

// Minimal valid OAS3 spec — passes Spectral's oas3-schema check, makes
// runSpectralLayers cheap to run repeatedly in tests.
const MINIMAL_SPEC = {
  openapi: '3.0.0',
  info: { title: 'Welle-F-test', version: '1.0.0' },
  paths: {},
};

// `beforeEach(_resetSpectralCacheForTests)` forces buildSpectral() to rebuild
// the full ruleset (11 yamls + ~340 rules + ~116 custom functions) on every
// test in this file. Under heavy parallel load that exceeds the vitest 5s
// default — observed flakes on `returns undefined for ...` were the rebuild
// taking >5s during contended I/O. 30s gives generous headroom while still
// catching real hangs.
describe('spectral-runner apiq-meta propagation (Welle F Phase 1B)', { timeout: 30_000 }, () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    _resetSpectralCacheForTests();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // ---------------------------------------------------------------------------
  // Public API — getApiqMetaForRule
  // ---------------------------------------------------------------------------

  it('exposes getApiqMetaForRule as a callable function', () => {
    expect(typeof getApiqMetaForRule).toBe('function');
  });

  it('returns undefined for rules that do not declare apiq-meta (pre-F4 baseline)', async () => {
    // Force buildSpectral by running once. Any current YAML-rule will populate
    // descriptions; none yet populate apiq-meta. We probe a known rule-code
    // (CL-1 is part of apiq-ruleset-client-p1.yaml — well-attested in
    // apiq-ruleset-client-p1.test.ts) and expect undefined.
    await runSpectralLayers(MINIMAL_SPEC);
    expect(getApiqMetaForRule('CL-1')).toBeUndefined();
  });

  it('returns undefined for rule-codes that do not exist at all', async () => {
    await runSpectralLayers(MINIMAL_SPEC);
    expect(getApiqMetaForRule('does-not-exist-rule-code-xyz')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Coverage logging
  // ---------------------------------------------------------------------------

  it('logs apiq-meta coverage stat on buildSpectral', async () => {
    await runSpectralLayers(MINIMAL_SPEC);
    const coverageLogs = logSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0] ?? '').includes('apiq-meta coverage:')
    );
    expect(coverageLogs.length).toBeGreaterThanOrEqual(1);
    // Format: `[spectral-runner] apiq-meta coverage: X/Y (Z.Z%)`
    expect(String(coverageLogs[0][0])).toMatch(
      /apiq-meta coverage: \d+\/\d+ \(\d+\.\d%\)/
    );
  });

  it('does NOT warn when apiq-meta coverage ≥95% (post-F4 baseline = 100%)', async () => {
    await runSpectralLayers(MINIMAL_SPEC);
    const warns = warnSpy.mock.calls.filter((call: unknown[]) =>
      String(call[0] ?? '').includes('apiq-meta coverage below 95% target')
    );
    // Pre-F4: coverage was 0% → warning fired.
    // Post-F4 (Welle F migration done, 2026-05-08): all 110 YAML-rules carry
    // an `apiq-meta` block → coverage is 100% → warning MUST NOT fire.
    expect(warns.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // DetectorFinding propagation — synthetic diagnostic
  // ---------------------------------------------------------------------------

  it('mapDiagnosticToDetectorFinding does NOT add meta.apiqMeta when rule has no apiq-meta', async () => {
    // Force ruleset to load so the apiq-meta map is populated (still empty).
    await runSpectralLayers(MINIMAL_SPEC);

    const synthetic = {
      code: 'CL-1',
      message: 'synthetic test diagnostic',
      severity: 1 as const,
      path: ['paths', '/users', 'get'],
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      },
    };
    const f = mapDiagnosticToDetectorFinding(synthetic);
    expect(f.meta?.ruleCode).toBe('CL-1');
    expect((f.meta as { apiqMeta?: ApiqMetaYamlBlock }).apiqMeta).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Reset behavior
  // ---------------------------------------------------------------------------

  it('_resetSpectralCacheForTests clears the apiq-meta map between runs', async () => {
    await runSpectralLayers(MINIMAL_SPEC);
    // Even after a full run, no rules have apiq-meta yet → map is empty.
    expect(getApiqMetaForRule('CL-1')).toBeUndefined();

    _resetSpectralCacheForTests();
    // After reset, still undefined (no entries). What we verify is the API
    // remains callable + does not throw.
    expect(getApiqMetaForRule('CL-1')).toBeUndefined();

    // Re-run + still consistent.
    await runSpectralLayers(MINIMAL_SPEC);
    expect(getApiqMetaForRule('CL-1')).toBeUndefined();
  });
});
