#!/usr/bin/env tsx
/**
 * Patterns-JSON-Export — parses master `rules-brainstorm.md` and writes
 * `scripts/spike/data/patterns.json` as structured single-source-of-truth
 * for downstream wellen (F, C/D, T, M5).
 *
 * Per `specs/E09-w-m-mining-optimization.md` Plus-section + D15.
 *
 * Usage:
 *   npx tsx scripts/spike/eval/patterns-export.ts
 *
 * Output: scripts/spike/data/patterns.json (committed).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  Lens,
  Severity,
  SeverityDirection,
} from '../deterministic/infra/severity-schema.js';

// =============================================================================
// 1. Schema (D15)
// =============================================================================

export type ExportedSourceType =
  | 'rfc'
  | 'rfc-draft'
  | 'owasp'
  | 'book'
  | 'postmortem'
  | 'corpus'
  | 'conference-talk'
  | 'vendor-blog'
  | 'paper'
  | 'spectral-default'
  | 'linter'
  | 'style-guide'
  | 're-audit'
  | 'apiq-original';

export interface ExportedPattern {
  patternId: string;
  lens: Lens[];
  source: {
    type: ExportedSourceType;
    citation: string;
    verbatim?: string;
    url?: string;
  };
  severityHypothesis: Severity;
  direction?: SeverityDirection;
  codegenTargets: string[];
  description: string;
  detectionPrecision: 'high' | 'medium' | 'low';
  isPureSpectralDetectable: boolean;
  isStageATerritory: boolean;
  round: 1 | 2 | 3 | 4;
}

export interface ParseStats {
  totalPatterns: number;
  perRound: Record<1 | 2 | 3 | 4, number>;
  perLens: Record<Lens, number>;
  perSeverity: Record<Severity, number>;
  perSourceType: Record<string, number>;
  patternsWithVerbatim: number;
  patternsWithUrl: number;
  patternsWithCitation: number;
  unparseable: string[];
  enrichmentSources: {
    metaFileMatches: number;
    descriptionMarkerMatches: number;
    notesColumnMatches: number;
    urlAutoDerived: number;
    verbatimAutoExtracted: number;
  };
}

// =============================================================================
// 2. Lens-Mapping (header-string → Lens enum-value)
// =============================================================================

const LENS_NAMES: ReadonlyArray<Lens> = [
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

const LENS_BY_NUMBER: Record<number, Lens> = {
  1: 'threat-modeling',
  2: 'standards-compliance',
  3: 'evolution-friction',
  4: 'client-friction',
  5: 'style-coherence',
  6: 'privacy-data-class',
  7: 'operations',
  8: 'internal-consistency',
  9: 'ai-agent-consumability',
  10: 'operational-metadata',
};

/**
 * Parse a Lens-header line and return the resolved lens-name.
 * Examples:
 *   "Lens 1 — Threat-Modeling"      → 'threat-modeling'
 *   "Lens 4 — Client-Friction"      → 'client-friction'
 *   "Lens 6 — Privacy / Data-Class" → 'privacy-data-class'
 */
function parseLensFromHeader(header: string): Lens | null {
  const lower = header.toLowerCase();

  // Try numbered lens first ("Lens N — ...")
  const numMatch = header.match(/lens\s+(\d{1,2})\b/i);
  if (numMatch) {
    const n = Number(numMatch[1]);
    if (LENS_BY_NUMBER[n]) return LENS_BY_NUMBER[n];
  }

  // Fallback: keyword-match
  if (/threat[-\s]?modeling|threat-mod/i.test(header)) return 'threat-modeling';
  if (/standards[-\s]?compliance|standards/i.test(lower) && !/internal/i.test(lower))
    return 'standards-compliance';
  if (/evolution[-\s]?friction|evolution/i.test(lower)) return 'evolution-friction';
  if (/client[-\s]?friction|\bclient\b/i.test(lower)) return 'client-friction';
  if (/style[-\s]?coherence|\bstyle\b/i.test(lower)) return 'style-coherence';
  if (/privacy|data[-\s]?class/i.test(lower)) return 'privacy-data-class';
  if (/operations|operational(?!\s*metadata)/i.test(lower)) return 'operations';
  if (/internal[-\s]?consistency|internal/i.test(lower)) return 'internal-consistency';
  if (/ai[-\s]?agent|ai-agent-consum/i.test(lower)) return 'ai-agent-consumability';
  if (/operational[-\s]?metadata|operational-metad/i.test(lower))
    return 'operational-metadata';

  return null;
}

// =============================================================================
// 3. Severity / Source heuristics
// =============================================================================

function parseSeverity(raw: string): Severity {
  const lower = raw.toLowerCase().trim();
  if (lower.includes('error') || lower === 'must' || lower === 'must-not')
    return 'error';
  if (lower.includes('warn') || lower === 'should' || lower === 'should-not')
    return 'warn';
  if (lower.includes('hint') || lower.includes('recommended') || lower === 'may')
    return 'hint';
  if (lower.includes('info')) return 'info';
  // Default: treat as hint (D15 robustness rule)
  return 'hint';
}

function parseSourceTypeFromPatternId(
  patternId: string,
): ExportedSourceType {
  const upper = patternId.toUpperCase();

  // Round-4 prefixes — most specific (Round-4 mining 2026-05-07)
  // R4-CT-* = conference-talk, R4-VB-* = vendor-blog,
  // R4-IETF-* = rfc / rfc-draft, R4-AP-* = academic paper
  if (upper.startsWith('R4-CT-')) return 'conference-talk';
  if (upper.startsWith('R4-VB-')) return 'vendor-blog';
  if (upper.startsWith('R4-IETF-')) return 'rfc';
  if (upper.startsWith('R4-AP-')) return 'paper';

  // Round-3 prefixes — most specific
  if (upper.startsWith('R3-BK-')) return 'book';
  if (upper.startsWith('R3-PM-')) return 'postmortem';
  if (upper.startsWith('R3-CO-')) return 'corpus';
  if (upper.startsWith('R3-RA-')) return 're-audit';

  // Round-2 prefixes — based on phase-letter convention from rules-brainstorm
  // TM-A* = Threat-Modeling (OWASP-class)
  // RFC2-* = RFC-2119 standards-compliance
  // EV-* = Evolution
  // CL-* = Client-Friction
  // SC-* / SCF-* = Style-Coherence
  // F-* = Phase-F meta
  // L6/L7/L8/L9/L10-* = Lens-prefixed Round-2 phase-F additions
  if (upper.startsWith('TM-A')) return 'owasp';
  if (upper.startsWith('RFC2-')) return 'rfc';
  if (
    upper.startsWith('EV-') ||
    upper.startsWith('CL-') ||
    upper.startsWith('SCF-') ||
    upper.startsWith('SC-')
  )
    return 'style-guide';
  if (
    upper.startsWith('L6-') ||
    upper.startsWith('L7-') ||
    upper.startsWith('L8-') ||
    upper.startsWith('L9-') ||
    upper.startsWith('L10-') ||
    upper.startsWith('OM-') ||
    upper.startsWith('OP-') ||
    upper.startsWith('IC-') ||
    upper.startsWith('AI-') ||
    upper.startsWith('PR-')
  )
    return 'style-guide';
  if (upper.startsWith('F-')) return 'style-guide';

  // Round-1 single-letter or compound prefixes
  // A* / B* / C* … = generic-categories from brainstorm
  // *-MIN-* = mining single-source
  // *-SP-* = spectral-vendor (linter)
  if (/-SP-/.test(upper)) return 'linter';
  if (/-MIN-/.test(upper)) return 'linter';
  if (/-SG-/.test(upper)) return 'style-guide';
  if (/-VTEX-/.test(upper)) return 'linter';
  if (upper.startsWith('Y-')) return 'owasp';
  if (upper.startsWith('Z-')) return 'style-guide';
  if (upper.startsWith('DM-')) return 'linter';
  if (upper.startsWith('A-SP-') || upper.startsWith('A-MIN-')) return 'linter';

  // Apiq-original Round-1 identifiers (single letter + digit, e.g. A1, B7, M14)
  if (/^[A-Z]\d+$/.test(upper)) return 'apiq-original';
  // Sub-tagged like W-MIN-1 already covered above
  if (/^[A-Z]+-\d+$/.test(upper)) return 'apiq-original';

  return 'apiq-original';
}

