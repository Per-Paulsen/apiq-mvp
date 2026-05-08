/**
 * Tests for walkSla4oaiPresence (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkSla4oaiPresence } from '../../deterministic/walkers/info-tier-sla4oai.js';

describe('walkSla4oaiPresence (Welle F)', () => {
  it('emits 0 findings when info.x-sla / info.x-sla4oai absent', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    };
    const findings = await walkSla4oaiPresence(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when info block is absent', async () => {
    const spec = { openapi: '3.0.0', paths: {} };
    const findings = await walkSla4oaiPresence(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when x-sla is null', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0', 'x-sla': null },
      paths: {},
    };
    const findings = await walkSla4oaiPresence(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding when info.x-sla is a non-empty object', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test',
        version: '1.0',
        'x-sla': { availability: '99.9%', latencyP99Ms: 250 },
      },
      paths: {},
    };
    const findings = await walkSla4oaiPresence(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe('walker:info-tier:sla4oai-presence');
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.positiveMarker).toBe(true);
    expect(findings[0]?.meta?.extensionKey).toBe('x-sla');
    expect(findings[0]?.title).toContain('SLA4OAI');
  });

  it('prefers x-sla4oai when both forms are present', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test',
        version: '1.0',
        'x-sla4oai': { context: { sla: '4.0' } },
        'x-sla': { availability: '99.9%' },
      },
      paths: {},
    };
    const findings = await walkSla4oaiPresence(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.extensionKey).toBe('x-sla4oai');
  });
});
