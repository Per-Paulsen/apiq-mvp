import 'server-only';

/**
 * Epic 04 — LLM analysis pipeline orchestration.
 *
 * Plain async function (NOT a server action — `runAnalysis` is called BY
 * server actions and the `/api/internal/analyze` route handler). No
 * `'use server'` directive.
 *
 * Responsibilities:
 *   - Daily $10 / 24h workspace budget gate (rolling sum of `LLMCall.costUSD`).
 *   - Drive `Spec.analysisStatus` lifecycle: pending → analyzing → completed | failed.
 *   - Call OpenRouter via `callLLM`, validate response against `OutputSchema`.
 *   - Persist findings + LLMCall + recompute quality score in one transaction.
 *
 * Conventions (per Epic 02 / Epic 03 results):
 *   - Returns `{ success, error }`; never throws to the caller.
 *   - Uses `Prisma.InputJsonValue` cast for Json writes.
 *   - Workspace ownership is the caller's responsibility — runAnalysis trusts
 *     its specId argument (route handler protects via INTERNAL_API_SECRET,
 *     server actions verify via session.workspaceId).
 */

import * as crypto from 'node:crypto';

import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { callLLM } from '@/lib/openrouter';
import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/analysis/prompt';
import { OutputSchema } from '@/lib/analysis/schema';
import { computeQualityScore } from '@/lib/analysis/quality-score';

// =====================================================================
// Constants
// =====================================================================