function parseSourceTypeFromSourceCol(rawSource: string): ExportedSourceType {
  const lower = rawSource.toLowerCase();
  if (/^books?:/.test(lower) || /\bbooks?:/.test(lower)) return 'book';
  if (/^postmortem:/.test(lower) || /\bpostmortem:/.test(lower))
    return 'postmortem';
  if (/^corpus:/.test(lower)) return 'corpus';
  if (/^reaudit:/.test(lower) || /^re-audit:/.test(lower)) return 're-audit';
  if (/owasp/.test(lower)) return 'owasp';
  if (/rfc[-\s]?\d+/.test(lower)) return 'rfc';
  if (/spectral|vacuum|redocly|ibm[-\s]/i.test(rawSource)) return 'linter';
  return 'style-guide';
}

// =============================================================================
// 4. Round-3 detail-resolver (cross-references mining-round3-*.md source-files)
// =============================================================================

interface Round3Detail {
  citation?: string;
  verbatim?: string;
  url?: string;
  severityHypothesis?: Severity;
  direction?: SeverityDirection;
  codegenTargets?: string[];
  description?: string;
  detectionPrecision?: 'high' | 'medium' | 'low';
  isPureSpectralDetectable?: boolean;
  isStageATerritory?: boolean;
  lens?: Lens[];
  sourceType?: ExportedSourceType;
}

/**
 * Build an index of Round-3 patterns keyed by patternId, by parsing the
 * `mining-round3-{books,postmortems,corpus}.md` YAML-block files and the
 * `mining-round3-reaudit.md` ID/title-block file.
 */
function buildRound3DetailIndex(repoRoot: string): Map<string, Round3Detail> {
  const map = new Map<string, Round3Detail>();
  const sourceFiles: Array<{ file: string; sourceType: ExportedSourceType }> = [
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round3-books.md',
      sourceType: 'book',
    },
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round3-postmortems.md',
      sourceType: 'postmortem',
    },
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round3-corpus.md',
      sourceType: 'corpus',
    },
  ];

  for (const sf of sourceFiles) {
    const full = path.join(repoRoot, sf.file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    parseRound3YamlBlocks(text, sf.sourceType, map);
  }

  // Re-audit file uses a different format (key: value blocks separated by '#')
  const reauditPath = path.join(
    repoRoot,
    'specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md',
  );
  if (fs.existsSync(reauditPath)) {
    const text = fs.readFileSync(reauditPath, 'utf8');
    parseRound3ReauditBlocks(text, map);
  }

  return map;
}

/**
 * Parse a YAML-style block. The content is in markdown ```yaml fences.
 * Each "- pattern-id: ..." starts a new block (until next "- pattern-id:" or
 * end of fence).
 */
function parseRound3YamlBlocks(
  text: string,
  defaultSourceType: ExportedSourceType,
  out: Map<string, Round3Detail>,
): void {
  const blockRegex = /-\s+pattern-id:\s+(R3-[A-Z0-9-]+)([\s\S]*?)(?=\n-\s+pattern-id:\s+R3-|\n```|\n##\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    const pid = m[1].trim();
    const body = m[2];
    const detail: Round3Detail = { sourceType: defaultSourceType };

    const citation = matchYamlField(body, 'citation');
    if (citation) detail.citation = citation;
    const verbatim = matchYamlField(body, 'verbatim');
    if (verbatim) detail.verbatim = verbatim;
    const url = matchYamlField(body, 'url');
    if (url) detail.url = url;
    const sev = matchYamlField(body, 'severity-hypothesis');
    if (sev) detail.severityHypothesis = parseSeverity(sev);
    const dir = matchYamlField(body, 'direction');
    if (dir && /^(tighten|loosen|drift)$/.test(dir.trim()))
      detail.direction = dir.trim() as SeverityDirection;
    const description = matchYamlField(body, 'description');
    if (description) detail.description = description;
    const dp = matchYamlField(body, 'detection-precision');
    if (dp && /^(high|medium|low)$/.test(dp.trim()))
      detail.detectionPrecision = dp.trim() as 'high' | 'medium' | 'low';
    const sp = matchYamlField(body, 'is-pure-spectral-detectable');
    if (sp) detail.isPureSpectralDetectable = /^true$/i.test(sp.trim());
    const stage = matchYamlField(body, 'is-stage-a-territory');
    if (stage) detail.isStageATerritory = /^true$/i.test(stage.trim());

    // codegen-targets: ["*"] OR ["java", "go"]
    const cgRaw = matchYamlField(body, 'codegen-targets');
    if (cgRaw) {
      const arrMatch = cgRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        detail.codegenTargets = arrMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
      }
    }

    // lens: [threat-modeling, ...] — array of lens-names OR numeric [1, 2, ...]
    const lensRaw = matchYamlField(body, 'lens');
    if (lensRaw) {
      const arrMatch = lensRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        const tokens = arrMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
        const resolved: Lens[] = [];
        for (const t of tokens) {
          const numeric = Number(t);
          if (!isNaN(numeric) && LENS_BY_NUMBER[numeric]) {
            resolved.push(LENS_BY_NUMBER[numeric]);
            continue;
          }
          const lens = parseLensFromHeader(t);
          if (lens) resolved.push(lens);
        }
        if (resolved.length > 0) detail.lens = resolved;
      }
    }

    out.set(pid, detail);
  }
}

/**
 * Round-4 detail-resolver — same shape as Round-3 but for R4-* IDs.
 *
 * Parses Round-4 mining files for YAML pattern-blocks. Round-4 source-files
 * (mining-round4-{conferences,vendor-blogs,papers}.md) all use the same
 * YAML pattern-block format as Round-3.
 */
function buildRound4DetailIndex(repoRoot: string): Map<string, Round3Detail> {
  const map = new Map<string, Round3Detail>();
  const sourceFiles: Array<{ file: string; sourceType: ExportedSourceType }> = [
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round4-conferences.md',
      sourceType: 'conference-talk',
    },
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round4-vendor-blogs.md',
      sourceType: 'vendor-blog',
    },
    {
      file: 'specs/big-spec-architecture-spike-stage-a-mining-round4-papers.md',
      sourceType: 'paper',
    },
  ];

  for (const sf of sourceFiles) {
    const full = path.join(repoRoot, sf.file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, 'utf8');
    parseRound4YamlBlocks(text, sf.sourceType, map);
  }

  return map;
}

/**
 * Parse Round-4 YAML pattern-blocks. Same structure as parseRound3YamlBlocks
 * but with R4-prefix detection. R4-IETF prefix uses 'rfc' or 'rfc-draft' source-type
 * depending on the citation field (auto-detected here).
 */
function parseRound4YamlBlocks(
  text: string,
  defaultSourceType: ExportedSourceType,
  out: Map<string, Round3Detail>,
): void {
  const blockRegex = /-\s+pattern-id:\s+(R4-[A-Z0-9-]+)([\s\S]*?)(?=\n-\s+pattern-id:\s+R4-|\n```|\n##\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    const pid = m[1].trim();
    const body = m[2];
    const detail: Round3Detail = { sourceType: defaultSourceType };

    // For R4-IETF, refine source-type based on the YAML `type:` sub-field.
    if (pid.startsWith('R4-IETF-')) {
      const typeMatch = body.match(/^\s+type:\s+(\S+)/m);
      if (typeMatch) {
        const t = typeMatch[1].trim().toLowerCase();
        if (t === 'rfc-draft') detail.sourceType = 'rfc-draft';
        else if (t === 'rfc') detail.sourceType = 'rfc';
      } else {
        detail.sourceType = 'rfc';
      }
    }

    const citation = matchYamlField(body, 'citation');
    if (citation) detail.citation = citation;
    const verbatim = matchYamlField(body, 'verbatim');
    if (verbatim) detail.verbatim = verbatim;
    const url = matchYamlField(body, 'url');
    if (url) detail.url = url;
    const sev = matchYamlField(body, 'severity-hypothesis');
    if (sev) detail.severityHypothesis = parseSeverity(sev);
    const dir = matchYamlField(body, 'direction');
    if (dir && /^(tighten|loosen|drift)$/.test(dir.trim()))
      detail.direction = dir.trim() as SeverityDirection;
    const description = matchYamlField(body, 'description');
    if (description) detail.description = description;
    const dp = matchYamlField(body, 'detection-precision');
    if (dp && /^(high|medium|low)$/.test(dp.trim()))
      detail.detectionPrecision = dp.trim() as 'high' | 'medium' | 'low';
    const sp = matchYamlField(body, 'is-pure-spectral-detectable');
    if (sp) detail.isPureSpectralDetectable = /^true$/i.test(sp.trim());
    const stage = matchYamlField(body, 'is-stage-a-territory');
    if (stage) detail.isStageATerritory = /^true$/i.test(stage.trim());

    // codegen-targets
    const cgRaw = matchYamlField(body, 'codegen-targets');
    if (cgRaw) {
      const arrMatch = cgRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        detail.codegenTargets = arrMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
      }
    }

    // lens: numeric [1, 2] or string [threat-modeling, ...]
    const lensRaw = matchYamlField(body, 'lens');
    if (lensRaw) {
      const arrMatch = lensRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        const tokens = arrMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
        const resolved: Lens[] = [];
        for (const t of tokens) {
          const numeric = Number(t);
          if (!isNaN(numeric) && LENS_BY_NUMBER[numeric]) {
            resolved.push(LENS_BY_NUMBER[numeric]);
            continue;
          }
          const lens = parseLensFromHeader(t);
          if (lens) resolved.push(lens);
        }
        if (resolved.length > 0) detail.lens = resolved;
      }
    }

    out.set(pid, detail);
  }
}

