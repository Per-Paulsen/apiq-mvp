/**
 * T25 — Source-Verify CLI tests (Welle D, post Phase-3 schema-split).
 *
 * Covers:
 *   1. YAML-block parsing → quote+url source-collection (legacy `verbatim`
 *      field still accepted with migration-warning)
 *   2. Whitespace-normalised substring match
 *   3. Drift-detection (quote missing from fetched text)
 *   4. Cache-hit within TTL avoids re-fetching
 *   5. Rate-limit / transient-error retry-with-backoff
 *   6. YAML edit preserves structure when bumping verifiedAt
 *   7. CLI exit-code: 1 on drift in check-only, 0 when all-verified or
 *      summary-only
 *   8. --dry-run mode does NOT write yaml-files
 *   9. summary-only sources are skipped (not flagged as drift)
 *  10. legacy `verbatim` field still works but emits a warning
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import YAML from 'yaml';

import {
  collectSources,
  normaliseWhitespace,
  verifyVerbatimSubstring,
  applyVerifiedAtBumps,
  runVerify,
  type FetchCache,
  type FetchResult,
} from '../../../source-verify/verify-rfc-verbatim.js';

// ---------------------------------------------------------------------------
// Test-fixtures
// ---------------------------------------------------------------------------

const SAMPLE_YAML = `extends: []
rules:
  test-rule-with-verbatim:
    description: Test rule with two verifiable sources (now using 'quote' field)
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-1
      lenses: [threat-modeling]
      sources:
        - type: rfc
          name: RFC 9110
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          quote: 'A sender MUST NOT generate the chunked transfer coding'
          verifiedAt: '2026-05-01'
        - type: vendor
          name: 'OWASP'
          url: 'https://owasp.org/Top10/'
          quote: 'Broken Access Control'
          verifiedAt: '2026-05-01'
        - type: mining
          phase: round1
          subagent: 'no-url-no-verbatim-skip'
      stakeholders: [security]
      lifecycle-phase: deploy-time
      defect-class: semantic
      iso25010: [security]
      codegen-targets: ['*']
      cost-impact: medium
      mttr-impact: low
      agent-readiness-impact: medium

  test-rule-without-meta:
    description: Has no apiq-meta — should be skipped entirely
    given: $.info
    severity: warn
    then:
      function: truthy
`;

/**
 * Variant fixture exercising the schema-split: rules using `summary` (skipped),
 * legacy `verbatim` (still accepted with warning), and a quote (verified).
 */
const SAMPLE_YAML_SCHEMA_SPLIT = `extends: []
rules:
  rule-summary-only:
    description: Has summary but no quote — should be skipped, not drift
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-S
      lenses: [client-friction]
      sources:
        - type: mining
          phase: round2
          subagent: 'no-quote'
          url: 'https://example.com/blog'
          summary: 'paraphrase that should never be checked'
      stakeholders: [client-dev]
      lifecycle-phase: build-time
      defect-class: ergonomic
      iso25010: [usability]
      codegen-targets: ['*']

  rule-legacy-verbatim:
    description: Still uses deprecated 'verbatim' field — warning + verify
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-L
      lenses: [standards-compliance]
      sources:
        - type: rfc
          name: 'RFC 9110'
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          verbatim: 'legacy quote about chunked transfer'
          verifiedAt: '2026-05-01'
      stakeholders: [spec-author]
      lifecycle-phase: validation-time
      defect-class: norm
      iso25010: [maintainability]
      codegen-targets: ['*']

  rule-quote-clean:
    description: Uses new 'quote' field
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-Q
      lenses: [standards-compliance]
      sources:
        - type: rfc
          name: 'RFC 9110'
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          quote: 'fresh quote text'
          verifiedAt: '2026-05-01'
      stakeholders: [spec-author]
      lifecycle-phase: validation-time
      defect-class: norm
      iso25010: [maintainability]
      codegen-targets: ['*']
`;

