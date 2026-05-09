/**
 * Arazzo-workflow-document walker — Welle F (F6) Lens-9 (AI-Agent-Consumability)
 * positive-marker.
 *
 * Detects evidence of an Arazzo workflow-document linked to or embedded in
 * the OpenAPI spec. Arazzo is the OpenAPI Initiative's standard for
 * specifying multi-step API workflows (sequences of operations with
 * dependencies, retries, and branching) — essentially "OpenAPI for
 * workflows", introduced 2024 and emphasized at OpenAPI conferences as the
 * canonical AI-agent-consumability artefact (R4-CT-AI-01 mining-output).
 *
 * Three detection paths (any of these signals presence):
 *   1. `spec.x-workflows` extension exists and has meaningful content
 *      (root-level workflow definitions inline)
 *   2. `spec.info.x-arazzo` extension exists (linking metadata pointing to
 *      a companion Arazzo document)
 *   3. `spec.info.x-workflows` extension exists (alternative linking form)
 *
 * Note: We do NOT detect via filesystem-companion (`workflows.arazzo.yaml`
 * adjacent to the spec) — walker operates on the in-memory spec object only.
 * Companion-file detection is deferred to a future filesystem-aware variant.
 *
 * Sources:
 *   - Arazzo specification (https://github.com/OAI/Arazzo-Specification)
 *   - Round-4 conference-talk mining (R4-CT-AI-01 — OpenAPI 2025 emphasis)
 *   - Plan-doc §5 F6: ai-agent-consumability-marker
 *
 * Lens: 9 (AI-Agent-Consumability) + 10 (Operational-Metadata)
 * Round: 4 (positive-marker, info-tier emission)
 *
 * Detection rules (conservative + zero-FP):
 *   - Extension values must be non-null + meaningful (non-empty object or
 *     non-empty array or non-empty string).
 *   - At least ONE of the three detection paths must succeed.
 */

import type { DetectorFinding, DetectorOptions } from '../infra/types.js';

function isMeaningful(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0;
  return false;
}

export async function walkArazzoWorkflowDocument(
  spec: object,
  _opts?: DetectorOptions,
): Promise<DetectorFinding[]> {
  const root = spec as Record<string, unknown>;

  const hasRootWorkflows = isMeaningful(root['x-workflows']);

  let hasInfoArazzo = false;
  let hasInfoWorkflows = false;
  const info = root.info;
  if (info && typeof info === 'object') {
    const infoObj = info as Record<string, unknown>;
    hasInfoArazzo = isMeaningful(infoObj['x-arazzo']);
    hasInfoWorkflows = isMeaningful(infoObj['x-workflows']);
  }

  if (!hasRootWorkflows && !hasInfoArazzo && !hasInfoWorkflows) return [];

  const detectedVia: string[] = [];
  if (hasRootWorkflows) detectedVia.push('x-workflows (root)');
  if (hasInfoArazzo) detectedVia.push('info.x-arazzo');
  if (hasInfoWorkflows) detectedVia.push('info.x-workflows');

  const sourcePath = hasRootWorkflows
    ? '/x-workflows'
    : (hasInfoArazzo ? '/info/x-arazzo' : '/info/x-workflows');

  return [{
    detectorId: 'walker:info-tier:arazzo-workflow-document-presence',
    layer: 'walker-statistical',
    title: `Arazzo workflow-document declared (${detectedVia.join(', ')})`,
    narration:
      `Spec carries Arazzo workflow-document evidence via ${detectedVia.join(', ')}. ` +
      `Arazzo (OpenAPI Initiative standard, 2024) specifies multi-step API workflows — ` +
      `sequences of operations with dependencies, retries, and branching — i.e. "OpenAPI ` +
      `for workflows". Round-4 conference-talk mining (R4-CT-AI-01) identified Arazzo as ` +
      `the canonical AI-agent-consumability artefact: agentic clients consume the workflow ` +
      `document to plan multi-step task execution instead of inferring step-sequences from ` +
      `endpoint descriptions alone. Presence is a positive AI-agent-consumability marker ` +
      `(Lens-9). (Informational — no action required.)`,
    rationale:
      'Round-4 conference-talk mining (R4-CT-AI-01) identified Arazzo as the OpenAPI ' +
      'Initiative\'s answer to AI-agent-consumability: workflow-documents specify ' +
      'multi-step task execution declaratively, letting agentic SDKs avoid ad-hoc step ' +
      'sequencing. Detecting linking-evidence as a positive marker (info-tier) lets apiq ' +
      'surface AI-agent-ready specs without false-flagging absence as a defect.',
    category: 'design',
    severity: 'low',
    scope: 'spec',
    affectedEndpoints: [],
    patchOps: [],
    patchSummary: '(Positive marker — no patch required.)',
    sourcePath,
    meta: {
      apiqSeverity: 'info',
      lens: ['ai-agent-consumability', 'operational-metadata'],
      positiveMarker: true,
      detectedVia,
      patternId: 'F6-INFO-ARAZZO',
      infoTier: true,
    },
  }];
}
