/**
 * Pattern-Knowledge-Index — embedding-basierter retrieval over alle Round-1+2+3 patterns
 * für downstream-Konsumenten (Welle F + V + Phase B).
 *
 * Per Welle M / M5 + D11.
 *
 * Source: rules-brainstorm.md (Round-1 brainstorming + Round-2 master inventory)
 *         + mining-round3-{books,postmortems,corpus,reaudit}.md (via rules-brainstorm
 *         Round-3-Additions section).
 * Storage: in-memory JSON-on-disk at scripts/spike/eval/cache/pattern-index.json
 * Provider: text-embedding-3-small (1536-dim, consistent mit embedding-similarity.ts)
 *
 * Public API:
 *   - buildPatternIndex(): Promise<void>       // one-shot index-build
 *   - findRelatedPatterns(query, opts):
 *       Promise<PatternMatch[]>                // search via cosine-similarity
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';
import dotenv from 'dotenv';
import OpenAI from 'openai';

import type { Lens, Severity, SeverityDirection } from '../deterministic/severity-schema.js';

// =============================================================================
// Path setup + env-loading (Q2-fix pattern: REPO_ROOT first, SPIKE_ROOT override)
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // .../scripts/spike/eval
const SPIKE_ROOT = path.resolve(__dirname, '..'); // .../scripts/spike
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..'); // .../repo-root (3 up from /eval/)
const REPO_ENV = path.join(REPO_ROOT, '.env');
const SPIKE_ENV = path.join(SPIKE_ROOT, '.env');

if (fs.existsSync(REPO_ENV)) dotenv.config({ path: REPO_ENV });
if (fs.existsSync(SPIKE_ENV)) dotenv.config({ path: SPIKE_ENV, override: true });

const INDEX_PATH = path.join(SPIKE_ROOT, 'eval', 'cache', 'pattern-index.json');
const EMBEDDING_CACHE_DIR = path.join(SPIKE_ROOT, 'eval', 'cache', 'embeddings');
const RULES_BRAINSTORM_PATH = path.join(
  REPO_ROOT,
  'specs',
  'big-spec-architecture-spike-stage-a-rules-brainstorm.md'
);

const MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 256;

// =============================================================================
// Public types
// =============================================================================

export type PatternSourceType =
  | 'rfc'
  | 'owasp'
  | 'book'
  | 'postmortem'
  | 'corpus'
  | 'spectral-default'
  | 'linter'
  | 'style-guide'
  | 're-audit'
  | 'apiq-original';

export interface PatternIndexEntry {
  patternId: string;
  lens: Lens[];
  sourceType: PatternSourceType;
  description: string;
  embedding: number[]; // 1536-dim
  metadata: {
    round: 1 | 2 | 3;
    severityHypothesis: Severity;
    direction?: SeverityDirection;
    detectionPrecision: 'high' | 'medium' | 'low';
    isPureSpectralDetectable: boolean;
    isStageATerritory: boolean;
  };
}

export interface FindRelatedOpts {
  topK?: number;
  lens?: Lens;
  sourceType?: PatternSourceType;
  minSimilarity?: number;
}

export interface PatternMatch {
  pattern: PatternIndexEntry;
  similarity: number;
}

// Internal "raw pattern" type used between the parser and the index-builder.
interface RawPattern {
  patternId: string;
  lens: Lens[];
  sourceType: PatternSourceType;
  description: string;
  severityHypothesis: Severity;
  direction?: SeverityDirection;
  round: 1 | 2 | 3;
  detectionPrecision: 'high' | 'medium' | 'low';
  isPureSpectralDetectable: boolean;
  isStageATerritory: boolean;
}

// =============================================================================
// OpenAI client + cache helpers (mirrored from embedding-similarity.ts)
// =============================================================================

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add to scripts/spike/.env or repo-root .env. Required for pattern-index embedding calls.'
    );
  }
  _client = new OpenAI({ apiKey });
  return _client;
}

function cacheKey(text: string): string {
  return crypto.createHash('sha256').update(MODEL).update(':').update(text).digest('hex');
}

function readEmbeddingCache(hash: string): number[] | null {
  const p = path.join(EMBEDDING_CACHE_DIR, hash.slice(0, 2), `${hash}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as { vec?: unknown };
    return Array.isArray(parsed.vec) ? (parsed.vec as number[]) : null;
  } catch {
    return null;
  }
}

function writeEmbeddingCache(hash: string, text: string, vec: number[]): void {
  const dir = path.join(EMBEDDING_CACHE_DIR, hash.slice(0, 2));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, `${hash}.json`),
    JSON.stringify({ model: MODEL, text, vec }) + '\n',
    'utf8'
  );
}

async function embed(text: string): Promise<number[]> {
  const hash = cacheKey(text);
  const cached = readEmbeddingCache(hash);
  if (cached) return cached;
  const resp = await getClient().embeddings.create({ model: MODEL, input: text });
  const vec = resp.data[0]?.embedding;
  if (!vec || !Array.isArray(vec)) {
    throw new Error('OpenAI embedding response missing vector for input');
  }
  writeEmbeddingCache(hash, text, vec);
  return vec;
}

async function embedBatch(
  texts: string[]
): Promise<{ vectors: number[][]; cacheHits: number; cacheMisses: number; apiCalls: number }> {
  const result: (number[] | null)[] = new Array(texts.length).fill(null);
  const missingIdx: number[] = [];
  const missingTexts: string[] = [];
  const missingHashes: string[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;

  for (let i = 0; i < texts.length; i++) {
    const t = texts[i];
    const hash = cacheKey(t);
    const cached = readEmbeddingCache(hash);
    if (cached) {
      result[i] = cached;
      cacheHits++;
    } else {
      missingIdx.push(i);
      missingTexts.push(t);
      missingHashes.push(hash);
      cacheMisses++;
    }
  }

  let apiCalls = 0;
  if (missingTexts.length > 0) {
    const client = getClient();
    for (let start = 0; start < missingTexts.length; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, missingTexts.length);
      const batchInputs = missingTexts.slice(start, end);
      const resp = await client.embeddings.create({ model: MODEL, input: batchInputs });
      apiCalls++;
      for (let j = 0; j < batchInputs.length; j++) {
        const item = resp.data[j];
        if (!item || !Array.isArray(item.embedding)) {
          throw new Error(
            `OpenAI embeddings response missing embedding at batch-index ${j} (global ${missingIdx[start + j]})`
          );
        }
        const vec = item.embedding;
        const globalIdx = missingIdx[start + j];
        result[globalIdx] = vec;
        writeEmbeddingCache(missingHashes[start + j], missingTexts[start + j], vec);
      }
    }
  }

  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) {
      throw new Error(`Embedding for text-index ${i} was not populated`);
    }
  }

  return {
    vectors: result as number[][],
    cacheHits,
    cacheMisses,
    apiCalls,
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// =============================================================================
// Pattern parser — extracts patterns from rules-brainstorm.md
// =============================================================================
//
// Markdown is hierarchical; we recognize three different table formats:
//
//   1. Round-1 brainstorming (Sections A-X): `| ID | Check | Severity | Notes |`
//   2. Round-2 Master "Stage-A Pattern Inventory by Lens": `| Pattern-ID | Title |
//      Sources | Multi-Lens | Severity | Detection | Priority | Freq | Cost | Notes |`
//      (Lens-3 has Severity-Direction column instead of plain Severity.)
//   3. Round-3 Additions: `| Pattern-ID | Source | Description (≤80 chars) |
//      Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |`
//
// We detect by section heading + first table line.

const LENS_NAMES: Lens[] = [
  'threat-modeling',
  'standards-compliance',
  'evolution-friction',
  'client-friction',
  'style-coherence',
  'privacy-data-class',
  'operations',
  'internal-consistency',
  'ai-agent-consumability',
  'operational-metadata',
];

// Mapping of Round-1 section letters to default Lens-tags.
// These are based on the section semantics in rules-brainstorm.md §"Brainstorming
// — generische Custom-Rules die FEHLEN".
const ROUND1_SECTION_LENS: Record<string, Lens[]> = {
  A: ['standards-compliance', 'internal-consistency'],
  B: ['standards-compliance', 'client-friction'],
  C: ['standards-compliance', 'client-friction'],
  D: ['client-friction', 'internal-consistency'],
  E: ['client-friction', 'style-coherence'],
  F: ['threat-modeling', 'standards-compliance'],
  G: ['style-coherence', 'client-friction'],
  H: ['evolution-friction', 'standards-compliance'],
  I: ['standards-compliance', 'style-coherence'],
  J: ['style-coherence', 'internal-consistency'],
  K: ['standards-compliance', 'client-friction'],
  L: ['standards-compliance', 'client-friction'],
  M: ['internal-consistency', 'client-friction'],
  N: ['client-friction', 'ai-agent-consumability'],
  O: ['internal-consistency', 'evolution-friction'],
  P: ['standards-compliance', 'operations'],
  Q: ['style-coherence', 'client-friction'],
  R: ['client-friction', 'ai-agent-consumability'],
  S: ['style-coherence', 'standards-compliance'],
  T: ['standards-compliance', 'client-friction'],
  U: ['standards-compliance', 'evolution-friction'],
  V: ['client-friction', 'operational-metadata'],
  W: ['style-coherence', 'internal-consistency'],
  X: ['standards-compliance', 'evolution-friction'],
};

const LENS_SECTION_HEADERS: Array<{ heading: RegExp; lens: Lens }> = [
  { heading: /Lens 1 — Threat-Modeling/i, lens: 'threat-modeling' },
  { heading: /Lens 2 — Standards-Compliance/i, lens: 'standards-compliance' },
  { heading: /Lens 3 — Evolution-Friction/i, lens: 'evolution-friction' },
  { heading: /Lens 4 — Client-Friction/i, lens: 'client-friction' },
  { heading: /Lens 5 — Style-Coherence/i, lens: 'style-coherence' },
  { heading: /Lens 6 — Privacy/i, lens: 'privacy-data-class' },
  { heading: /Lens 7 — Operations/i, lens: 'operations' },
  { heading: /Lens 8 — Internal-Consistency/i, lens: 'internal-consistency' },
  { heading: /Lens 9 — AI-Agent-Consumability/i, lens: 'ai-agent-consumability' },
  { heading: /Lens 10 — Operational-Metadata/i, lens: 'operational-metadata' },
];

function classifySource(idOrSource: string): PatternSourceType {
  const s = idOrSource.toLowerCase();
  if (s.startsWith('r3-bk-') || s.includes('books:')) return 'book';
  if (s.startsWith('r3-pm-') || s.includes('postmortem:')) return 'postmortem';
  if (s.startsWith('r3-co-') || s.includes('corpus:')) return 'corpus';
  if (s.startsWith('r3-ra-') || s.includes('reaudit:')) return 're-audit';
  if (s.startsWith('rfc2-') || s.includes('rfc ')) return 'rfc';
  if (s.startsWith('y-') || s.startsWith('tm-a') || s.includes('owasp')) return 'owasp';
  if (s.startsWith('scf-') || s.startsWith('sc-') || s.includes('aip-')) return 'style-guide';
  if (s.includes('spectral')) return 'spectral-default';
  if (s.includes('linter')) return 'linter';
  return 'apiq-original';
}

function classifySourceForRound2Sources(sourcesField: string): PatternSourceType {
  const s = sourcesField.toLowerCase();
  if (s.includes('rfc')) return 'rfc';
  if (s.includes('owasp')) return 'owasp';
  if (s.includes('aip-') || s.includes('json:api') || s.includes('hal') || s.includes('siren') || s.includes('odata')) {
    return 'style-guide';
  }
  if (s.includes('book')) return 'book';
  if (s.includes('postmortem')) return 'postmortem';
  if (s.includes('corpus')) return 'corpus';
  if (s.includes('linter') || s.includes('vacuum') || s.includes('redocly') || s.includes('spectral')) {
    return 'linter';
  }
  if (s.includes('apiq') || s.includes('walker') || s.includes('original')) return 'apiq-original';
  return 'apiq-original';
}

function parseSeverity(text: string): { severity: Severity; direction?: SeverityDirection } {
  const t = text.toLowerCase();
  let direction: SeverityDirection | undefined;
  if (t.includes('tighten')) direction = 'tighten';
  else if (t.includes('loosen')) direction = 'loosen';
  else if (t.includes('drift')) direction = 'drift';
  // Severity-Hyp from Round-3 sometimes uses "OOS" or "—". Default to 'hint'.
  if (t.includes('error')) return { severity: 'error', direction };
  if (t.includes('warn')) return { severity: 'warn', direction };
  if (t.includes('info')) return { severity: 'info', direction };
  if (t.includes('hint')) return { severity: 'hint', direction };
  return { severity: 'hint', direction };
}

function parseRound2LensField(field: string): Lens[] {
  // Format examples: "TM, Erg" / "Std, Erg" / "1, 6" / "**6**, 1" / "3, 4"
  // Map abbreviations + numerics -> Lens-names.
  const cleaned = field.replace(/\*\*/g, '').trim();
  const parts = cleaned.split(/[,\s]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  const lenses = new Set<Lens>();
  for (const p of parts) {
    // numeric
    const n = parseInt(p, 10);
    if (!isNaN(n) && n >= 1 && n <= 10) {
      lenses.add(LENS_NAMES[n - 1]);
      continue;
    }
    if (p === 'tm' || p === 'threat') lenses.add('threat-modeling');
    else if (p === 'std' || p === 'standards') lenses.add('standards-compliance');
    else if (p === 'evo' || p === 'evolution') lenses.add('evolution-friction');
    else if (p === 'cli' || p === 'client' || p === 'erg') lenses.add('client-friction');
    else if (p === 'sty' || p === 'style' || p === 'coherence') lenses.add('style-coherence');
    else if (p === 'pri' || p === 'privacy') lenses.add('privacy-data-class');
    else if (p === 'ops' || p === 'operations') lenses.add('operations');
    else if (p === 'int-cons' || p === 'consistency' || p === 'int') lenses.add('internal-consistency');
    else if (p === 'ai' || p === 'agent') lenses.add('ai-agent-consumability');
    else if (p === 'meta' || p === 'metadata') lenses.add('operational-metadata');
    else if (p === 'hyg' || p === 'doc') lenses.add('style-coherence');
  }
  return lenses.size > 0 ? Array.from(lenses) : ['standards-compliance'];
}

