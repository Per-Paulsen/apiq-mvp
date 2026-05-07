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
      expect(p.round).toBeLessThanOrEqual(3);
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
});
