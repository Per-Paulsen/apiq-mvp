import { describe, it, expect } from 'vitest';
import {
  clusterKeyFor,
  clusterFindings,
  RepetitionClusterScorer,
} from '../../eval/scorers/repetition-cluster.js';
import type { Finding } from '../../schema.js';

function llm(over: Partial<Finding> & { title: string }): Finding {
  return {
    title: over.title,
    narration:
      over.narration ??
      'LLM-emitted narration for repetition-cluster tests; needs at least fifty characters here.',
    rationale: over.rationale ?? 'LLM rationale text long enough to satisfy validation.',
    category: over.category ?? 'clarity',
    severity: over.severity ?? 'medium',
    scope: over.scope ?? 'spec',
    affectedEndpoints: over.affectedEndpoints ?? [],
    patchOps: over.patchOps ?? [],
    patchSummary: over.patchSummary ?? 'Apply patch.',
  };
}

describe('clusterKeyFor', () => {
  it('treats parens-stripped phrasing as equivalent', () => {
    const a = clusterKeyFor('Missing 429 (Too Many Requests) response definition');
    const b = clusterKeyFor('Missing 429 Too Many Requests response definition');
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('collapses token-bag with reordered tokens to the same key', () => {
    const a = clusterKeyFor('Missing limit constraint');
    const b = clusterKeyFor('Constraint missing on limit');
    expect(a).toBe(b);
  });

  it('returns empty string on empty input without throwing', () => {
    expect(clusterKeyFor('')).toBe('');
    expect(clusterKeyFor('   ')).toBe('');
  });
});

describe('clusterFindings', () => {
  it('reports correct uniqueClusters / repetitionRate / largestClusterSize on a synthetic 10-finding array', () => {
    // 3 unique clusters by design — token-bag (sorted, singularised, stop-words dropped):
    //   A: "429 missing response" × 5
    //   B: "server slash trailing url" × 3
    //   C: "level missing tag top" × 2
    // Stop-words used here that DO get dropped: "the", "for", "in", "on", "by", "to".
    const findings: Finding[] = [
      // Cluster A — token-bag {429, missing, response}.
      llm({ title: 'Missing 429 response' }),
      llm({ title: '429 response missing' }),
      llm({ title: 'Missing the 429 response' }),
      llm({ title: 'Response missing for 429' }),
      llm({ title: '429 missing response' }),
      // Cluster B — token-bag {server, url, trailing, slash}.
      llm({ title: 'Server URL trailing slash' }),
      llm({ title: 'Trailing slash in server URL' }),
      llm({ title: 'Slash trailing on server URL' }),
      // Cluster C — token-bag {level, missing, tag, top}.
      llm({ title: 'Top-level tags missing' }),
      llm({ title: 'Missing top-level tags' }),
    ];

    const result = clusterFindings(findings);
    expect(result.totalFindings).toBe(10);
    expect(result.uniqueClusters).toBe(3);
    // 1 - 3/10 = 0.7
    expect(result.repetitionRate).toBeCloseTo(0.7, 10);
    expect(result.largestClusterSize).toBe(5);
  });

  it('returns zero-stats on empty findings array', () => {
    const result = clusterFindings([]);
    expect(result.totalFindings).toBe(0);
    expect(result.uniqueClusters).toBe(0);
    expect(result.repetitionRate).toBe(0);
    expect(result.largestClusterSize).toBe(0);
  });
});

describe('RepetitionClusterScorer', () => {
  it('works without a reference target (reference: null)', () => {
    const findings: Finding[] = [
      llm({ title: 'Missing 429 response' }),
      llm({ title: '429 response missing' }),
    ];
    const result = RepetitionClusterScorer.score({
      reference: null,
      llmFindings: findings,
      runMeta: { spec: 'test', architecture: 'test' },
    });
    expect(result.scorerName).toBe('repetition-cluster');
    expect(result.totalFindings).toBe(2);
    expect(result.uniqueClusters).toBe(1);
  });
});