interface ParsedTableRow {
  cells: string[];
}

function parseTableRow(line: string): ParsedTableRow | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  // Skip separator rows: |---|---|...
  if (/^\|[\s|:-]+\|$/.test(trimmed)) return null;
  const inner = trimmed.slice(1, -1);
  const cells = inner.split('|').map((c) => c.trim());
  return { cells };
}

function isHeaderRow(cells: string[]): boolean {
  // Header rows mention "ID" / "Pattern-ID" / "Check" / "Title" / "Description"
  const joined = cells.join(' | ').toLowerCase();
  return (
    (joined.includes('id') && (joined.includes('check') || joined.includes('title') || joined.includes('description'))) ||
    joined.includes('pattern-id')
  );
}

// =============================================================================
// Top-level parser
// =============================================================================

export function loadAllPatterns(): RawPattern[] {
  if (!fs.existsSync(RULES_BRAINSTORM_PATH)) {
    throw new Error(`rules-brainstorm.md not found at ${RULES_BRAINSTORM_PATH}`);
  }
  const text = fs.readFileSync(RULES_BRAINSTORM_PATH, 'utf8');
  const lines = text.split('\n');

  const patterns: RawPattern[] = [];
  const seenIds = new Set<string>();

  // Tracker state
  let currentRound: 1 | 2 | 3 = 1;
  let currentLens: Lens | null = null;
  let currentSection: string | null = null; // Round-1 letter (A..X)
  let inRound2Master = false;
  let inRound3Section = false;
  let currentRound2IsLens3 = false; // Lens 3 has Severity-Direction column

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Round-2 master section
    if (/^## Mining-Round-2 Master-Konsolidierung/.test(line)) {
      inRound2Master = true;
      inRound3Section = false;
      currentRound = 2;
      currentLens = null;
      continue;
    }
    // Detect Round-3 section
    if (/^## Round-3 Additions/.test(line)) {
      inRound2Master = false;
      inRound3Section = true;
      currentRound = 3;
      currentLens = null;
      continue;
    }
    // Detect Round-1 brainstorming sections (e.g., "### A. Strukturelle Validität")
    const r1m = line.match(/^### ([A-X])\. /);
    if (r1m && !inRound2Master && !inRound3Section) {
      currentSection = r1m[1];
      currentRound = 1;
      continue;
    }

    // Detect Lens-headers (used in both Round-2 and Round-3 sections)
    for (const lh of LENS_SECTION_HEADERS) {
      if (lh.heading.test(line)) {
        currentLens = lh.lens;
        currentRound2IsLens3 = lh.lens === 'evolution-friction';
        break;
      }
    }

    // Round-2 special lens sections like "Cross-Lens Patterns" — fall back to current lens
    // (Cross-Lens is multi-tagged via the row's Multi-Lens column.)

    // Don't try to parse pattern rows from sections we shouldn't
    const row = parseTableRow(line);
    if (!row) continue;
    if (isHeaderRow(row.cells)) continue;

    // Skip rows where the first cell is "—" or empty
    if (!row.cells[0] || row.cells[0] === '—') continue;

    const firstCell = row.cells[0];

    // Round-1 brainstorming rows: section-letter followed by digit (e.g. "A1", "B2", "TM-A50")
    if (currentRound === 1 && currentSection !== null) {
      // Format: | ID | Check | Severity | Notes |
      const idMatch = firstCell.match(/^([A-X][0-9]+|TM-[A-Z][0-9]+)$/);
      if (!idMatch) continue;
      if (row.cells.length < 3) continue;
      const patternId = idMatch[1];
      if (seenIds.has(patternId)) continue;
      const description = stripMarkdown(row.cells[1] ?? '');
      const severityField = row.cells[2] ?? '';
      const sev = parseSeverity(severityField);
      const lens = ROUND1_SECTION_LENS[currentSection] ?? ['standards-compliance'];
      const sourceType = classifySource(patternId);
      patterns.push({
        patternId,
        lens,
        sourceType,
        description: description || `Round-1 pattern ${patternId}`,
        severityHypothesis: sev.severity,
        round: 1,
        detectionPrecision: 'medium',
        isPureSpectralDetectable: true,
        isStageATerritory: true,
      });
      seenIds.add(patternId);
      continue;
    }

    // Round-2 Master rows
    if (inRound2Master && currentLens !== null) {
      // Format: | Pattern-ID | Title | Sources | Multi-Lens | Severity[/Direction] |
      //         Detection | Priority | Freq | Cost | Notes |
      // Lens-3 has 'Severity-Direction' as its 5th column (still parseable as severity).
      const idMatch = firstCell.match(/^([A-Z]+[0-9A-Z-]*)$/);
      if (!idMatch) continue;
      if (row.cells.length < 5) continue;
      const patternId = idMatch[1];
      if (seenIds.has(patternId)) continue;
      const title = stripMarkdown(row.cells[1] ?? '');
      const sources = row.cells[2] ?? '';
      const multiLens = row.cells[3] ?? '';
      const severityField = row.cells[4] ?? '';
      // Skip "covered" / "OUT" / "(LLM-only)" rows
      if (/\(covered\)|OUT|\(LLM-only\)/i.test(severityField)) continue;
      const sev = parseSeverity(severityField);
      // Combine multi-lens column with current lens
      const lensFromField = parseRound2LensField(multiLens);
      const lensSet = new Set<Lens>([currentLens, ...lensFromField]);
      const sourceType = classifySourceForRound2Sources(sources) || classifySource(patternId);
      patterns.push({
        patternId,
        lens: Array.from(lensSet),
        sourceType,
        description: title || `Round-2 ${patternId}`,
        severityHypothesis: sev.severity,
        direction: sev.direction,
        round: 2,
        detectionPrecision: 'medium',
        isPureSpectralDetectable: !/heuristic|graph|llm/i.test(row.cells[5] ?? ''),
        isStageATerritory: true,
      });
      seenIds.add(patternId);
      continue;
    }

    // Round-3 Additions rows
    if (inRound3Section && currentLens !== null) {
      // Format: | Pattern-ID | Source | Description | Severity-Hyp | Spectral? | Stage-A? | relates-to-existing |
      const idMatch = firstCell.match(/^(R3-[A-Z]+-[A-Z0-9-]+)$/);
      if (!idMatch) continue;
      if (row.cells.length < 6) continue;
      const patternId = idMatch[1];
      if (seenIds.has(patternId)) continue;
      const source = row.cells[1] ?? '';
      const description = stripMarkdown(row.cells[2] ?? '');
      const severityField = row.cells[3] ?? '';
      const spectralField = (row.cells[4] ?? '').toLowerCase();
      const stageAField = (row.cells[5] ?? '').toLowerCase();
      const sev = parseSeverity(severityField);
      const sourceType = classifySource(patternId);
      patterns.push({
        patternId,
        lens: [currentLens],
        sourceType,
        description: description || `Round-3 ${patternId}`,
        severityHypothesis: sev.severity,
        round: 3,
        detectionPrecision: 'medium',
        isPureSpectralDetectable: spectralField.includes('true'),
        isStageATerritory: stageAField.includes('true'),
      });
      // Tag with source-prefix variation if explicitly mentioned
      void source;
      seenIds.add(patternId);
      continue;
    }
  }

  return patterns;
}