const SYSTEM_PROMPT_VERSION = 'v4';
const DAILY_BUDGET_USD = 10.0;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * OpenRouter pricing per 1M tokens (USD). Update if OpenRouter Sonnet pricing
 * changes — last verified 2026-05-02 against OpenRouter pricing page.
 *
 * Unknown model fallback: $5 / $5 per 1M tokens (conservative — keeps the
 * daily budget cap operational even if we point at a model we don't price).
 */
const MODEL_PRICING_PER_1M: Record<string, { input: number; output: number }> = {
  'anthropic/claude-sonnet-4': { input: 3, output: 15 },
};
const DEFAULT_PRICING_PER_1M = { input: 5, output: 5 };

function priceFor(model: string): { input: number; output: number } {
  return MODEL_PRICING_PER_1M[model] ?? DEFAULT_PRICING_PER_1M;
}

function costUSD(model: string, tokensIn: number, tokensOut: number): number {
  const p = priceFor(model);
  return (tokensIn * p.input + tokensOut * p.output) / 1_000_000;
}

// =====================================================================
// Result type
// =====================================================================

export type RunAnalysisError =
  | { kind: 'not_found' }
  | {
      kind: 'budget_exceeded';
      spent: number;
      limit: number;
      retryAt: string;
    }
  | { kind: 'llm_error'; message: string }
  | { kind: 'schema_validation'; message: string }
  | { kind: 'unexpected'; message: string };

export type RunAnalysisResult =
  | { success: true }
  | { success: false; error: RunAnalysisError };

// =====================================================================
// runAnalysis
// =====================================================================

export async function runAnalysis(specId: string): Promise<RunAnalysisResult> {
  // 1. Load spec.
  const spec = await prisma.spec.findUnique({
    where: { id: specId },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      currentJson: true,
      currentVersionId: true,
      endpointCount: true,
    },
  });
  if (!spec) {
    return { success: false, error: { kind: 'not_found' } };
  }
  const { workspaceId } = spec;

  // `currentVersionId` is non-null in practice — every spec is created with a
  // SpecVersion in the same transaction (Epic 03). The schema-level nullable
  // is a chicken-and-egg artifact (Spec → SpecVersion FK).
  const currentVersionId = spec.currentVersionId;
  if (!currentVersionId) {
    return {
      success: false,
      error: {
        kind: 'unexpected',
        message: 'Spec has no currentVersionId — cannot run analysis.',
      },
    };
  }

  // 2. Dollar-budget check (rolling 24h SUM(costUSD) per workspace).
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);
  const budgetAgg = await prisma.lLMCall.aggregate({
    _sum: { costUSD: true },
    where: { workspaceId, createdAt: { gt: since } },
  });
  const spent = budgetAgg._sum.costUSD ?? 0;
  if (spent >= DAILY_BUDGET_USD) {
    const oldest = await prisma.lLMCall.findFirst({
      where: { workspaceId, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const retryAtDate = oldest
      ? new Date(oldest.createdAt.getTime() + TWENTY_FOUR_HOURS_MS)
      : new Date(Date.now() + TWENTY_FOUR_HOURS_MS);
    const retryAt = retryAtDate.toISOString();
    const message = `Daily LLM budget reached ($${spent.toFixed(2)} / $${DAILY_BUDGET_USD.toFixed(2)}) — resets at ${retryAt}`;
    await prisma.spec.update({
      where: { id: specId },
      data: { analysisStatus: 'failed', analysisError: message },
    });
    return {
      success: false,
      error: {
        kind: 'budget_exceeded',
        spent,
        limit: DAILY_BUDGET_USD,
        retryAt,
      },
    };
  }

  // 3. Mark analyzing (outside the success transaction so the spinner shows).
  await prisma.spec.update({
    where: { id: specId },
    data: { analysisStatus: 'analyzing' },
  });

  // 4. Build prompt + LLMCall audit metadata.
  const userPrompt = buildUserPrompt(spec.name, spec.currentJson as object);
  const userPromptPreamble = `Spec name: ${spec.name}`;
  const specSizeBytes = Buffer.byteLength(
    JSON.stringify(spec.currentJson),
    'utf8',
  );
  const specEndpointCount = spec.endpointCount;

  // 5. Hash the system prompt for the LLMCall audit row.
  const systemPromptHash = crypto
    .createHash('sha256')
    .update(SYSTEM_PROMPT)
    .digest('hex');

  const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
  const promptAudit: Prisma.InputJsonValue = {
    systemPromptHash,
    systemPromptVersion: SYSTEM_PROMPT_VERSION,
    userPromptPreamble,
    specName: spec.name,
    specSizeBytes,
    specEndpointCount,
  };

  // 6. Call the LLM, with one schema-validation retry on top of the
  //    JSON-parse retry that callLLM does internally.
  let result: Awaited<ReturnType<typeof callLLM>>;
  let parsedOutput: ReturnType<typeof OutputSchema.parse> | null = null;
  let lastSchemaError: string | null = null;

  for (let schemaAttempt = 0; schemaAttempt < 2; schemaAttempt++) {
    try {
      result = await callLLM({ system: SYSTEM_PROMPT, user: userPrompt });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Persist failed Spec + LLMCall (best-effort — swallow inner errors).
      try {
        await prisma.spec.update({
          where: { id: specId },
          data: { analysisStatus: 'failed', analysisError: message },
        });
        await prisma.lLMCall.create({
          data: {
            workspaceId,
            specId: spec.id,
            specVersionId: currentVersionId,
            model,
            prompt: promptAudit,
            responseRaw: '',
            tokensIn: 0,
            tokensOut: 0,
            costUSD: 0,
            durationMs: 0,
            status: 'failed',
            errorMessage: message,
          },
        });
      } catch (writeErr) {
        console.error('runAnalysis: failed to persist llm_error state:', writeErr);
      }
      return { success: false, error: { kind: 'llm_error', message } };
    }

    const validation = OutputSchema.safeParse(result.parsed);
    if (validation.success) {
      parsedOutput = validation.data;
      break;
    }
    lastSchemaError = validation.error.message;
    // Retry once on schema-validation failure (separate from callLLM's
    // internal JSON.parse retry).
  }

  if (!parsedOutput) {
    const message = lastSchemaError ?? 'Schema validation failed';
    try {
      await prisma.spec.update({
        where: { id: specId },
        data: { analysisStatus: 'failed', analysisError: message },
      });
      // Record the LAST failed attempt (result is set by the loop above —
      // we know it ran at least once, otherwise we would have hit the
      // llm_error branch and returned).
      await prisma.lLMCall.create({
        data: {
          workspaceId,
          specId: spec.id,
          specVersionId: spec.currentVersionId,
          model: result!.model,
          prompt: promptAudit,
          responseRaw: result!.raw,
          tokensIn: result!.tokensIn,
          tokensOut: result!.tokensOut,
          costUSD: costUSD(result!.model, result!.tokensIn, result!.tokensOut),
          durationMs: result!.durationMs,
          status: 'failed',
          errorMessage: message,
        },
      });
    } catch (writeErr) {
      console.error('runAnalysis: failed to persist schema_validation state:', writeErr);
    }
    return { success: false, error: { kind: 'schema_validation', message } };
  }

  // 7. Success path — atomically delete prior open findings, insert new ones,
  //    recompute quality score, update spec, write success LLMCall.
  const callResult = result!;
  const newFindings = parsedOutput.findings;
  const callCost = costUSD(callResult.model, callResult.tokensIn, callResult.tokensOut);

  try {
    await prisma.$transaction(async (tx) => {
      // Delete prior open findings (history-preserving — applied/rejected/
      // stale/outdated rows are kept per AC #4).
      await tx.finding.deleteMany({
        where: { specId: spec.id, status: 'open' },
      });

      // Insert new findings (status defaults to 'open').
      if (newFindings.length > 0) {
        await tx.finding.createMany({
          data: newFindings.map((f) => ({
            specId: spec.id,
            specVersionId: currentVersionId,
            scope: f.scope,
            affectedEndpoints: f.affectedEndpoints as unknown as Prisma.InputJsonValue,
            category: f.category,
            severity: f.severity,
            title: f.title,
            narration: f.narration,
            rationale: f.rationale,
            patchSummary: f.patchSummary,
            patchOps: f.patchOps as unknown as Prisma.InputJsonValue,
          })),
        });
      }

      // Compute score from the new opens — applied/rejected don't count
      // toward the score so we don't need to re-query the history.
      const scoreInput = newFindings.map((f) => ({
        status: 'open' as const,
        severity: f.severity,
      }));
      // computeQualityScore expects the Prisma row shape; only `status` and
      // `severity` are read so the cast is sound.
      const qualityScore = computeQualityScore(
        scoreInput as unknown as Parameters<typeof computeQualityScore>[0],
      );

      await tx.spec.update({
        where: { id: spec.id },
        data: {
          qualityScore,
          lastAnalyzedAt: new Date(),
          analysisStatus: 'completed',
          analysisError: null,
        },
      });

      await tx.lLMCall.create({
        data: {
          workspaceId,
          specId: spec.id,
          specVersionId: spec.currentVersionId,
          model: callResult.model,
          prompt: promptAudit,
          responseRaw: callResult.raw,
          tokensIn: callResult.tokensIn,
          tokensOut: callResult.tokensOut,
          costUSD: callCost,
          durationMs: callResult.durationMs,
          status: 'success',
          errorMessage: null,
        },
      });
    });
  } catch (err) {
    // Transaction failed (DB hiccup) — leave Spec in 'failed' state and
    // write a failed LLMCall outside the (now-rolled-back) transaction.
    const message = err instanceof Error ? err.message : String(err);
    try {
      await prisma.spec.update({
        where: { id: specId },
        data: { analysisStatus: 'failed', analysisError: message },
      });
      await prisma.lLMCall.create({
        data: {
          workspaceId,
          specId: spec.id,
          specVersionId: spec.currentVersionId,
          model: callResult.model,
          prompt: promptAudit,
          responseRaw: callResult.raw,
          tokensIn: callResult.tokensIn,
          tokensOut: callResult.tokensOut,
          costUSD: callCost,
          durationMs: callResult.durationMs,
          status: 'failed',
          errorMessage: message,
        },
      });
    } catch (writeErr) {
      console.error('runAnalysis: failed to persist tx-failure state:', writeErr);
    }
    return { success: false, error: { kind: 'unexpected', message } };
  }

  return { success: true };
}
