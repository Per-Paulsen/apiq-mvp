/**
 * One-shot migration: Stripe FULL reference target markdown → structured JSON.
 *
 * Reads:  openapi-examples/stripe-full/reference/findings-target-big.md
 * Writes: openapi-examples/stripe-full/reference/findings.json
 *
 * The markdown stays in place as a human-readable companion. The JSON becomes
 * the source-of-truth for the eval-pipeline going forward.
 *
 * Classification tags (isLintFlavoured / isKnowledgeBackedGap /
 * isDeterministicallyDetectable) are seeded with my best-guess per finding;
 * user reviews after migration. See classification rationale per F# below.
 *
 * Usage: npx tsx scripts/spike/eval/migrate-md-to-json.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ReferenceTargetSchema,
  type ReferenceTarget,
  type FindingClassification,
} from './types.js';
import type { Finding, AffectedEndpoint, PatchOp } from '../schema.js';

// =============================================================================
// Markdown parser — extends scripts/spike/score-coverage.ts parseReferenceTarget
// to also extract narration / rationale / patchOps / patchSummary bodies.
// =============================================================================

interface ParsedFinding {
  id: string;
  index: number;
  title: string;
  category: 'clarity' | 'design' | 'risk';
  severity: 'critical' | 'high' | 'medium' | 'low';
  scope: 'spec' | 'endpoint';
  affectedEndpoints: AffectedEndpoint[];
  patchSummary: string;
  narration: string;
  rationale: string;
  patchOps: PatchOp[];
}

const HEADER_RE = /^##\s+Finding\s+(\d+)\s+[—-]\s+(.+?)\s*$/;
const SECTION_RE = /^###\s+(narration|rationale|patchOps)/i;
const BULLET_FIELD_RE = /^-\s+\*\*(category|severity|scope|affectedEndpoints|patchSummary):\*\*\s*(.*?)\s*$/i;
const SEPARATOR_RE = /^---\s*$/;

function parseAffectedEndpoints(value: string): AffectedEndpoint[] {
  const cleaned = value.replace(/^\[|\]$/g, '').trim();
  if (!cleaned || /^\(?(none|n\/a|empty)\)?$/i.test(cleaned)) return [];
  const parts = cleaned.split(/[,;]\s*/).map((p) => p.trim()).filter(Boolean);
  const result: AffectedEndpoint[] = [];
  for (const part of parts) {
    let m = part.match(/^([A-Za-z]+)\s+(\/.+)$/);
    if (m) result.push({ method: m[1].toLowerCase(), path: m[2] });
  }
  return result;
}

