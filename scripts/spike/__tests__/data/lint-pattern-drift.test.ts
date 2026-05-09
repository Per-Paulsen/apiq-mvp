/**
 * Tests for `scripts/spike/data/lint-pattern-drift.ts`.
 *
 * Drift classes covered (see lint-pattern-drift.ts header for definitions):
 *   class-1  patternId in patterns.json without yaml-rule         (warn)
 *   class-2  yaml-rule pattern-id NOT in patterns.json            (error)
 *   class-3  severityHypothesis ≠ yaml rule severity              (warn)
 *   class-4  patterns.json `lens` disjoint from apiq-meta.lenses  (warn)
 *   class-5  bundle-rule sub-pattern-id NOT in patterns.json      (error)
 *   clean   negative case (no drift)
 */

import { describe, it, expect } from 'vitest';
import {
  lintPatternDrift,
  type LintInput,
  type PatternEntry,
} from '../../data/lint-pattern-drift.js';

function patterns(...entries: PatternEntry[]): PatternEntry[] {
  return entries;
}

function yamlFile(
  fileName: string,
  rules: Record<string, unknown>
): LintInput['yamlFiles'][number] {
  return { fileName, ruleset: { rules } as never };
}

describe('lint-pattern-drift', () => {
  it('class-1: patternId in patterns.json without yaml-rule → warn', () => {
    const input: LintInput = {
      patterns: patterns({
        patternId: 'X-1',
        lens: ['threat-modeling'],
        severityHypothesis: 'warn',
      }),
      yamlFiles: [yamlFile('apiq-ruleset.yaml', {})],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-1']).toHaveLength(1);
    const f = report.byClass['class-1'][0];
    expect(f.severity).toBe('warn');
    expect(f.patternId).toBe('X-1');
  });

  it('class-2: yaml-rule pattern-id NOT in patterns.json → error', () => {
    const input: LintInput = {
      patterns: patterns(),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-orphan-rule': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'PHANTOM-99',
              lenses: ['threat-modeling'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-2']).toHaveLength(1);
    expect(report.errors).toHaveLength(1);
    expect(report.byClass['class-2'][0].patternId).toBe('PHANTOM-99');
    expect(report.byClass['class-2'][0].severity).toBe('error');
  });

  it('class-3: severity hypothesis ≠ yaml severity → warn', () => {
    const input: LintInput = {
      patterns: patterns({
        patternId: 'Y-1',
        lens: ['threat-modeling'],
        severityHypothesis: 'error',
      }),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-y1': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'Y-1',
              lenses: ['threat-modeling'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-3']).toHaveLength(1);
    const f = report.byClass['class-3'][0];
    expect(f.severity).toBe('warn');
    expect(f.detail).toMatchObject({ hypothesis: 'error', yamlSeverity: 'warn' });
  });

  it('class-4: lens disjoint between patterns.json and apiq-meta → warn', () => {
    const input: LintInput = {
      patterns: patterns({
        patternId: 'Z-1',
        lens: ['threat-modeling'],
        severityHypothesis: 'warn',
      }),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-z1': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'Z-1',
              lenses: ['evolution-friction'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-4']).toHaveLength(1);
    expect(report.byClass['class-4'][0].severity).toBe('warn');
  });

  it('class-4 subset overlap is OK (no false positive)', () => {
    const input: LintInput = {
      patterns: patterns({
        patternId: 'Z-2',
        lens: ['threat-modeling', 'client-friction'],
        severityHypothesis: 'warn',
      }),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-z2': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'Z-2',
              lenses: ['threat-modeling'], // subset → overlap → no drift
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-4']).toHaveLength(0);
  });

  it('class-5: bundle-rule sub-pattern-id NOT in patterns.json → error', () => {
    const input: LintInput = {
      patterns: patterns(
        {
          patternId: 'Y-25',
          lens: ['threat-modeling'],
          severityHypothesis: 'hint',
        }
        // RFC2-90 intentionally absent → drift
      ),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-bundle': {
            severity: 'hint',
            'apiq-meta': {
              'pattern-id': ['Y-25', 'RFC2-90'],
              lenses: ['threat-modeling'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.byClass['class-5']).toHaveLength(1);
    expect(report.byClass['class-5'][0].patternId).toBe('RFC2-90');
    expect(report.byClass['class-5'][0].severity).toBe('error');
    // The other half of the bundle (Y-25) must NOT be flagged.
    expect(
      report.byClass['class-5'].some((f) => f.patternId === 'Y-25')
    ).toBe(false);
  });

  it('clean case: no drift when patterns.json + yaml are aligned', () => {
    const input: LintInput = {
      patterns: patterns(
        {
          patternId: 'A1',
          lens: ['standards-compliance'],
          severityHypothesis: 'error',
        },
        {
          patternId: 'Y-1',
          lens: ['threat-modeling'],
          severityHypothesis: 'warn',
        }
      ),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-a1': {
            severity: 'error',
            'apiq-meta': {
              'pattern-id': 'A1',
              lenses: ['standards-compliance'],
            },
          },
          'apiq-y1': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'Y-1',
              lenses: ['threat-modeling', 'client-friction'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.findings).toHaveLength(0);
    expect(report.errors).toHaveLength(0);
    expect(report.warnings).toHaveLength(0);
  });

  it('aggregates totals + byClass groupings correctly', () => {
    const input: LintInput = {
      patterns: patterns(
        {
          patternId: 'P1',
          lens: ['threat-modeling'],
          severityHypothesis: 'error',
        },
        {
          patternId: 'P2', // class-1 (no yaml-rule)
          lens: ['threat-modeling'],
          severityHypothesis: 'warn',
        }
      ),
      yamlFiles: [
        yamlFile('apiq-ruleset.yaml', {
          'apiq-p1': {
            severity: 'error',
            'apiq-meta': {
              'pattern-id': 'P1',
              lenses: ['threat-modeling'],
            },
          },
          'apiq-phantom': {
            severity: 'warn',
            'apiq-meta': {
              'pattern-id': 'PHANTOM', // class-2
              lenses: ['threat-modeling'],
            },
          },
        }),
      ],
    };
    const report = lintPatternDrift(input);
    expect(report.patternsCount).toBe(2);
    expect(report.yamlRulesCount).toBe(2);
    expect(report.yamlRulesWithMetaCount).toBe(2);
    expect(report.byClass['class-1']).toHaveLength(1);
    expect(report.byClass['class-2']).toHaveLength(1);
    expect(report.findings).toHaveLength(2);
    expect(report.errors).toHaveLength(1);
    expect(report.warnings).toHaveLength(1);
  });
});
