/**
 * Batch-verifies curated quotes against cached RFCs (norm-rules same as T25).
 * Usage: npx tsx scripts/source-verify/batch-check.ts <path-to-quotes.json>
 *
 * Each entry of `candidates` is checked. Output: per-entry verified / drift,
 * plus a summary count. Use this before populating the YAMLs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, '.cache.json');

interface Candidate {
  rule: string;
  pattern: string;
  yaml: string;
  sourceIndex: number;
  rfc: number;
  url: string;
  quote: string;
}
interface QuotesFile { candidates: Candidate[] }

const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, { body: string }>;
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

function rfcEditorRawUrl(url: string): string {
  const m = url.match(/^https?:\/\/(?:www\.)?rfc-editor\.org\/rfc\/(rfc\d+)(?:\.[a-z]+)?(?:[#?].*)?$/i);
  if (m) return `https://www.rfc-editor.org/rfc/${m[1].toLowerCase()}.txt`;
  return url;
}

const file = process.argv[2] ?? path.resolve(__dirname, 'curated-quotes.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8')) as QuotesFile;

let ok = 0, fail = 0;
const failures: { c: Candidate; reason: string }[] = [];

for (const c of data.candidates) {
  const rawUrl = rfcEditorRawUrl(c.url);
  const body = cache[rawUrl]?.body;
  if (!body) {
    fail++;
    failures.push({ c, reason: `cache-miss for ${rawUrl}` });
    continue;
  }
  const found = norm(body).includes(norm(c.quote));
  if (found) {
    ok++;
    console.log(`OK   ${c.pattern} :: ${c.rule.slice(0, 60)}...`);
  } else {
    fail++;
    failures.push({ c, reason: 'quote-not-in-body' });
    console.log(`FAIL ${c.pattern} :: ${c.rule}`);
    console.log(`     quote: "${c.quote.slice(0, 100)}${c.quote.length > 100 ? '...' : ''}"`);
  }
}

console.log(`\nSummary: ok=${ok} fail=${fail} total=${data.candidates.length}`);
if (failures.length > 0) process.exit(1);