function parseMarkdownReference(md: string): ParsedFinding[] {
  const lines = md.split(/\r?\n/);
  const out: ParsedFinding[] = [];
  let cur: Partial<ParsedFinding> | null = null;
  let section: 'narration' | 'rationale' | 'patchOps' | null = null;
  let buf: string[] = [];
  let inFence = false;
  let fenceBuf: string[] = [];

  const flushBuf = () => {
    if (!cur || !section) return;
    const text = buf.join('\n').trim();
    if (section === 'narration') cur.narration = text;
    else if (section === 'rationale') cur.rationale = text;
    else if (section === 'patchOps') {
      // The patch JSON is inside ```json ... ``` fences; if no fence captured
      // (some findings explicitly emit `[]`), we already handled it via fenceBuf.
      // If fenceBuf still empty and buf contains "[]", parse that.
      if (cur.patchOps === undefined) {
        const fenceJson = fenceBuf.join('\n').trim();
        const fallback = text.match(/(\[[\s\S]*\])/);
        const raw = fenceJson || (fallback ? fallback[1] : '[]');
        try {
          const parsed = JSON.parse(raw);
          cur.patchOps = Array.isArray(parsed) ? parsed : [];
        } catch {
          cur.patchOps = [];
        }
      }
    }
    buf = [];
    fenceBuf = [];
  };

  const commit = () => {
    flushBuf();
    if (
      cur &&
      cur.id &&
      typeof cur.index === 'number' &&
      cur.title &&
      cur.category &&
      cur.severity &&
      cur.scope &&
      cur.patchSummary !== undefined &&
      cur.narration !== undefined &&
      cur.rationale !== undefined
    ) {
      out.push({
        id: cur.id,
        index: cur.index,
        title: cur.title,
        category: cur.category,
        severity: cur.severity,
        scope: cur.scope,
        affectedEndpoints: cur.affectedEndpoints ?? [],
        patchSummary: cur.patchSummary,
        narration: cur.narration,
        rationale: cur.rationale,
        patchOps: cur.patchOps ?? [],
      });
    }
    cur = null;
    section = null;
    buf = [];
    fenceBuf = [];
    inFence = false;
  };

  for (const raw of lines) {
    const headerMatch = raw.match(HEADER_RE);
    if (headerMatch) {
      commit();
      const idx = parseInt(headerMatch[1], 10);
      cur = {
        id: `F${idx}`,
        index: idx,
        title: headerMatch[2].trim(),
        affectedEndpoints: [],
      };
      continue;
    }
    if (!cur) continue;

    if (SEPARATOR_RE.test(raw)) {
      commit();
      continue;
    }

    // Bullet-field lines (only outside section bodies).
    if (section === null) {
      const fieldMatch = raw.match(BULLET_FIELD_RE);
      if (fieldMatch) {
        const key = fieldMatch[1].toLowerCase();
        const value = fieldMatch[2].trim();
        if (key === 'category' && /^(clarity|design|risk)$/i.test(value)) {
          cur.category = value.toLowerCase() as ParsedFinding['category'];
        } else if (key === 'severity' && /^(critical|high|medium|low)$/i.test(value)) {
          cur.severity = value.toLowerCase() as ParsedFinding['severity'];
        } else if (key === 'scope' && /^(spec|endpoint)$/i.test(value)) {
          cur.scope = value.toLowerCase() as ParsedFinding['scope'];
        } else if (key === 'affectedendpoints') {
          cur.affectedEndpoints = parseAffectedEndpoints(value);
        } else if (key === 'patchsummary') {
          cur.patchSummary = value.replace(/^`|`$/g, '').trim();
        }
        continue;
      }
    }

    // Section markers.
    const sectionMatch = raw.match(SECTION_RE);
    if (sectionMatch) {
      flushBuf();
      const newSection = sectionMatch[1].toLowerCase() as 'narration' | 'rationale' | 'patchops';
      section = newSection === 'patchops' ? 'patchOps' : (newSection as 'narration' | 'rationale');
      continue;
    }

    // Code-fence handling for patchOps body.
    if (section === 'patchOps') {
      if (/^```/.test(raw)) {
        if (inFence) {
          // close fence — parse JSON
          inFence = false;
          const json = fenceBuf.join('\n').trim();
          try {
            const parsed = JSON.parse(json);
            if (cur && Array.isArray(parsed)) cur.patchOps = parsed as PatchOp[];
          } catch {
            // leave to flushBuf fallback
          }
        } else {
          inFence = true;
          fenceBuf = [];
        }
        continue;
      }
      if (inFence) {
        fenceBuf.push(raw);
        continue;
      }
    }

    // Body accumulation.
    if (section) buf.push(raw);
  }
  commit();
  return out;
}

// =============================================================================
// Classification map — best-guess for each F1..F29 of Stripe FULL.
// User reviews after migration. Keys: F-id, value: classification tags.
// =============================================================================

const STRIPE_CLASSIFICATIONS: Record<string, FindingClassification> = {
  // Surface design issues — Spectral-class
  F1: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
        narrationKeywords: ['trailing slash', 'server url', 'url normalization', 'OpenAPI 3.0 §4.7.5'],
        expectedClusterKey: null },
  F2: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
        narrationKeywords: ['tags', 'untagged', 'operation grouping', 'navigation'],
        expectedClusterKey: null },
  F3: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
        narrationKeywords: ['HTML markup', 'CommonMark', 'description', 'markdown'],
        expectedClusterKey: null },
  F4: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
        narrationKeywords: ['bearerFormat', 'JWT', 'auth header'],
        expectedClusterKey: null },
  F5: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
        narrationKeywords: ['required', 'api_errors.message', 'error envelope'],
        expectedClusterKey: null },

  // Default-response missing — knowledge of HTTP status semantics
  F6: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
        narrationKeywords: ['default response', '4xx', '5xx', 'status codes', 'no per-status differentiation'],
        expectedClusterKey: 'missing-error-response' },

  // The headline knowledge-backed-gap class
  F7: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
        narrationKeywords: ['Idempotency-Key', 'idempotency', 'POST', 'retry-safe', 'Stripe docs'],
        expectedClusterKey: null },
  F8: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
        narrationKeywords: ['x-www-form-urlencoded', 'JSON content-type', 'application/json'],
        expectedClusterKey: null },
  F9: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
        narrationKeywords: ['x-stripeBypassValidation', 'vendor extension', 'enum', 'non-authoritative'],
        expectedClusterKey: null },

  // OpenAPI semantic-correctness violation (deepObject + array)
  F10: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
         narrationKeywords: ['deepObject', 'expand', 'array', 'OAS 3.0 §4.7.10.1', 'style'],
         expectedClusterKey: null },

  F11: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['unix-time', 'format', 'epoch', 'integer'],
         expectedClusterKey: null },

  // Operational headers — Stripe-specific knowledge
  F12: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: false,
         narrationKeywords: ['Stripe-Account', 'Stripe-Version', 'multi-tenant', 'version pinning'],
         expectedClusterKey: null },

  F13: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['deprecated', 'prose-only deprecation'],
         expectedClusterKey: null },
  F14: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['missing description', 'operation description'],
         expectedClusterKey: 'missing-description' },
  F15: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['missing summary'],
         expectedClusterKey: 'missing-summary' },

  F16: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
         narrationKeywords: ['pagination', 'page-based', 'cursor-based', 'consistency'],
         expectedClusterKey: null },
  F17: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: false,
         narrationKeywords: ['api_errors.code', 'enum', 'free-form string', 'typed error'],
         expectedClusterKey: null },
  F18: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: false,
         narrationKeywords: ['error payload', 'nested PaymentIntent', 'leak schemas'],
         expectedClusterKey: null },
  F19: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['deprecation', 'inconsistent', 'cards', 'bank_accounts'],
         expectedClusterKey: null },
  F20: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: false,
         narrationKeywords: ['wrong summary', 'create a card', 'bank_accounts'],
         expectedClusterKey: null },

  // The differentiator F-class
  F21: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: false,
         narrationKeywords: ['parameter-relationship', 'mutually exclusive', 'conditional required', 'oneOf', 'prose only'],
         expectedClusterKey: null },
  F22: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: false,
         narrationKeywords: ['customer', 'customer_account', 'ambiguous', 'billing_portal/sessions'],
         expectedClusterKey: null },
  F23: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
         narrationKeywords: ['cross-resource reference', 'plain string', 'foreign key', 'no $ref'],
         expectedClusterKey: null },

  F24: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['maxLength', '5000', 'default everywhere', 'string properties'],
         expectedClusterKey: null },
  F25: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['range constraints', 'minimum', 'maximum', 'integer', 'number'],
         expectedClusterKey: 'limit-no-range' },
  F26: { isLintFlavoured: true, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['operationId', 'verbose', 'machine-generated'],
         expectedClusterKey: null },
  F27: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['requestBody examples', 'no examples', 'codegen'],
         expectedClusterKey: null },

  // Operational headers — RFC + industry knowledge
  F28: { isLintFlavoured: false, isKnowledgeBackedGap: true, isDeterministicallyDetectable: true,
         narrationKeywords: ['rate-limit', 'X-RateLimit-Remaining', 'Retry-After', 'response headers'],
         expectedClusterKey: null },
  F29: { isLintFlavoured: false, isKnowledgeBackedGap: false, isDeterministicallyDetectable: true,
         narrationKeywords: ['empty description', 'component schemas', '79%'],
         expectedClusterKey: 'empty-schema-description' },
};

// =============================================================================
// Top-level metadata — pulled from md header.
// =============================================================================

const STRIPE_METADATA = {
  spec: 'stripe-full',
  specSource: 'openapi-examples/stripe-full/spec.json',
  specCommit: '011d8e301d28a95e1b8898229954d79da3e0fa43',
  specVersion: '2026-04-22.dahlia',
  endpointCount: 587,
  pathCount: 414,
  openapiVersion: '3.0.0',
  componentSchemaCount: 1385,
  estimatedInputTokens: 926000,
  authoringDate: '2026-05-04',
  author: 'Claude Code (LLM-authored, user-hardened)',
  humanHardenedDate: null,
  humanHardenedBy: null,
  notes: [
    'Reference target for the apiq Big-Spec Architecture Spike (Epic 09).',
    '29 findings. Initial draft: 20. F21–F22 added during user-prompted senior-engineer hardening; F23 added after user-prompted generalisation surfaced the spec-knowledge-asymmetry pattern as a systemic finding-class. F24–F29 added 2026-05-04 (post-Stage-3 reference completeness pass) after Gemini-2.5-Pro Stripe FULL run surfaced 6 strong, spec-grounded findings missed in initial drafting. F21 scope corrected from endpoint to spec; F22 severity corrected from high to medium; both 2026-05-04 after user fact-check against Stripe documentation AI-agent.',
    'Distribution (Stage 3): 0 critical · 9 high · 14 medium · 6 low. 16 clarity / 12 design / 1 risk. 22 spec-scope · 7 endpoint-scope.',
    'Critical-Review 2026-05-05 (Iteration 2): reference-target is LLM-authored — coverage-score against this reference is self-validation-bias. humanHardenedDate / humanHardenedBy fields here are the field to set when domain-expert review completes.',
    'Authoring discipline: every finding is hard-grounded in spec text at openapi-examples/stripe-full/spec.json (commit 011d8e30..., version 2026-04-22.dahlia). When in doubt, the path → JSON-pointer reference is included.',
    'No critical findings: Stripe is one of the most polished public OpenAPI specs in the wild. The v0.1 spike\'s calibration anchor "On large polished specs, critical findings are RARE" applies. Severity inflation on Stripe FULL would itself be a finding-quality bug.',
  ].join('\n\n'),
};

// =============================================================================
// Run migration.
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const MD_PATH = path.join(REPO_ROOT, 'openapi-examples', 'stripe-full', 'reference', 'findings-target-big.md');
const JSON_PATH = path.join(REPO_ROOT, 'openapi-examples', 'stripe-full', 'reference', 'findings.json');

function main() {
  console.log(`Reading ${MD_PATH}`);
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const parsed = parseMarkdownReference(md);
  console.log(`Parsed ${parsed.length} findings from markdown`);

  if (parsed.length !== 29) {
    console.error(`Expected 29 findings, got ${parsed.length}`);
    process.exit(1);
  }

  const enriched = parsed.map((p) => {
    const classification = STRIPE_CLASSIFICATIONS[p.id];
    if (!classification) {
      throw new Error(`No classification for ${p.id}`);
    }
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      severity: p.severity,
      scope: p.scope,
      affectedEndpoints: p.affectedEndpoints,
      patchSummary: p.patchSummary,
      narration: p.narration,
      rationale: p.rationale,
      patchOps: p.patchOps,
      classification,
      selfReviewNotes: null,
    };
  });

  const target = {
    ...STRIPE_METADATA,
    findings: enriched,
  };

  // Validate against schema before writing.
  const validated = ReferenceTargetSchema.parse(target);

  fs.writeFileSync(JSON_PATH, JSON.stringify(validated, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${JSON_PATH} (${validated.findings.length} findings)`);

  // Summary stats.
  const lintCount = validated.findings.filter((f) => f.classification.isLintFlavoured).length;
  const knowledgeCount = validated.findings.filter((f) => f.classification.isKnowledgeBackedGap).length;
  const detCount = validated.findings.filter((f) => f.classification.isDeterministicallyDetectable).length;
  const clusterKeys = new Set(
    validated.findings.map((f) => f.classification.expectedClusterKey).filter((k): k is string => !!k)
  );

  console.log(`\nClassification summary:`);
  console.log(`  isLintFlavoured:               ${lintCount}/29`);
  console.log(`  isKnowledgeBackedGap:          ${knowledgeCount}/29  ← differentiator class`);
  console.log(`  isDeterministicallyDetectable: ${detCount}/29  ← Stage 4 Deterministic Layer scope`);
  console.log(`  expectedClusterKey set:        ${clusterKeys.size} unique cluster keys`);
  console.log(`  Substantive (non-lint):        ${29 - lintCount}/29`);
}

main();
