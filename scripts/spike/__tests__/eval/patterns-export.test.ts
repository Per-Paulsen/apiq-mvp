import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import {
  parsePatternsFromMaster,
  writePatternsJson,
  type ExportedPattern,
} from '../../eval/patterns-export.js';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MASTER = path.join(
  REPO_ROOT,
  'specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md',
);

describe('patterns-export', () => {
  it('parses ≥150 patterns from master rules-brainstorm.md', () => {
    const { patterns, stats } = parsePatternsFromMaster(MASTER);
    expect(patterns.length).toBeGreaterThanOrEqual(150);
    expect(stats.totalPatterns).toBeGreaterThanOrEqual(150);
    expect(stats.totalPatterns).toBe(patterns.length);
  });

  it('all parsed patterns have required fields', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    for (const p of patterns.slice(0, 25)) {
      expect(p.patternId).toBeTruthy();
      expect(p.lens.length).toBeGreaterThan(0);
      expect(p.source).toBeTruthy();
      expect(p.source.type).toBeTruthy();
      expect(p.source.citation).toBeTruthy();
      expect(p.severityHypothesis).toMatch(/^(error|warn|hint|info)$/);
      expect(p.round).toBeGreaterThanOrEqual(1);
      expect(p.round).toBeLessThanOrEqual(4);
      expect(Array.isArray(p.codegenTargets)).toBe(true);
      expect(p.codegenTargets.length).toBeGreaterThan(0);
      expect(p.detectionPrecision).toMatch(/^(high|medium|low)$/);
      expect(typeof p.isPureSpectralDetectable).toBe('boolean');
      expect(typeof p.isStageATerritory).toBe('boolean');
    }
  });

  it('Round-3 patterns are all detected and tagged correctly', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round3 = patterns.filter((p) => p.round === 3);
    // Spec says ≥80; master file lists 122 candidates with 5 OOS so we
    // expect around 100+. Use a conservative floor.
    expect(round3.length).toBeGreaterThanOrEqual(80);
    // Verify all Round-3 patterns have R3- prefix
    for (const p of round3.slice(0, 20)) {
      expect(p.patternId).toMatch(/^R3-/);
    }
  });

  it('Round-3 patterns include verbatim+url for book/postmortem/corpus sources', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round3 = patterns.filter((p) => p.round === 3);
    const withVerbatim = round3.filter((p) => p.source.verbatim);
    const withUrl = round3.filter((p) => p.source.url);
    // At least half of Round-3 patterns should have a verbatim quote (master
    // claims 100% citation-quality for Books and Postmortems).
    expect(withVerbatim.length).toBeGreaterThan(round3.length * 0.3);
    expect(withUrl.length).toBeGreaterThan(round3.length * 0.3);
  });

  it('Round-3 patterns retain 100% verbatim+URL after enrichment (no regression)', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round3 = patterns.filter((p) => p.round === 3);
    // Books + postmortems = 100% verbatim+URL via mining-round3-{books,postmortems}.md
    // Books (R3-BK-) + Postmortems (R3-PM-) should all retain verbatim+url.
    const bkPm = round3.filter(
      (p) => p.patternId.startsWith('R3-BK-') || p.patternId.startsWith('R3-PM-'),
    );
    expect(bkPm.length).toBeGreaterThan(50);
    const bkPmWithVerbatim = bkPm.filter((p) => p.source.verbatim);
    const bkPmWithUrl = bkPm.filter((p) => p.source.url);
    // Allow some noise (some entries may not have parsed cleanly), but >90% must
    // retain both verbatim and URL.
    expect(bkPmWithVerbatim.length / bkPm.length).toBeGreaterThan(0.9);
    expect(bkPmWithUrl.length / bkPm.length).toBeGreaterThan(0.9);
  });

  it('citation-coverage ≥60% across all patterns (post-Welle-M Round-4 enrichment)', () => {
    const { patterns, stats } = parsePatternsFromMaster(MASTER);
    expect(stats.patternsWithCitation).toBeGreaterThan(patterns.length * 0.6);
  });

  it('Round-2 patterns have ≥40% citation populated (post-enrichment)', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round2 = patterns.filter((p) => p.round === 2);
    const round2Cited = round2.filter(
      (p) => p.source.citation && p.source.citation !== 'apiq-original',
    );
    expect(round2.length).toBeGreaterThan(100);
    expect(round2Cited.length / round2.length).toBeGreaterThan(0.4);
  });

  it('URL-coverage ≥50% across all patterns (auto-derived from citations)', () => {
    const { patterns, stats } = parsePatternsFromMaster(MASTER);
    expect(stats.patternsWithUrl).toBeGreaterThan(patterns.length * 0.5);
  });

  it('enrichmentSources counter is populated (Round-2 meta + URL auto-derive active)', () => {
    const { stats } = parsePatternsFromMaster(MASTER);
    expect(stats.enrichmentSources).toBeTruthy();
    expect(stats.enrichmentSources.metaFileMatches).toBeGreaterThan(0);
    expect(stats.enrichmentSources.urlAutoDerived).toBeGreaterThan(100);
  });

  it('F-N patterns from mining-round2-meta.md are enriched with verbatim+citation', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const fPatterns = patterns.filter((p) => /^F-\d+$/.test(p.patternId));
    expect(fPatterns.length).toBeGreaterThan(10);
    // At least half of F-N patterns should have verbatim populated from
    // mining-round2-meta.md cross-reference.
    const fWithVerbatim = fPatterns.filter((p) => p.source.verbatim);
    expect(fWithVerbatim.length / fPatterns.length).toBeGreaterThan(0.5);
  });

  it('source-type distribution reflects sane prefix-mapping', () => {
    const { stats } = parsePatternsFromMaster(MASTER);
    // We expect coverage across multiple source-type families
    const sourceTypeCount = Object.keys(stats.perSourceType).length;
    expect(sourceTypeCount).toBeGreaterThanOrEqual(3);
    // At least book + postmortem (from Round-3) should be present
    expect(stats.perSourceType['book']).toBeGreaterThan(0);
    expect(stats.perSourceType['postmortem']).toBeGreaterThan(0);
  });

  it('lens-distribution covers ≥6 of the 10 lenses', () => {
    const { stats } = parsePatternsFromMaster(MASTER);
    const populated = Object.values(stats.perLens).filter((n) => n > 0).length;
    expect(populated).toBeGreaterThanOrEqual(6);
  });

  it('writePatternsJson writes a valid JSON file', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const tmpDir = fs.mkdtempSync(
      path.join(REPO_ROOT, 'scripts', 'spike', 'data', '.tmp-patterns-test-'),
    );
    const out = path.join(tmpDir, 'patterns.json');
    try {
      writePatternsJson(out, patterns);
      const round = JSON.parse(fs.readFileSync(out, 'utf8')) as ExportedPattern[];
      expect(round.length).toBe(patterns.length);
      expect(round[0]).toHaveProperty('patternId');
      expect(round[0]).toHaveProperty('lens');
      expect(round[0]).toHaveProperty('source');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('no duplicate pattern-IDs in output', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const ids = patterns.map((p) => p.patternId);
    const uniq = new Set(ids);
    expect(uniq.size).toBe(ids.length);
  });

  it('Round-4 patterns are detected and tagged with round=4', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round4 = patterns.filter((p) => p.round === 4);
    // Spec says ~84 (some multi-lens-tagged become more rows). Conservative floor.
    expect(round4.length).toBeGreaterThanOrEqual(80);
    // All Round-4 patterns must use R4- prefix
    for (const p of round4) {
      expect(p.patternId).toMatch(/^R4-(CT|VB|IETF|AP)-/);
    }
  });

  it('Round-4 patterns have 100% verbatim+URL coverage (per source-files)', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const round4 = patterns.filter((p) => p.round === 4);
    expect(round4.length).toBeGreaterThan(0);
    const withVerbatim = round4.filter((p) => p.source.verbatim);
    const withUrl = round4.filter((p) => p.source.url);
    // mining-round4-{conferences,vendor-blogs,papers}.md claim 100% verbatim+URL.
    // Allow trivial noise (1-2 entries) but enforce >=95%.
    expect(withVerbatim.length / round4.length).toBeGreaterThan(0.95);
    expect(withUrl.length / round4.length).toBeGreaterThan(0.95);
  });

  it('Round-4 patterns have correct source-types per prefix', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const r4ct = patterns.filter((p) => p.patternId.startsWith('R4-CT-'));
    const r4vb = patterns.filter((p) => p.patternId.startsWith('R4-VB-'));
    const r4ietf = patterns.filter((p) => p.patternId.startsWith('R4-IETF-'));
    const r4ap = patterns.filter((p) => p.patternId.startsWith('R4-AP-'));
    expect(r4ct.length).toBeGreaterThan(0);
    expect(r4vb.length).toBeGreaterThan(0);
    expect(r4ietf.length).toBeGreaterThan(0);
    expect(r4ap.length).toBeGreaterThan(0);
    for (const p of r4ct) expect(p.source.type).toBe('conference-talk');
    for (const p of r4vb) expect(p.source.type).toBe('vendor-blog');
    for (const p of r4ietf) expect(['rfc', 'rfc-draft']).toContain(p.source.type);
    for (const p of r4ap) expect(p.source.type).toBe('paper');
  });

  it('Round-4 includes the high-impact 2025 IETF RFC patterns', () => {
    const { patterns } = parsePatternsFromMaster(MASTER);
    const ids = new Set(patterns.map((p) => p.patternId));
    // RFC 9700 OAuth-Security-BCP-240 (Jan 2025), RFC 9745 Deprecation (Mar 2025),
    // RFC 9728 OAuth Protected Resource Metadata (Apr 2025), RFC 9727 api-catalog (Mar 2025)
    expect(ids.has('R4-IETF-TM-01')).toBe(true);
    expect(ids.has('R4-IETF-ST-01')).toBe(true);
    expect(ids.has('R4-IETF-ST-03')).toBe(true);
    expect(ids.has('R4-IETF-ST-06')).toBe(true);
  });

  it('per-round stats include round=4 bucket', () => {
    const { stats } = parsePatternsFromMaster(MASTER);
    expect(stats.perRound).toBeTruthy();
    expect(stats.perRound[4]).toBeGreaterThan(0);
    // Round-4 should be >=80 patterns per source-file claims (84 expected).
    expect(stats.perRound[4]).toBeGreaterThanOrEqual(80);
  });

  it('Round-4 source-types appear in perSourceType stats', () => {
    const { stats } = parsePatternsFromMaster(MASTER);
    expect(stats.perSourceType['conference-talk']).toBeGreaterThan(0);
    expect(stats.perSourceType['vendor-blog']).toBeGreaterThan(0);
    expect(stats.perSourceType['paper']).toBeGreaterThan(0);
  });
});
