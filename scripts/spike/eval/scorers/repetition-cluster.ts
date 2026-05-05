/**
 * Repetition-Cluster Scorer — quantifies how much of the LLM finding output
 * is repetitive variants of the same underlying Befund.
 *
 * Motivating observation (Stage 3 manual audits):
 *   - PagerDuty FULL two-call run: ~37 % of 623 findings are repetitive
 *     variants of <10 unique Befunde — e.g. "Missing 429 response definition"
 *     emitted 67× across title-variants in one run.
 *   - Stripe FULL two-call run: top-15 cluster ≈ 17 % of 1 423 findings.
 *
 * Why this matters: Stage 4 introduces a Deterministic Layer that should
 * collapse exactly this kind of repetition. The repetition-rate produced
 * here is the empirical baseline against which Stage 4 effectiveness will
 * be measured.
 *
 * Normalization approach (cluster-key derivation):
 *   1. lowercase
 *   2. strip punctuation [-_,;.()[]/]  (replaced with space)
 *   3. tokenize on whitespace
 *   4. drop stop-words (shared STOP_WORDS list with jaccard.ts)
 *   5. drop tokens shorter than 3 chars
 *   6. singularise (shared singularise() with jaccard.ts)
 *   7. sort tokens alphabetically
 *   8. join with single space
 *
 * Trade-offs:
 *   - Token-bag normalization (step 7 sort) ignores word order. This is
 *     intentional — "Missing 429 response definition" vs "429 Too Many
 *     Requests response missing" must collapse. False positives are rare
 *     because category/severity differ for unrelated findings that happen
 *     to share token-sets, but those still cluster by *title* here. We
 *     accept that: clustering exists for repetition-quantification, not
 *     deduplication.
 *   - Numbers are kept (so "429" and "404" do not collapse). HTTP-status
 *     numerics carry semantic load.
 *   - Singularisation is the same naive English heuristic as jaccard.ts —
 *     "responses" → "response", "queries" → "query". Good enough for
 *     OpenAPI-style finding titles.
 *   - Endpoint-specific endpoint names embedded in titles ("List events",
 *     "Get user") will NOT cluster across endpoints — by design. The
 *     "missing 429 …" cluster works precisely because LLMs emit the same
 *     spec-level phrasing per endpoint.
 *
 * Reused helpers from jaccard.ts (copied here verbatim to keep the module
 * self-contained — jaccard does not export singularise/tokenize and we don't
 * want a circular-ish dependency for two pure helpers).
 */

import type { Finding } from '../../schema.js';
import type { Scorer, RunMeta, ReferenceTarget } from '../types.js';

// =============================================================================
// Helpers — kept in sync with jaccard.ts. STOP_WORDS, singularise() are
// duplicated intentionally (small, pure, stable).
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

/**
 * Compute the cluster key for a finding title. See file-header for algorithm.
 * Pure / deterministic. Empty input → empty string (degenerate cluster).
 */
