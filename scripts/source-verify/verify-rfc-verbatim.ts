/**
 * T25 — Source-Verify CLI (Welle D).
 *
 * Quarterly automated verification that `sources[*].quote` strings declared
 * inside apiq-meta blocks of all `scripts/spike/deterministic/apiq-ruleset-*.yaml`
 * files are still present in the authoritative source documents (RFCs, IETF
 * drafts, GitHub-hosted vendor docs, W3C specs, …).
 *
 * Schema-Split (Welle D Phase-3 #10): `quote` is the strict copy-paste from
 * the source URL — verifiable by this CLI. `summary` is a mining-paraphrase
 * — NOT verified here. Sources that carry only `summary` (or only the
 * deprecated legacy `verbatim` field) are skipped with a "summary-only" /
 * "legacy-verbatim" status and do NOT count as drift.
 *
 * The companion workflow `.github/workflows/source-verify-quarterly.yml` runs
 * this CLI in `--check-only` mode every quarter; on drift it opens an issue,
 * on clean-pass it opens a PR with bumped `verifiedAt`-timestamps.
 *
 * Public entry points (importable from tests):
 *   - `collectSources(yamlText: string): VerbatimSource[]`
 *   - `normaliseWhitespace(text: string): string`
 *   - `verifyVerbatimSubstring(quote: string, doc: string): boolean`
 *   - `fetchSource(url: string, cache: FetchCache): Promise<FetchResult>`
 *   - `runVerify(opts: RunOpts): Promise<RunReport>`
 *
 * CLI:
 *   `npx tsx scripts/source-verify/verify-rfc-verbatim.ts [flags]`
 *   Flags:
 *     --check-only   CI-mode: no yaml writes, exit 1 on drift only (NOT on
 *                    summary-only-skipped or legacy-verbatim warnings).
 *     --dry-run      No yaml writes, exit 0 always (allows baseline snapshot).
 *     --verbose      Log every source individually.
 *     --json         Emit machine-readable JSON report on stdout (suppresses
 *                    human-readable per-line logging — `--verbose` still adds
 *                    diagnostic info to stderr).
 *
 * Cache: `scripts/source-verify/.cache.json` (gitignored). Keyed by URL,
 * stores `{ etag?, fetchedAt, body }`. Cache TTL: 10 minutes for re-runs in the
 * same quarter, ETag-revalidation on cache-stale.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as https from 'node:https';
import * as http from 'node:http';
import { execSync } from 'node:child_process';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RULESETS_DIR = path.resolve(REPO_ROOT, 'scripts', 'spike', 'deterministic');
const CACHE_PATH = path.resolve(__dirname, '.cache.json');

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — protects against accidental re-fetches in the same quarter.
const FETCH_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_BASE_MS = 750;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerbatimSource {
  yamlFile: string;
  ruleName: string;
  sourceIndex: number;
  url: string;
  /** Verifiable text — populated from `sources[*].quote` (or legacy `verbatim`). */
  quote: string;
  /** True when populated from the deprecated `verbatim` field (legacy-warning). */
  fromLegacyVerbatim: boolean;
  verifiedAt?: string;
}

export interface FetchCacheEntry {
  etag?: string;
  fetchedAt: number;
  body: string;
  status: number;
}

export type FetchCache = Record<string, FetchCacheEntry>;

export interface FetchResult {
  ok: boolean;
  body?: string;
  status?: number;
  error?: string;
  fromCache: boolean;
}

export interface SourceVerification {
  yamlFile: string;
  ruleName: string;
  sourceIndex: number;
  url: string;
  quote: string;
  status: 'verified' | 'drift' | 'fetch-fail';
  message?: string;
  newVerifiedAt?: string;
  /** Set when verification used the deprecated `verbatim` field instead of `quote`. */
  legacyVerbatimUsed?: boolean;
}

export interface SummaryOnlySkipped {
  yamlFile: string;
  ruleName: string;
  sourceIndex: number;
  reason: 'summary-only' | 'no-url' | 'no-quote-no-summary';
}

