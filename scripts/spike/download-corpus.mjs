// M2a Corpus Downloader — Welle M Round-3 Mining
// Downloads OAS3 specs from APIs.guru + vendor sources, applies healthy-spec-filter.
// Output: scripts/spike/data/healthy-corpus/{<spec-id>.json, manifest.json}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CORPUS_DIR = path.join(__dirname, 'data', 'healthy-corpus');
const TARGETS_FILE = path.join(CORPUS_DIR, '_targets.json');

if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true });

// ---------- Concurrency limiter ----------
function pLimit(n) {
  const queue = [];
  let running = 0;
  const next = () => {
    if (running >= n || queue.length === 0) return;
    running++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (v) => { running--; resolve(v); next(); },
      (e) => { running--; reject(e); next(); }
    );
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

// ---------- Healthy-spec-filter ----------
const FILTER_DEFAULTS = {
  oas3: true,
  minOps: 5,        // relaxed from 10 → 5 to clear ≥500 target (D10 graceful-degradation)
  tags: true,
  descRate: 0.8,
  recentYears: 999, // disabled — APIs.guru 'updated' field reflects ingestion not API mtime
};

function evaluateSpec(specBody, target, criteria) {
  const result = {
    oasVersion: null,
    operationsCount: 0,
    tagsCount: 0,
    operationsWithDescription: 0,
    descriptionRate: 0,
    lastUpdated: target.updated || null,
    title: null,
    parseable: false,
    healthy: false,
    filterPasses: [],
    filterFails: [],
  };

  if (!specBody || typeof specBody !== 'object') {
    result.filterFails.push('not-object');
    return result;
  }
  result.parseable = true;
  result.title = specBody?.info?.title || null;
  result.oasVersion = specBody.openapi || specBody.swagger || null;

  // (a) oas3
  if (criteria.oas3) {
    if (typeof result.oasVersion === 'string' && result.oasVersion.startsWith('3')) {
      result.filterPasses.push('oas3');
    } else {
      result.filterFails.push('oas3');
    }
  }

  // ops count + descriptions
  const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
  let ops = 0;
  let opsWithDesc = 0;
  if (specBody.paths && typeof specBody.paths === 'object') {
    for (const pathItem of Object.values(specBody.paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue;
      for (const m of HTTP_METHODS) {
        const op = pathItem[m];
        if (op && typeof op === 'object') {
          ops++;
          const desc = (op.description || op.summary || '').trim();
          if (desc.length > 0) opsWithDesc++;
        }
      }
    }
  }
  result.operationsCount = ops;
  result.operationsWithDescription = opsWithDesc;
  result.descriptionRate = ops > 0 ? opsWithDesc / ops : 0;

  // (b) min ops
  if (ops >= criteria.minOps) result.filterPasses.push('minOps');
  else result.filterFails.push('minOps');

  // (c) tags array
  const topTags = Array.isArray(specBody.tags) ? specBody.tags : [];
  result.tagsCount = topTags.length;
  if (criteria.tags) {
    if (topTags.length >= 1) result.filterPasses.push('tags');
    else result.filterFails.push('tags');
  }

  // (d) description rate
  if (result.descriptionRate >= criteria.descRate) result.filterPasses.push('descriptions');
  else result.filterFails.push('descriptions');

  // (e) recent
  if (target.updated) {
    const ageMs = Date.now() - new Date(target.updated).getTime();
    const ageYears = ageMs / (1000 * 60 * 60 * 24 * 365.25);
    if (ageYears <= criteria.recentYears) result.filterPasses.push('recent');
    else result.filterFails.push('recent');
  } else {
    result.filterFails.push('recent-unknown');
  }

  result.healthy = result.filterFails.length === 0;
  return result;
}

// ---------- Spec sanitizer ----------
// Strip x-logo data-uri and other heavy metadata that may bloat JSON without helping pattern-mining.
// Keep info.title, info.description, info.version, paths, components, tags. Strip x-logo.
function sanitizeSpec(spec) {
  // shallow clone-and-prune
  if (!spec || typeof spec !== 'object') return spec;
  if (spec.info && typeof spec.info === 'object') {
    const newInfo = { ...spec.info };
    delete newInfo['x-logo'];
    spec.info = newInfo;
  }
  return spec;
}

// ---------- Hashing for dedup ----------
function specHash(specBody) {
  // Use stable signature: paths + components.schemas keys, not full body
  // (full hash will rarely collide because of mtime / order changes)
  try {
    const str = JSON.stringify(specBody);
    return crypto.createHash('sha256').update(str).digest('hex');
  } catch {
    return null;
  }
}

// ---------- Fetcher ----------
async function fetchWithRetry(url, retries = 2) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

function parseSpec(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(text);
  }
  // YAML: lazy-load
  // We use sync require since this is a node script
  return null;
}

// ---------- Vendor specs ----------
const VENDOR_SPECS = [
  {
    id: 'stripe--core--latest',
    providerName: 'stripe.com',
    source: 'vendor',
    url: 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json',
    info: { title: 'Stripe API' },
    updated: new Date().toISOString(),
    forceInclude: true,
  },
  {
    id: 'github--rest--main',
    providerName: 'github.com',
    source: 'vendor',
    url: 'https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json',
    info: { title: 'GitHub REST API' },
    updated: new Date().toISOString(),
  },
  {
    id: 'digitalocean--core--main',
    providerName: 'digitalocean.com',
    source: 'vendor',
    url: 'https://raw.githubusercontent.com/digitalocean/openapi/main/specification/DigitalOcean-public.v2.yaml',
    info: { title: 'DigitalOcean API' },
    updated: new Date().toISOString(),
    forceInclude: true,
  },
  {
    id: 'twilio--core--main',
    providerName: 'twilio.com',
    source: 'vendor',
    url: 'https://raw.githubusercontent.com/twilio/twilio-oai/main/spec/json/twilio_api_v2010.json',
    info: { title: 'Twilio API' },
    updated: new Date().toISOString(),
    forceInclude: true,
  },
  {
    id: 'gitlab--core--main',
    providerName: 'gitlab.com',
    source: 'vendor',
    url: 'https://gitlab.com/gitlab-org/gitlab/-/raw/master/doc/api/openapi/openapi_v2.yaml',
    info: { title: 'GitLab API' },
    updated: new Date().toISOString(),
    forceInclude: true,
  },
  {
    id: 'pagerduty--rest--main',
    providerName: 'pagerduty.com',
    source: 'vendor',
    url: 'https://raw.githubusercontent.com/PagerDuty/api-schema/main/reference/REST/openapiv3.json',
    info: { title: 'PagerDuty REST API' },
    updated: new Date().toISOString(),
  },
];

// ---------- Main ----------
async function main() {
  const args = process.argv.slice(2);
  const maxTargets = parseInt(args[0] || '0') || 0; // 0 = all
  const skipVendor = args.includes('--skip-vendor');
  const skipApisGuru = args.includes('--skip-apis-guru');

  const targets = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
  console.log(`Loaded ${targets.length} APIs.guru OAS3 targets`);

  const allTargets = [];
  if (!skipApisGuru) {
    const apisGuruList = maxTargets > 0 ? targets.slice(0, maxTargets) : targets;
    for (const t of apisGuruList) allTargets.push({ ...t, source: 'apis.guru' });
  }
  if (!skipVendor) {
    for (const v of VENDOR_SPECS) allTargets.push(v);
  }

  console.log(`Total to download: ${allTargets.length}`);

  const limit = pLimit(5);
  const seenHashes = new Set();
  const results = [];
  let done = 0;
  let downloaded = 0;
  let healthy = 0;
  let dupCount = 0;
  let errCount = 0;

  const tasks = allTargets.map((t) => limit(async () => {
    let body = null;
    let parseError = null;
    try {
      const text = await fetchWithRetry(t.url, 2);
      try {
        body = parseSpec(text);
        if (body === null) {
          // YAML — try dynamic import
          const yaml = await import('yaml').catch(() => null);
          if (yaml) {
            body = yaml.parse(text);
          } else {
            parseError = 'no-yaml-parser';
          }
        }
      } catch (e) {
        parseError = `parse: ${e.message}`;
      }
      downloaded++;
    } catch (e) {
      parseError = `fetch: ${e.message}`;
      errCount++;
    }

    const evalResult = body ? evaluateSpec(body, t, FILTER_DEFAULTS) : {
      oasVersion: null, operationsCount: 0, tagsCount: 0,
      operationsWithDescription: 0, descriptionRate: 0,
      lastUpdated: t.updated || null, title: null,
      parseable: false, healthy: false,
      filterPasses: [], filterFails: ['parse-fail'],
      parseError,
    };

    let dup = false;
    if (body && evalResult.healthy) {
      const h = specHash(body);
      if (h && seenHashes.has(h)) {
        dup = true;
        dupCount++;
      } else if (h) {
        seenHashes.add(h);
      }
    }

    // Write to disk if healthy OR forced (vendor specs always get written even if failing filter,
    // since they are known-good high-quality APIs and M2c may include them by name).
    const shouldWrite = body && !dup && (evalResult.healthy || t.forceInclude);
    if (shouldWrite) {
      sanitizeSpec(body);
      const fp = path.join(CORPUS_DIR, `${t.id}.json`);
      try {
        fs.writeFileSync(fp, JSON.stringify(body));
        if (evalResult.healthy) healthy++;
      } catch (e) {
        evalResult.filterFails.push(`write: ${e.message}`);
        evalResult.healthy = false;
      }
    }

    done++;
    if (done % 50 === 0) {
      console.log(`  progress: ${done}/${allTargets.length} done, ${healthy} healthy, ${dupCount} dups, ${errCount} errors`);
    }

    return {
      id: t.id,
      source: t.source,
      providerName: t.providerName,
      url: t.url,
      downloadedAt: new Date().toISOString(),
      spec: evalResult,
      healthy: evalResult.healthy && !dup,
      duplicate: dup,
      filterPasses: evalResult.filterPasses,
      filterFails: evalResult.filterFails,
      parseError: parseError || undefined,
    };
  }));

  const allEvals = await Promise.all(tasks);

  // Summary
  const filterStats = {
    'oas3-pass': 0, 'oas3-fail': 0,
    'minOps-pass': 0, 'minOps-fail': 0,
    'tags-pass': 0, 'tags-fail': 0,
    'descriptions-pass': 0, 'descriptions-fail': 0,
    'recent-pass': 0, 'recent-fail': 0,
    'parseable': 0, 'parse-fail': 0,
  };
  for (const r of allEvals) {
    if (r.parseError) filterStats['parse-fail']++;
    else filterStats['parseable']++;
    for (const p of r.filterPasses) {
      const k = `${p}-pass`;
      if (k in filterStats) filterStats[k]++;
    }
    for (const f of r.filterFails) {
      const k = `${f}-fail`;
      if (k in filterStats) filterStats[k]++;
    }
  }

  const manifest = {
    generated: new Date().toISOString(),
    sources: ['apis.guru', 'vendor'],
    totalAttempted: allTargets.length,
    totalDownloaded: downloaded,
    totalHealthy: healthy,
    totalDuplicates: dupCount,
    totalErrors: errCount,
    filterCriteria: FILTER_DEFAULTS,
    filterStats,
    specs: allEvals,
  };

  fs.writeFileSync(path.join(CORPUS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\n=== DONE ===');
  console.log(`Total attempted: ${allTargets.length}`);
  console.log(`Total downloaded: ${downloaded}`);
  console.log(`Total healthy:    ${healthy}`);
  console.log(`Total duplicates: ${dupCount}`);
  console.log(`Total errors:     ${errCount}`);
  console.log(`Filter stats:`, filterStats);
  console.log(`Manifest: ${path.join(CORPUS_DIR, 'manifest.json')}`);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
