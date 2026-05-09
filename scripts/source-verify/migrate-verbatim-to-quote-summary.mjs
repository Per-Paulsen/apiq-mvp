#!/usr/bin/env node
/**
 * Welle-D Verbatim-Schema-Migration — single-shot script (Welle D Phase-3 #10).
 *
 * Migrates every `verbatim:` field in the 11 apiq-ruleset-*.yaml files to
 * either `quote:` (T25-verifiable) or `summary:` (mining-paraphrase, not
 * verified). Heuristic-driven; conservative-default = `summary` when in doubt.
 *
 *   --dry-run   prints planned migrations, makes no changes (default)
 *   --apply     writes migrations to disk
 *   --verbose   logs each individual decision
 *
 * Heuristic for QUOTE (verifiable):
 *   - source `type` ∈ { rfc, bcp, iso, iana-registry } AND
 *   - text ≤200 chars AND
 *   - text contains BCP-2119 keyword (MUST, SHOULD, REQUIRED, RECOMMENDED, MAY)
 *     in formal/RFC tone AND
 *   - URL points to an RFC-section / RFC raw-text (heuristic: rfc-editor.org/
 *     www.iana.org/ www.iso.org/ datatracker.ietf.org/)
 *
 * Otherwise: SUMMARY (drops verifiedAt — not relevant when not verifiable).
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RULESETS_DIR = path.resolve(REPO_ROOT, 'scripts', 'spike', 'deterministic');

const YAML_FILES = [
  'apiq-ruleset.yaml',
  'apiq-ruleset-threat-p1.yaml',
  'apiq-ruleset-client-p1.yaml',
  'apiq-ruleset-evolution.yaml',
  'apiq-ruleset-threat-p2.yaml',
  'apiq-ruleset-client-p2.yaml',
  'apiq-ruleset-threat-p3.yaml',
  'apiq-ruleset-client-p3.yaml',
  'apiq-ruleset-evolution-p3.yaml',
  'apiq-ruleset-standards-p3.yaml',
  'apiq-ruleset-other-p3.yaml',
];

const ARGS = new Set(process.argv.slice(2));
const APPLY = ARGS.has('--apply');
const VERBOSE = ARGS.has('--verbose');

const VERIFIABLE_TYPES = new Set(['rfc', 'bcp', 'iso', 'iana-registry']);
const VERIFIABLE_URL_HOSTS = [
  'rfc-editor.org',
  'datatracker.ietf.org',
  'www.iana.org',
  'www.iso.org',
  'www.w3.org',
  'tools.ietf.org',
];

const BCP_2119_KEYWORDS = /\b(MUST(?:\s+NOT)?|SHALL(?:\s+NOT)?|SHOULD(?:\s+NOT)?|REQUIRED|RECOMMENDED|NOT\s+RECOMMENDED|MAY|OPTIONAL)\b/;

/**
 * Decide whether a verbatim entry should migrate to `quote` or `summary`.
 *
 * @param {object} ctx
 * @param {string} ctx.text — verbatim string content
 * @param {string|null} ctx.type — source.type if detectable on same line
 * @param {string|null} ctx.url — source.url if detectable on same line
 * @returns {'quote'|'summary'}
 */
function classify({ text, type, url: src_url }) {
  if (!text) return 'summary';
  // Length-cap: anything >200 chars is definitely not a verifiable RFC quote.
  if (text.length > 200) return 'summary';
  // mining + vendor types are paraphrases by definition.
  if (type === 'mining' || type === 'vendor') return 'summary';
  // Without a verifiable type AND verifiable URL, default to summary.
  const typeIsVerifiable = type && VERIFIABLE_TYPES.has(type);
  const urlIsVerifiable =
    src_url && VERIFIABLE_URL_HOSTS.some((h) => src_url.includes(h));
  if (!typeIsVerifiable && !urlIsVerifiable) return 'summary';
  // RFC tone: must contain BCP-2119 keyword to qualify.
  if (!BCP_2119_KEYWORDS.test(text)) return 'summary';
  // Conservative: if no URL at all, can't verify → summary.
  if (!src_url) return 'summary';
  return 'quote';
}

/**
 * Parse an inline-flow-style YAML object literal (e.g. `{ type: rfc, ... }`)
 * into a tiny key-value map. Limitation: doesn't recurse into nested objects/
 * arrays (none used in our sources entries). Sufficient for our heuristics.
 *
 * @param {string} body — inside the curlies, e.g. ` type: rfc, verbatim: '...' `
 * @returns {Record<string,string>}
 */
function parseInlineFlow(body) {
  const out = {};
  // Tokenise on commas that are NOT inside quoted strings.
  const tokens = [];
  let cur = '';
  let inQuote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) {
        // YAML uses doubled quotes ('') for escaping in single-quoted scalars.
        if (body[i + 1] === inQuote) {
          cur += ch + ch;
          i++;
          continue;
        }
        inQuote = null;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === ',') {
      tokens.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) tokens.push(cur);
  for (const tok of tokens) {
    const m = tok.match(/^\s*([a-zA-Z_][\w-]*)\s*:\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    // Strip outermost matching quotes for value-extraction.
    if (
      (v.startsWith("'") && v.endsWith("'")) ||
      (v.startsWith('"') && v.endsWith('"'))
    ) {
      v = v.slice(1, -1).replace(/''/g, "'");
    }
    out[m[1]] = v;
  }
  return out;
}

