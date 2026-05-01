// Slice the Stripe OpenAPI spec down to ≤200 endpoints by keeping only paths
// whose first segment (after /v1/) matches an allow-list of core domains.
//
// Stripe's spec carries no `tags` on operations and no top-level `tags`, so the
// originally-suggested tag-intersection slicing strategy is not applicable.
// We use path-prefix instead, which is functionally equivalent to Stripe's
// resource-domain grouping and yields a deterministic, reproducible slice.
//
// Reproducibility note: the allow-list and algorithm are documented in
// openapi-examples/stripe/slice.md.
//
// Source: github.com/stripe/openapi (master) — openapi/spec3.json. We do not
// vendor the full spec into the repo; this script fetches it on demand.
import { writeFileSync } from 'node:fs';

const SOURCE_URL = 'https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json';
const OUT_PATH = 'openapi-examples/stripe/spec.json';

const ALLOW_PREFIXES = new Set([
  'charges',
  'customers',
  'invoices',
  'invoiceitems',
  'payment_intents',
  'subscriptions',
  'subscription_items',
  'subscription_schedules',
  'products',
]);

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Failed to fetch ${SOURCE_URL}: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();

let originalOps = 0;
for (const item of Object.values(spec.paths)) {
  for (const m of METHODS) if (item?.[m]) originalOps++;
}

const newPaths = {};
let keptOps = 0;
const keptPrefixes = new Map();
const droppedPrefixes = new Map();

for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
  const stripped = pathKey.replace(/^\//, '').replace(/^v1\//, '');
  const prefix = stripped.split('/')[0];

  if (!ALLOW_PREFIXES.has(prefix)) {
    let n = 0;
    for (const m of METHODS) if (pathItem?.[m]) n++;
    droppedPrefixes.set(prefix, (droppedPrefixes.get(prefix) ?? 0) + n);
    continue;
  }

  // Keep entire path-item: every operation under an allow-listed prefix is in scope.
  newPaths[pathKey] = pathItem;
  let n = 0;
  for (const m of METHODS) if (pathItem?.[m]) n++;
  keptOps += n;
  keptPrefixes.set(prefix, (keptPrefixes.get(prefix) ?? 0) + n);
}

// Build sliced spec. Keep info/servers/security/components AS-IS for v0.1.
// (Top-level `tags` is not present in Stripe's spec, so nothing to filter.)
const sliced = {
  openapi: spec.openapi,
  info: spec.info,
  servers: spec.servers,
  security: spec.security,
  paths: newPaths,
  components: spec.components,
};

writeFileSync(OUT_PATH, JSON.stringify(sliced, null, 2), 'utf8');

console.log(`Original ops: ${originalOps}`);
console.log(`Kept ops:     ${keptOps}`);
console.log(`Dropped ops:  ${originalOps - keptOps}`);
console.log(`Kept paths:   ${Object.keys(newPaths).length} / ${Object.keys(spec.paths).length}`);
console.log('\nKept by prefix:');
for (const [p, c] of [...keptPrefixes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${p}: ${c}`);
}
console.log(`\nDropped prefix groups: ${droppedPrefixes.size}`);
const droppedSorted = [...droppedPrefixes.entries()].sort((a, b) => b[1] - a[1]);
console.log('Top dropped prefixes (first 10):');
for (const [p, c] of droppedSorted.slice(0, 10)) {
  console.log(`  ${p}: ${c}`);
}