export interface RunReport {
  startedAt: string;
  finishedAt: string;
  mode: 'verify' | 'dry-run' | 'check-only';
  totalSources: number;
  verified: number;
  drift: number;
  fetchFail: number;
  /** Sources skipped because they only carry `summary` (paraphrase, non-auditable). */
  summaryOnlySkipped: number;
  /** Sources still on legacy `verbatim` field — emit migration-warning. */
  legacyVerbatimWarned: number;
  perFile: Record<
    string,
    {
      verified: number;
      drift: number;
      fetchFail: number;
      summaryOnlySkipped: number;
      legacyVerbatimWarned: number;
      sources: number;
    }
  >;
  results: SourceVerification[];
  skipped: SummaryOnlySkipped[];
}

export interface RunOpts {
  mode: 'verify' | 'dry-run' | 'check-only';
  verbose: boolean;
  json: boolean;
  rulesetsDir?: string;
  cachePath?: string;
  fetcher?: (url: string, cache: FetchCache, opts: { verbose: boolean }) => Promise<FetchResult>;
  now?: () => Date;
}

// ---------------------------------------------------------------------------
// YAML scanning — collect all populated verbatim sources
// ---------------------------------------------------------------------------

interface ApiqMetaSource {
  type?: string;
  name?: string;
  url?: string;
  /** Verifiable copy-paste — T25 audit-target. */
  quote?: string;
  /** Mining-paraphrase / subagent-summary — NOT verified by T25. */
  summary?: string;
  /** @deprecated Use `quote` (T25-verifiable) or `summary` (paraphrase). */
  verbatim?: string;
  verifiedAt?: string;
  [key: string]: unknown;
}

interface ApiqMetaBlock {
  sources?: ApiqMetaSource[];
  [key: string]: unknown;
}

interface YamlRule {
  description?: string;
  'apiq-meta'?: ApiqMetaBlock;
  [key: string]: unknown;
}

interface YamlRuleset {
  rules?: Record<string, YamlRule>;
  [key: string]: unknown;
}

export interface CollectedSources {
  /** Sources with `quote` (or legacy `verbatim`) AND `url` — auditable. */
  verifiable: VerbatimSource[];
  /** Sources skipped — non-auditable (no `quote`, or no `url`, or summary-only). */
  skipped: SummaryOnlySkipped[];
}

export function collectSources(
  yamlText: string,
  yamlFile = ''
): CollectedSources {
  const parsed = YAML.parse(yamlText) as YamlRuleset | null;
  const verifiable: VerbatimSource[] = [];
  const skipped: SummaryOnlySkipped[] = [];
  if (!parsed?.rules) return { verifiable, skipped };
  for (const [ruleName, rule] of Object.entries(parsed.rules)) {
    const meta = rule?.['apiq-meta'];
    const sources = meta?.sources;
    if (!Array.isArray(sources)) continue;
    sources.forEach((src, idx) => {
      if (!src || typeof src !== 'object') return;
      const quoteText = typeof src.quote === 'string' ? src.quote.trim() : '';
      const summaryText = typeof src.summary === 'string' ? src.summary.trim() : '';
      const legacyVerbatim = typeof src.verbatim === 'string' ? src.verbatim.trim() : '';
      const url = typeof src.url === 'string' ? src.url.trim() : '';

      // Pick the verifiable text: prefer `quote`, fall back to legacy `verbatim`
      // (with warning). `summary` is NEVER auditable.
      const verifiableText = quoteText || legacyVerbatim;
      const fromLegacyVerbatim = !quoteText && !!legacyVerbatim;

      if (verifiableText && url) {
        verifiable.push({
          yamlFile,
          ruleName,
          sourceIndex: idx,
          url,
          quote: verifiableText,
          fromLegacyVerbatim,
          verifiedAt: typeof src.verifiedAt === 'string' ? src.verifiedAt : undefined,
        });
        return;
      }

      // Sources with content but not auditable — record skip-reason for telemetry.
      if (summaryText && !verifiableText) {
        skipped.push({ yamlFile, ruleName, sourceIndex: idx, reason: 'summary-only' });
        return;
      }
      if (verifiableText && !url) {
        skipped.push({ yamlFile, ruleName, sourceIndex: idx, reason: 'no-url' });
        return;
      }
      // Source carries neither quote nor summary nor legacy-verbatim — silent skip
      // (e.g. citation-pointer-only sources like `{ type: vendor, name: 'OWASP' }`).
      // We still emit an entry for accounting completeness only when *something* was
      // claimed but unusable.
      if (!verifiableText && !summaryText) {
        // No claim → not a skip.
        return;
      }
      skipped.push({ yamlFile, ruleName, sourceIndex: idx, reason: 'no-quote-no-summary' });
    });
  }
  return { verifiable, skipped };
}

