/**
 * `callLLM` retry-policy tests (Epic 04 AC #5, #6, #7, #8).
 *
 * The OpenAI SDK is mocked at the module boundary so no real network call
 * is made. Backoff delays (1 s / 4 s / 16 s) are advanced via Vitest's fake
 * timers — without them the tests would block for ~21 s on the exhaust path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock the OpenAI SDK before importing the module under test -----------

// Hoisted so the factory below can refer to it.
const create = vi.hoisted(() => vi.fn());

vi.mock('openai', () => {
  // OpenAI is invoked via `new OpenAI({...})`. An arrow function can't be
  // used as a constructor; use a regular function expression so `new`
  // works and returns the stub client.
  function MockOpenAI(this: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).chat = { completions: { create } };
  }
  return { default: MockOpenAI };
});

// ---- Imports (after mocks) -------------------------------------------------

import { callLLM, stripJsonFences } from '@/lib/openrouter';

// ---- Helpers ---------------------------------------------------------------

function makeResponse(content: string, tokensIn = 100, tokensOut = 50) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: tokensIn, completion_tokens: tokensOut },
  };
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message = `HTTP ${status}`) {
    super(message);
    this.status = status;
  }
}

/**
 * Run a callLLM invocation under fake timers. Returns a promise that resolves
 * after both the call and any pending timer-driven retries settle.
 *
 * The retry loop chains `await sleep(...)` between attempts; when fake
 * timers are active, those sleeps don't progress unless we explicitly
 * advance the clock. We do so by repeatedly running pending micro-tasks +
 * advancing the clock by 1 s at a time until the call settles.
 */
async function runWithFakeTimers<T>(invocation: () => Promise<T>): Promise<T> {
  const promise = invocation();
  // Attach a no-op rejection handler so the original `promise` (which we
  // ALSO return for the caller to await) doesn't generate an
  // unhandled-rejection warning while we're advancing timers. The caller's
  // `await` / `expect(...).rejects` will still see the rejection.
  promise.catch(() => {});
  // Track resolution.
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );

  // Drain micro-tasks + advance timers in 1 s steps until the promise
  // settles. Cap iterations defensively — exhausted retries should never
  // need more than ~30 s of backoff in total (1 + 4 + 16 = 21 s).
  for (let i = 0; i < 60 && !settled; i++) {
    // Let pending micro-tasks (the awaits between sleep and the next try)
    // run to completion at the current virtual time.
    await Promise.resolve();
    await Promise.resolve();
    if (settled) break;
    await vi.advanceTimersByTimeAsync(1000);
  }

  return promise;
}

// ---- beforeEach / afterEach ------------------------------------------------

