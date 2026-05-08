/**
 * Tests for walkArazzoWorkflowDocument (Welle F / F6 info-tier positive-marker).
 */

import { describe, it, expect } from 'vitest';
import { walkArazzoWorkflowDocument } from '../../deterministic/walkers/info-tier-arazzo-workflow.js';

describe('walkArazzoWorkflowDocument (Welle F)', () => {
  it('emits 0 findings when no Arazzo evidence', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when x-workflows is empty array', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-workflows': [],
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits 0 findings when info.x-arazzo is null', async () => {
    const spec = {
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0', 'x-arazzo': null },
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(0);
  });

  it('emits info-tier finding when root x-workflows has content', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-workflows': [
        { workflowId: 'createUserAndOrder', steps: [{ stepId: 'step1' }] },
      ],
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.detectorId).toBe(
      'walker:info-tier:arazzo-workflow-document-presence',
    );
    expect(findings[0]?.severity).toBe('low');
    expect(findings[0]?.meta?.apiqSeverity).toBe('info');
    expect(findings[0]?.meta?.detectedVia).toContain('x-workflows (root)');
  });

  it('emits info-tier finding when info.x-arazzo points to a companion file', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test',
        version: '1.0',
        'x-arazzo': { url: './workflows.arazzo.yaml' },
      },
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.detectedVia).toContain('info.x-arazzo');
  });

  it('emits info-tier finding when info.x-workflows is a non-empty string', async () => {
    const spec = {
      openapi: '3.0.0',
      info: {
        title: 'Test',
        version: '1.0',
        'x-workflows': 'workflows.arazzo.yaml',
      },
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.meta?.detectedVia).toContain('info.x-workflows');
  });

  it('reports all detection paths when multiple are present', async () => {
    const spec = {
      openapi: '3.0.0',
      'x-workflows': [{ workflowId: 'wf1' }],
      info: {
        title: 'Test',
        version: '1.0',
        'x-arazzo': { url: './wf.yaml' },
      },
      paths: {},
    };
    const findings = await walkArazzoWorkflowDocument(spec);
    expect(findings).toHaveLength(1);
    const detectedVia = findings[0]?.meta?.detectedVia as string[];
    expect(detectedVia).toContain('x-workflows (root)');
    expect(detectedVia).toContain('info.x-arazzo');
  });
});