/**
 * Migrate a single yaml file's text, returning new text + per-entry decisions.
 *
 * Strategy per yaml-line:
 *   - INLINE-FLOW form: `        - { type: rfc, verbatim: '...', verifiedAt: '...' }`
 *     → rewrite the `verbatim:` token in-place to `quote:` or `summary:`,
 *       drop `verifiedAt:` if migrating to `summary`.
 *   - BLOCK form (rare):
 *       `        - type: rfc`
 *       `          verbatim: '...'`
 *     → look up nearest preceding `type:` + `url:` siblings to classify, then
 *       rename the `verbatim:` key.
 *
 * Both forms preserve indentation, comments, surrounding lines.
 */
function migrateYaml(yamlText, fileName) {
  const lines = yamlText.split('\n');
  const decisions = [];
  let summaryDroppedVerifiedAt = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Inline-flow form: a single line containing both verbatim: and the curly
    // object braces. Match: optional indent, `-`, `{`, body, `}`.
    const inlineMatch = line.match(/^(\s*-\s*)\{\s*(.*?)\s*\}\s*$/);
    if (inlineMatch && /\bverbatim:/.test(line)) {
      const indent = inlineMatch[1];
      const body = inlineMatch[2];
      const fields = parseInlineFlow(body);
      const verbatimText = fields.verbatim;
      if (typeof verbatimText !== 'string') {
        // Defensive — shouldn't happen given the regex test above.
        continue;
      }
      const decision = classify({
        text: verbatimText,
        type: fields.type ?? null,
        url: fields.url ?? null,
      });
      // Rewrite the body: rename `verbatim:` token; if summary, also drop
      // `verifiedAt:` if present (no longer meaningful).
      let newBody = renameInlineKey(body, 'verbatim', decision);
      if (decision === 'summary' && /\bverifiedAt:/.test(newBody)) {
        newBody = dropInlineKey(newBody, 'verifiedAt');
        summaryDroppedVerifiedAt++;
      }
      const newLine = `${indent}{ ${newBody} }`;
      lines[i] = newLine;
      decisions.push({
        file: fileName,
        line: i + 1,
        type: fields.type ?? '?',
        url: fields.url ?? '?',
        decision,
        text: verbatimText.slice(0, 80),
      });
      continue;
    }

    // Block form: line is just `<indent>verbatim: '...'`. Look BACKWARDS for
    // siblings (same indent or `-` peer) to find type / url.
    const blockMatch = line.match(/^(\s*)verbatim:\s*(.*?)\s*$/);
    if (blockMatch) {
      const indent = blockMatch[1];
      const rawValue = blockMatch[2];
      // Strip outer quotes for classification, but preserve the original line
      // for substitution.
      const text = stripQuotes(rawValue);
      const { type: ctxType, url: ctxUrl } = lookupBlockSiblings(lines, i, indent);
      const decision = classify({
        text,
        type: ctxType,
        url: ctxUrl,
      });
      lines[i] = line.replace(/\bverbatim:/, `${decision}:`);

      if (decision === 'summary') {
        // Walk forward through sibling lines at same indent in this list-item
        // and remove a `verifiedAt:` line if present.
        for (let j = i + 1; j < lines.length; j++) {
          const peer = lines[j];
          const peerMatch = peer.match(/^(\s*)([a-zA-Z_][\w-]*):/);
          if (!peerMatch) continue;
          if (peerMatch[1].length < indent.length) break; // out of this object
          if (peerMatch[1].length > indent.length) continue;
          if (peerMatch[2] === 'verifiedAt') {
            lines.splice(j, 1);
            summaryDroppedVerifiedAt++;
            break;
          }
          if (peerMatch[2] === 'type' || peerMatch[2] === 'url') {
            // Still scanning peers in this object — keep going.
            continue;
          }
        }
      }

      decisions.push({
        file: fileName,
        line: i + 1,
        type: ctxType ?? '?',
        url: ctxUrl ?? '?',
        decision,
        text: text.slice(0, 80),
      });
    }
  }

  return { newText: lines.join('\n'), decisions, summaryDroppedVerifiedAt };
}

/**
 * Rename a key in an inline-flow body. Preserves quote-style + value.
 */
function renameInlineKey(body, oldKey, newKey) {
  // Tokenise like parseInlineFlow but preserve original token-text.
  const out = [];
  let cur = '';
  let inQuote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) {
        if (body[i + 1] === inQuote) {
          cur += ch + ch;
          i++;
          continue;
        }
        inQuote = null;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  const re = new RegExp(`^(\\s*)${oldKey}(\\s*:)`);
  const replaced = out.map((tok) => tok.replace(re, `$1${newKey}$2`));
  return replaced.join(',').replace(/^\s*,/, '').trim();
}