beforeEach(() => {
  // resetAllMocks clears the IMPLEMENTATION (not just call history) so a
  // sticky `mockRejectedValue` from a prior test doesn't leak into the
  // next one.
  vi.resetAllMocks();
  vi.useFakeTimers();
  // The lazy OpenAI client constructor reads OPENROUTER_API_KEY; provide
  // any non-empty string so getClient() doesn't throw.
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

// =====================================================================
// Retry policy
// =====================================================================

describe('callLLM retry policy', () => {
  it('AC #5 — 5xx retries 3 times then throws (4 calls total)', async () => {
    const err = new HttpError(502, 'Bad Gateway');
    create.mockRejectedValue(err);

    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow('Bad Gateway');

    // 1 initial + 3 retries.
    expect(create).toHaveBeenCalledTimes(4);
  });

  it('AC #5 — 5xx eventually succeeds after 2 retries', async () => {
    create
      .mockRejectedValueOnce(new HttpError(503))
      .mockRejectedValueOnce(new HttpError(503))
      .mockResolvedValueOnce(makeResponse('{"findings":[]}'));

    const result = await runWithFakeTimers(() =>
      callLLM({ system: 's', user: 'u' }),
    );

    expect(create).toHaveBeenCalledTimes(3);
    expect(result.parsed).toEqual({ findings: [] });
    expect(result.tokensIn).toBe(100);
    expect(result.tokensOut).toBe(50);
  });

  it('AC #6 — 400 throws immediately (no retry)', async () => {
    const err = new HttpError(400, 'Bad Request');
    create.mockRejectedValue(err);

    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow('Bad Request');

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('AC #6 — 401 throws immediately', async () => {
    create.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow('Unauthorized');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('AC #6 — 403 throws immediately', async () => {
    create.mockRejectedValue(new HttpError(403, 'Forbidden'));
    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow('Forbidden');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('AC #6 — 429 IS retried', async () => {
    create
      .mockRejectedValueOnce(new HttpError(429, 'Too Many'))
      .mockRejectedValueOnce(new HttpError(429))
      .mockRejectedValueOnce(new HttpError(429))
      .mockResolvedValueOnce(makeResponse('{"findings":[]}'));

    const result = await runWithFakeTimers(() =>
      callLLM({ system: 's', user: 'u' }),
    );
    expect(create).toHaveBeenCalledTimes(4);
    expect(result.parsed).toEqual({ findings: [] });
  });

  it('network error (no status field) is treated as retryable', async () => {
    const netErr = new Error('ECONNRESET');
    create.mockRejectedValue(netErr);

    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow('ECONNRESET');
    // 1 initial + 3 retries.
    expect(create).toHaveBeenCalledTimes(4);
  });
});

// =====================================================================
// JSON-fence stripping (AC #7)
// =====================================================================

describe('callLLM JSON-fence handling (AC #7)', () => {
  it('strips ```json fences and parses the body', async () => {
    create.mockResolvedValueOnce(
      makeResponse('```json\n{"findings":[]}\n```'),
    );

    const result = await runWithFakeTimers(() =>
      callLLM({ system: 's', user: 'u' }),
    );
    expect(result.parsed).toEqual({ findings: [] });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('strips bare ``` fences', async () => {
    create.mockResolvedValueOnce(makeResponse('```\n{"findings":[]}\n```'));
    const result = await runWithFakeTimers(() =>
      callLLM({ system: 's', user: 'u' }),
    );
    expect(result.parsed).toEqual({ findings: [] });
  });
});

// =====================================================================
// JSON-parse retry (AC #8)
// =====================================================================

describe('callLLM JSON-parse retry (AC #8)', () => {
  it('parse failure → 1 retry → success', async () => {
    create
      .mockResolvedValueOnce(makeResponse('not json'))
      .mockResolvedValueOnce(makeResponse('{"findings":[]}'));

    const result = await runWithFakeTimers(() =>
      callLLM({ system: 's', user: 'u' }),
    );
    // The parse retry doesn't burn a network attempt — but the
    // implementation does call create() a second time, so we expect 2.
    expect(create).toHaveBeenCalledTimes(2);
    expect(result.parsed).toEqual({ findings: [] });
  });

  it('parse failure on every response → eventually throws', async () => {
    // Every API call returns un-parseable content. The first parse-failure
    // triggers the documented 1 parse-retry; subsequent parse-failures are
    // re-thrown to the outer catch (which treats no-status errors as
    // retryable, exhausting the network budget — behaviour ported verbatim
    // from the Epic 00 spike). The call MUST eventually throw with the
    // parse-error message regardless of which retry layer ran out first.
    create.mockResolvedValue(makeResponse('still not json'));

    await expect(
      runWithFakeTimers(() => callLLM({ system: 's', user: 'u' })),
    ).rejects.toThrow(/Failed to parse LLM response as JSON/);
    // 1 initial + 1 parse-retry + 3 network retries on the parse-throw = 5.
    expect(create).toHaveBeenCalledTimes(5);
  });
});

// =====================================================================
// stripJsonFences unit tests
// =====================================================================

describe('stripJsonFences', () => {
  it('returns bare JSON unchanged', () => {
    expect(stripJsonFences('{"a":1}')).toBe('{"a":1}');
  });

  it('trims leading and trailing whitespace', () => {
    expect(stripJsonFences('   {"a":1}   ')).toBe('{"a":1}');
  });

  it('strips ```json fences', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips bare ``` fences', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('does NOT match fences embedded in prose (no leading fence)', () => {
    // The regex requires the fence at the very start (after trim). When
    // there's leading prose, the fence must NOT be stripped — the call
    // site catches the parse error and retries.
    const input = 'Here is the result: ```json\n{"a":1}\n```';
    expect(stripJsonFences(input)).toBe(input);
  });
});
