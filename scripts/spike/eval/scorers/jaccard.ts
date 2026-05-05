/**
 * Jaccard coverage scorer — measures how many reference findings are matched
 * by an LLM-emitted findings list using token-Jaccard title-similarity +
 * endpoint-overlap + category/scope cross-checks.
 *
 * Algorithm preserved verbatim from `scripts/spike/score-coverage.ts` (the v0.1
 * implementation). Re-packaged as a pluggable Scorer<JaccardResult> over the
 * structured ReferenceTarget format.
 *
 * Pass-criterion gate: ≥60 % reference coverage per Epic 09 Acceptance #4 / Pass-3.
 */

import type { Finding, AffectedEndpoint } from '../../schema.js';
import type { ReferenceTarget, ReferenceFinding, Scorer, RunMeta } from '../types.js';

// =============================================================================
// Algorithm — copied from score-coverage.ts. Pure functions, no state.
// =============================================================================

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'without', 'when',
  'where', 'which', 'while', 'why', 'no', 'not', 'all', 'any', 'some', 'each',
  'every', 'have', 'had', 'do', 'does', 'did', 'so', 'such', 'than', 'then',
]);

function singularise(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.endsWith('sses')) return t.slice(0, -2);
  if (t.endsWith('xes') || t.endsWith('shes') || t.endsWith('ches')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_/]+/g, ' ')
      .split(/[\s_]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
      .map((t) => singularise(t))
  );
}

export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function endpointOverlap(a: AffectedEndpoint[], b: AffectedEndpoint[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a.map((e) => `${e.method.toLowerCase()} ${e.path}`));
  let count = 0;
  for (const e of b) if (aSet.has(`${e.method.toLowerCase()} ${e.path}`)) count++;
  return count;
}

function scoreMatch(ref: ReferenceFinding, llm: Finding): { score: number; reason: string } {
  const titleSim = titleSimilarity(ref.title, llm.title);
  const sameCategory = ref.category === llm.category;
  const sameScope = ref.scope === llm.scope;

  if (ref.scope === 'endpoint') {
    const overlap = endpointOverlap(ref.affectedEndpoints, llm.affectedEndpoints);
    if (overlap > 0 && sameCategory) {
      return {
        score: 100 + overlap * 5 + titleSim * 30,
        reason: `endpoint-overlap=${overlap}, category=${llm.category}, titleSim=${titleSim.toFixed(2)}`,
      };
    }
    if (overlap > 0) {
      return {
        score: 70 + overlap * 5 + titleSim * 30,
        reason: `endpoint-overlap=${overlap}, category-mismatch (ref=${ref.category}, llm=${llm.category}), titleSim=${titleSim.toFixed(2)}`,
      };
    }
    if (sameCategory && titleSim >= 0.4) {
      return {
        score: 30 + titleSim * 30,
        reason: `endpoint-overlap=0 BUT category=${llm.category} AND titleSim=${titleSim.toFixed(2)}`,
      };
    }
    return { score: 0, reason: `endpoint-overlap=0, titleSim=${titleSim.toFixed(2)}` };
  }

  if (sameScope && sameCategory && titleSim >= 0.3) {
    return {
      score: 50 + titleSim * 50,
      reason: `scope=${ref.scope}, category=${llm.category}, titleSim=${titleSim.toFixed(2)}`,
    };
  }
  if (sameScope && titleSim >= 0.35) {
    return {
      score: 45 + titleSim * 50,
      reason: `scope=${ref.scope}, category=${ref.category}/${llm.category} (mismatch), titleSim=${titleSim.toFixed(2)}`,
    };
  }
  if (titleSim >= 0.5) {
    return {
      score: 45 + titleSim * 50,
      reason: `titleSim=${titleSim.toFixed(2)} (high), scope=${ref.scope}/${llm.scope}, category=${ref.category}/${llm.category}`,
    };
  }
  if (sameCategory && titleSim >= 0.4) {
    return {
      score: 25 + titleSim * 50,
      reason: `category=${llm.category}, titleSim=${titleSim.toFixed(2)}, scope-mismatch`,
    };
  }
  return { score: 0, reason: `titleSim=${titleSim.toFixed(2)}, sameScope=${sameScope}, sameCat=${sameCategory}` };
}

const COVERAGE_SCORE_THRESHOLD = 45;

// =============================================================================
// Result type + scorer wrapper.
// =============================================================================

export interface PerRefMatch {
  refId: string;
  refTitle: string;
  matched: boolean;
  matchedLlmIndex: number | null;
  bestScore: number;
  reason: string;
}

export interface JaccardResult {
  scorerName: 'jaccard';
  totalRefs: number;
  coveredRefs: number;
  coverageRate: number;

  /** Substantive-only coverage: drop refs where classification.isLintFlavoured. */
  substantiveTotalRefs: number;
  substantiveCoveredRefs: number;
  substantiveCoverageRate: number;

  /** LLM-only coverage: drop refs where classification.isPureSpectralDetectable OR
   *  classification.isDomainKnowledgeDetectable (both belong to Stage-4 Deterministic
   *  Layer in their respective tier, not the LLM under test). */
  llmOnlyTotalRefs: number;
  llmOnlyCoveredRefs: number;
  llmOnlyCoverageRate: number;