/**
 * Parse re-audit blocks of form:
 *   # R3-RA-7-1 — Last-Modified on cacheable GET (read-side cache-validator)
 *   id: R3-RA-7-1
 *   title: "..."
 *   sources: [...]
 *   multi-lens: [7, 4]
 *   severity: hint
 *   ...
 */
function parseRound3ReauditBlocks(
  text: string,
  out: Map<string, Round3Detail>,
): void {
  const blockRegex = /^#\s+(R3-RA-[A-Z0-9-]+).*?$([\s\S]*?)(?=^#\s+R3-RA-|^##\s|^---\s*$|\Z)/gm;
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    const pid = m[1].trim();
    const body = m[2];
    const detail: Round3Detail = { sourceType: 're-audit' };

    const title = matchYamlField(body, 'title');
    if (title) detail.citation = title;
    const sev = matchYamlField(body, 'severity');
    if (sev) detail.severityHypothesis = parseSeverity(sev);
    // multi-lens: [7, 4]
    const lensRaw = matchYamlField(body, 'multi-lens');
    if (lensRaw) {
      const arrMatch = lensRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        const nums = arrMatch[1]
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => Number.isFinite(n));
        const resolved = nums
          .map((n) => LENS_BY_NUMBER[n])
          .filter((l): l is Lens => Boolean(l));
        if (resolved.length > 0) detail.lens = resolved;
      }
    }
    const notes = matchYamlField(body, 'notes');
    if (notes) detail.description = notes;
    const sources = matchYamlField(body, 'sources');
    if (sources && !detail.citation) detail.citation = sources;

    out.set(pid, detail);
  }
}

/**
 * Match a YAML-style "key: value" field within a block-body. Handles:
 *   - Plain scalar    →  key: value
 *   - Quoted scalar   →  key: "value"
 *   - Block scalar    →  key: |
 *                          line1
 *                          line2
 */
