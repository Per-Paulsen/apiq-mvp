import { z } from 'zod';

/**
 * RFC 6902 JSON Patch operation.
 * `value` is required for `add`, `replace`, `test`; absent for `remove`.
 * `from` is required for `move` and `copy` (kept optional here so the
 * schema can validate any shape the LLM emits — the patch validator
 * downstream applies stricter per-op checks).
 */
export const PatchOpSchema = z.object({
  op: z.enum(['add', 'remove', 'replace', 'move', 'copy', 'test']),
  path: z.string().min(1),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

export const AffectedEndpointSchema = z.object({
  path: z.string().min(1),
  method: z.string().min(1),
});

export const FindingSchema = z.object({
  title: z.string().min(1).max(200),
  // Stage-3 relax (was 200..1500): some models (Grok 4.1 Fast) emit shorter narrations
  // even with the prompt's 200-char floor. Lower bound keeps the field non-empty
  // while allowing terser models to deliver structured output.
  narration: z.string().min(50).max(2000),
  // Stage-3 relax (was 50..800): same reasoning — Grok emits short rationales.
  rationale: z.string().min(20).max(1000),
  category: z.enum(['clarity', 'design', 'risk']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  scope: z.enum(['spec', 'endpoint']),
  affectedEndpoints: z.array(AffectedEndpointSchema),
  patchOps: z.array(PatchOpSchema),
  // Stage-3 relax (was 120): Sonnet 4.6 / Opus 4.7 frequently emit slightly-longer
  // patchSummary phrases even with the prompt's 120-char floor. 200 is the
  // practical compromise; UI rendering can truncate at display time if needed.
  patchSummary: z.string().min(1).max(200),
});

export const OutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type AffectedEndpoint = z.infer<typeof AffectedEndpointSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Output = z.infer<typeof OutputSchema>;
