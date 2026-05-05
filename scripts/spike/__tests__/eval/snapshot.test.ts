import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  lockSnapshot,
  loadSnapshot,
  diffAgainstSnapshot,
  type Snapshot,
} from '../../eval/snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mirror the snapshot.ts SNAPSHOTS_DIR resolution so cleanup-hooks remove
// exactly the same file the module wrote.
const SNAPSHOTS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'eval',
  'snapshots'
);

const PRODUCTION_SNAPSHOT = 'c-i-baseline-stripe';

// Track configs created during a test so afterEach can clean them up.
const createdConfigs = new Set<string>();

function uniqueConfigName(): string {
  const name = `test-snapshot-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  createdConfigs.add(name);
  return name;
}

afterEach(() => {
  for (const name of createdConfigs) {
    // Hard-guard: never delete the production snapshot, even if a test name
    // somehow collides.
    if (name === PRODUCTION_SNAPSHOT) continue;
    const filePath = path.join(SNAPSHOTS_DIR, `${name}.json`);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // Best-effort cleanup; ignore.
    }
  }
  createdConfigs.clear();
});

function buildMetrics(over: Partial<Snapshot['metrics']> = {}): Snapshot['metrics'] {
  return {
    findingCount: { mean: 1000, std: 0 },
    costUSD: { mean: 5.0, std: 0 },
    durationMs: { mean: 60000, std: 0 },
    applyCleanRate: { mean: 0.95, std: 0 },
    halluRate: { mean: 0.02, std: 0 },
    coverageRate: 0.5,
    substantiveCoverageRate: 0.4,
    knowledgeBackedCoverageRate: 0.3,
    repetitionRate: 0.3,
    uniqueClusters: 700,
    ...over,
  };
}

describe('lockSnapshot + loadSnapshot round-trip', () => {
  it('locks then loads back the same metrics', () => {
    const configName = uniqueConfigName();
    const metrics = buildMetrics();
    const result = lockSnapshot({
      configName,
      spec: 'test-spec',
      metrics,
      notes: 'unit-test',
    });
    expect(result.written).toBe(true);
    expect(fs.existsSync(result.path)).toBe(true);

    const loaded = loadSnapshot(configName);
    expect(loaded).not.toBeNull();
    expect(loaded!.configName).toBe(configName);
    expect(loaded!.spec).toBe('test-spec');
    expect(loaded!.metrics).toEqual(metrics);
    // lockedBy is either a git SHA or 'manual'.
    expect(loaded!.lockedBy).toMatch(/^[a-f0-9]+$|^manual$/);
    expect(loaded!.notes).toBe('unit-test');
  });
});

describe('loadSnapshot', () => {
  it('returns null on a nonexistent config without throwing', () => {
    const configName = uniqueConfigName(); // never written
    // Remove from createdConfigs since nothing to clean.
    createdConfigs.delete(configName);
    expect(loadSnapshot(configName)).toBeNull();
  });
});

describe('diffAgainstSnapshot — no locked snapshot', () => {
  it('returns hasSnapshot=false / withinTolerance=true with friendly markdown', () => {
    const configName = uniqueConfigName();
    createdConfigs.delete(configName); // nothing written
    const report = diffAgainstSnapshot({
      configName,
      currentMetrics: buildMetrics(),
    });
    expect(report.hasSnapshot).toBe(false);
    expect(report.withinTolerance).toBe(true);
    expect(report.markdownReport).toMatch(/Run.*lock.*to create one/i);
  });
});

describe('diffAgainstSnapshot — self-diff', () => {
  it('reports all metrics within tolerance when locked metrics match current', () => {
    const configName = uniqueConfigName();
    const metrics = buildMetrics();
    lockSnapshot({ configName, spec: 'test-spec', metrics });

    const report = diffAgainstSnapshot({
      configName,
      currentMetrics: metrics,
    });
    expect(report.hasSnapshot).toBe(true);
    expect(report.withinTolerance).toBe(true);
    for (const row of report.perMetric) {
      expect(row.withinTolerance).toBe(true);
    }
  });
});

describe('diffAgainstSnapshot — out-of-tolerance', () => {
  it('flags an offending metric and contains "Outside" in its status cell', () => {
    const configName = uniqueConfigName();
    const baseline = buildMetrics({ costUSD: { mean: 5.0, std: 0 } });
    lockSnapshot({ configName, spec: 'test-spec', metrics: baseline });

    // costUSD jumps from 5.00 to 10.00 → +100% > default tolerance of 20%.
    const current = buildMetrics({ costUSD: { mean: 10.0, std: 0 } });
    const report = diffAgainstSnapshot({ configName, currentMetrics: current });
    expect(report.hasSnapshot).toBe(true);
    expect(report.withinTolerance).toBe(false);
    const costRow = report.perMetric.find((r) => r.metric === 'costUSD');
    expect(costRow).toBeDefined();
    expect(costRow!.withinTolerance).toBe(false);
    expect(report.markdownReport).toContain('Outside');
  });
});

describe('diffAgainstSnapshot — improvement vs regression labelling', () => {
  it('labels a 50% halluRate drop as "improvement" (lower-better)', () => {
    const configName = uniqueConfigName();
    const baseline = buildMetrics({ halluRate: { mean: 0.10, std: 0 } });
    lockSnapshot({ configName, spec: 'test-spec', metrics: baseline });

    // Drop from 0.10 to 0.05 → -50%, exceeds default 5% tolerance.
    const current = buildMetrics({ halluRate: { mean: 0.05, std: 0 } });
    const report = diffAgainstSnapshot({ configName, currentMetrics: current });
    expect(report.markdownReport).toMatch(/improvement/i);
  });

  it('labels a 50% coverageRate drop as "regression" (higher-better)', () => {
    const configName = uniqueConfigName();
    const baseline = buildMetrics({ coverageRate: 0.6 });
    lockSnapshot({ configName, spec: 'test-spec', metrics: baseline });

    // Drop from 0.6 to 0.3 → -50%, exceeds default 10% tolerance.
    const current = buildMetrics({ coverageRate: 0.3 });
    const report = diffAgainstSnapshot({ configName, currentMetrics: current });
    expect(report.markdownReport).toMatch(/regression/i);
  });
});