/**
 * Drop a key from an inline-flow body.
 */
function dropInlineKey(body, key) {
  const out = [];
  let cur = '';
  let inQuote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuote) {
      if (ch === inQuote) {
        if (body[i + 1] === inQuote) {
          cur += ch + ch;
          i++;
          continue;
        }
        inQuote = null;
      }
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = ch;
      cur += ch;
      continue;
    }
    if (ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  const re = new RegExp(`^\\s*${key}\\s*:`);
  const filtered = out.filter((tok) => !re.test(tok));
  return filtered.join(',').replace(/^\s*,/, '').trim();
}

function stripQuotes(s) {
  const t = s.trim();
  if (
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('"') && t.endsWith('"'))
  ) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

/**
 * For block-form: walk backward / forward through sibling lines at the same
 * indent (within the same list-item) and grab `type:` / `url:` values.
 */
function lookupBlockSiblings(lines, idx, indent) {
  let type = null;
  let urlVal = null;
  // Walk backward — siblings precede `verbatim:` (or follow, in fewer cases).
  for (let j = idx - 1; j >= 0; j--) {
    const line = lines[j];
    const m = line.match(/^(\s*)(?:-\s*)?([a-zA-Z_][\w-]*):\s*(.*?)\s*$/);
    if (!m) {
      // Blank line / comment — keep walking.
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
      break;
    }
    // List-item start `-` at lesser indent? we've left this entry.
    const isListItem = /^\s*-/.test(line);
    if (m[1].length < indent.length && !isListItem) break;
    if (m[1].length === indent.length || (isListItem && m[1].length + 2 === indent.length)) {
      const k = m[2];
      const v = stripQuotes(m[3]);
      if (k === 'type' && !type) type = v;
      if (k === 'url' && !urlVal) urlVal = v;
    }
    if (isListItem && m[1].length + 2 === indent.length) {
      // Reached the start of this list-item — stop.
      break;
    }
  }
  // Walk forward — pick up siblings AFTER verbatim: line.
  for (let j = idx + 1; j < lines.length; j++) {
    const line = lines[j];
    const m = line.match(/^(\s*)([a-zA-Z_][\w-]*):\s*(.*?)\s*$/);
    if (!m) {
      if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
      break;
    }
    if (m[1].length !== indent.length) {
      if (m[1].length < indent.length) break;
      continue;
    }
    const k = m[2];
    const v = stripQuotes(m[3]);
    if (k === 'type' && !type) type = v;
    if (k === 'url' && !urlVal) urlVal = v;
  }
  return { type, url: urlVal };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const summary = {};
  let totalQuote = 0;
  let totalSummary = 0;
  let totalDroppedVerifiedAt = 0;
  let filesChanged = 0;

  for (const yamlFile of YAML_FILES) {
    const filePath = path.join(RULESETS_DIR, yamlFile);
    if (!fs.existsSync(filePath)) {
      console.warn(`SKIP missing file: ${filePath}`);
      continue;
    }
    const before = fs.readFileSync(filePath, 'utf8');
    const { newText, decisions, summaryDroppedVerifiedAt } = migrateYaml(before, yamlFile);

    const quoteCount = decisions.filter((d) => d.decision === 'quote').length;
    const summaryCount = decisions.filter((d) => d.decision === 'summary').length;

    summary[yamlFile] = {
      total: decisions.length,
      quote: quoteCount,
      summary: summaryCount,
      droppedVerifiedAt: summaryDroppedVerifiedAt,
    };
    totalQuote += quoteCount;
    totalSummary += summaryCount;
    totalDroppedVerifiedAt += summaryDroppedVerifiedAt;

    if (VERBOSE) {
      for (const d of decisions) {
        console.log(
          `  [${d.file}:${d.line}] ${d.decision.toUpperCase()} (type=${d.type}) "${d.text}"`
        );
      }
    }

    if (newText !== before) {
      filesChanged++;
      if (APPLY) {
        fs.writeFileSync(filePath, newText, 'utf8');
      }
    }
  }

  console.log('\n=== Verbatim → quote/summary migration ===');
  console.log(`Mode: ${APPLY ? 'APPLY (writes to disk)' : 'DRY-RUN (no writes)'}\n`);
  console.log('Per-yaml decisions:');
  for (const [f, s] of Object.entries(summary)) {
    console.log(
      `  ${f}: total=${s.total} quote=${s.quote} summary=${s.summary} droppedVerifiedAt=${s.droppedVerifiedAt}`
    );
  }
  console.log(
    `\nTotals: quote=${totalQuote} summary=${totalSummary} (droppedVerifiedAt=${totalDroppedVerifiedAt}, filesChanged=${filesChanged})`
  );
  if (!APPLY) {
    console.log('\nRun with --apply to write the migrations to disk.');
  }
}

main();
