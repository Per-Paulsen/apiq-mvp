/**
 * Classification scorer — STUB.
 *
 * Classifies LLM-emitted findings into three buckets:
 *   - deterministic-class: would have been found by the Stage 4 Deterministic
 *     Layer (Spectral-class + custom rules). Should NOT count toward LLM
 *     differentiator-credit.
 *   - knowledge-class: knowledge-backed-gap findings — the differentiator.
 *   - repetition-class: per-endpoint variants of a common pattern that the
 *     deterministic layer would roll up.
 *
 * Full implementation deferred to Phase A (after Deterministic Layer ships).
 * The Deterministic Layer's pattern-list will provide the "would have been
 * found" oracle this scorer needs.
 *
 * Until then: returns all findings as 'unclassified' so the Runner / Comparison
 * pipeline still works end-to-end.
 */

import type { Finding } from '../../schema.js';
import type { Scorer } from '../types.js';

export type FindingClass = 'deterministic' | 'knowledge' | 'repetition' | 'unclassified';

export interface ClassificationResult {
  scorerName: 'classification';
  /** Always present; with the stub all are 'unclassified'. */
  perFinding: Array<{ index: number; class: FindingClass; reason: string }>;
  counts: Record<FindingClass, number>;
  /** True once the Deterministic Layer is wired in (Phase A). False = stub. */
  implemented: boolean;
}

export const ClassificationScorer: Scorer<ClassificationResult> = {
  name: 'classification',
  score({ llmFindings }) {
    const perFinding = llmFindings.map((_, index) => ({
      index,
      class: 'unclassified' as FindingClass,
      reason: 'Classification scorer not yet implemented — wires up after Phase A Deterministic Layer ships.',
    }));

    const counts: Record<FindingClass, number> = {
      deterministic: 0,
      knowledge: 0,
      repetition: 0,
      unclassified: llmFindings.length,
    };

    return {
      scorerName: 'classification',
      perFinding,
      counts,
      implemented: false,
    };
  },
};