export function clusterKeyFor(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[-_,;.()[\]/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ');

  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    .map(singularise);

  return [...tokens].sort().join(' ');
}

// =============================================================================
// Result types.
// =============================================================================

export interface FindingCluster {
  /** Normalized cluster key (sorted token bag). */
  clusterKey: string;
  /** The longest original title in the cluster (most descriptive variant). */
  exampleTitle: string;
  /** Number of LLM findings in this cluster. */
  count: number;
  /** Indices into the input llmFindings array — for downstream traceability. */
  findingIndices: number[];
  /** Unique (path, method) pairs across all findings in the cluster. */
  affectedEndpointCount: number;
  severityBreakdown: { critical: number; high: number; medium: number; low: number };
  categoryBreakdown: { clarity: number; design: number; risk: number; correctness: number };
}

export interface ClusterResult {
  scorerName: 'repetition-cluster';
  totalFindings: number;
  uniqueClusters: number;
  /** 1 - (uniqueClusters / totalFindings). Higher = more repetitive. */
  repetitionRate: number;
  largestClusterSize: number;
  /** Top-N clusters by size, descending. Default N=20. */
  topClusters: FindingCluster[];
  /** Histogram: clusterSize → howManyClustersHaveThisSize. */
  sizeHistogram: Record<number, number>;
}

// =============================================================================
// Core clustering function.
// =============================================================================

/**
 * Group findings by cluster-key and return aggregate statistics.
 * @param llmFindings  Findings array from a run.
 * @param topN         How many top-by-size clusters to return. Default 20.
 */
export function clusterFindings(llmFindings: Finding[], topN: number = 20): ClusterResult {
  const total = llmFindings.length;

  // Pass 1: group indices by cluster key.
  const groups = new Map<string, number[]>();
  for (let i = 0; i < total; i++) {
    const key = clusterKeyFor(llmFindings[i].title);
    const list = groups.get(key);
    if (list) {
      list.push(i);
    } else {
      groups.set(key, [i]);
    }
  }

  // Pass 2: build cluster objects with breakdowns.
  const clusters: FindingCluster[] = [];
  for (const [clusterKey, indices] of groups) {
    let exampleTitle = '';
    const endpointSet = new Set<string>();
    const severity = { critical: 0, high: 0, medium: 0, low: 0 };
    const category = { clarity: 0, design: 0, risk: 0, correctness: 0 };

    for (const idx of indices) {
      const f = llmFindings[idx];
      if (f.title.length > exampleTitle.length) exampleTitle = f.title;
      for (const ep of f.affectedEndpoints) {
        endpointSet.add(`${ep.method.toLowerCase()} ${ep.path}`);
      }
      // Severity is one of the four enum values; cast safe via guard.
      if (f.severity in severity) {
        severity[f.severity as keyof typeof severity]++;
      }
      // Category schema is currently {clarity, design, risk}; ReferenceFinding
      // adds 'correctness'. Use guard to stay forward-compatible.
      if (f.category in category) {
        category[f.category as keyof typeof category]++;
      }
    }

    clusters.push({
      clusterKey,
      exampleTitle,
      count: indices.length,
      findingIndices: indices,
      affectedEndpointCount: endpointSet.size,
      severityBreakdown: severity,
      categoryBreakdown: category,
    });
  }

  // Sort by count desc, then by clusterKey for determinism.
  clusters.sort((a, b) => (b.count - a.count) || a.clusterKey.localeCompare(b.clusterKey));

  // Histogram.
  const sizeHistogram: Record<number, number> = {};
  for (const c of clusters) {
    sizeHistogram[c.count] = (sizeHistogram[c.count] ?? 0) + 1;
  }

  const uniqueClusters = clusters.length;
  const repetitionRate = total === 0 ? 0 : 1 - uniqueClusters / total;
  const largestClusterSize = clusters.length > 0 ? clusters[0].count : 0;

  return {
    scorerName: 'repetition-cluster',
    totalFindings: total,
    uniqueClusters,
    repetitionRate,
    largestClusterSize,
    topClusters: clusters.slice(0, topN),
    sizeHistogram,
  };
}

// =============================================================================
// Pluggable Scorer wrapper.
// =============================================================================

export const RepetitionClusterScorer: Scorer<ClusterResult> = {
  name: 'repetition-cluster',
  score({ llmFindings }: { reference: ReferenceTarget | null; llmFindings: Finding[]; runMeta: RunMeta }) {
    return clusterFindings(llmFindings);
  },
};

// =============================================================================
// CLI mode — `npx tsx eval/scorers/repetition-cluster.ts <run-json-path>`
// =============================================================================

// Cross-platform CLI-entrypoint detection. On Windows, import.meta.url is
// `file:///C:/...` (three slashes) while process.argv[1] is `C:\...` —
// pathToFileURL handles both correctly.
const _argvUrl = await (async () => {
  if (!process.argv[1]) return '';
  const { pathToFileURL } = await import('node:url');
  return pathToFileURL(process.argv[1]).href;
})();
if (import.meta.url === _argvUrl) {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npx tsx eval/scorers/repetition-cluster.ts <run-json-path>');
    process.exit(1);
  }

  // Lazy-import fs only in CLI mode to keep the module import-cheap.
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');

  const abs = resolve(path);
  const raw = readFileSync(abs, 'utf-8');
  const parsed = JSON.parse(raw);

  const findings: Finding[] = Array.isArray(parsed.findings)
    ? parsed.findings
    : Array.isArray(parsed?.aggregated?.findings)
      ? parsed.aggregated.findings
      : Array.isArray(parsed?.output?.findings)
        ? parsed.output.findings
        : [];

  if (findings.length === 0) {
    console.error(`No findings array found at top-level/.aggregated/.output in ${abs}`);
    process.exit(2);
  }

  const result = clusterFindings(findings, 20);

  console.log('===============================================================');
  console.log('Repetition-Cluster Scorer');
  console.log('===============================================================');
  console.log(`Source:                ${abs}`);
  if (parsed.specName) console.log(`Spec:                  ${parsed.specName}`);
  if (parsed.arch) console.log(`Architecture:          ${parsed.arch}`);
  console.log('---------------------------------------------------------------');
  console.log(`totalFindings:         ${result.totalFindings}`);
  console.log(`uniqueClusters:        ${result.uniqueClusters}`);
  console.log(`repetitionRate:        ${(result.repetitionRate * 100).toFixed(2)} %`);
  console.log(`largestClusterSize:    ${result.largestClusterSize}`);
  console.log('---------------------------------------------------------------');
  console.log(`Top ${result.topClusters.length} clusters by size:`);
  console.log('---------------------------------------------------------------');
  for (let i = 0; i < result.topClusters.length; i++) {
    const c = result.topClusters[i];
    const sevParts = Object.entries(c.severityBreakdown)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    const catParts = Object.entries(c.categoryBreakdown)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}=${n}`)
      .join(' ');
    console.log(
      `${String(i + 1).padStart(2)}. count=${String(c.count).padStart(3)}  endpoints=${String(
        c.affectedEndpointCount
      ).padStart(3)}  ${c.exampleTitle}`
    );
    console.log(`     key:  ${c.clusterKey}`);
    console.log(`     sev:  ${sevParts}    cat: ${catParts}`);
  }
  console.log('---------------------------------------------------------------');
  console.log('Size histogram (clusterSize -> #clusters):');
  const sizes = Object.keys(result.sizeHistogram)
    .map(Number)
    .sort((a, b) => b - a);
  for (const sz of sizes) {
    console.log(`  size ${String(sz).padStart(3)}: ${result.sizeHistogram[sz]} cluster(s)`);
  }
  console.log('===============================================================');
}
