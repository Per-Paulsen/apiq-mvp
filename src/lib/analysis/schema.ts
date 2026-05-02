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
  title: z.string().min(1).max(120),
  narration: z.string().min(200).max(1500),
  // Relaxed from 100 in v3 — polish findings (typos, schema-naming) don't need 100-char rationale.
  rationale: z.string().min(50).max(800),
  category: z.enum(['clarity', 'design', 'risk']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  scope: z.enum(['spec', 'endpoint']),
  affectedEndpoints: z.array(AffectedEndpointSchema),
  patchOps: z.array(PatchOpSchema),
  patchSummary: z.string().min(1).max(120),
});

export const OutputSchema = z.object({
  findings: z.array(FindingSchema),
});

export type PatchOp = z.infer<typeof PatchOpSchema>;
export type AffectedEndpoint = z.infer<typeof AffectedEndpointSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Output = z.infer<typeof OutputSchema>;