  /** Pure-spectral coverage: subset where classification.isPureSpectralDetectable.
   *  These are the findings the cheap Spectral-class layer should catch. */
  pureSpectralTotalRefs: number;
  pureSpectralCoveredRefs: number;
  pureSpectralCoverageRate: number;

  /** Domain-knowledge coverage: subset where classification.isDomainKnowledgeDetectable.
   *  These need API-family-specific pattern libraries. */
  domainKnowledgeTotalRefs: number;
  domainKnowledgeCoveredRefs: number;
  domainKnowledgeCoverageRate: number;

  /** Knowledge-backed-gap coverage: subset where classification.isKnowledgeBackedGap.
   *  Differentiator-class metric. */
  knowledgeBackedTotalRefs: number;
  knowledgeBackedCoveredRefs: number;
  knowledgeBackedCoverageRate: number;

  perRef: PerRefMatch[];
}

export const JaccardScorer: Scorer<JaccardResult> = {
  name: 'jaccard',
  score({ reference, llmFindings }) {
    if (!reference) {
      throw new Error('JaccardScorer requires a reference target');
    }
    const refs = reference.findings;
    const perRef: PerRefMatch[] = [];
    const usedLlmIndices = new Set<number>();

    for (const ref of refs) {
      let bestScore = 0;
      let bestLlmIndex = -1;
      let bestReason = 'no LLM finding considered';
      for (let i = 0; i < llmFindings.length; i++) {
        if (usedLlmIndices.has(i)) continue;
        const llm = llmFindings[i];
        const { score, reason } = scoreMatch(ref, llm);
        if (score > bestScore) {
          bestScore = score;
          bestLlmIndex = i;
          bestReason = reason;
        }
      }
      const matched = bestScore >= COVERAGE_SCORE_THRESHOLD;
      if (matched) usedLlmIndices.add(bestLlmIndex);
      perRef.push({
        refId: ref.id,
        refTitle: ref.title,
        matched,
        matchedLlmIndex: matched ? bestLlmIndex : null,
        bestScore,
        reason: bestReason,
      });
    }

    const matchedById = new Map(perRef.map((p) => [p.refId, p.matched]));
    const isMatched = (id: string) => matchedById.get(id) === true;

    const substantiveRefs = refs.filter((r) => !r.classification.isLintFlavoured);
    const llmOnlyRefs = refs.filter(
      (r) =>
        !r.classification.isPureSpectralDetectable &&
        !r.classification.isDomainKnowledgeDetectable
    );
    const pureSpectralRefs = refs.filter((r) => r.classification.isPureSpectralDetectable);
    const domainKnowledgeRefs = refs.filter((r) => r.classification.isDomainKnowledgeDetectable);
    const knowledgeRefs = refs.filter((r) => r.classification.isKnowledgeBackedGap);

    const coveredCount = perRef.filter((p) => p.matched).length;
    const substantiveCovered = substantiveRefs.filter((r) => isMatched(r.id)).length;
    const llmOnlyCovered = llmOnlyRefs.filter((r) => isMatched(r.id)).length;
    const pureSpectralCovered = pureSpectralRefs.filter((r) => isMatched(r.id)).length;
    const domainKnowledgeCovered = domainKnowledgeRefs.filter((r) => isMatched(r.id)).length;
    const knowledgeCovered = knowledgeRefs.filter((r) => isMatched(r.id)).length;

    const safeRate = (n: number, d: number) => (d === 0 ? 0 : n / d);

    return {
      scorerName: 'jaccard',
      totalRefs: refs.length,
      coveredRefs: coveredCount,
      coverageRate: safeRate(coveredCount, refs.length),

      substantiveTotalRefs: substantiveRefs.length,
      substantiveCoveredRefs: substantiveCovered,
      substantiveCoverageRate: safeRate(substantiveCovered, substantiveRefs.length),

      llmOnlyTotalRefs: llmOnlyRefs.length,
      llmOnlyCoveredRefs: llmOnlyCovered,
      llmOnlyCoverageRate: safeRate(llmOnlyCovered, llmOnlyRefs.length),

      pureSpectralTotalRefs: pureSpectralRefs.length,
      pureSpectralCoveredRefs: pureSpectralCovered,
      pureSpectralCoverageRate: safeRate(pureSpectralCovered, pureSpectralRefs.length),

      domainKnowledgeTotalRefs: domainKnowledgeRefs.length,
      domainKnowledgeCoveredRefs: domainKnowledgeCovered,
      domainKnowledgeCoverageRate: safeRate(domainKnowledgeCovered, domainKnowledgeRefs.length),

      knowledgeBackedTotalRefs: knowledgeRefs.length,
      knowledgeBackedCoveredRefs: knowledgeCovered,
      knowledgeBackedCoverageRate: safeRate(knowledgeCovered, knowledgeRefs.length),

      perRef,
    };
  },
};

/**
 * Convenience wrapper for legacy callers. Mirrors the original
 * `scoreCoverage(referencePath, llmFindings)` signature.
 */
export function scoreCoverageWithJaccard(
  reference: ReferenceTarget,
  llmFindings: Finding[],
  runMeta: RunMeta = { spec: reference.spec, architecture: 'unknown' }
): JaccardResult {
  return JaccardScorer.score({ reference, llmFindings, runMeta });
}
