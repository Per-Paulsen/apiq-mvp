/**
 * Coverage scorer — measures how many manually-authored "gold standard" reference
 * findings are matched by an LLM-emitted findings list.
 *
 * Used for Pass-Criterion #3 in Epic 09 spike (≥60% reference-target coverage).
 *
 * Reference-target file format (as in
 * openapi-examples/<spec>/reference/findings-target-big.md):
 *
 *   ## Finding N — <title>
 *
 *   - **category:** clarity | design | risk
 *   - **severity:** critical | high | medium | low
 *   - **scope:** spec | endpoint
 *   - **affectedEndpoints:** [optional list, comma-separated `METHOD path` pairs]
 *   - **patchSummary:** ...
 *
 *   ### narration
 *   ...
 *
 *   ### rationale
 *   ...
 *
 *   ### patchOps (RFC 6902)
 *   ```json
 *   [...]
 *   ```
 *
 * The parser is lenient: missing fields default sensibly, and the body of each
 * finding (narration / rationale / patchOps) is captured-but-unused by the
 * matcher. Only title + category + scope + affectedEndpoints participate in
 * the coverage decision.
 */

import * as fs from 'node:fs';
import type { Finding, AffectedEndpoint } from './schema.js';

export interface ReferenceFinding {
  index: number;
  title: string;
  category: 'clarity' | 'design' | 'risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  scope: 'spec' | 'endpoint';
  affectedEndpoints: AffectedEndpoint[];
}

export interface PerRefMatch {
  refIndex: number;
  refTitle: string;
  matched: boolean;
  matchedLlmIndex: number | null;
  reason: string;
}

export interface CoverageResult {
  totalCount: number;
  coveredCount: number;
  coverageRate: number;
  perRef: PerRefMatch[];
}

const HEADER_RE = /^##\s+Finding\s+(\d+)\s+[—-]\s+(.+?)\s*$/;

function parseBullet(line: string, key: string): string | null {
  const re = new RegExp(`^-\\s+\\*\\*${key}:\\*\\*\\s*(.*?)\\s*$`, 'i');
  const m = line.match(re);
  return m ? m[1].trim() : null;
}

function parseAffectedEndpoints(value: string): AffectedEndpoint[] {
  if (!value) return [];
  // Accept formats:
  //   "GET /weather, POST /charges"
  //   "get::/weather, post::/charges"
  //   "[GET /weather]"
  //   "(none)" → []
  const cleaned = value.replace(/^\[|\]$/g, '').trim();
  if (!cleaned || /^\(?(none|n\/a|empty)\)?$/i.test(cleaned)) return [];
  const parts = cleaned.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
  const result: AffectedEndpoint[] = [];
  for (const part of parts) {
    let m = part.match(/^([A-Za-z]+)\s*::\s*(\/.+)$/);
    if (!m) m = part.match(/^([A-Za-z]+)\s+(\/.+)$/);
    if (!m) m = part.match(/^(\/[^\s]+)\s+([A-Za-z]+)$/);
    if (m) {
      const looksLikePathFirst = m[1].startsWith('/');
      const method = (looksLikePathFirst ? m[2] : m[1]).toLowerCase();
      const pathStr = looksLikePathFirst ? m[1] : m[2];
      result.push({ path: pathStr, method });
    }
  }
  return result;
}

export function parseReferenceTarget(markdown: string): ReferenceFinding[] {
  const lines = markdown.split(/\r?\n/);
  const findings: ReferenceFinding[] = [];
  let cur: Partial<ReferenceFinding> | null = null;

  const commit = () => {
    if (
      cur &&
      typeof cur.index === 'number' &&
      cur.title &&
      cur.category &&
      cur.severity &&
      cur.scope
    ) {
      findings.push({
        index: cur.index,
        title: cur.title,
        category: cur.category,
        severity: cur.severity,
        scope: cur.scope,
        affectedEndpoints: cur.affectedEndpoints ?? [],
      });
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const headerMatch = raw.match(HEADER_RE);
    if (headerMatch) {
      commit();
      cur = {
        index: parseInt(headerMatch[1], 10),
        title: headerMatch[2].trim(),
        affectedEndpoints: [],
      };
      continue;
    }
    if (!cur) continue;

    const cat = parseBullet(line, 'category');
    if (cat && /^(clarity|design|risk)$/i.test(cat)) {
      cur.category = cat.toLowerCase() as 'clarity' | 'design' | 'risk';
      continue;
    }
    const sev = parseBullet(line, 'severity');
    if (sev && /^(critical|high|medium|low)$/i.test(sev)) {
      cur.severity = sev.toLowerCase() as 'critical' | 'high' | 'medium' | 'low';
      continue;
    }
    const scope = parseBullet(line, 'scope');
    if (scope && /^(spec|endpoint)$/i.test(scope)) {
      cur.scope = scope.toLowerCase() as 'spec' | 'endpoint';
      continue;
    }
    const aff = parseBullet(line, 'affectedEndpoints');
    if (aff !== null) {
      cur.affectedEndpoints = parseAffectedEndpoints(aff);
      continue;
    }
  }
  commit();

  // Sanity: scope=endpoint should have at least one affected endpoint.
  for (const f of findings) {
    if (f.scope === 'endpoint' && f.affectedEndpoints.length === 0) {
      // Don't throw — just warn via stderr at runtime; some specs mark "endpoint"
      // for many ops without enumerating them in the bullet.
    }
  }

  return findings;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'in', 'is',
  'it', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'without', 'when',
  'where', 'which', 'while', 'why', 'no', 'not', 'all', 'any', 'some', 'each',
  'every', 'has', 'have', 'had', 'do', 'does', 'did', 'so', 'such', 'than', 'then',
]);