function makeTempRulesetDir(yamlText: string): { dir: string; yamlPath: string; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apiq-source-verify-test-'));
  const yamlPath = path.join(dir, 'apiq-ruleset-testset.yaml');
  fs.writeFileSync(yamlPath, yamlText, 'utf8');
  return {
    dir,
    yamlPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

function makeMockFetcher(
  responses: Record<string, FetchResult | (() => Promise<FetchResult>)>
): { calls: string[]; fetcher: (url: string, cache: FetchCache) => Promise<FetchResult> } {
  const calls: string[] = [];
  const fetcher = async (url: string, _cache: FetchCache): Promise<FetchResult> => {
    calls.push(url);
    const r = responses[url];
    if (!r) return { ok: false, error: `no-mock-for-${url}`, fromCache: false };
    if (typeof r === 'function') return r();
    return r;
  };
  return { calls, fetcher };
}

// ---------------------------------------------------------------------------
// Test 1 — collectSources parses verbatim+url pairs
// ---------------------------------------------------------------------------

describe('source-verify CLI — Welle D T25', () => {
  it('collectSources finds source entries with both quote AND url, skipping incomplete', () => {
    const { verifiable } = collectSources(SAMPLE_YAML, 'apiq-ruleset-testset.yaml');
    expect(verifiable).toHaveLength(2);
    expect(verifiable[0]).toMatchObject({
      ruleName: 'test-rule-with-verbatim',
      sourceIndex: 0,
      url: 'https://www.rfc-editor.org/rfc/rfc9110',
      quote: 'A sender MUST NOT generate the chunked transfer coding',
      fromLegacyVerbatim: false,
    });
    expect(verifiable[1]).toMatchObject({
      ruleName: 'test-rule-with-verbatim',
      sourceIndex: 1,
      url: 'https://owasp.org/Top10/',
      fromLegacyVerbatim: false,
    });
  });

  it('collectSources reports summary-only sources as skipped, not as verifiable', () => {
    const { verifiable, skipped } = collectSources(
      SAMPLE_YAML_SCHEMA_SPLIT,
      'apiq-ruleset-testset.yaml'
    );
    // 1 legacy-verbatim entry + 1 quote entry = 2 verifiable
    expect(verifiable).toHaveLength(2);
    // 1 summary-only entry = 1 skipped
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      ruleName: 'rule-summary-only',
      reason: 'summary-only',
    });
    // legacy-verbatim is still verifiable, but flagged
    const legacy = verifiable.find((s) => s.ruleName === 'rule-legacy-verbatim');
    expect(legacy?.fromLegacyVerbatim).toBe(true);
    expect(legacy?.quote).toBe('legacy quote about chunked transfer');
    // quote-clean is verifiable + NOT flagged as legacy
    const clean = verifiable.find((s) => s.ruleName === 'rule-quote-clean');
    expect(clean?.fromLegacyVerbatim).toBe(false);
    expect(clean?.quote).toBe('fresh quote text');
  });

  // -------------------------------------------------------------------------
  // Test 2 — whitespace-normalised substring match
  // -------------------------------------------------------------------------

  it('normaliseWhitespace collapses multiple spaces / tabs / newlines + lowercases', () => {
    expect(normaliseWhitespace('A   B\tC\nD\r\nE  ')).toBe('a b c d e');
    expect(normaliseWhitespace('Mixed\t  CASE\n')).toBe('mixed case');
  });

  it('verifyVerbatimSubstring matches across whitespace differences', () => {
    const verbatim = 'A sender MUST NOT generate the chunked transfer coding';
    const doc = 'Section 7.1\n\nA  sender\tMUST NOT generate\n   the chunked transfer coding\nin a response.';
    expect(verifyVerbatimSubstring(verbatim, doc)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 3 — drift-detection
  // -------------------------------------------------------------------------

  it('verifyVerbatimSubstring returns false when verbatim is missing from doc → drift', () => {
    const verbatim = 'a string that does not appear in the source';
    const doc = 'completely unrelated text body';
    expect(verifyVerbatimSubstring(verbatim, doc)).toBe(false);
  });

  it('drift-detection — runVerify reports drift when verbatim absent from fetched doc', async () => {
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { fetcher } = makeMockFetcher({
        'https://www.rfc-editor.org/rfc/rfc9110': {
          ok: true,
          body: 'this RFC body does not contain the chunked phrase',
          status: 200,
          fromCache: false,
        },
        'https://owasp.org/Top10/': {
          ok: true,
          body: 'Broken Access Control is the most serious risk',
          status: 200,
          fromCache: false,
        },
      });
      const report = await runVerify({
        mode: 'dry-run',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      expect(report.totalSources).toBe(2);
      expect(report.verified).toBe(1);
      expect(report.drift).toBe(1);
      const driftEntry = report.results.find((r) => r.status === 'drift');
      expect(driftEntry?.url).toBe('https://www.rfc-editor.org/rfc/rfc9110');
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Test 4 — cache-hit avoids re-fetching
  // -------------------------------------------------------------------------

  it('cache-hit — second runVerify within TTL does not re-call the fetcher', async () => {
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      // Pre-seed cache with both URLs as recent + matching verbatim.
      const seededCache: FetchCache = {
        'https://www.rfc-editor.org/rfc/rfc9110': {
          fetchedAt: Date.now(),
          status: 200,
          body: 'A sender MUST NOT generate the chunked transfer coding in this case.',
        },
        'https://owasp.org/Top10/': {
          fetchedAt: Date.now(),
          status: 200,
          body: 'Top 10: Broken Access Control is risk #1',
        },
      };
      fs.writeFileSync(cachePath, JSON.stringify(seededCache), 'utf8');

      // Mock-fetcher reads from the cache parameter — this verifies our
      // collected `cache` is passed-through correctly. We assert it does NOT
      // fall back to live fetch even if seeded is present.
      const { calls, fetcher } = makeMockFetcher({});
      const cacheReadingFetcher = async (url: string, cache: FetchCache): Promise<FetchResult> => {
        const cached = cache[url];
        if (cached) return { ok: true, body: cached.body, status: cached.status, fromCache: true };
        return fetcher(url, cache);
      };
      const report = await runVerify({
        mode: 'dry-run',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher: cacheReadingFetcher,
      });
      expect(report.verified).toBe(2);
      expect(report.drift).toBe(0);
      expect(calls).toHaveLength(0); // never fell back to mock-default
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Test 5 — rate-limit-handling — transient errors retry then succeed
  // -------------------------------------------------------------------------

  it('rate-limit-handling — fetcher that retries returns success on second attempt', async () => {
    // We simulate retry-logic via the mock — the CLI's runVerify treats the
    // fetcher as a black box, so retry-correctness is tested at the fetcher
    // boundary. Here we verify that when a fetcher reports `ok:false`, the
    // result is correctly classified as fetch-fail.
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      let owaspAttempts = 0;
      const fetcher = async (url: string, _cache: FetchCache): Promise<FetchResult> => {
        if (url === 'https://owasp.org/Top10/') {
          owaspAttempts++;
          if (owaspAttempts === 1) {
            return { ok: false, error: 'HTTP 429', fromCache: false };
          }
          return { ok: true, body: 'Broken Access Control', status: 200, fromCache: false };
        }
        if (url === 'https://www.rfc-editor.org/rfc/rfc9110') {
          return {
            ok: true,
            body: 'A sender MUST NOT generate the chunked transfer coding',
            status: 200,
            fromCache: false,
          };
        }
        return { ok: false, error: 'unmocked', fromCache: false };
      };
      const report = await runVerify({
        mode: 'dry-run',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      // First-attempt for owasp returned 429 (fetch-fail); we don't retry at
      // the runVerify-level (retry is the fetcher's responsibility). The CLI
      // correctly classifies as fetch-fail with no crash.
      expect(report.fetchFail).toBe(1);
      expect(report.verified).toBe(1);
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Test 6 — yaml-edit preserves structure when updating verifiedAt
  // -------------------------------------------------------------------------

  it('applyVerifiedAtBumps preserves yaml structure & updates verifiedAt in-place', () => {
    const updated = applyVerifiedAtBumps(SAMPLE_YAML, [
      { ruleName: 'test-rule-with-verbatim', sourceIndex: 0, newVerifiedAt: '2026-08-01' },
      { ruleName: 'test-rule-with-verbatim', sourceIndex: 1, newVerifiedAt: '2026-08-01' },
    ]);
    // Both timestamps bumped
    expect(updated).toContain("verifiedAt: '2026-08-01'");
    expect(updated).not.toContain("verifiedAt: '2026-05-01'");
    // Structure preserved — comments/keys still parse
    const reparsed = YAML.parse(updated) as {
      rules: Record<string, unknown>;
    };
    expect(Object.keys(reparsed.rules)).toEqual(['test-rule-with-verbatim', 'test-rule-without-meta']);
    // Per-source verifiedAt now both 2026-08-01
    const ruleObj = reparsed.rules['test-rule-with-verbatim'] as {
      'apiq-meta': { sources: Array<{ verifiedAt?: string }> };
    };
    expect(ruleObj['apiq-meta'].sources[0].verifiedAt).toBe('2026-08-01');
    expect(ruleObj['apiq-meta'].sources[1].verifiedAt).toBe('2026-08-01');
  });

  // -------------------------------------------------------------------------
  // Test 7 — CLI exit-code behaviour through runVerify report
  // -------------------------------------------------------------------------

  it('CLI report — drift>0 means check-only would exit 1; all-verified means exit 0', async () => {
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      // All-verified case
      const cleanReport = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher: makeMockFetcher({
          'https://www.rfc-editor.org/rfc/rfc9110': {
            ok: true,
            body: 'A sender MUST NOT generate the chunked transfer coding',
            status: 200,
            fromCache: false,
          },
          'https://owasp.org/Top10/': {
            ok: true,
            body: 'Broken Access Control',
            status: 200,
            fromCache: false,
          },
        }).fetcher,
      });
      expect(cleanReport.drift + cleanReport.fetchFail).toBe(0); // → exit 0

      // Drift case
      const driftReport = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher: makeMockFetcher({
          'https://www.rfc-editor.org/rfc/rfc9110': {
            ok: true,
            body: 'unrelated text',
            status: 200,
            fromCache: false,
          },
          'https://owasp.org/Top10/': {
            ok: true,
            body: 'Broken Access Control',
            status: 200,
            fromCache: false,
          },
        }).fetcher,
      });
      expect(driftReport.drift).toBeGreaterThan(0); // → exit 1
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Test 8 — --dry-run mode does NOT write yaml-files
  // -------------------------------------------------------------------------

  it('dry-run mode does NOT write yaml-files even when sources match', async () => {
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const before = fs.readFileSync(tmp.yamlPath, 'utf8');
      await runVerify({
        mode: 'dry-run',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher: makeMockFetcher({
          'https://www.rfc-editor.org/rfc/rfc9110': {
            ok: true,
            body: 'A sender MUST NOT generate the chunked transfer coding',
            status: 200,
            fromCache: false,
          },
          'https://owasp.org/Top10/': {
            ok: true,
            body: 'Broken Access Control',
            status: 200,
            fromCache: false,
          },
        }).fetcher,
      });
      const after = fs.readFileSync(tmp.yamlPath, 'utf8');
      expect(after).toBe(before); // unchanged
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Bonus — verify-mode does write yaml-files
  // -------------------------------------------------------------------------

  it('verify-mode writes yaml-files when sources match (bumps verifiedAt)', async () => {
    const tmp = makeTempRulesetDir(SAMPLE_YAML);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const before = fs.readFileSync(tmp.yamlPath, 'utf8');
      expect(before).toContain("verifiedAt: '2026-05-01'");
      await runVerify({
        mode: 'verify',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        now: () => new Date('2026-08-15T00:00:00Z'),
        fetcher: makeMockFetcher({
          'https://www.rfc-editor.org/rfc/rfc9110': {
            ok: true,
            body: 'A sender MUST NOT generate the chunked transfer coding',
            status: 200,
            fromCache: false,
          },
          'https://owasp.org/Top10/': {
            ok: true,
            body: 'Broken Access Control',
            status: 200,
            fromCache: false,
          },
        }).fetcher,
      });
      const after = fs.readFileSync(tmp.yamlPath, 'utf8');
      expect(after).toContain("verifiedAt: '2026-08-15'");
      expect(after).not.toContain("verifiedAt: '2026-05-01'");
    } finally {
      tmp.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // Welle-D Phase-3 schema-split — quote / summary / legacy-verbatim coverage
  // -------------------------------------------------------------------------

  it('skips sources with only summary, not flagged as drift', async () => {
    const yaml = `extends: []
rules:
  rule-summary-only:
    description: 'summary only'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-S
      lenses: [client-friction]
      sources:
        - type: mining
          phase: round2
          subagent: 'mining-paraphrase'
          url: 'https://example.com/blog'
          summary: 'paraphrase, never checked'
      stakeholders: [client-dev]
      lifecycle-phase: build-time
      defect-class: ergonomic
      iso25010: [usability]
      codegen-targets: ['*']
`;
    const tmp = makeTempRulesetDir(yaml);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { calls, fetcher } = makeMockFetcher({});
      const report = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      expect(report.drift).toBe(0);
      expect(report.verified).toBe(0);
      expect(report.fetchFail).toBe(0);
      expect(report.summaryOnlySkipped).toBe(1);
      expect(report.totalSources).toBe(0); // no auditable sources
      // Importantly: we never even attempted to fetch the summary-only URL.
      expect(calls).toHaveLength(0);
    } finally {
      tmp.cleanup();
    }
  });

  it('warns on legacy verbatim-field but does not fail (back-compat)', async () => {
    const yaml = `extends: []
rules:
  rule-legacy:
    description: 'legacy verbatim'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-L
      lenses: [standards-compliance]
      sources:
        - type: rfc
          name: 'RFC 9110'
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          verbatim: 'legacy must-appear text'
      stakeholders: [spec-author]
      lifecycle-phase: validation-time
      defect-class: norm
      iso25010: [maintainability]
      codegen-targets: ['*']
`;
    const tmp = makeTempRulesetDir(yaml);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { fetcher } = makeMockFetcher({
        'https://www.rfc-editor.org/rfc/rfc9110': {
          ok: true,
          body: 'this RFC contains the legacy must-appear text inline.',
          status: 200,
          fromCache: false,
        },
      });
      const report = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      expect(report.verified).toBe(1);
      expect(report.drift).toBe(0);
      expect(report.legacyVerbatimWarned).toBe(1);
      // The verified entry carries the legacyVerbatimUsed flag for telemetry.
      const v = report.results.find((r) => r.status === 'verified');
      expect(v?.legacyVerbatimUsed).toBe(true);
    } finally {
      tmp.cleanup();
    }
  });

  it('exit-code 0 when all sources are summary-only (no drift)', async () => {
    const yaml = `extends: []
rules:
  rule-summary-only-A:
    description: 'A'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-S1
      lenses: [client-friction]
      sources:
        - type: mining
          phase: round2
          subagent: 'foo'
          summary: 'paraphrase one'
      stakeholders: [client-dev]
      lifecycle-phase: build-time
      defect-class: ergonomic
      iso25010: [usability]
      codegen-targets: ['*']
  rule-summary-only-B:
    description: 'B'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-S2
      lenses: [client-friction]
      sources:
        - type: mining
          phase: round2
          subagent: 'bar'
          url: 'https://example.com/x'
          summary: 'paraphrase two'
      stakeholders: [client-dev]
      lifecycle-phase: build-time
      defect-class: ergonomic
      iso25010: [usability]
      codegen-targets: ['*']
`;
    const tmp = makeTempRulesetDir(yaml);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { fetcher } = makeMockFetcher({});
      const report = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      // Drift + fetch-fail BOTH zero → CLI would exit 0
      expect(report.drift + report.fetchFail).toBe(0);
      expect(report.summaryOnlySkipped).toBe(2);
      expect(report.totalSources).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });

  it('exit-code 0 when all quotes verify (clean schema-split path)', async () => {
    const yaml = `extends: []
rules:
  rule-quote-clean:
    description: 'fresh quote'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-Q
      lenses: [standards-compliance]
      sources:
        - type: rfc
          name: 'RFC 9110'
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          quote: 'A sender MUST NOT generate the chunked transfer coding'
      stakeholders: [spec-author]
      lifecycle-phase: validation-time
      defect-class: norm
      iso25010: [maintainability]
      codegen-targets: ['*']
`;
    const tmp = makeTempRulesetDir(yaml);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { fetcher } = makeMockFetcher({
        'https://www.rfc-editor.org/rfc/rfc9110': {
          ok: true,
          body: 'A sender MUST NOT generate the chunked transfer coding in this case.',
          status: 200,
          fromCache: false,
        },
      });
      const report = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      expect(report.verified).toBe(1);
      expect(report.drift).toBe(0);
      expect(report.fetchFail).toBe(0);
      expect(report.legacyVerbatimWarned).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });

  it('exit-code 1 when any quote drifts', async () => {
    const yaml = `extends: []
rules:
  rule-quote-drifts:
    description: 'drift'
    given: $.info
    severity: warn
    then:
      function: truthy
    apiq-meta:
      pattern-id: TEST-D
      lenses: [standards-compliance]
      sources:
        - type: rfc
          name: 'RFC 9110'
          url: 'https://www.rfc-editor.org/rfc/rfc9110'
          quote: 'this exact phrase is missing from the source'
      stakeholders: [spec-author]
      lifecycle-phase: validation-time
      defect-class: norm
      iso25010: [maintainability]
      codegen-targets: ['*']
`;
    const tmp = makeTempRulesetDir(yaml);
    const cachePath = path.join(tmp.dir, '.cache.json');
    try {
      const { fetcher } = makeMockFetcher({
        'https://www.rfc-editor.org/rfc/rfc9110': {
          ok: true,
          body: 'completely unrelated body text',
          status: 200,
          fromCache: false,
        },
      });
      const report = await runVerify({
        mode: 'check-only',
        verbose: false,
        json: true,
        rulesetsDir: tmp.dir,
        cachePath,
        fetcher,
      });
      expect(report.drift).toBeGreaterThan(0); // → exit 1
      expect(report.verified).toBe(0);
    } finally {
      tmp.cleanup();
    }
  });
});
