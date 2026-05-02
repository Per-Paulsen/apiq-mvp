/**
 * `/api/internal/analyze` route handler tests (Epic 04 AC #11, #12).
 *
 * Mocks `runAnalysis` so the test never enters the real pipeline.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/analysis/runAnalysis', () => ({
  runAnalysis: vi.fn(async () => ({ success: true })),
}));

import { POST } from '@/app/api/internal/analyze/route';
import { runAnalysis } from '@/lib/analysis/runAnalysis';

// ---- Helpers ---------------------------------------------------------------

function makeRequest(opts: {
  body: unknown;
  secret?: string | null; // omit to send no header; null = explicit empty
}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (opts.secret !== undefined && opts.secret !== null) {
    headers.set('x-internal-secret', opts.secret);
  }
  return new Request('http://localhost/api/internal/analyze', {
    method: 'POST',
    headers,
    body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body),
  });
}

// ---- beforeEach / afterEach ------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---- Tests -----------------------------------------------------------------

describe('POST /api/internal/analyze (AC #11, #12)', () => {
  it('AC #11 — no x-internal-secret header → 403, runAnalysis not called', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');

    const response = await POST(makeRequest({ body: { specId: 'spec-1' } }));

    expect(response.status).toBe(403);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('AC #11 — wrong secret → 403', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');

    const response = await POST(
      makeRequest({ body: { specId: 'spec-1' }, secret: 'wrong-secret' }),
    );

    expect(response.status).toBe(403);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('AC #11 — env var unset → 403 (fail-closed)', async () => {
    // No stubEnv — env var is undefined.
    const response = await POST(
      makeRequest({ body: { specId: 'spec-1' }, secret: 'anything' }),
    );

    expect(response.status).toBe(403);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('AC #12 — correct secret + valid body → 202, runAnalysis called', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');

    const response = await POST(
      makeRequest({ body: { specId: 'spec-1' }, secret: 'expected-secret' }),
    );

    expect(response.status).toBe(202);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
    expect(runAnalysis).toHaveBeenCalledWith('spec-1');
  });

  it('malformed body (no specId) → 400, runAnalysis not called', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');

    const response = await POST(
      makeRequest({ body: {}, secret: 'expected-secret' }),
    );

    expect(response.status).toBe(400);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('non-string specId → 400', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');

    const response = await POST(
      makeRequest({ body: { specId: 123 }, secret: 'expected-secret' }),
    );

    expect(response.status).toBe(400);
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it('runAnalysis is fire-and-forget — response returns even if pipeline never resolves', async () => {
    vi.stubEnv('INTERNAL_API_SECRET', 'expected-secret');
    // Return a never-resolving promise. If POST awaited it, the test would
    // hang. The 5s test timeout forces a fast failure if the route ever
    // changes to await runAnalysis().
    vi.mocked(runAnalysis).mockImplementation(() => new Promise(() => {}));

    const response = await POST(
      makeRequest({ body: { specId: 'spec-1' }, secret: 'expected-secret' }),
    );

    expect(response.status).toBe(202);
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  }, 5000);
});