/**
 * Minimal noun stemmer — strips common English plural suffixes so `schemas`
 * and `schema`, `parameters` and `parameter`, `responses` and `response`
 * collapse to the same token. Title-similarity on opaque API titles is much
 * more sensitive to plural/singular drift than to verb-tense drift, so this
 * lightweight rule covers most of the cases in practice without pulling in
 * a real stemmer.
 */
function singularise(t: string): string {
  if (t.length <= 4) return t;
  if (t.endsWith('ies')) return t.slice(0, -3) + 'y'; // properties → property
  if (t.endsWith('sses')) return t.slice(0, -2); // addresses → address
  if (t.endsWith('xes') || t.endsWith('shes') || t.endsWith('ches')) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us') && !t.endsWith('is')) return t.slice(0, -1);
  return t;
}

function tokenize(s: string): Set<string> {
  // Split on whitespace AND hyphens AND underscores — the title `Idempotency-Key`
  // should tokenise to {idempotency, key}, not to a single hyphenated token,
  // so that it matches against `idempotency key` written without the hyphen.
  // Forward slashes are kept as token-content (paths like `/v1/customers`).
  // Each token is then singularised so plural/singular drift doesn't kill matches.
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9_/]+/g, ' ')
      .split(/[\s_]+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
      .map((t) => singularise(t))
  );
}

/**
 * Jaccard-style overlap between title token sets, in [0, 1].
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Endpoint overlap — shared `(path, method)` count (case-insensitive on method).
 */
function endpointOverlap(a: AffectedEndpoint[], b: AffectedEndpoint[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a.map((e) => `${e.method.toLowerCase()} ${e.path}`));
  let count = 0;
  for (const e of b) if (aSet.has(`${e.method.toLowerCase()} ${e.path}`)) count++;
  return count;
}

/**
 * Score whether a single LLM finding "matches" a reference finding.
 * Returns the strength of the match (0 = no match, higher = stronger).
 *
 * Match-decision matrix:
 *   - endpoint-scope ref + endpoint-overlap + same-category  → strong match
 *   - endpoint-scope ref + endpoint-overlap + cross-category → moderate match (categories
 *     are LLM-judgement-calls; idempotency may be tagged risk by ref and design by LLM)
 *   - spec-scope ref + same-category + titleSim≥0.3          → moderate match
 *   - any-scope + cross-category + titleSim≥0.5              → moderate match
 *   - any-scope + cross-category + titleSim≥0.4              → weak match (under threshold by default)
 */
function scoreMatch(ref: ReferenceFinding, llm: Finding): { score: number; reason: string } {
  const titleSim = titleSimilarity(ref.title, llm.title);
  const sameCategory = ref.category === llm.category;
  const sameScope = ref.scope === llm.scope;

  // Endpoint-scope: prioritise endpoint overlap.
  if (ref.scope === 'endpoint') {
    const overlap = endpointOverlap(ref.affectedEndpoints, llm.affectedEndpoints);
    if (overlap > 0 && sameCategory) {
      return {
        score: 100 + overlap * 5 + titleSim * 30,
        reason: `endpoint-overlap=${overlap}, category=${llm.category}, titleSim=${titleSim.toFixed(2)}`,
      };
    }
    if (overlap > 0) {
      // Endpoint overlap with category mismatch is still a strong match — categories
      // are subjective tags on the same finding, not the finding itself.
      return {
        score: 70 + overlap * 5 + titleSim * 30,
        reason: `endpoint-overlap=${overlap}, category-mismatch (ref=${ref.category}, llm=${llm.category}), titleSim=${titleSim.toFixed(2)}`,
      };
    }
    // No endpoint overlap — last-resort match via title-similarity + same category.
    if (sameCategory && titleSim >= 0.4) {
      return {
        score: 30 + titleSim * 30,
        reason: `endpoint-overlap=0 BUT category=${llm.category} AND titleSim=${titleSim.toFixed(2)}`,
      };
    }
    return { score: 0, reason: `endpoint-overlap=0, titleSim=${titleSim.toFixed(2)}` };
  }

  // Spec-scope: rely on title similarity + (loose) category check. Categories
  // are LLM-judgement-tags (clarity vs design vs risk are not crisply separable
  // for many findings — F7 idempotency-key is risk per ref, design per LLM).
  // Same-scope + same-category with mid title-sim is the strongest signal;
  // same-scope cross-category is allowed at slightly higher title-sim.
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
  // Cross-scope cross-category bridge needs stronger title-similarity.
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

export function scoreCoverage(referencePath: string, llmFindings: Finding[]): CoverageResult {
  const md = fs.readFileSync(referencePath, 'utf8');
  const refs = parseReferenceTarget(md);
  if (refs.length === 0) {
    throw new Error(
      `Reference target at ${referencePath} parsed to 0 findings — check the markdown structure`
    );
  }

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
      refIndex: ref.index,
      refTitle: ref.title,
      matched,
      matchedLlmIndex: matched ? bestLlmIndex : null,
      reason: bestReason,
    });
  }

  const coveredCount = perRef.filter((p) => p.matched).length;
  return {
    totalCount: refs.length,
    coveredCount,
    coverageRate: refs.length === 0 ? 0 : coveredCount / refs.length,
    perRef,
  };
}
