/**
 * Domain-knowledge layer dispatcher (Task A2).
 *
 * **STATUS (2026-05-05): SPIKE DATAPOINT ONLY — NOT IN PRODUCTION PIPELINE.**
 *
 * Iteration 6 of the Big-Spec Architecture Spike (see
 * `specs/big-spec-architecture-spike-critical-review.md` §17–§19) deemed this
 * layer wrong-layer for Stage A:
 *   - apiq is spec-agnostic — it analyses ANY OpenAPI spec
 *   - Hardcoding Stripe-specific patterns competes with Spectral-custom-
 *     rulesets, not apiq's actual differentiator
 *   - Vendor knowledge belongs to LLM Phase B (the LLM has Stripe / GitHub /
 *     PagerDuty / dnd5eapi conventions in its training data and applies them
 *     via reasoning, not deterministic pattern-matching)
 *   - A3 (PD/GitHub/dnd5eapi pattern libraries) was explicitly cancelled —
 *     not built — for the same reason and the additional product-scaling
 *     constraint (a Self-Service tool can't curate libs for the long-tail of
 *     incoming specs)
 *
 * This module is **preserved as a spike datapoint** for the empirical record:
 * the 4 hardcoded Stripe patterns (F7 Idempotency-Key, F9 stripeBypass,
 * F12 Stripe-Account, F28 rate-limit) achieved 100% recall in isolated tests
 * — demonstrating the recall ceiling for Stripe-specific patterns when
 * deterministically encoded. The empirical comparison against LLM-Phase-B
 * (with v6-prompt invoking training-knowledge) is the actual spike-lock test.
 *
 * The module is no longer auto-registered by `registerDefaultRunners()` in
 * `../index.ts`. The original architecture below (heuristic detection +
 * dispatcher) is preserved verbatim for traceability.
 *
 * ----------------------------------------------------------------------------
 *
 * Detects which API-family a spec belongs to and dispatches to the matching
 * pattern library. Currently supports Stripe-class specs only; A3 will expand
 * to PagerDuty / GitHub / dnd5eapi families post-launch (each addition is a
 * new detector + a heuristic branch here).
 *
 * Public API: runDomainKnowledgeLayers(spec, opts) => DetectorFinding[]
 *
 * Stripe-class heuristic (any of the three signals below is sufficient):
 *   1. spec.info.title contains "stripe" (case-insensitive)
 *   2. spec.info.contact.url contains "stripe.com"
 *   3. spec.servers[0].url contains "stripe.com"
 *
 * Rationale: matching on (1) handles forks/mirrors of the Stripe spec that
 * keep the title; (2) covers private Stripe-derived specs that override the
 * server URL; (3) covers specs that retain Stripe's production base-URL but
 * have been retitled. The OR-combination keeps the gate generous since the
 * downstream patterns are themselves conservative on what they emit.
 *
 * The dispatcher also honors `opts.specName === 'stripe-full'` as an explicit
 * override so CLI / harness scripts can force-run the Stripe layer regardless
 * of spec metadata.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DetectorFinding, DetectorOptions } from '../types.js';
import { runStripePatterns } from './stripe.js';

interface LooseSpec {
  info?: {
    title?: unknown;
    contact?: { url?: unknown } | null;
  } | null;
  servers?: Array<{ url?: unknown } | null> | null;
}

function lowerStr(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase() : '';
}

export function isStripeSpec(spec: object): boolean {
  const obj = spec as LooseSpec;
  const title = lowerStr(obj?.info?.title);
  const contactUrl = lowerStr(obj?.info?.contact?.url);
  const serverUrl = lowerStr(Array.isArray(obj?.servers) && obj.servers[0] ? obj.servers[0]?.url : '');
  return title.includes('stripe') || contactUrl.includes('stripe.com') || serverUrl.includes('stripe.com');
}

export async function runDomainKnowledgeLayers(
  spec: object,
  opts?: DetectorOptions
): Promise<DetectorFinding[]> {
  const explicitStripe = opts?.specName === 'stripe-full' || opts?.specName === 'stripe';
  if (explicitStripe || isStripeSpec(spec)) {
    return runStripePatterns(spec, opts);
  }
  return [];
}

// ---------------------------------------------------------------------------
// CLI: `npx tsx deterministic/domain-knowledge/index.ts <spec-name>`
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const specName = process.argv[2];
  if (!specName) {
    console.error('Usage: npx tsx deterministic/domain-knowledge/index.ts <spec-name>');
    console.error('Available specs (relative to repo openapi-examples/): stripe-full, pagerduty-full, dnd5eapi, github-rest, openweathermap, stripe, pagerduty');
    process.exit(2);
  }

  // Resolve repo root: scripts/spike/deterministic/domain-knowledge/index.ts → ../../../../
  const here = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..', '..');
  const specPath = path.join(repoRoot, 'openapi-examples', specName, 'spec.json');

  let raw: string;
  try {
    raw = await readFile(specPath, 'utf-8');
  } catch (err) {
    console.error(`[domain-knowledge:cli] could not read spec at ${specPath}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  const spec = JSON.parse(raw) as object;
  const detectedAsStripe = isStripeSpec(spec);

  const startedAt = Date.now();
  const findings = await runDomainKnowledgeLayers(spec, { specName });
  const durationMs = Date.now() - startedAt;

  console.log(`\n=== Domain-Knowledge Layer — ${specName} ===`);
  console.log(`Spec path:           ${specPath}`);
  console.log(`Detected Stripe:     ${detectedAsStripe}`);
  console.log(`Findings emitted:    ${findings.length}`);
  console.log(`Runtime:             ${durationMs}ms`);

  if (findings.length === 0) {
    console.log('\n(no findings — heuristic correctly skipped this spec)');
    return;
  }

  console.log('\n--- Findings ---');
  for (const f of findings) {
    console.log(`\n[${f.detectorId}]  severity=${f.severity}  scope=${f.scope}  category=${f.category}`);
    console.log(`  title:        ${f.title}`);
    console.log(`  patchSummary: ${f.patchSummary}`);
    if (f.meta) {
      const metaSummary: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f.meta)) {
        if (Array.isArray(v) && v.length > 5) {
          metaSummary[k] = `[${v.length} items, first 5: ${JSON.stringify(v.slice(0, 5))}]`;
        } else {
          metaSummary[k] = v;
        }
      }
      console.log(`  meta:         ${JSON.stringify(metaSummary)}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`per-detector counts:`);
  const perDetector: Record<string, number> = {};
  for (const f of findings) {
    perDetector[f.detectorId] = (perDetector[f.detectorId] ?? 0) + 1;
  }
  for (const [id, c] of Object.entries(perDetector)) {
    console.log(`  ${id}: ${c}`);
  }
}

// Cross-platform-safe entry-point guard (works on Windows + Unix).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('[domain-knowledge:cli] fatal:', err);
    process.exit(1);
  });
}
