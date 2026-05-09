/**
 * Helper für Verbatim-Curation (OQ-2):
 * Fetched eine Liste von RFCs als raw-text und cached in /tmp/rfc-verbatim
 * (oder direkt in scripts/source-verify/.cache.json — re-using T25-cache).
 *
 * Usage: npx tsx scripts/source-verify/fetch-rfc-raw.ts
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as https from 'node:https';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, '.cache.json');

const RFCS = [9457, 8725, 6749, 6750, 3986, 7396, 6902, 5789, 9745, 9700, 6570, 7616, 7240, 9111, 8259, 8288, 9651, 8594];
// 9110 ist schon gecacht.

interface CacheEntry { etag?: string; fetchedAt: number; body: string; status: number; }

function load(): Record<string, CacheEntry> {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
}
function save(c: Record<string, CacheEntry>) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
}

function get(url: string): Promise<string> {
  return new Promise((res, rej) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'apiq-curator/1.0', Accept: 'text/plain, */*' },
      timeout: 60000,
    }, (r) => {
      const status = r.statusCode ?? 0;
      if ([301, 302, 307, 308].includes(status) && r.headers.location) {
        r.resume();
        get(new URL(r.headers.location, url).toString()).then(res, rej);
        return;
      }
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
      r.on('error', rej);
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', rej);
  });
}

(async () => {
  const cache = load();
  for (const n of RFCS) {
    const url = `https://www.rfc-editor.org/rfc/rfc${n}.txt`;
    if (cache[url]) {
      console.log(`skip ${url} (cached, ${cache[url].body.length} chars)`);
      continue;
    }
    try {
      const body = await get(url);
      cache[url] = { fetchedAt: Date.now(), body, status: 200 };
      console.log(`OK   ${url}: ${body.length} chars`);
    } catch (e) {
      console.error(`FAIL ${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  save(cache);
  console.log(`\nCache saved: ${Object.keys(cache).length} entries.`);
})();