export function discoverRulesetFiles(dir = RULESETS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^apiq-ruleset(?:-[a-z0-9-]+)?\.yaml$/i.test(f))
    .sort();
}

// ---------------------------------------------------------------------------
// Whitespace normalisation + verbatim substring match
// ---------------------------------------------------------------------------

export function normaliseWhitespace(text: string): string {
  // Collapse all whitespace runs to a single space, lowercase to make the match
  // robust against minor casing-drift in verbatim citations. Strip leading /
  // trailing.
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function verifyVerbatimSubstring(verbatim: string, doc: string): boolean {
  if (!verbatim || !doc) return false;
  const needle = normaliseWhitespace(verbatim);
  const hay = normaliseWhitespace(doc);
  return hay.includes(needle);
}

// ---------------------------------------------------------------------------
// Fetch layer — RFC, GitHub, generic HTTP
// ---------------------------------------------------------------------------

function rfcEditorUrlFor(url: string): string {
  // https://www.rfc-editor.org/rfc/rfc9110 → https://www.rfc-editor.org/rfc/rfc9110.txt
  // https://www.rfc-editor.org/rfc/rfc9110#section-15.5.16 → ...rfc9110.txt
  const m = url.match(/^https?:\/\/(?:www\.)?rfc-editor\.org\/rfc\/(rfc\d+)(?:\.[a-z]+)?(?:[#?].*)?$/i);
  if (m) return `https://www.rfc-editor.org/rfc/${m[1].toLowerCase()}.txt`;
  return url;
}

function blobToRawGithub(url: string): string {
  // https://github.com/<owner>/<repo>/blob/<ref>/<path> → raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+?)(?:[#?].*)?$/i);
  if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}`;
  return url;
}

function rewriteUrlForRawText(url: string): string {
  if (/rfc-editor\.org\/rfc\//i.test(url)) return rfcEditorUrlFor(url);
  if (/^https?:\/\/github\.com\/.+\/blob\//i.test(url)) return blobToRawGithub(url);
  return url;
}

function loadCache(cachePath: string): FetchCache {
  if (!fs.existsSync(cachePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf8')) as FetchCache;
  } catch {
    return {};
  }
}

function saveCache(cachePath: string, cache: FetchCache): void {
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

function httpGet(url: string, etag?: string): Promise<{ status: number; body: string; etag?: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https://') ? https : http;
    const headers: Record<string, string> = {
      'User-Agent': 'apiq-source-verify/1.0 (+https://github.com/perpaulsen/apiq-mvp)',
      Accept: 'text/plain, text/html, */*;q=0.5',
    };
    if (etag) headers['If-None-Match'] = etag;
    const req = lib.get(url, { headers, timeout: FETCH_TIMEOUT_MS }, (res) => {
      const status = res.statusCode ?? 0;
      // Follow redirects (max 5) — RFC editor + IETF often 301 to canonical.
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url).toString();
        httpGet(next, etag).then(resolve, reject);
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const newEtag = typeof res.headers.etag === 'string' ? res.headers.etag : undefined;
        resolve({ status, body, etag: newEtag });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => {
      req.destroy(new Error(`fetch-timeout after ${FETCH_TIMEOUT_MS}ms: ${url}`));
    });
    req.on('error', reject);
  });
}

export async function fetchSource(
  url: string,
  cache: FetchCache,
  opts: { verbose: boolean }
): Promise<FetchResult> {
  const fetchUrl = rewriteUrlForRawText(url);
  const now = Date.now();
  const cached = cache[fetchUrl];
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    if (opts.verbose) {
      // eslint-disable-next-line no-console
      console.error(`  [cache-hit] ${fetchUrl}`);
    }
    return { ok: true, body: cached.body, status: cached.status, fromCache: true };
  }

  // GitHub raw content — try `gh api` first if available, fall back to direct fetch.
  if (/^https?:\/\/raw\.githubusercontent\.com\//i.test(fetchUrl)) {
    const ghResult = tryGhRawFetch(fetchUrl);
    if (ghResult.ok && ghResult.body) {
      cache[fetchUrl] = { fetchedAt: now, body: ghResult.body, status: 200 };
      return { ok: true, body: ghResult.body, status: 200, fromCache: false };
    }
  }

  let lastError = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { status, body, etag } = await httpGet(fetchUrl, cached?.etag);
      if (status === 304 && cached) {
        cache[fetchUrl] = { ...cached, fetchedAt: now };
        return { ok: true, body: cached.body, status: cached.status, fromCache: true };
      }
      if (status >= 200 && status < 300 && body) {
        cache[fetchUrl] = { etag, fetchedAt: now, body, status };
        return { ok: true, body, status, fromCache: false };
      }
      if (status === 429 || status >= 500) {
        lastError = `HTTP ${status}`;
        await sleep(RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
        continue;
      }
      return { ok: false, status, error: `HTTP ${status}`, fromCache: false };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      await sleep(RETRY_BACKOFF_BASE_MS * Math.pow(2, attempt));
    }
  }
  return { ok: false, error: lastError || 'unknown-fetch-failure', fromCache: false };
}

function tryGhRawFetch(rawUrl: string): { ok: boolean; body?: string } {
  const m = rawUrl.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (!m) return { ok: false };
  const [, owner, repo, ref, filePath] = m;
  try {
    const stdout = execSync(
      `gh api "repos/${owner}/${repo}/contents/${filePath}?ref=${ref}" --jq ".content"`,
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: FETCH_TIMEOUT_MS }
    );
    const b64 = stdout.replace(/\s+/g, '');
    if (!b64) return { ok: false };
    return { ok: true, body: Buffer.from(b64, 'base64').toString('utf8') };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// YAML in-place edit — bump verifiedAt for verified sources
// ---------------------------------------------------------------------------

interface VerifiedAtPatch {
  ruleName: string;
  sourceIndex: number;
  newVerifiedAt: string;
}

export function applyVerifiedAtBumps(yamlText: string, patches: VerifiedAtPatch[]): string {
  if (patches.length === 0) return yamlText;
  const doc = YAML.parseDocument(yamlText);
  for (const patch of patches) {
    const node = doc.getIn(['rules', patch.ruleName, 'apiq-meta', 'sources', patch.sourceIndex], true);
    if (node && typeof (node as { set?: (k: string, v: unknown) => void }).set === 'function') {
      (node as { set: (k: string, v: unknown) => void }).set('verifiedAt', patch.newVerifiedAt);
    } else {
      // Fallback — rewrite via setIn (preserves comments via Document API).
      doc.setIn(
        ['rules', patch.ruleName, 'apiq-meta', 'sources', patch.sourceIndex, 'verifiedAt'],
        patch.newVerifiedAt
      );
    }
  }
  return String(doc);
}

// ---------------------------------------------------------------------------
// Top-level run
// ---------------------------------------------------------------------------

export async function runVerify(opts: RunOpts): Promise<RunReport> {
  const dir = opts.rulesetsDir ?? RULESETS_DIR;
  const cachePath = opts.cachePath ?? CACHE_PATH;
  const now = opts.now ?? (() => new Date());
  const fetcher = opts.fetcher ?? fetchSource;
  const startedAt = now().toISOString();

  const files = discoverRulesetFiles(dir);
  const cache = loadCache(cachePath);
  const results: SourceVerification[] = [];
  const allSkipped: SummaryOnlySkipped[] = [];
  const perFile: RunReport['perFile'] = {};

  for (const file of files) {
    perFile[file] = {
      verified: 0,
      drift: 0,
      fetchFail: 0,
      summaryOnlySkipped: 0,
      legacyVerbatimWarned: 0,
      sources: 0,
    };
    const yamlPath = path.join(dir, file);
    const yamlText = fs.readFileSync(yamlPath, 'utf8');
    const { verifiable, skipped } = collectSources(yamlText, file);
    perFile[file].sources = verifiable.length;
    perFile[file].summaryOnlySkipped = skipped.length;
    allSkipped.push(...skipped);
    if (verifiable.length === 0) continue;

    const patches: VerifiedAtPatch[] = [];
    const today = now().toISOString().slice(0, 10);

    for (const src of verifiable) {
      if (src.fromLegacyVerbatim) {
        perFile[file].legacyVerbatimWarned++;
        if (opts.verbose && !opts.json) {
          // eslint-disable-next-line no-console
          console.warn(
            `  [WARN] ${file}::${src.ruleName}[${src.sourceIndex}] uses deprecated 'verbatim' field — migrate to 'quote' (verifiable) or 'summary' (paraphrase).`
          );
        }
      }
      if (opts.verbose && !opts.json) {
        // eslint-disable-next-line no-console
        console.log(`  [${file}] ${src.ruleName}#${src.sourceIndex} → ${src.url}`);
      }
      const fetched = await fetcher(src.url, cache, { verbose: opts.verbose });
      if (!fetched.ok || !fetched.body) {
        perFile[file].fetchFail++;
        results.push({
          yamlFile: file,
          ruleName: src.ruleName,
          sourceIndex: src.sourceIndex,
          url: src.url,
          quote: src.quote,
          status: 'fetch-fail',
          message: fetched.error,
          legacyVerbatimUsed: src.fromLegacyVerbatim || undefined,
        });
        continue;
      }
      const matched = verifyVerbatimSubstring(src.quote, fetched.body);
      if (matched) {
        perFile[file].verified++;
        patches.push({ ruleName: src.ruleName, sourceIndex: src.sourceIndex, newVerifiedAt: today });
        results.push({
          yamlFile: file,
          ruleName: src.ruleName,
          sourceIndex: src.sourceIndex,
          url: src.url,
          quote: src.quote,
          status: 'verified',
          newVerifiedAt: today,
          legacyVerbatimUsed: src.fromLegacyVerbatim || undefined,
        });
      } else {
        perFile[file].drift++;
        results.push({
          yamlFile: file,
          ruleName: src.ruleName,
          sourceIndex: src.sourceIndex,
          url: src.url,
          quote: src.quote,
          status: 'drift',
          message: 'quote string not found in fetched source',
          legacyVerbatimUsed: src.fromLegacyVerbatim || undefined,
        });
      }
    }

    if (opts.mode === 'verify' && patches.length > 0) {
      const updated = applyVerifiedAtBumps(yamlText, patches);
      fs.writeFileSync(yamlPath, updated, 'utf8');
    }
  }

  saveCache(cachePath, cache);

  const verified = results.filter((r) => r.status === 'verified').length;
  const drift = results.filter((r) => r.status === 'drift').length;
  const fetchFail = results.filter((r) => r.status === 'fetch-fail').length;
  const summaryOnlySkipped = allSkipped.length;
  const legacyVerbatimWarned = results.filter((r) => r.legacyVerbatimUsed).length;

  return {
    startedAt,
    finishedAt: now().toISOString(),
    mode: opts.mode,
    totalSources: results.length,
    verified,
    drift,
    fetchFail,
    summaryOnlySkipped,
    legacyVerbatimWarned,
    perFile,
    results,
    skipped: allSkipped,
  };
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

interface ParsedArgs {
  mode: 'verify' | 'dry-run' | 'check-only';
  verbose: boolean;
  json: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = new Set(argv.slice(2));
  return {
    mode: args.has('--check-only') ? 'check-only' : args.has('--dry-run') ? 'dry-run' : 'verify',
    verbose: args.has('--verbose') || args.has('-v'),
    json: args.has('--json'),
    help: args.has('--help') || args.has('-h'),
  };
}

function printUsage(): void {
  // eslint-disable-next-line no-console
  console.log(
    [
      'Usage: npx tsx scripts/source-verify/verify-rfc-verbatim.ts [flags]',
      '',
      'Verifies sources[*].quote strings in apiq-ruleset-*.yaml files against',
      'their authoritative URLs. summary-only and legacy-verbatim sources are',
      'reported but do not cause exit-1 (Welle-D Phase-3 schema-split).',
      '',
      'Flags:',
      '  --check-only   CI-mode: no yaml writes, exit 1 on drift or fetch-fail',
      '  --dry-run      No yaml writes, exit 0 always (baseline-snapshot mode)',
      '  --verbose|-v   Per-source logging on stderr (incl. legacy-warnings)',
      '  --json         Emit machine-readable JSON report on stdout',
      '  --help|-h      Show this message',
    ].join('\n')
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  if (args.help) {
    printUsage();
    return;
  }
  const report = await runVerify({
    mode: args.mode,
    verbose: args.verbose,
    json: args.json,
  });

  if (args.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `\nSource-Verify report — mode=${report.mode}\n` +
        `  total-auditable: ${report.totalSources}  verified: ${report.verified}  drift: ${report.drift}  fetch-fail: ${report.fetchFail}\n` +
        `  summary-only-skipped: ${report.summaryOnlySkipped}  legacy-verbatim-warned: ${report.legacyVerbatimWarned}\n`
    );
    for (const [file, stats] of Object.entries(report.perFile)) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${file}: auditable=${stats.sources} verified=${stats.verified} drift=${stats.drift} fetch-fail=${stats.fetchFail} summary-only=${stats.summaryOnlySkipped} legacy-warned=${stats.legacyVerbatimWarned}`
      );
    }
    if (report.drift > 0) {
      // eslint-disable-next-line no-console
      console.log(`\nDrift details:`);
      for (const r of report.results.filter((x) => x.status === 'drift')) {
        // eslint-disable-next-line no-console
        console.log(`  - ${r.yamlFile} :: ${r.ruleName}[${r.sourceIndex}]  ${r.url}`);
      }
    }
    if (report.legacyVerbatimWarned > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `\n[migration-warning] ${report.legacyVerbatimWarned} source(s) still use deprecated 'verbatim' field — migrate to 'quote' (T25-verifiable) or 'summary' (paraphrase).`
      );
    }
  }

  // Exit-code 1 only on drift (per Welle-D Phase-3 schema-split: summary-only
  // and legacy-verbatim-warnings are NOT failures). Fetch-fail still surfaces
  // as exit-1 to keep CI safe against transient-network-blindness.
  if (args.mode === 'check-only' && (report.drift > 0 || report.fetchFail > 0)) {
    process.exit(1);
  }
}

const isMain = import.meta.url === pathToFileURLForArgv(process.argv[1] ?? '');

function pathToFileURLForArgv(p: string): string {
  if (!p) return '';
  try {
    return new URL(`file://${path.resolve(p).replace(/\\/g, '/')}`).toString();
  } catch {
    return '';
  }
}

if (isMain) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('source-verify fatal:', err);
    process.exit(2);
  });
}
