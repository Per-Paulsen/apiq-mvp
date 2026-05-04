import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set. Add it to scripts/spike/.env');
  }
  _client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
  return _client;
}

function getModel(): string {
  return process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4';
}

/**
 * Strip JSON code fences from a response. Handles:
 *   ```json\n{...}\n```
 *   ```\n{...}\n```
 * Trims leading/trailing whitespace. If no fences, returns the trimmed input.
 */
export function stripJsonFences(raw: string): string {
  let s = raw.trim();
  // ```json ... ```
  const jsonFence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/;
  const m = s.match(jsonFence);
  if (m) {
    s = m[1].trim();
  }
  return s;
}

export interface CallLLMArgs {
  system: string;
  user: string;
}

export interface CallLLMResult {
  raw: string;
  parsed: unknown;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  model: string;
}

interface RetryConfig {
  maxRetries: number;
  delaysMs: number[];
}

const NETWORK_RETRY: RetryConfig = {
  maxRetries: 3,
  delaysMs: [1000, 4000, 16000],
};

function isRetryableStatus(status: number | undefined): boolean {
  if (status === undefined) return true; // network/no-status → treat as retryable
  if (status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function isClientError(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 429;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call OpenRouter via the OpenAI SDK chat.completions endpoint.
 *
 * Retries:
 *  - 5xx / network / 429: 3 retries with backoff 1s / 4s / 16s
 *  - 4xx (other than 429): no retry, throw
 *  - JSON.parse failure after fence-strip: 1 retry with the same prompt
 */
export async function callLLM(args: CallLLMArgs): Promise<CallLLMResult> {
  const client = getClient();
  const model = getModel();

  let lastNetworkErr: unknown = null;
  let parseRetried = false;

  for (let networkAttempt = 0; networkAttempt <= NETWORK_RETRY.maxRetries; networkAttempt++) {
    const start = Date.now();
    try {
      const resp = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
        // Some providers (notably Grok 4.1 Fast on OpenRouter) default to a
        // small max_completion_tokens cap and truncate JSON mid-stream, breaking
        // the schema parse. Explicitly request 32K output so the schema-shaped
        // findings array can complete.
        max_tokens: 32000,
      });
      const durationMs = Date.now() - start;
      const raw = resp.choices?.[0]?.message?.content ?? '';
      const tokensIn = resp.usage?.prompt_tokens ?? 0;
      const tokensOut = resp.usage?.completion_tokens ?? 0;

      // Try to parse. On failure, do exactly one retry with the same prompt.
      const stripped = stripJsonFences(raw);
      try {
        const parsed = JSON.parse(stripped);
        return { raw, parsed, tokensIn, tokensOut, durationMs, model };
      } catch (parseErr) {
        if (parseRetried) {
          throw new Error(
            `Failed to parse LLM response as JSON after one retry. ` +
              `Last error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
              `Raw (first 500 chars): ${raw.slice(0, 500)}`
          );
        }
        parseRetried = true;
        // Re-loop with the same network attempt count (don't burn a network retry).
        // To do this we just continue to the next iteration of the outer loop
        // but we must NOT increment networkAttempt. Easiest: decrement here.
        networkAttempt--;
        continue;
      }
    } catch (err) {
      lastNetworkErr = err;
      const status = (err as { status?: number })?.status;

      if (isClientError(status)) {
        // 4xx (not 429): no retry
        throw err;
      }

      if (!isRetryableStatus(status)) {
        throw err;
      }

      if (networkAttempt >= NETWORK_RETRY.maxRetries) {
        throw err;
      }

      const delay = NETWORK_RETRY.delaysMs[networkAttempt] ?? 16000;
      // eslint-disable-next-line no-console
      console.error(
        `[openrouter] network/5xx/429 error (attempt ${networkAttempt + 1}/${
          NETWORK_RETRY.maxRetries + 1
        }), retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`
      );
      await sleep(delay);
    }
  }

  // Should not reach — the loop either returns or throws above.
  throw lastNetworkErr instanceof Error
    ? lastNetworkErr
    : new Error('callLLM: exhausted retries with no captured error');
}
