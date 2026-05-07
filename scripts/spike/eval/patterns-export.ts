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
} from '../deterministic/severity-schema.js';

// =============================================================================
// 1. Schema (D15)
// =============================================================================

export type ExportedSourceType =
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
  round: 1 | 2 | 3;
}

export interface ParseStats {
  totalPatterns: number;
  perRound: Record<1 | 2 | 3, number>;
  perLens: Record<Lens, number>;
  perSeverity: Record<Severity, number>;
  perSourceType: Record<string, number>;
  patternsWithVerbatim: number;
  patternsWithUrl: number;
  unparseable: string[];
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

    // lens: [threat-modeling, ...] — array of lens-names
    const lensRaw = matchYamlField(body, 'lens');
    if (lensRaw) {
      const arrMatch = lensRaw.match(/\[([^\]]*)\]/);
      if (arrMatch) {
        const names = arrMatch[1]
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter((s) => s.length > 0);
        const resolved = names
          .map((n) => parseLensFromHeader(n))
          .filter((l): l is Lens => l !== null);
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

  const patterns: ExportedPattern[] = [];
  const seen = new Set<string>();
  const unparseable: string[] = [];

  // Section state
  let inRound3Section = false;
  let inRound2MasterSection = false;
  let inMiningErgRound1 = false;
  // Currently active Lens (Round-2 / Round-3 lens-headers set this)
  let activeLens: Lens | null = null;
  // Currently active brainstorm-category (A/B/C/...) — used as lens-fallback
  let activeRound1Category: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Section transitions
    if (/^##\s+Round-3 Additions/i.test(line)) {
      inRound3Section = true;
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
    const round = inRound3Section ? 3 : inRound2MasterSection ? 2 : 1;
    const r3Detail = round === 3 ? round3Detail.get(idCellClean) : undefined;

    // Determine lens
    let lens: Lens[] = [];
    if (r3Detail?.lens && r3Detail.lens.length > 0) {
      lens = r3Detail.lens;
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
    if (r3Detail?.severityHypothesis) {
      severity = r3Detail.severityHypothesis;
    } else {
      // Find a severity column. Heuristics by section:
      //   Round-3 tables: column index 3 (Severity-Hyp)
      //   Round-2 tables: column index 4 (Severity)
      //   Round-1 tables: column index 2 (Severity)
      let sevCellIdx = -1;
      if (round === 3 && cells.length >= 4) sevCellIdx = 3;
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
      r3Detail?.description ?? cleanCell(cells[1] ?? idCellClean) ?? idCellClean;
    const truncDesc =
      description.length > 300 ? description.slice(0, 297) + '...' : description;

    // Source
    const sourceType: ExportedSourceType =
      r3Detail?.sourceType ?? parseSourceTypeFromPatternId(idCellClean);
    let citation = r3Detail?.citation;
    if (!citation) {
      // Heuristic: scan all cells (excluding the ID, severity, and description)
      // for a cell that contains source-markers like [SP-, MIN-, SG-, RFC, etc.
      // We compute which cells are "off-limits" up front.
      const sevColIdx =
        round === 3 && cells.length >= 4
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
      // Round-3 source column is col-1 (the "Source" column).
      // Round-2 source column is col-2 (the "Sources" column).
      // Round-1 mining-tables: col-2 is the "Source" column.
      // Round-1 simple tables (A1-X5): no source col — citation stays apiq-original.
      if (!citation) {
        if (round === 3 && cells[1]) {
          citation = cleanCell(cells[1]);
        } else if (round === 2 && cells.length >= 3) {
          citation = cleanCell(cells[2]);
        } else if (round === 1 && cells.length >= 5 && cells[2]) {
          // Mining-tables: col-2 is Source
          citation = cleanCell(cells[2]);
        }
      }

      if (!citation) citation = 'apiq-original';
    }
    citation = citation || 'apiq-original';
    if (citation.length > 500) citation = citation.slice(0, 500);

    // direction / codegen / detection / spectral / stage-a (round-3 only typically)
    const direction = r3Detail?.direction;
    const codegenTargets = r3Detail?.codegenTargets ?? ['*'];
    const detectionPrecision = r3Detail?.detectionPrecision ?? 'medium';
    const isPureSpectralDetectable =
      r3Detail?.isPureSpectralDetectable !== undefined
        ? r3Detail.isPureSpectralDetectable
        : true;
    const isStageATerritory =
      r3Detail?.isStageATerritory !== undefined
        ? r3Detail.isStageATerritory
        : true;

    const pattern: ExportedPattern = {
      patternId: idCellClean,
      lens,
      source: {
        type: sourceType,
        citation,
        ...(r3Detail?.verbatim ? { verbatim: r3Detail.verbatim } : {}),
        ...(r3Detail?.url ? { url: r3Detail.url } : {}),
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
  const perRound: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
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
  for (const p of patterns) {
    perRound[p.round]++;
    for (const l of p.lens) perLens[l]++;
    perSeverity[p.severityHypothesis]++;
    perSourceType[p.source.type] = (perSourceType[p.source.type] ?? 0) + 1;
    if (p.source.verbatim) withVerbatim++;
    if (p.source.url) withUrl++;
  }

  const stats: ParseStats = {
    totalPatterns: patterns.length,
    perRound,
    perLens,
    perSeverity,
    perSourceType,
    patternsWithVerbatim: withVerbatim,
    patternsWithUrl: withUrl,
    unparseable,
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
  console.log(
    `Patterns with verbatim quote: ${stats.patternsWithVerbatim} / ${stats.totalPatterns}`,
  );
  console.log(`Patterns with URL: ${stats.patternsWithUrl} / ${stats.totalPatterns}`);
  console.log(`Unparseable severity (defaulted to hint): ${stats.unparseable.length}`);
  if (stats.unparseable.length > 0 && stats.unparseable.length <= 10) {
    console.log(`  e.g. ${stats.unparseable.slice(0, 10).join(', ')}`);
  }
}