function matchYamlField(body: string, key: string): string | null {
  // Block-scalar (|) form: capture indented lines until next un-indented key
  const blockRegex = new RegExp(
    `(^|\\n)\\s*${escapeRegex(key)}:\\s*\\|\\s*\\n((?:\\s{2,}.*(?:\\n|$))+)`,
    'm',
  );
  const blockM = body.match(blockRegex);
  if (blockM) {
    return blockM[2]
      .split('\n')
      .map((l) => l.replace(/^\s{2,}/, ''))
      .join(' ')
      .trim();
  }

  // Inline form: key: value | key: "value"
  const inlineRegex = new RegExp(
    `(^|\\n)\\s*${escapeRegex(key)}:\\s*(.+?)(?=\\n\\s*[a-z][a-z0-9-]*:|\\n\\s*$|$)`,
    'mi',
  );
  const inlineM = body.match(inlineRegex);
  if (inlineM) {
    let v = inlineM[2].trim();
    // Strip surrounding quotes
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  }

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// 5. Markdown table-row parser
// =============================================================================

/**
 * Strip leading/trailing pipes and inline `code` markers from a table-cell.
 * Removes ALL backticks (since they wrap inline-code that markdown renders
 * but is purely visual noise in our exported JSON).
 */
function cleanCell(cell: string): string {
  return cell.trim().replace(/`/g, '').trim();
}

/**
 * Parse a markdown table row "| col | col | col |" into an array of cells.
 * Returns null if the line is not a table row (or is the separator).
 */
function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) return null;
  // Skip separator rows like "|---|---|---|"
  if (/^\|\s*[-:\s|]+\s*\|?\s*$/.test(trimmed)) return null;

  // Split on pipes that aren't inside backticks
  const parts: string[] = [];
  let cur = '';
  let inCode = false;
  // Drop the first "|" (it's the row-leader)
  const inner = trimmed.replace(/^\|/, '').replace(/\|\s*$/, '');
  for (const ch of inner) {
    if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      parts.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur);

  return parts.map((p) => p.trim());
}

// =============================================================================
// 5b. Mining-Round-2 Meta-File Cross-Reference Index (Phase F enrichment)
// =============================================================================

interface MetaFileEntry {
  /** verbatim-quote (already-curated description from mining-round2-meta.md) */
  verbatim?: string;
  /** url derived from source-domain mapping */
  url?: string;
  /** citation (Source-Domain column) */
  citation?: string;
}

/**
 * Parse `mining-round2-meta.md` Phase-F take-into-apiq table (F-1..F-20) to
 * build a cross-reference index keyed by pattern-id. The Phase-F table has
 * the shape:
 *
 *   | **F-N. Title** | Source-Domain | Lens | Why-generalisable | Detection | Severity | Notes |
 */
function buildMetaFileIndex(repoRoot: string): Map<string, MetaFileEntry> {
  const map = new Map<string, MetaFileEntry>();
  const metaPath = path.join(
    repoRoot,
    'specs/big-spec-architecture-spike-stage-a-mining-round2-meta.md',
  );
  if (!fs.existsSync(metaPath)) return map;

  const text = fs.readFileSync(metaPath, 'utf8');
  const lines = text.split(/\r?\n/);

  // Match: | **F-1. Sunset header (RFC 8594) on deprecated operations** | RFC + FinTech FAPI mandate | 3, 10 | ... |
  const fRowRegex = /^\|\s*\*\*(F-\d+)\.\s*([^*]+?)\*\*\s*\|\s*([^|]+)\|/;
  for (const line of lines) {
    const m = line.match(fRowRegex);
    if (!m) continue;
    const pid = m[1].trim();
    const title = m[2].trim();
    const sourceDomain = m[3].trim();

    const entry: MetaFileEntry = {
      verbatim: title,
      citation: sourceDomain,
    };
    // Try to derive URL from sourceDomain content
    const url = deriveUrlFromCitation(sourceDomain) ?? deriveUrlFromCitation(title);
    if (url) entry.url = url;
    map.set(pid, entry);
  }

  return map;
}

// =============================================================================
// 5c. URL auto-derivation from citation strings
// =============================================================================

/**
 * Auto-derive a canonical URL from a citation-string. Supports:
 *   - RFC NNNN[NN]                → https://www.rfc-editor.org/rfc/rfcNNNN
 *   - OWASP API[1-10]             → OWASP Top-10 API page
 *   - draft-ietf-httpapi-X        → IETF datatracker
 *   - OAS [23].N                  → OpenAPI spec
 *   - OASDIFF                     → oasdiff GitHub
 *   - Spectral / spectral:X       → Stoplight Spectral docs
 *   - SLA4OAI                     → SLA4OAI spec
 *   - DOLAR / Palma/Khomh         → Palma 2015 chapter
 *   - FAIR                        → FAIR principles
 *   - ISO/IEC 25010               → ISO standard page
 *   - HL7 FHIR                    → FHIR RESTful API spec
 *   - GitHub / Stripe / OpenAI    → respective developer-docs
 */
function deriveUrlFromCitation(citation: string): string | undefined {
  if (!citation) return undefined;
  const lower = citation.toLowerCase();

  // RFC — most common
  const rfcMatch = citation.match(/RFC\s+(\d{3,5})\b/i);
  if (rfcMatch) return `https://www.rfc-editor.org/rfc/rfc${rfcMatch[1]}`;

  // BCP — boundary-case
  const bcpMatch = citation.match(/\bBCP[-\s]?(\d{2,4})\b/i);
  if (bcpMatch) return `https://www.rfc-editor.org/info/bcp${bcpMatch[1]}`;

  // OWASP API[1-10]
  const owaspApiMatch = citation.match(/OWASP\s+API[-\s]?(\d{1,2})\b/i);
  if (owaspApiMatch) {
    return `https://owasp.org/API-Security/editions/2023/en/0xa${owaspApiMatch[1]}-`;
  }
  if (/owasp\s+(rest|cheat)/i.test(citation)) {
    return 'https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html';
  }
  if (/owasp\s+cors/i.test(citation)) {
    return 'https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny';
  }
  if (/owasp\s+http[-\s]?headers/i.test(citation)) {
    return 'https://owasp.org/www-project-secure-headers/';
  }
  if (/^owasp\b/i.test(citation) || /\bowasp\b/i.test(lower)) {
    return 'https://owasp.org/www-project-api-security/';
  }

  // IETF drafts (draft-ietf-X-Y / draft-foo-bar)
  const draftMatch = citation.match(/draft-[a-z]+-[a-z0-9-]+/i);
  if (draftMatch) {
    return `https://datatracker.ietf.org/doc/${draftMatch[0]}/`;
  }

  // OAS / OpenAPI X.Y
  if (/OAS[-\s]?3\.0|OpenAPI\s*3\.0/i.test(citation)) {
    return 'https://spec.openapis.org/oas/v3.0.3';
  }
  if (/OAS[-\s]?3\.1|OpenAPI\s*3\.1/i.test(citation)) {
    return 'https://spec.openapis.org/oas/v3.1.0';
  }
  if (/OAS[-\s]?3\.3/i.test(citation)) {
    return 'https://github.com/OAI/OpenAPI-Specification';
  }
  if (/^OAS\b|^OpenAPI\b/.test(citation)) {
    return 'https://spec.openapis.org/oas/latest.html';
  }

  // OASDIFF
  if (/oasdiff/i.test(citation)) return 'https://github.com/oasdiff/oasdiff';

  // Spectral / Stoplight
  if (/spectral/i.test(citation)) return 'https://github.com/stoplightio/spectral';
  if (/vacuum/i.test(citation)) return 'https://quobix.com/vacuum/';
  if (/redocly/i.test(citation)) return 'https://redocly.com/docs/cli/rules/';
  if (/\bibm[-\s]/i.test(citation) || /^IBM\b/.test(citation))
    return 'https://github.com/IBM/openapi-validator';

  // SLA4OAI
  if (/sla4oai/i.test(citation)) return 'https://sla4oai.specs.governify.io/';

  // DOLAR / Palma / Khomh
  if (/dolar|palma|khomh/i.test(citation)) {
    return 'https://link.springer.com/chapter/10.1007/978-3-662-48616-0_11';
  }
  if (/sara/i.test(citation)) {
    return 'https://www.worldscientific.com/doi/abs/10.1142/S0218843017420011';
  }

  // FAIR
  if (/\bfair\b/i.test(citation) && !/fapi/i.test(citation)) {
    return 'https://www.go-fair.org/fair-principles/';
  }

  // ISO/IEC 25010
  if (/ISO\/?IEC\s*25010/i.test(citation) || /iso[-\s]?25010/i.test(citation)) {
    return 'https://iso25000.com/index.php/en/iso-25000-standards/iso-25010';
  }

  // FHIR
  if (/\bfhir\b/i.test(citation)) return 'https://www.hl7.org/fhir/http.html';

  // FAPI
  if (/\bfapi\b/i.test(citation)) return 'https://openid.net/wg/fapi/';

  // TM Forum
  if (/tm\s*forum|tmf630/i.test(citation)) {
    return 'https://www.tmforum.org/resources/specification/tmf630-rest-api-design-guidelines-4-2-0/';
  }

  // arXiv references
  const arxivMatch = citation.match(/arxiv[:\s]+(\d{4}\.\d{4,5})/i);
  if (arxivMatch) return `https://arxiv.org/abs/${arxivMatch[1]}`;

  // Springer Delphi study
  if (/springer.*delphi|delphi.*springer/i.test(citation)) {
    return 'https://arxiv.org/abs/2108.00033';
  }

  // Microservice API Patterns (MAP)
  if (/\bmap\b.*pattern|microservice[-\s]api[-\s]pattern/i.test(citation)) {
    return 'https://microservice-api-patterns.org/';
  }

  // Bloch / Qt / Massé books
  if (/\bbloch\b/i.test(citation)) {
    return 'https://research.google.com/pubs/archive/32713.pdf';
  }
  if (/\bqt\b/i.test(citation) && /api[-\s]design/i.test(citation)) {
    return 'https://wiki.qt.io/API_Design_Principles';
  }
  if (/\bmass[ée]\b/i.test(citation)) {
    return 'https://www.oreilly.com/library/view/rest-api-design/9781449317904/';
  }

  // Heroku style guide
  if (/\bheroku\b/i.test(citation)) {
    return 'https://github.com/interagent/http-api-design';
  }
  // Zalando
  if (/\bzalando\b/i.test(citation)) {
    return 'https://opensource.zalando.com/restful-api-guidelines/';
  }
  // Microsoft
  if (/\bmicrosoft\b/i.test(citation)) {
    return 'https://github.com/microsoft/api-guidelines';
  }
  // Google AIP
  if (/\bgoogle\b.*aip|\baip-\d/i.test(citation)) return 'https://google.aip.dev/';
  // Stripe
  if (/\bstripe\b/i.test(citation)) return 'https://stripe.com/docs/api';
  // GitHub API
  if (/github[-\s]rest|github[-\s]api/i.test(citation)) {
    return 'https://docs.github.com/en/rest';
  }
  // OpenAI
  if (/\bopenai\b/i.test(citation)) return 'https://platform.openai.com/docs/api-reference';

  // IANA registry
  if (/\biana\b/i.test(citation)) return 'https://www.iana.org/assignments/';

  // 42Crunch
  if (/42crunch/i.test(citation)) {
    return 'https://42crunch.com/api-security-audit/';
  }

  // JSON-Schema versions (draft-NN, 2019-09, 2020-12)
  if (/json-schema/i.test(citation) || /\bdraft-\d{2}\b/i.test(citation)) {
    return 'https://json-schema.org/specification.html';
  }

  // Adidas / SPS / Azure / DigitalOcean / RedHat / Speakeasy / VTex / Box / Nexmo etc.
  if (/\badidas\b/i.test(citation)) {
    return 'https://github.com/adidas/api-guidelines';
  }
  if (/\bsps\b/i.test(citation) || /\bSPS-/i.test(citation)) {
    return 'https://github.com/SPSCommerce/sps-api-standards';
  }
  if (/\bazure\b/i.test(citation) || /\bAZ-/i.test(citation)) {
    return 'https://github.com/Azure/azure-api-style-guide';
  }
  if (/digitalocean|\bDO-/i.test(citation)) {
    return 'https://github.com/digitalocean/openapi';
  }
  if (/red[-\s]?hat|rhoas/i.test(citation)) {
    return 'https://github.com/redhat-developer/app-services-api-guidelines';
  }
  if (/speakeasy/i.test(citation)) return 'https://www.speakeasy.com/openapi';
  if (/\bvtex\b/i.test(citation)) {
    return 'https://github.com/vtex/openapi-schemas';
  }
  if (/\bteam[-\s]?d\b|teamdigitale/i.test(citation)) {
    return 'https://github.com/teamdigitale/api-openapi-samples';
  }
  if (/\baywh\b|apis you won/i.test(citation)) {
    return 'https://github.com/apisyouwonthate/style-guide';
  }
  if (/\boptic\b/i.test(citation)) return 'https://www.useoptic.com/';
  if (/\bbump\.?sh\b/i.test(citation)) return 'https://bump.sh/';
  if (/\bpb33f\b/i.test(citation)) return 'https://pb33f.io/';
  if (/cloudflare/i.test(citation)) {
    return 'https://developers.cloudflare.com/api/';
  }
  if (/zalando[-\s]?(restful|api)|zally/i.test(citation)) {
    return 'https://opensource.zalando.com/restful-api-guidelines/';
  }
  if (/apimatic/i.test(citation)) return 'https://www.apimatic.io/';
  if (/postman/i.test(citation)) return 'https://www.postman.com/api-platform/';
  if (/rapidapi/i.test(citation)) return 'https://rapidapi.com/';

  // OpenAPI Initiative / OAI
  if (/\boai\b|openapi initiative/i.test(citation)) {
    return 'https://www.openapis.org/';
  }

  // OpenID
  if (/openid|oidc/i.test(citation)) return 'https://openid.net/';

  // CORS — generic
  if (/^cors\s+spec|cors\s+w3c/i.test(citation)) {
    return 'https://www.w3.org/TR/cors/';
  }

  // SSRF cheat-sheet
  if (/ssrf/i.test(citation)) {
    return 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html';
  }

  // Fielding REST dissertation
  if (/fielding/i.test(citation)) {
    return 'https://www.ics.uci.edu/~fielding/pubs/dissertation/top.htm';
  }

  // Schema.org
  if (/schema\.org/i.test(citation)) return 'https://schema.org/';

  // JSON:API
  if (/json:?api/i.test(citation)) return 'https://jsonapi.org/';

  // HAL / Siren
  if (/\bhal\b/i.test(citation) && /(?:hal\+json|HAL\b)/i.test(citation))
    return 'https://stateless.group/hal_specification.html';
  if (/\bsiren\b/i.test(citation))
    return 'https://github.com/kevinswiber/siren';

  // OData
  if (/odata/i.test(citation)) {
    return 'https://www.odata.org/documentation/';
  }

  // GitHub webhook docs / Stripe webhook docs
  if (/webhook/i.test(citation) && /github/i.test(citation)) {
    return 'https://docs.github.com/en/webhooks';
  }

  return undefined;
}

// =============================================================================
// 5d. Verbatim auto-extraction
// =============================================================================

/**
 * Extract a verbatim-quote from a citation/notes string. Looks for:
 *   - parenthetical (verbatim "X")    → "X"
 *   - parenthetical (verbatim 'X')    → "X"
 *   - colon-separated  X: "Y"         → "Y"
 *   - bare double-quoted text         → first quoted span
 *
 * Returns undefined if no verbatim-quote found.
 */
function extractVerbatim(text: string): string | undefined {
  if (!text) return undefined;

  // (verbatim "X") or (verbatim 'X')
  const parenVerbatim = text.match(/\(verbatim\s+["']([^"']{2,200})["']\)/i);
  if (parenVerbatim) return parenVerbatim[1].trim();

  // bare "(verbatim X)" without quotes
  const parenVerbatimBare = text.match(/\(verbatim\s+([^)]{2,200})\)/i);
  if (parenVerbatimBare) {
    return parenVerbatimBare[1].replace(/^["']|["']$/g, '').trim();
  }

  // RFC-2119 keywords with quotes — e.g. ' "MUST utilize TLS" ', ' "NOT RECOMMENDED" '
  const mustQuoted = text.match(
    /"((?:MUST|SHOULD|MAY|REQUIRED|RECOMMENDED|NOT\s+RECOMMENDED|MUST\s+NOT|SHOULD\s+NOT)[^"]{0,180})"/,
  );
  if (mustQuoted) return mustQuoted[1].trim();

  return undefined;
}

// =============================================================================
// 5e. Round-1 Notes-column source-marker scanner
// =============================================================================

/**
 * Scan a Round-1 Notes-column cell for embedded source-references like
 * "OAS 3 §4.7.25", "RFC 7807", "RFC 8288", "RFC 6749 §3.1". Returns the
 * matched citation-string + auto-derived URL when possible.
 */
function scanNotesForSourceMarkers(notes: string): {
  citation?: string;
  url?: string;
  sourceType?: ExportedSourceType;
} {
  if (!notes) return {};

  // RFC NNNN [§X.Y]
  const rfcMatch = notes.match(/RFC\s+\d{3,5}(?:\s*§[\d.]+)?/i);
  if (rfcMatch) {
    return {
      citation: rfcMatch[0].trim(),
      url: deriveUrlFromCitation(rfcMatch[0]),
      sourceType: 'rfc',
    };
  }

  // OAS 3 §X.Y or OpenAPI 3.X
  const oasMatch = notes.match(/OAS[-\s]?3(?:\.\d)?(?:\s*§[\d.]+)?/i);
  if (oasMatch) {
    return {
      citation: oasMatch[0].trim(),
      url: deriveUrlFromCitation(oasMatch[0]),
      sourceType: 'spectral-default',
    };
  }
  const openapiMatch = notes.match(/OpenAPI\s*3\.\d/i);
  if (openapiMatch) {
    return {
      citation: openapiMatch[0].trim(),
      url: deriveUrlFromCitation(openapiMatch[0]),
      sourceType: 'spectral-default',
    };
  }

  // OWASP API[1-10] / OWASP REST etc.
  const owaspMatch = notes.match(/OWASP\s+(?:API[-\s]?\d{1,2}|REST|CORS|HTTP[-\s]?Headers|JWT)/i);
  if (owaspMatch) {
    return {
      citation: owaspMatch[0].trim(),
      url: deriveUrlFromCitation(owaspMatch[0]),
      sourceType: 'owasp',
    };
  }

  // ISO/IEC 25010
  const isoMatch = notes.match(/ISO\/?IEC\s*25010/i);
  if (isoMatch) {
    return {
      citation: isoMatch[0].trim(),
      url: deriveUrlFromCitation(isoMatch[0]),
      sourceType: 'style-guide',
    };
  }

  // IETF draft
  const draftMatch = notes.match(/draft-[a-z]+-[a-z0-9-]+/i);
  if (draftMatch) {
    return {
      citation: draftMatch[0].trim(),
      url: deriveUrlFromCitation(draftMatch[0]),
      sourceType: 'rfc',
    };
  }

  // BCP-NNN
  const bcpMatch = notes.match(/\bBCP[-\s]?\d{2,4}\b/i);
  if (bcpMatch) {
    return {
      citation: bcpMatch[0].trim(),
      url: deriveUrlFromCitation(bcpMatch[0]),
      sourceType: 'rfc',
    };
  }

  // Spectral / Vacuum / Redocly / IBM
  const linterMatch = notes.match(/\b(Spectral|Vacuum|Redocly|IBM|spectral:\w+)\b/i);
  if (linterMatch) {
    return {
      citation: linterMatch[0].trim(),
      url: deriveUrlFromCitation(linterMatch[0]),
      sourceType: 'linter',
    };
  }

  return {};
}

// =============================================================================
// 6. Main parser
// =============================================================================

/**
 * Top-level entrypoint. Reads master `rules-brainstorm.md`, walks line-by-line,
 * tracks current section/subsection, and emits ExportedPattern[] from any
 * markdown table-row whose first cell matches a Pattern-ID convention.
 */
export function parsePatternsFromMaster(masterPath: string): {
  patterns: ExportedPattern[];
  stats: ParseStats;
} {
  const repoRoot = path.resolve(path.dirname(masterPath), '..');
  const text = fs.readFileSync(masterPath, 'utf8');
  const lines = text.split(/\r?\n/);

  // Build the round-3 detail index (cross-reference source-files).
  const round3Detail = buildRound3DetailIndex(repoRoot);
  // Build the round-4 detail index (cross-reference source-files).
  const round4Detail = buildRound4DetailIndex(repoRoot);
  // Build the round-2-meta enrichment index (Phase F take-into-apiq table).
  const metaFileIndex = buildMetaFileIndex(repoRoot);

  const patterns: ExportedPattern[] = [];
  const seen = new Set<string>();
  const unparseable: string[] = [];

  // Enrichment counters
  let metaFileMatches = 0;
  let descriptionMarkerMatches = 0;
  let notesColumnMatches = 0;
  let urlAutoDerived = 0;
  let verbatimAutoExtracted = 0;

  // Section state
  let inRound3Section = false;
  let inRound4Section = false;
  let inRound2MasterSection = false;
  let inMiningErgRound1 = false;
  // Currently active Lens (Round-2 / Round-3 / Round-4 lens-headers set this)
  let activeLens: Lens | null = null;
  // Currently active brainstorm-category (A/B/C/...) — used as lens-fallback
  let activeRound1Category: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section transitions
    if (/^##\s+Round-4 Additions/i.test(line)) {
      inRound4Section = true;
      inRound3Section = false;
      inRound2MasterSection = false;
      inMiningErgRound1 = false;
      activeLens = null;
      continue;
    }
    if (/^##\s+Round-3 Additions/i.test(line)) {
      inRound3Section = true;
      inRound4Section = false;
      inRound2MasterSection = false;
      inMiningErgRound1 = false;
      activeLens = null;
      continue;
    }
    if (/^##\s+Mining-Round-2 Master-Konsolidierung/i.test(line)) {
      inRound2MasterSection = true;
      inRound3Section = false;
      inMiningErgRound1 = false;
      activeLens = null;
      continue;
    }
    if (/^##\s+Mining-Ergänzungen/i.test(line)) {
      inMiningErgRound1 = true;
      inRound3Section = false;
      inRound2MasterSection = false;
      activeLens = null;
      continue;
    }
    if (/^##\s+(Status|Andere deterministische|Implementierungs|Was nicht|Brainstorming)/i.test(line)) {
      // Other top-level sections — neutral
      // Do not reset round-flags here; Round-3 ends before "Status" though
    }

    // Lens-Header tracking inside Round-2 / Round-3 sections
    const lensHeader = line.match(/^####\s+Lens\s+\d+/i);
    if (lensHeader) {
      const resolved = parseLensFromHeader(line);
      activeLens = resolved;
      continue;
    }
    // Round-1 brainstorm-categories: "### A. Strukturelle Validität & OAS-Konformität"
    const r1CatHeader = line.match(/^###\s+([A-Z])\.\s+/);
    if (r1CatHeader) {
      activeRound1Category = r1CatHeader[1];
      activeLens = null;
      continue;
    }
    // Mining-Ergänzungen (Round-1 follow-up) per-category headers:
    // "#### Kategorie A — Strukturelle Validität & OAS-Konformität — Additions from mining"
    const miningCatHeader = line.match(/^####\s+Kategorie\s+([A-Z])\b/);
    if (miningCatHeader) {
      activeRound1Category = miningCatHeader[1];
      activeLens = null;
      continue;
    }

    // Try to parse as table row
    const cells = parseTableRow(line);
    if (!cells || cells.length < 2) continue;

    const idCellRaw = cells[0];
    const idCellClean = cleanCell(idCellRaw);

    // Skip table-headers (first column is "ID" / "Pattern-ID" / "Pattern" / "New ID" etc.)
    if (
      /^(id|pattern[-\s]?id|pattern|new\s+id|brainstorm[-\s]?id|topic|family|severity|lens|opinion|spectral)/i.test(
        idCellClean,
      )
    )
      continue;

    // Pattern-ID detection: heuristic — accept anything that looks like an ID.
    // We require:
    //   - either a Round-3 prefix (R3-) OR
    //   - matches /^[A-Z][A-Z0-9]*\d/ (e.g. "A1", "TM-A50", "RFC2-58", "Y-25", "M-SP-7")
    // Reject pure prose / multi-word phrases.
    const looksLikeId =
      /^R3-[A-Z]+-[A-Z0-9-]+$/.test(idCellClean) ||
      /^[A-Z][A-Z0-9]*-?[A-Z0-9-]*\d+[A-Z0-9-]*$/.test(idCellClean) ||
      /^[A-Z]\d+[a-z]?$/.test(idCellClean);

    if (!looksLikeId) continue;

    // Reject duplicates (master file has same ID listed in multiple summary tables)
    if (seen.has(idCellClean)) continue;

    // Build the pattern
    const round: 1 | 2 | 3 | 4 = inRound4Section
      ? 4
      : inRound3Section
        ? 3
        : inRound2MasterSection
          ? 2
          : 1;
    const r3Detail = round === 3 ? round3Detail.get(idCellClean) : undefined;
    const r4Detail = round === 4 ? round4Detail.get(idCellClean) : undefined;
    // Unified detail (used in both Round-3 and Round-4 enrichment paths)
    const detail = r3Detail ?? r4Detail;

    // Determine lens
    let lens: Lens[] = [];
    if (detail?.lens && detail.lens.length > 0) {
      lens = detail.lens;
    } else if (activeLens) {
      lens = [activeLens];
    } else if (activeRound1Category) {
      // Map common Round-1 categories to lenses
      lens = [mapRound1CategoryToLens(activeRound1Category)];
    } else {
      lens = ['standards-compliance']; // generic fallback
    }

    // Determine severity
    let severity: Severity = 'hint';
    let unparseableSeverity = false;
    if (detail?.severityHypothesis) {
      severity = detail.severityHypothesis;
    } else {
      // Find a severity column. Heuristics by section:
      //   Round-4 tables (per-lens):   column index 3 (Severity-Hyp)
      //   Round-4 tables (cross-lens): column index 4 (Severity-Hyp)
      //   Round-3 tables: column index 3 (Severity-Hyp)
      //   Round-2 tables: column index 4 (Severity)
      //   Round-1 tables: column index 2 (Severity)
      let sevCellIdx = -1;
      if (round === 4 && cells.length >= 4) sevCellIdx = 3;
      else if (round === 3 && cells.length >= 4) sevCellIdx = 3;
      else if (round === 2 && cells.length >= 5) sevCellIdx = 4;
      else if (round === 1 && cells.length >= 3) sevCellIdx = 2;

      if (sevCellIdx >= 0 && cells[sevCellIdx]) {
        const sevRaw = cleanCell(cells[sevCellIdx]);
        if (sevRaw.toLowerCase().includes('oos')) {
          // OOS rows — skip entirely (no severity).
          continue;
        }
        // Try to find a severity-keyword in the cell or any later cell.
        const sevText = cells.slice(sevCellIdx).join(' ');
        if (
          /\b(error|warn|hint|info)\b/i.test(sevText) ||
          /\b(MUST|SHOULD|MAY|RECOMMENDED)\b/i.test(sevText)
        ) {
          const directMatch = sevText.match(/\b(error|warn|hint|info)\b/i);
          severity = directMatch
            ? parseSeverity(directMatch[1])
            : parseSeverity(sevText);
        } else {
          unparseableSeverity = true;
        }
      } else {
        unparseableSeverity = true;
      }
    }
    if (unparseableSeverity) unparseable.push(idCellClean);

    // Description
    const description =
      detail?.description ?? cleanCell(cells[1] ?? idCellClean) ?? idCellClean;
    const truncDesc =
      description.length > 300 ? description.slice(0, 297) + '...' : description;

    // Source
    const sourceType: ExportedSourceType =
      detail?.sourceType ?? parseSourceTypeFromPatternId(idCellClean);
    let citation = detail?.citation;
    if (!citation) {
      // Heuristic: scan all cells (excluding the ID, severity, and description)
      // for a cell that contains source-markers like [SP-, MIN-, SG-, RFC, etc.
      // We compute which cells are "off-limits" up front.
      const sevColIdx =
        round === 4 && cells.length >= 4
          ? 3
          : round === 3 && cells.length >= 4
            ? 3
            : round === 2 && cells.length >= 5
              ? 4
              : round === 1 && cells.length >= 3
                ? 2
                : -1;
      const skipCols = new Set<number>([0, sevColIdx]);
      // For Round-3 tables: col 1 = Source, col 2 = Description.
      // For Round-2 tables: col 1 = Title, col 2 = Sources, col 3 = Multi-Lens.
      // For Round-1 tables: col 1 = Check, col 2 = Severity, col 3 = Notes.
      // For Round-1 mining tables: col 1 = Pattern, col 2 = Source, col 3 = Severity, col 4 = Notes.
      // For Round-1 cross-source-table: col 0 = Pattern, col 1 = Sources, col 2 = Severity, col 3 = Cat, col 4 = Notes.

      // First pass: explicit source-marker hunting
      for (let cIdx = 1; cIdx < cells.length; cIdx++) {
        if (skipCols.has(cIdx)) continue;
        const c = cells[cIdx];
        if (
          /\[(SP-|MIN-|SG-|G-|TM-|RFC|OWASP|AYWH|Vacuum|Redocly|IBM|Spectral|Team-D|SPS|Adidas|Azure|Stripe|Microsoft|Google|Zalando)/i.test(
            c,
          ) ||
          /(books?|postmortem|corpus|reaudit|spectral|vacuum|redocly|ibm):/i.test(c)
        ) {
          citation = cleanCell(c);
          break;
        }
      }

      // Second pass: pick a designated "source" column based on table-shape.
      // Round-4 source column is col-1 (the "Source" column, same as Round-3).
      // Round-3 source column is col-1 (the "Source" column).
      // Round-2 source column is col-2 (the "Sources" column).
      // Round-1 mining-tables: col-2 is the "Source" column.
      // Round-1 simple tables (A1-X5): no source col — citation stays apiq-original.
      if (!citation) {
        if (round === 4 && cells[1]) {
          citation = cleanCell(cells[1]);
        } else if (round === 3 && cells[1]) {
          citation = cleanCell(cells[1]);
        } else if (round === 2 && cells.length >= 3) {
          citation = cleanCell(cells[2]);
        } else if (round === 1 && cells.length >= 5 && cells[2]) {
          // Mining-tables: col-2 is Source
          citation = cleanCell(cells[2]);
        }
      }

      // Round-1 simple-table fallback (4-col tables: ID|Check|Severity|Notes).
      // The Notes column may carry RFC/OAS/OWASP/Spectral source-markers.
      if (!citation && round === 1 && cells.length === 4 && cells[3]) {
        const notesCell = cleanCell(cells[3]);
        const scanned = scanNotesForSourceMarkers(notesCell);
        if (scanned.citation) {
          citation = scanned.citation;
          notesColumnMatches++;
        }
      }

      if (!citation) citation = 'apiq-original';
    }
    citation = citation || 'apiq-original';
    if (citation.length > 500) citation = citation.slice(0, 500);

    // direction / codegen / detection / spectral / stage-a (round-3+4 only typically)
    const direction = detail?.direction;
    const codegenTargets = detail?.codegenTargets ?? ['*'];
    const detectionPrecision = detail?.detectionPrecision ?? 'medium';
    const isPureSpectralDetectable =
      detail?.isPureSpectralDetectable !== undefined
        ? detail.isPureSpectralDetectable
        : true;
    const isStageATerritory =
      detail?.isStageATerritory !== undefined
        ? detail.isStageATerritory
        : true;

    // Enrichment pass (skip Round-3 + Round-4 — both already have 100% verbatim+URL).
    let verbatim: string | undefined = detail?.verbatim;
    let url: string | undefined = detail?.url;
    let resolvedSourceType: ExportedSourceType = sourceType;

    if (round !== 3 && round !== 4) {
      // Phase 1 — meta-file cross-reference (Phase-F F-N patterns)
      const metaEntry = metaFileIndex.get(idCellClean);
      if (metaEntry) {
        if (!verbatim && metaEntry.verbatim) {
          verbatim = metaEntry.verbatim;
          metaFileMatches++;
        }
        if (!url && metaEntry.url) url = metaEntry.url;
        if (metaEntry.citation && citation === 'apiq-original') {
          citation = metaEntry.citation;
        }
      }

      // Phase 2 — description-marker scan (Round-1 + Round-2)
      // For patterns where citation still says "apiq-original" or carries embedded
      // source-markers, scan description + citation-string for RFC/OWASP/OAS markers.
      if (!url) {
        const derivedUrl = deriveUrlFromCitation(citation);
        if (derivedUrl) {
          url = derivedUrl;
          urlAutoDerived++;
        }
      }
      if (!verbatim) {
        const v = extractVerbatim(citation) ?? extractVerbatim(description);
        if (v) {
          verbatim = v;
          verbatimAutoExtracted++;
        }
      }

      // Phase 3 — re-scan description for embedded RFC/OAS/OWASP markers when
      // citation is still 'apiq-original' or non-informative
      if (
        citation === 'apiq-original' ||
        /^(verify|already|sharper|covered|see|cousin|extends|niche)/i.test(citation)
      ) {
        const scanned = scanNotesForSourceMarkers(description);
        if (scanned.citation) {
          citation = scanned.citation;
          if (scanned.url && !url) url = scanned.url;
          if (scanned.sourceType) resolvedSourceType = scanned.sourceType;
          descriptionMarkerMatches++;
        }
      }

      // Phase 4 — last-resort URL: scan description for any RFC/spec markers
      // when URL is still unresolved. This catches "RFC 8259" embedded in a
      // description-string of an otherwise apiq-original pattern.
      if (!url) {
        const fallbackScan = scanNotesForSourceMarkers(description);
        if (fallbackScan.url) {
          url = fallbackScan.url;
          urlAutoDerived++;
        }
      }
    }

    const pattern: ExportedPattern = {
      patternId: idCellClean,
      lens,
      source: {
        type: resolvedSourceType,
        citation,
        ...(verbatim ? { verbatim } : {}),
        ...(url ? { url } : {}),
      },
      severityHypothesis: severity,
      ...(direction ? { direction } : {}),
      codegenTargets,
      description: truncDesc,
      detectionPrecision,
      isPureSpectralDetectable,
      isStageATerritory,
      round,
    };
    patterns.push(pattern);
    seen.add(idCellClean);
  }

  // Suppress unused-warning on inMiningErgRound1 — preserved for future use
  void inMiningErgRound1;

  // ===== Stats =====
  const perRound: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const perLens: Record<Lens, number> = {
    'threat-modeling': 0,
    'standards-compliance': 0,
    'evolution-friction': 0,
    'client-friction': 0,
    'style-coherence': 0,
    'privacy-data-class': 0,
    operations: 0,
    'internal-consistency': 0,
    'ai-agent-consumability': 0,
    'operational-metadata': 0,
  };
  const perSeverity: Record<Severity, number> = {
    error: 0,
    warn: 0,
    hint: 0,
    info: 0,
  };
  const perSourceType: Record<string, number> = {};
  let withVerbatim = 0;
  let withUrl = 0;
  let withCitation = 0;
  for (const p of patterns) {
    perRound[p.round]++;
    for (const l of p.lens) perLens[l]++;
    perSeverity[p.severityHypothesis]++;
    perSourceType[p.source.type] = (perSourceType[p.source.type] ?? 0) + 1;
    if (p.source.verbatim) withVerbatim++;
    if (p.source.url) withUrl++;
    if (p.source.citation && p.source.citation !== 'apiq-original') withCitation++;
  }

  const stats: ParseStats = {
    totalPatterns: patterns.length,
    perRound,
    perLens,
    perSeverity,
    perSourceType,
    patternsWithVerbatim: withVerbatim,
    patternsWithUrl: withUrl,
    patternsWithCitation: withCitation,
    unparseable,
    enrichmentSources: {
      metaFileMatches,
      descriptionMarkerMatches,
      notesColumnMatches,
      urlAutoDerived,
      verbatimAutoExtracted,
    },
  };

  return { patterns, stats };
}

// =============================================================================
// 7. Round-1 category → lens mapping
// =============================================================================

const ROUND1_CATEGORY_TO_LENS: Record<string, Lens> = {
  A: 'standards-compliance', // Strukturelle Validität & OAS-Konformität
  B: 'standards-compliance', // HTTP-Method-Semantik
  C: 'standards-compliance', // Status-Code-Coverage
  D: 'internal-consistency', // Response-Body-Konsistenz
  E: 'client-friction', // Pagination
  F: 'threat-modeling', // Authentication & Security
  G: 'style-coherence', // Naming-Konsistenz
  H: 'evolution-friction', // Versioning
  I: 'standards-compliance', // Date/Time
  J: 'standards-compliance', // ID-Conventions
  K: 'standards-compliance', // Error-Response (RFC 7807)
  L: 'standards-compliance', // Request-Body
  M: 'internal-consistency', // Schema-Hygiene
  N: 'client-friction', // Examples
  O: 'internal-consistency', // Components
  P: 'operations', // Servers/URLs
  Q: 'style-coherence', // Tag-Hygiene
  R: 'client-friction', // Operation-Hygiene
  S: 'style-coherence', // Path-Conventions
  T: 'standards-compliance', // Parameter-Hygiene
  U: 'standards-compliance', // Webhooks
  V: 'operational-metadata', // externalDocs
  W: 'internal-consistency', // Cross-Cutting Statistical
  X: 'standards-compliance', // OAS 3.0 vs 3.1
  Y: 'threat-modeling', // Security-Hardening
  Z: 'style-coherence', // Markdown / Description-Hygiene
};

function mapRound1CategoryToLens(cat: string): Lens {
  return ROUND1_CATEGORY_TO_LENS[cat] ?? 'standards-compliance';
}

// =============================================================================
// 8. Output writer
// =============================================================================

export function writePatternsJson(
  outputPath: string,
  patterns: ExportedPattern[],
): void {
  fs.writeFileSync(outputPath, JSON.stringify(patterns, null, 2) + '\n', 'utf8');
}

// =============================================================================
// 9. CLI entry
// =============================================================================

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (isCliEntrypoint()) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // eval/ is at scripts/spike/eval — repo-root is 3 levels up.
  const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
  const masterPath = path.join(
    REPO_ROOT,
    'specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md',
  );
  const outputPath = path.join(REPO_ROOT, 'scripts/spike/data/patterns.json');

  const { patterns, stats } = parsePatternsFromMaster(masterPath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  writePatternsJson(outputPath, patterns);

  console.log(`Wrote ${patterns.length} patterns to ${outputPath}`);
  console.log(`Per round:`, stats.perRound);
  console.log(`Per lens:`, stats.perLens);
  console.log(`Per severity:`, stats.perSeverity);
  console.log(`Per source-type:`, stats.perSourceType);
  const pct = (n: number) =>
    `${((n / stats.totalPatterns) * 100).toFixed(1)}%`;
  console.log(
    `Patterns with verbatim quote: ${stats.patternsWithVerbatim} / ${stats.totalPatterns} (${pct(stats.patternsWithVerbatim)})`,
  );
  console.log(
    `Patterns with URL: ${stats.patternsWithUrl} / ${stats.totalPatterns} (${pct(stats.patternsWithUrl)})`,
  );
  console.log(
    `Patterns with citation (non-apiq-original): ${stats.patternsWithCitation} / ${stats.totalPatterns} (${pct(stats.patternsWithCitation)})`,
  );
  console.log(`Enrichment-sources:`, stats.enrichmentSources);
  console.log(`Unparseable severity (defaulted to hint): ${stats.unparseable.length}`);
  if (stats.unparseable.length > 0 && stats.unparseable.length <= 10) {
    console.log(`  e.g. ${stats.unparseable.slice(0, 10).join(', ')}`);
  }
}