function stripMarkdown(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();
}

// =============================================================================
// Index build + load
// =============================================================================

let _index: PatternIndexEntry[] | null = null;

function loadIndex(): PatternIndexEntry[] {
  if (_index) return _index;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new Error(
      `Pattern-index not found at ${INDEX_PATH}. Run buildPatternIndex() first (or invoke build-pattern-index.ts CLI).`
    );
  }
  const raw = fs.readFileSync(INDEX_PATH, 'utf8');
  _index = JSON.parse(raw) as PatternIndexEntry[];
  return _index;
}

export interface BuildStats {
  totalPatterns: number;
  cacheHits: number;
  cacheMisses: number;
  apiCalls: number;
  indexFileSize: number;
}

export async function buildPatternIndex(): Promise<BuildStats> {
  const patterns = loadAllPatterns();
  if (patterns.length === 0) {
    throw new Error('Parser yielded zero patterns. rules-brainstorm.md schema may have changed.');
  }
  // eslint-disable-next-line no-console
  console.log(`Pattern-index: parsing yielded ${patterns.length} patterns from rules-brainstorm.md`);

  const texts = patterns.map(
    (p) => `${p.description} | ${p.lens.join(',')} | ${p.sourceType}`
  );
  const { vectors, cacheHits, cacheMisses, apiCalls } = await embedBatch(texts);

  const entries: PatternIndexEntry[] = patterns.map((p, i) => ({
    patternId: p.patternId,
    lens: p.lens,
    sourceType: p.sourceType,
    description: p.description,
    embedding: vectors[i],
    metadata: {
      round: p.round,
      severityHypothesis: p.severityHypothesis,
      direction: p.direction,
      detectionPrecision: p.detectionPrecision,
      isPureSpectralDetectable: p.isPureSpectralDetectable,
      isStageATerritory: p.isStageATerritory,
    },
  }));

  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), 'utf8');
  const fileSize = fs.statSync(INDEX_PATH).size;

  // Reset in-memory cache so the next loadIndex() call picks up the freshly-written file
  _index = null;

  return {
    totalPatterns: entries.length,
    cacheHits,
    cacheMisses,
    apiCalls,
    indexFileSize: fileSize,
  };
}

// =============================================================================
// Search API
// =============================================================================

export async function findRelatedPatterns(
  query: string,
  opts: FindRelatedOpts = {}
): Promise<PatternMatch[]> {
  const topK = opts.topK ?? 10;
  const minSim = opts.minSimilarity ?? 0.5;

  const queryVec = await embed(query);
  const idx = loadIndex();

  const filtered = idx.filter((e) => {
    if (opts.lens && !e.lens.includes(opts.lens)) return false;
    if (opts.sourceType && e.sourceType !== opts.sourceType) return false;
    return true;
  });

  const scored = filtered.map((e) => ({ pattern: e, similarity: cosine(queryVec, e.embedding) }));
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.filter((s) => s.similarity >= minSim).slice(0, topK);
}

// Test-only escape hatch: reset the cached in-memory index (e.g. after rebuild).
export function resetPatternIndexCache(): void {
  _index = null;
}
