// Slice PagerDuty's OpenAPI spec to ≤200 endpoints by keeping only operations
// whose tags intersect a core "incident response" allow-list. The full spec is
// 419 endpoints; we keep the operational core (incidents/services/schedules/users
// etc.) and drop more peripheral domains (status pages, automation actions,
// orchestrations, analytics, etc.).
//
// Algorithm:
//   1. For each operation under each path, keep iff op.tags intersects ALLOW_TAGS.
//   2. If a path-item has zero kept operations, drop the path entirely.
//   3. Filter top-level `tags` to those still referenced by kept operations.
//   4. Keep info / servers / security / components AS-IS.
//
// Source: github.com/PagerDuty/api-schema (main) — reference/REST/openapiv3.json.
// We do not vendor the full spec into the repo; this script fetches it on demand.
import { writeFileSync } from 'node:fs';

const SOURCE_URL = 'https://raw.githubusercontent.com/PagerDuty/api-schema/main/reference/REST/openapiv3.json';
const OUT = 'openapi-examples/pagerduty/spec.json';

const ALLOW_TAGS = new Set([
  'Incidents',
  'Services',
  'Schedules',
  'Schedules_v3',
  'Users',
  'Teams',
  'Escalation Policies',
  'Webhooks',
  'Maintenance Windows',
  'Tags',
  'Log Entries',
  'Change Events',
  'Extensions',
  'Service Dependencies',
]);

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Failed to fetch ${SOURCE_URL}: HTTP ${res.status}`);
  process.exit(1);
}
const spec = await res.json();

const tagsKept = new Set();
const newPaths = {};
let originalOps = 0;
let keptOps = 0;
const keptByTag = new Map();
const droppedByTag = new Map();

for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
  const newItem = {};
  // Preserve path-level non-operation keys (parameters, summary, description).
  for (const k of Object.keys(pathItem)) {
    if (!METHODS.includes(k)) newItem[k] = pathItem[k];
  }
  let kept = 0;
  for (const method of METHODS) {
    const op = pathItem[method];
    if (!op) continue;
    originalOps++;
    const tags = op.tags ?? [];
    const inScope = tags.some((t) => ALLOW_TAGS.has(t));
    if (inScope) {
      newItem[method] = op;
      keptOps++;
      kept++;
      for (const t of tags) {
        if (ALLOW_TAGS.has(t)) {
          tagsKept.add(t);
          keptByTag.set(t, (keptByTag.get(t) ?? 0) + 1);
        }
      }
    } else {
      for (const t of tags) droppedByTag.set(t, (droppedByTag.get(t) ?? 0) + 1);
    }
  }
  if (kept > 0) newPaths[pathKey] = newItem;
}

// Filter top-level tags to those still referenced.
const newTopTags = (spec.tags ?? []).filter((t) => tagsKept.has(t.name));

const sliced = {
  openapi: spec.openapi,
  info: spec.info,
  servers: spec.servers,
  security: spec.security,
  tags: newTopTags,
  paths: newPaths,
  components: spec.components,
};
// Drop any undefined top-level fields (e.g. servers/security if absent).
for (const k of Object.keys(sliced)) if (sliced[k] === undefined) delete sliced[k];

writeFileSync(OUT, JSON.stringify(sliced, null, 2), 'utf8');

console.log(`Original ops: ${originalOps}`);
console.log(`Kept ops:     ${keptOps}`);
console.log(`Dropped ops:  ${originalOps - keptOps}`);
console.log(`Kept paths:   ${Object.keys(newPaths).length} / ${Object.keys(spec.paths).length}`);
console.log(`Top-level tags kept: ${newTopTags.length} / ${(spec.tags ?? []).length}`);

console.log('\nKept by tag:');
for (const [t, c] of [...keptByTag.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${c}`);
}

const droppedSorted = [...droppedByTag.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\nDropped tag groups: ${droppedByTag.size}`);
console.log('Top dropped tags (first 15):');
for (const [t, c] of droppedSorted.slice(0, 15)) console.log(`  ${t}: ${c}`);
