/**
 * Helper: Read RFC from T25 cache + check if a candidate-quote is verbatim-substring.
 * Usage: npx tsx scripts/source-verify/check-quote.ts <rfc-number> "<quote>"
 *        npx tsx scripts/source-verify/check-quote.ts grep <rfc-number> "<regex>"
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, '.cache.json');

const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
const norm = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

const args = process.argv.slice(2);

if (args[0] === 'grep') {
  const rfc = args[1];
  const pattern = new RegExp(args.slice(2).join(' '), 'gi');
  const url = `https://www.rfc-editor.org/rfc/rfc${rfc}.txt`;
  const body = cache[url]?.body;
  if (!body) { console.error(`RFC ${rfc} not in cache`); process.exit(1); }
  let m: RegExpExecArray | null;
  let count = 0;
  while ((m = pattern.exec(body)) !== null && count < 30) {
    const start = Math.max(0, m.index - 80);
    const end = Math.min(body.length, m.index + m[0].length + 200);
    console.log(`---\n@${m.index}: ...${body.slice(start, end).replace(/\n/g, ' / ')}...`);
    count++;
  }
  process.exit(0);
}

if (args[0] === 'extract') {
  const rfc = args[1];
  const start = args[2];
  const len = parseInt(args[3] ?? '300', 10);
  const url = `https://www.rfc-editor.org/rfc/rfc${rfc}.txt`;
  const body = cache[url]?.body;
  if (!body) { console.error(`RFC ${rfc} not in cache`); process.exit(1); }
  const idx = body.indexOf(start);
  if (idx < 0) { console.error(`'${start}' not found`); process.exit(1); }
  console.log(body.slice(idx, idx + len));
  process.exit(0);
}

if (args[0] === 'check') {
  const rfc = args[1];
  const quote = args.slice(2).join(' ');
  const url = `https://www.rfc-editor.org/rfc/rfc${rfc}.txt`;
  const body = cache[url]?.body;
  if (!body) { console.error(`RFC ${rfc} not in cache`); process.exit(1); }
  const found = norm(body).includes(norm(quote));
  console.log(`RFC ${rfc} :: quote-len=${quote.length} :: found=${found}`);
  if (!found) {
    // Try first 30 chars
    const partial = norm(quote).slice(0, 50);
    const partialFound = norm(body).includes(partial);
    console.log(`  partial-50-found=${partialFound} :: head="${quote.slice(0, 80)}..."`);
  }
  process.exit(found ? 0 : 1);
}

console.log('Usage:');
console.log('  npx tsx check-quote.ts grep <rfc> "<regex>"');
console.log('  npx tsx check-quote.ts extract <rfc> "<startStr>" [len]');
console.log('  npx tsx check-quote.ts check <rfc> "<verbatim>"');
