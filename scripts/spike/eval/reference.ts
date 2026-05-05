/**
 * Reference-target loader. Supports both JSON (source-of-truth) and Markdown
 * (legacy companion) formats. Auto-detects by file extension.
 *
 * JSON format: structured per `eval/types.ts` ReferenceTargetSchema. Includes
 * classification tags (isLintFlavoured / isKnowledgeBackedGap /
 * isDeterministicallyDetectable / narrationKeywords / expectedClusterKey) and
 * full body fields (narration / rationale / patchOps).
 *
 * Markdown format: legacy. Only extracts title / category / severity / scope /
 * affectedEndpoints. Used by the original score-coverage.ts. New eval-pipeline
 * components should prefer JSON.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ReferenceTargetSchema,
  type ReferenceTarget,
  type ReferenceFinding,
} from './types.js';
import type { AffectedEndpoint } from '../schema.js';

const HEADER_RE = /^##\s+Finding\s+(\d+)\s+[—-]\s+(.+?)\s*$/;

function parseAffectedEndpoints(value: string): AffectedEndpoint[] {
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

function parseBullet(line: string, key: string): string | null {
  const re = new RegExp(`^-\\s+\\*\\*${key}:\\*\\*\\s*(.*?)\\s*$`, 'i');
  const m = line.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Lightweight markdown parser — extracts only the head-fields for legacy
 * coverage scoring. Body content (narration / rationale / patchOps) and
 * classification tags are NOT available from markdown — set to safe defaults.
 *
 * Use loadReferenceTarget() with a JSON file for full reference data.
 */
function parseMarkdownLegacy(md: string, specName: string): ReferenceTarget {
  const lines = md.split(/\r?\n/);
  const findings: ReferenceFinding[] = [];
  let cur: Partial<ReferenceFinding> | null = null;

  const commit = () => {
    if (cur && cur.id && cur.title && cur.category && cur.severity && cur.scope) {
      findings.push({
        id: cur.id,
        title: cur.title,
        category: cur.category,
        severity: cur.severity,
        scope: cur.scope,
        affectedEndpoints: cur.affectedEndpoints ?? [],
        patchSummary: cur.patchSummary ?? '(legacy markdown — patchSummary not extracted)',
        narration: cur.narration ?? '(legacy markdown — narration not extracted)',
        rationale: cur.rationale ?? '(legacy markdown — rationale not extracted)',
        patchOps: [],
        classification: {
          isLintFlavoured: false,
          isKnowledgeBackedGap: false,
          isPureSpectralDetectable: false,
          isDomainKnowledgeDetectable: false,
          narrationKeywords: [],
          expectedClusterKey: null,
        },
        selfReviewNotes: 'Loaded from legacy markdown format; classification + body fields unavailable',
      });
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    const headerMatch = raw.match(HEADER_RE);
    if (headerMatch) {
      commit();
      const idx = parseInt(headerMatch[1], 10);
      cur = { id: `F${idx}`, title: headerMatch[2].trim(), affectedEndpoints: [] };
      continue;
    }
    if (!cur) continue;

    const cat = parseBullet(line, 'category');
    if (cat && /^(clarity|design|risk|correctness)$/i.test(cat)) {
      cur.category = cat.toLowerCase() as ReferenceFinding['category'];
      continue;
    }
    const sev = parseBullet(line, 'severity');
    if (sev && /^(critical|high|medium|low)$/i.test(sev)) {
      cur.severity = sev.toLowerCase() as ReferenceFinding['severity'];
      continue;
    }
    const scope = parseBullet(line, 'scope');
    if (scope && /^(spec|endpoint)$/i.test(scope)) {
      cur.scope = scope.toLowerCase() as ReferenceFinding['scope'];
      continue;
    }
    const aff = parseBullet(line, 'affectedEndpoints');
    if (aff !== null) {
      cur.affectedEndpoints = parseAffectedEndpoints(aff);
      continue;
    }
    const ps = parseBullet(line, 'patchSummary');
    if (ps !== null) {
      cur.patchSummary = ps.replace(/^`|`$/g, '').trim();
      continue;
    }
  }
  commit();

  return ReferenceTargetSchema.parse({
    spec: specName,
    specSource: '(legacy markdown loader)',
    specCommit: null,
    specVersion: null,
    endpointCount: 0,
    pathCount: null,
    openapiVersion: null,
    componentSchemaCount: null,
    estimatedInputTokens: null,
    authoringDate: '0000-00-00',
    author: '(legacy markdown loader)',
    humanHardenedDate: null,
    humanHardenedBy: null,
    notes: 'Loaded from legacy markdown — full classification + body fields unavailable. Migrate to JSON via scripts/spike/eval/migrate-md-to-json.ts.',
    findings,
  });
}

/**
 * Load a reference target. Auto-detects format by extension:
 *   .json → structured ReferenceTarget per types.ts
 *   .md   → legacy markdown (head-fields only)
 */
export function loadReferenceTarget(filepath: string, specName?: string): ReferenceTarget {
  const ext = path.extname(filepath).toLowerCase();
  const raw = fs.readFileSync(filepath, 'utf8');
  if (ext === '.json') {
    return ReferenceTargetSchema.parse(JSON.parse(raw));
  }
  if (ext === '.md') {
    return parseMarkdownLegacy(raw, specName ?? path.basename(path.dirname(path.dirname(filepath))));
  }
  throw new Error(`Unsupported reference-target extension '${ext}' on ${filepath}`);
}
