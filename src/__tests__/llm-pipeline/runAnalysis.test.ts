/**
 * `runAnalysis` integration tests (Epic 04 AC #2-#10).
 *
 * Strategy:
 *   - `@/lib/prisma` and `@/lib/openrouter` are mocked aggressively (no DB,
 *     no network).
 *   - `@/lib/analysis/{prompt,schema,quality-score,stringify-spec}` are NOT
 *     mocked — they're pure modules and the goal is integration coverage.
 *   - The `prisma.$transaction` mock invokes its callback with a `tx` proxy
 *     mirroring the prisma surface used in the runAnalysis success path,
 *     stashing the latest tx at `__lastTx` for assertions.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    spec: { findUnique: vi.fn(), update: vi.fn() },
    lLMCall: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    finding: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/openrouter', () => ({
  callLLM: vi.fn(),
}));

// ---- Imports (after mocks) -------------------------------------------------

import { runAnalysis } from '@/lib/analysis/runAnalysis';
import { callLLM } from '@/lib/openrouter';
import { prisma } from '@/lib/prisma';

// ---- Fixtures --------------------------------------------------------------

// Pad strings so the zod schema's min(200) / min(50) constraints pass.
const NARRATION = (
  'This is a sample narration explaining the issue in detail. ' +
  'It needs to be at least 200 characters long to satisfy the zod schema constraint. ' +
  'The point is that the narration carries the WHY of the finding, references concrete spec fields, and stays grounded in actual OpenAPI semantics rather than generic linter rules.'
).repeat(1);
const RATIONALE =
  'Grounded in REST API design principles around stable pagination and resource modelling.';

const SAMPLE_FINDING = {
  title: 'Sample finding 1',
  narration: NARRATION,
  rationale: RATIONALE,
  category: 'design',
  severity: 'high',
  scope: 'endpoint',
  affectedEndpoints: [{ path: '/users', method: 'get' }],
  patchOps: [{ op: 'add', path: '/paths/~1users/get/parameters/0', value: {} }],
  patchSummary: 'Adds cursor parameter to /users for stable pagination',
} as const;

const SECOND_FINDING = {
  title: 'Sample finding 2',
  narration: NARRATION,
  rationale: RATIONALE,
  category: 'risk',
  severity: 'critical',
  scope: 'spec',
  affectedEndpoints: [],
  patchOps: [],
  patchSummary: 'Adds global security requirement',
} as const;

const SAMPLE_LLM_OUTPUT = {
  findings: [SAMPLE_FINDING, SECOND_FINDING],
};

const TINY_SPEC_JSON = {
  openapi: '3.0.0',
  info: { title: 'Tiny', version: '1.0' },
  paths: {
    '/users': {
      get: { responses: { '200': { description: 'ok' } } },
    },
  },
};

const RECURSIVE_SPEC_JSON = {
  openapi: '3.0.0',
  info: { title: 'Recursive', version: '1.0' },
  paths: {},
  components: {
    schemas: {
      TreeNode: {
        type: 'object',
        properties: {
          children: {
            type: 'array',
            items: { $ref: '#cyclic' },
          },
        },
      },
    },
  },
};

const SPEC_ID = 'spec-id-1';
const VERSION_ID = 'version-id-1';
const WORKSPACE_ID = 'workspace-id-1';

// Bypass `Spec.currentJson is Prisma.JsonValue` typing in the test fixtures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpecMock = any;

function defaultSpecRow(overrides: Partial<Record<string, unknown>> = {}): SpecMock {
  return {
    id: SPEC_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Tiny Spec',
    currentJson: TINY_SPEC_JSON,
    currentVersionId: VERSION_ID,
    endpointCount: 1,
    ...overrides,
  };
}

function defaultLLMResult() {
  return {
    raw: JSON.stringify(SAMPLE_LLM_OUTPUT),
    parsed: SAMPLE_LLM_OUTPUT,
    tokensIn: 1000,
    tokensOut: 500,
    durationMs: 1234,
    model: 'anthropic/claude-sonnet-4',
  };
}

// ---- Transaction mock helpers ---------------------------------------------

function setupTransactionMock() {
  vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
    const tx = {
      spec: {
        update: vi.fn(async (args: unknown) => args),
      },
      finding: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(async () => ({ count: 0 })),
      },
      lLMCall: {
        create: vi.fn(async (args: unknown) => args),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.$transaction as any).__lastTx = tx;
    return await (cb as (t: typeof tx) => Promise<unknown>)(tx);
  });
}

function getLastTx() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma.$transaction as any).__lastTx as {
    spec: { update: ReturnType<typeof vi.fn> };
    finding: {
      deleteMany: ReturnType<typeof vi.fn>;
      createMany: ReturnType<typeof vi.fn>;
    };
    lLMCall: { create: ReturnType<typeof vi.fn> };
  };
}

// ---- beforeEach ------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Default: no prior LLM cost.
  vi.mocked(prisma.lLMCall.aggregate).mockResolvedValue({
    _sum: { costUSD: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  // Default: callLLM resolves with a valid response.
  vi.mocked(callLLM).mockResolvedValue(defaultLLMResult());
});

// =====================================================================
// Happy path
// =====================================================================

describe('runAnalysis happy path (AC #2, #3)', () => {
  it('marks analyzing, calls LLM, persists findings + LLMCall, updates Spec', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({ success: true });

    // 1. analyzing marker (set BEFORE the transaction so the spinner shows).
    const updateCalls = vi.mocked(prisma.spec.update).mock.calls;
    expect(updateCalls[0][0]).toMatchObject({
      where: { id: SPEC_ID },
      data: { analysisStatus: 'analyzing' },
    });

    // 2. LLM was called once.
    expect(callLLM).toHaveBeenCalledTimes(1);

    // 3. Transaction body wrote the expected things.
    const tx = getLastTx();

    // deleteMany only on status='open' (history-preserving; AC #4).
    expect(tx.finding.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.finding.deleteMany).toHaveBeenCalledWith({
      where: { specId: SPEC_ID, status: 'open' },
    });

    // createMany got both fixture findings.
    expect(tx.finding.createMany).toHaveBeenCalledTimes(1);
    const createArgs = tx.finding.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };
    expect(createArgs.data).toHaveLength(2);
    expect(createArgs.data[0]).toMatchObject({
      specId: SPEC_ID,
      specVersionId: VERSION_ID,
      severity: 'high',
      category: 'design',
      scope: 'endpoint',
    });

    // Spec was updated with quality score + completion marker.
    expect(tx.spec.update).toHaveBeenCalledTimes(1);
    const specUpdate = tx.spec.update.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(specUpdate.where).toEqual({ id: SPEC_ID });
    expect(specUpdate.data).toMatchObject({
      analysisStatus: 'completed',
      analysisError: null,
    });
    expect(specUpdate.data.qualityScore).toBe(78); // 100 - (15 + 7) = 78 (1 critical, 1 high)
    expect(specUpdate.data.lastAnalyzedAt).toBeInstanceOf(Date);

    // Successful LLMCall row.
    expect(tx.lLMCall.create).toHaveBeenCalledTimes(1);
    const callArgs = tx.lLMCall.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data).toMatchObject({
      workspaceId: WORKSPACE_ID,
      specId: SPEC_ID,
      specVersionId: VERSION_ID,
      status: 'success',
      tokensIn: 1000,
      tokensOut: 500,
      errorMessage: null,
    });
    expect(callArgs.data.responseRaw).toBe(JSON.stringify(SAMPLE_LLM_OUTPUT));
  });
});

// =====================================================================
// AC #4 — re-analysis preserves history
// =====================================================================

describe('runAnalysis re-analysis (AC #4)', () => {
  it('only deletes status="open" findings (does not wildcard-delete history)', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    await runAnalysis(SPEC_ID);

    const tx = getLastTx();
    // Critical: the WHERE clause must include `status: 'open'` so prior
    // applied / rejected / stale / outdated rows are preserved as history.
    expect(tx.finding.deleteMany).toHaveBeenCalledWith({
      where: { specId: SPEC_ID, status: 'open' },
    });
  });
});

// =====================================================================
// AC #5 / AC #6 — LLM throw bookkeeping
// =====================================================================

describe('runAnalysis on callLLM failure (AC #5, #6)', () => {
  it('AC #5 — exhausted-retries error → marks failed, writes failed LLMCall, returns llm_error', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    vi.mocked(callLLM).mockRejectedValueOnce(
      new Error('callLLM: exhausted retries — 502 Bad Gateway'),
    );

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({
      success: false,
      error: {
        kind: 'llm_error',
        message: 'callLLM: exhausted retries — 502 Bad Gateway',
      },
    });

    // Spec.update calls: 1) analyzing, 2) failed.
    const updateCalls = vi.mocked(prisma.spec.update).mock.calls;
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1][0]).toMatchObject({
      where: { id: SPEC_ID },
      data: {
        analysisStatus: 'failed',
        analysisError: 'callLLM: exhausted retries — 502 Bad Gateway',
      },
    });

    // Failed LLMCall row written outside the success transaction.
    const llmCallCreate = vi.mocked(prisma.lLMCall.create);
    expect(llmCallCreate).toHaveBeenCalledTimes(1);
    expect(llmCallCreate.mock.calls[0][0]).toMatchObject({
      data: {
        workspaceId: WORKSPACE_ID,
        specId: SPEC_ID,
        status: 'failed',
        errorMessage: 'callLLM: exhausted retries — 502 Bad Gateway',
      },
    });
    // The success-path transaction was NOT entered.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('AC #6 — 4xx-equivalent throw is bookkept identically to 5xx exhaustion', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    // runAnalysis can't observe whether callLLM retried or not — it just
    // sees the final throw. AC #6 requires the same failure-path
    // bookkeeping as AC #5; this test documents that.
    vi.mocked(callLLM).mockRejectedValueOnce(new Error('400 Bad Request'));

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({
      success: false,
      error: { kind: 'llm_error', message: '400 Bad Request' },
    });

    // Same bookkeeping as the 5xx case.
    expect(prisma.spec.update).toHaveBeenLastCalledWith({
      where: { id: SPEC_ID },
      data: { analysisStatus: 'failed', analysisError: '400 Bad Request' },
    });
    expect(prisma.lLMCall.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'failed',
        errorMessage: '400 Bad Request',
      }),
    });
  });
});

// =====================================================================
// AC #7 — fence-stripped JSON parses correctly (already done by callLLM,
// runAnalysis just sees the parsed object)
// =====================================================================

describe('runAnalysis fence-stripped response (AC #7)', () => {
  it('happily consumes a parsed result from callLLM', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();
    // callLLM has already done its fence-strip; runAnalysis sees the
    // parsed object.
    vi.mocked(callLLM).mockResolvedValue(defaultLLMResult());

    const result = await runAnalysis(SPEC_ID);
    expect(result).toEqual({ success: true });
  });
});

// =====================================================================
// AC #7a — recursive cycle markers do not crash
// =====================================================================

describe('runAnalysis on a spec with cycle markers (AC #7a)', () => {
  it('does not crash on JSON.stringify when currentJson contains $ref:#cyclic markers', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(
      defaultSpecRow({ currentJson: RECURSIVE_SPEC_JSON, endpointCount: 0 }),
    );
    setupTransactionMock();

    const result = await runAnalysis(SPEC_ID);
    expect(result).toEqual({ success: true });

    // Sanity: callLLM was reached (so prompt-build did not throw).
    expect(callLLM).toHaveBeenCalledTimes(1);
  });
});

// =====================================================================
// AC #8 — schema validation retry
// =====================================================================

describe('runAnalysis schema validation (AC #8)', () => {
  it('all findings invalid twice → calls LLM twice, marks failed, writes failed LLMCall, returns schema_validation', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    // Two responses where every finding is malformed (1 finding, missing required fields).
    const badResult = {
      ...defaultLLMResult(),
      parsed: { findings: [{ title: 'too short' }] },
    };
    vi.mocked(callLLM)
      .mockResolvedValueOnce(badResult)
      .mockResolvedValueOnce(badResult);

    const result = await runAnalysis(SPEC_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('schema_validation');
    if (result.error.kind !== 'schema_validation') return;
    expect(typeof result.error.message).toBe('string');

    // callLLM called twice (initial + 1 schema-validation retry).
    expect(callLLM).toHaveBeenCalledTimes(2);

    // Spec.update calls: 1) analyzing, 2) failed.
    const updateCalls = vi.mocked(prisma.spec.update).mock.calls;
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[1][0]).toMatchObject({
      where: { id: SPEC_ID },
      data: { analysisStatus: 'failed' },
    });

    // Failed LLMCall row records the LAST raw response.
    const llmCallCreate = vi.mocked(prisma.lLMCall.create);
    expect(llmCallCreate).toHaveBeenCalledTimes(1);
    const callArgs = llmCallCreate.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(callArgs.data).toMatchObject({
      status: 'failed',
      responseRaw: badResult.raw,
    });
  });

  it('all findings invalid once then valid → returns success after retry', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    const badResult = {
      ...defaultLLMResult(),
      parsed: { findings: [{ title: 'bad' }] },
    };
    vi.mocked(callLLM)
      .mockResolvedValueOnce(badResult)
      .mockResolvedValueOnce(defaultLLMResult());

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({ success: true });
    expect(callLLM).toHaveBeenCalledTimes(2);
    // Successful transaction was entered.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('response shape invalid (no findings array) → retries once', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    // Response missing the `findings` array entirely → must retry.
    const noFindingsArray = {
      ...defaultLLMResult(),
      parsed: { wrong_key: [] },
    };
    vi.mocked(callLLM)
      .mockResolvedValueOnce(noFindingsArray)
      .mockResolvedValueOnce(defaultLLMResult());

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({ success: true });
    expect(callLLM).toHaveBeenCalledTimes(2);
  });
});

// =====================================================================
// Partial output: filter invalid findings, keep valid ones
// (post-draft fix per user review 2026-05-02 — addresses live observation
// of "9 of 10 findings valid; one missing rationale" wasting an OpenRouter
// call by rejecting the whole batch.)
// =====================================================================

describe('runAnalysis partial-output filter', () => {
  it('mixed valid + invalid findings: keeps valid, drops invalid, no retry, returns success', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    const partialResult = {
      ...defaultLLMResult(),
      parsed: {
        findings: [
          SAMPLE_FINDING,
          { title: 'malformed — no rationale', narration: NARRATION },
          SECOND_FINDING,
        ],
      },
    };
    vi.mocked(callLLM).mockResolvedValueOnce(partialResult);

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({ success: true });
    // No retry — partial output is acceptable.
    expect(callLLM).toHaveBeenCalledTimes(1);

    const tx = getLastTx();
    const createArgs = tx.finding.createMany.mock.calls[0][0] as {
      data: Array<Record<string, unknown>>;
    };
    // Only the 2 valid findings persisted (the malformed one is dropped).
    expect(createArgs.data).toHaveLength(2);
    expect(createArgs.data.map((f) => f.title)).toEqual([
      'Sample finding 1',
      'Sample finding 2',
    ]);

    // LLMCall row records the partial-output marker on the success row so
    // operators can see when filtering kicked in.
    const llmCallArgs = tx.lLMCall.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(llmCallArgs.data.status).toBe('success');
    expect(llmCallArgs.data.errorMessage).toMatch(
      /Partial output: dropped 1 invalid finding/,
    );
  });

  it('empty findings array (LLM emitted zero) is valid, returns success with no findings', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    setupTransactionMock();

    vi.mocked(callLLM).mockResolvedValueOnce({
      ...defaultLLMResult(),
      parsed: { findings: [] },
    });

    const result = await runAnalysis(SPEC_ID);

    expect(result).toEqual({ success: true });
    expect(callLLM).toHaveBeenCalledTimes(1);

    const tx = getLastTx();
    // createMany NOT called when zero findings (per existing implementation).
    expect(tx.finding.createMany).not.toHaveBeenCalled();
    // Spec still gets the completion marker; quality score is 100 (no findings).
    const specUpdate = tx.spec.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(specUpdate.data.qualityScore).toBe(100);
    expect(specUpdate.data.analysisStatus).toBe('completed');
  });
});

// =====================================================================
// AC #10 — daily budget exceeded
// =====================================================================

describe('runAnalysis daily budget guard (AC #10)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  });

  it('budget exceeded → marks failed, no LLM call, returns budget_exceeded with retryAt', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    vi.mocked(prisma.lLMCall.aggregate).mockResolvedValue({
      _sum: { costUSD: 10.5 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    // Oldest call from 6h ago.
    const oldestCreatedAt = new Date('2026-05-02T06:00:00Z');
    vi.mocked(prisma.lLMCall.findFirst).mockResolvedValue({
      createdAt: oldestCreatedAt,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const result = await runAnalysis(SPEC_ID);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('budget_exceeded');
    if (result.error.kind !== 'budget_exceeded') return;
    expect(result.error.spent).toBe(10.5);
    expect(result.error.limit).toBe(10.0);
    // retryAt = oldest.createdAt + 24h.
    expect(result.error.retryAt).toBe(
      new Date(oldestCreatedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    );

    // No LLM was called.
    expect(callLLM).not.toHaveBeenCalled();

    // Spec.update was called exactly once with `failed` + budget message.
    expect(prisma.spec.update).toHaveBeenCalledTimes(1);
    const updateArgs = vi.mocked(prisma.spec.update).mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ id: SPEC_ID });
    expect(updateArgs.data.analysisStatus).toBe('failed');
    expect(updateArgs.data.analysisError).toMatch(/Daily LLM budget reached/);

    // No transaction was entered.
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('exactly at the threshold ($10.00) is treated as exceeded', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(defaultSpecRow());
    vi.mocked(prisma.lLMCall.aggregate).mockResolvedValue({
      _sum: { costUSD: 10.0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    vi.mocked(prisma.lLMCall.findFirst).mockResolvedValue(null);

    const result = await runAnalysis(SPEC_ID);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.kind).toBe('budget_exceeded');
    expect(callLLM).not.toHaveBeenCalled();
  });
});

// =====================================================================
// not_found
// =====================================================================

describe('runAnalysis on a non-existent spec', () => {
  it('returns { kind: "not_found" } without LLM or DB writes', async () => {
    vi.mocked(prisma.spec.findUnique).mockResolvedValue(null);

    const result = await runAnalysis('nonexistent');

    expect(result).toEqual({
      success: false,
      error: { kind: 'not_found' },
    });
    expect(callLLM).not.toHaveBeenCalled();
    expect(prisma.spec.update).not.toHaveBeenCalled();
    expect(prisma.lLMCall.create).not.toHaveBeenCalled();
  });
});
