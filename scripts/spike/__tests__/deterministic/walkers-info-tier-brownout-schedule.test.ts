/**
 * Tests for walkBrownoutSchedule (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkBrownoutSchedule } from '../../deterministic/walkers/info-tier-brownout-schedule.js';

describe('walkBrownoutSchedule (Welle F)', () => {
  it('emits 0 findings when no x-brownout-schedule extension', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when x-brownout-schedule is null', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0', 'x-brownout-schedule': null },
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when x-brownout-schedule is empty array', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-brownout-schedule': [],
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding when info.x-brownout-schedule has dates', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test',
        version: '1.0',
        'x-brownout-schedule': [
          { date: '2026-06-01', durationMinutes: 30 },
          { date: '2026-06-15', durationMinutes: 60 },
        ],
      },
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:info-tier:brownout-schedule-presence');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.location).toBe('info');
  });

  it('emits info-tier finding when root x-brownout-schedule is a non-empty object', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-brownout-schedule': { '2026-06-01': '30m' },
      info: { title: 'Test', version: '1.0' },
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.location).toBe('root');
  });

  it('reports root + info location when both are present', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-brownout-schedule': { '2026-06-01': '30m' },
      info: {
        title: 'Test',
        version: '1.0',
        'x-brownout-schedule': [{ date: '2026-06-01' }],
      },
      paths: {},
    };
    const findings = await walkBrownoutSchedule(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.location).toBe('root + info');
  });
});
