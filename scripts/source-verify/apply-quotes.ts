/**
 * OQ-2 — Apply curated-quotes to ruleset YAMLs.
 *
 * For each candidate in curated-quotes.json:
 *   - Open the target yaml file
 *   - Locate rules.<ruleName>.apiq-meta.sources[<sourceIndex>]
 *   - Set: url, quote, verifiedAt (today's date)
 *   - PRESERVE existing fields (type, number, section, summary)
 *
 * Output: modified yaml files written in-place. Per-rule status logged.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RULESETS_DIR = path.resolve(REPO_ROOT, 'scripts', 'spike', 'deterministic');

interface Candidate {
  rule: string;
  pattern: string;
  yaml: string;
  sourceIndex: number;
  rfc: number;
  url: string;
  quote: string;
}

const today = '2026-05-09';
const data = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'curated-quotes.json'), 'utf8')
) as { candidates: Candidate[] };

// Group by yaml-file to load each only once.
const byFile = new Map<string, Candidate[]>();
for (const c of data.candidates) {
  if (!byFile.has(c.yaml)) byFile.set(c.yaml, []);
  byFile.get(c.yaml)!.push(c);
}

let totalApplied = 0;
let totalFailed = 0;
const failures: { c: Candidate; reason: string }[] = [];

for (const [yamlFile, candidates] of byFile) {
  const yamlPath = path.join(RULESETS_DIR, yamlFile);
  const yamlText = fs.readFileSync(yamlPath, 'utf8');
  const doc = YAML.parseDocument(yamlText);

  for (const c of candidates) {
    const sourcesPath = ['rules', c.rule, 'apiq-meta', 'sources'];
    const sourcesNode = doc.getIn(sourcesPath, true) as
      | { items?: unknown[]; get?: (i: number) => unknown }
      | undefined;
    if (!sourcesNode) {
      failures.push({ c, reason: `sources-not-found at ${sourcesPath.join('.')}` });
      totalFailed++;
      continue;
    }
    const sourceNode = doc.getIn([...sourcesPath, c.sourceIndex], true) as
      | { set?: (k: string, v: unknown) => void; has?: (k: string) => boolean }
      | undefined;
    if (!sourceNode || typeof sourceNode.set !== 'function') {
      failures.push({ c, reason: `source-${c.sourceIndex}-not-found or not-a-Map` });
      totalFailed++;
      continue;
    }
    sourceNode.set('url', c.url);
    sourceNode.set('quote', c.quote);
    sourceNode.set('verifiedAt', today);
    totalApplied++;
    console.log(`OK   ${yamlFile} :: ${c.rule}[${c.sourceIndex}]`);
  }

  fs.writeFileSync(yamlPath, String(doc), 'utf8');
}

console.log(`\nSummary: applied=${totalApplied} failed=${totalFailed} total=${data.candidates.length}`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f.c.yaml} :: ${f.c.rule}[${f.c.sourceIndex}] :: ${f.reason}`);
  process.exit(1);
}
