/**
 * Welle Arch+ A3 — FUNCTION_METADATA coverage gate.
 *
 * Verifies that every custom Spectral function registered in
 * `APIQ_CUSTOM_FUNCTIONS` has a matching entry in
 * `APIQ_CUSTOM_FUNCTION_METADATA`, with structurally-valid metadata
 * (kebab-name match, ≥1 patternId, lens within the 10-lens enum,
 * perfClass within the closed enum). Cross-validates patternIds
 * against `patterns.json` for drift-detection.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APIQ_CUSTOM_FUNCTIONS,
  APIQ_CUSTOM_FUNCTION_METADATA,
} from '../../deterministic/infra/spectral-runner.js';
import {
  VALID_LENSES,
  VALID_PERF_CLASSES,
} from '../../deterministic/spectral-functions/_metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface PatternRecord {
  patternId: string;
  [k: string]: unknown;
}

const PATTERNS_JSON_PATH = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'patterns.json',
);

function loadPatternIds(): Set<string> {
  if (!fs.existsSync(PATTERNS_JSON_PATH)) return new Set();
  const raw = JSON.parse(
    fs.readFileSync(PATTERNS_JSON_PATH, 'utf8'),
  ) as PatternRecord[];
  return new Set(raw.map((p) => p.patternId));
}

describe('APIQ_CUSTOM_FUNCTION_METADATA coverage', () => {
  const fnNames = Object.keys(APIQ_CUSTOM_FUNCTIONS);
  const metaNames = Object.keys(APIQ_CUSTOM_FUNCTION_METADATA);

  it('covers every registered custom function', () => {
    expect(metaNames.length).toBe(fnNames.length);
    for (const fn of fnNames) {
      expect(APIQ_CUSTOM_FUNCTION_METADATA[fn], `metadata missing for ${fn}`).toBeDefined();
    }
  });

  it('has no metadata-entries for unregistered functions', () => {
    for (const m of metaNames) {
      expect(APIQ_CUSTOM_FUNCTIONS[m], `metadata for unknown function ${m}`).toBeDefined();
    }
  });

  it.each(metaNames)('%s — name field matches map key', (key) => {
    const meta = APIQ_CUSTOM_FUNCTION_METADATA[key]!;
    expect(meta.name).toBe(key);
  });

  it.each(metaNames)('%s — has ≥1 non-empty patternId', (key) => {
    const meta = APIQ_CUSTOM_FUNCTION_METADATA[key]!;
    expect(Array.isArray(meta.patternIds)).toBe(true);
    expect(meta.patternIds.length).toBeGreaterThan(0);
    for (const pid of meta.patternIds) {
      expect(typeof pid).toBe('string');
      expect(pid.length).toBeGreaterThan(0);
    }
  });

  it.each(metaNames)('%s — lens is from the 10-lens closed-set', (key) => {
    const meta = APIQ_CUSTOM_FUNCTION_METADATA[key]!;
    expect(VALID_LENSES).toContain(meta.lens);
  });

  it.each(metaNames)('%s — perfClass is from the closed enum', (key) => {
    const meta = APIQ_CUSTOM_FUNCTION_METADATA[key]!;
    expect(VALID_PERF_CLASSES).toContain(meta.perfClass);
  });

  it.each(metaNames)('%s — description is a non-empty short string', (key) => {
    const meta = APIQ_CUSTOM_FUNCTION_METADATA[key]!;
    expect(typeof meta.description).toBe('string');
    expect(meta.description.length).toBeGreaterThan(10);
    expect(meta.description.length).toBeLessThan(220);
  });
});

describe('APIQ_CUSTOM_FUNCTION_METADATA cross-validation against patterns.json', () => {
  const patternIds = loadPatternIds();

  it('patterns.json loads with content', () => {
    expect(patternIds.size).toBeGreaterThan(100);
  });

  /**
   * Drift-flag list: known patternIds that exist on YAML rules but were not
   * present in patterns.json at the time A3 metadata was authored. These are
   * legitimate drift between YAML and patterns.json — the A1 lint-tool will
   * flag them in CI; this test merely documents them so future drift is
   * visible.
   */
  const KNOWN_DRIFT: ReadonlySet<string> = new Set([
    'EV-15',
    'EV-20',
    'EV-51',
    'EV-54',
    'EV-61',
  ]);

  it('all metadata patternIds either exist in patterns.json or are known-drift', () => {
    const undocumentedDrift: Array<{ fn: string; pid: string }> = [];
    for (const [fn, meta] of Object.entries(APIQ_CUSTOM_FUNCTION_METADATA)) {
      for (const pid of meta.patternIds) {
        if (!patternIds.has(pid) && !KNOWN_DRIFT.has(pid)) {
          undocumentedDrift.push({ fn, pid });
        }
      }
    }
    if (undocumentedDrift.length > 0) {
      console.warn(
        'A3 metadata-vs-patterns.json undocumented drift:',
        undocumentedDrift,
      );
    }
    expect(undocumentedDrift).toEqual([]);
  });
});
