/**
 * Integration test for runDeterministicLayer — verifies the full pipeline
 * (Spectral + Walkers + Module-classes) executes end-to-end against a real
 * reference spec and produces a non-empty findings list without crashing.
 *
 * This is the FIRST integration test — prior to W2, no test exercised
 * runDeterministicLayer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDeterministicLayer,
  registerDefaultRunners,
} from '../../deterministic/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('runDeterministicLayer integration', () => {
  beforeAll(async () => {
    await registerDefaultRunners();
  }, 60000); // 60s — dynamic imports can be slow under full-suite parallel load

  it('runs end-to-end on dnd5eapi without crashing and produces findings', async () => {
    const specPath = path.join(REPO_ROOT, 'openapi-examples', 'dnd5eapi', 'spec.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const result = await runDeterministicLayer(spec, { specName: 'dnd5eapi' });
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);
    // perDetector should have entries from multiple layers.
    const detectorIds = Object.keys(result.perDetector);
    expect(detectorIds.length).toBeGreaterThan(5);
    // Sanity: every emitted finding conforms to the canonical Finding-Schema
    // (mapDetectorFindings would have dropped malformed ones), so each should
    // at minimum have a non-empty title.
    expect(result.findings.every(f => typeof f.title === 'string' && f.title.length > 0)).toBe(true);
    // Q3: module-class layer is now distinct from walker-statistical. At least
    // one of the 15 wired module-classes should fire on dnd5eapi.
    expect(result.perLayer['module-class']).toBeGreaterThan(0);
  }, 90000); // 90s timeout — codegen-validation can take 30s+ on cold run

  it('runs end-to-end on stripe-full without crashing and produces findings', async () => {
    const specPath = path.join(REPO_ROOT, 'openapi-examples', 'stripe-full', 'spec.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const result = await runDeterministicLayer(spec, { specName: 'stripe-full' });
    // Threshold = 50% of measured post-Q1 count (9513) rounded down — guards
    // against pipeline-regression while tolerating natural drift.
    expect(result.findings.length).toBeGreaterThan(4000);
    expect(Object.keys(result.perDetector).length).toBeGreaterThan(10);
    expect(result.findings.every(f => typeof f.title === 'string' && f.title.length > 0)).toBe(true);
    expect(result.perLayer['module-class']).toBeGreaterThan(0);
  }, 600000); // 10min — generous for CPU/disk-load variance + codegen-typescript on stripe-full

  it('runs end-to-end on pagerduty-full without crashing and produces findings', async () => {
    const specPath = path.join(REPO_ROOT, 'openapi-examples', 'pagerduty-full', 'spec.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const result = await runDeterministicLayer(spec, { specName: 'pagerduty-full' });
    // Threshold = 50% of measured post-Q1 count (3896) rounded down.
    expect(result.findings.length).toBeGreaterThan(1500);
    expect(Object.keys(result.perDetector).length).toBeGreaterThan(10);
    expect(result.findings.every(f => typeof f.title === 'string' && f.title.length > 0)).toBe(true);
    expect(result.perLayer['module-class']).toBeGreaterThan(0);
  }, 600000);

  it('runs end-to-end on github-rest without crashing and produces findings', async () => {
    const specPath = path.join(REPO_ROOT, 'openapi-examples', 'github-rest', 'spec.json');
    const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    const result = await runDeterministicLayer(spec, { specName: 'github-rest' });
    // Threshold = 50% of measured post-Q1 count (21106) rounded down.
    expect(result.findings.length).toBeGreaterThan(10000);
    expect(Object.keys(result.perDetector).length).toBeGreaterThan(10);
    expect(result.findings.every(f => typeof f.title === 'string' && f.title.length > 0)).toBe(true);
    expect(result.perLayer['module-class']).toBeGreaterThan(0);
  }, 900000); // 15min — github-rest is the heaviest spec (21k findings; codegen alone ~5min)
});
