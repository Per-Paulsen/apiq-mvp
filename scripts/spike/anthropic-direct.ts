/**
 * Direct Anthropic API client — analog to openrouter.ts but talks directly to
 * console.anthropic.com instead of through OpenRouter. Used for Stripe FULL
 * coverage measurement on Sonnet 4.6 / Opus 4.7 because OpenRouter has provider
 * reliability issues at ≥800K input tokens for Anthropic models (observed in
 * Stage 3 Run 4 + Run 8 of the Big-Spec Architecture Spike).
 *
 * The API surface mirrors openrouter.ts's callLLM so run-arch.ts can dispatch
 * between the two providers based on a flag without other code changes.
 */

import Anthropic from '@anthropic-ai/sdk';

import { stripJsonFences } from './openrouter.js';

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to scripts/spike/.env to use --provider=anthropic-direct'
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Map OpenRouter-style model IDs to Anthropic-direct model IDs.
 * `anthropic/claude-sonnet-4.6` (OpenRouter) → `claude-sonnet-4-6` (Anthropic).
 * If the input is already in Anthropic-direct format, it's returned unchanged.
 */
function normaliseModelId(model: string): string {
  let m = model.replace(/^anthropic\//, '');
  // Anthropic-direct uses dashes, OpenRouter uses dots in version separators.
  m = m.replace(/(\d)\.(\d)/g, '$1-$2');
  return m;
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
  if (status === undefined) return true;
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
 * Get the model ID for the call. Defaults to Anthropic Sonnet 4.6.
 * Reads from `ANTHROPIC_MODEL` env or falls back to a Sonnet 4.6 default.
 */
function getModel(override?: string): string {
  if (override) return normaliseModelId(override);
  const fromEnv = process.env.ANTHROPIC_MODEL;
  if (fromEnv) return normaliseModelId(fromEnv);
  return 'claude-sonnet-4-6';
}

/**
 * Call the Anthropic Messages API. Mirrors `callLLM` from openrouter.ts.
 *
 * Retries:
 *  - 5xx / network / 429: 3 retries with backoff 1s / 4s / 16s
 *  - 4xx (other than 429): no retry, throw
 *  - JSON.parse failure after fence-strip: 1 retry with the same prompt
 *
 * Notes on long context:
 *  - Sonnet 4.6 / Opus 4.7 support up to 1M input tokens. Anthropic's 1M
 *    context-mode (over 200K) historically required a beta header
 *    (`anthropic-beta: context-1m-2025-08-07`) and carried 2× pricing. As of
 *    2026-05 the 1M mode is GA on the Sonnet/Opus 4.x family per Anthropic
 *    docs; no beta header needed. If usage shows premium pricing in the bill,
 *    the model is silently in the 1M tier — that's expected on inputs > 200K.
 */
export async function callLLM(args: CallLLMArgs, modelOverride?: string): Promise<CallLLMResult> {
  const client = getClient();
  const model = getModel(modelOverride);

  let lastNetworkErr: unknown = null;
  let parseRetried = false;

  for (let networkAttempt = 0; networkAttempt <= NETWORK_RETRY.maxRetries; networkAttempt++) {
    const start = Date.now();
    try {
      // Use streaming — the Anthropic SDK requires it for any call that *could*
      // exceed 10 minutes. With max_tokens=32000 and a large input, the SDK's
      // estimate trips that threshold and rejects non-streaming. Streaming
      // accumulates content as it arrives and we await finalMessage() at the end.
      const stream = client.messages.stream({
        model,
        max_tokens: 32000,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
      });
      const resp = await stream.finalMessage();
      const durationMs = Date.now() - start;

      const raw = resp.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const tokensIn = resp.usage.input_tokens;
      const tokensOut = resp.usage.output_tokens;

      const stripped = stripJsonFences(raw);
      try {
        const parsed = JSON.parse(stripped);
        return { raw, parsed, tokensIn, tokensOut, durationMs, model: resp.model };
      } catch (parseErr) {
        if (parseRetried) {
          throw new Error(
            `Failed to parse Anthropic response as JSON after one retry. ` +
              `Last error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}. ` +
              `Raw (first 500 chars): ${raw.slice(0, 500)}`
          );
        }
        parseRetried = true;
        networkAttempt--; // don't burn a network retry
        continue;
      }
    } catch (err) {
      lastNetworkErr = err;
      const status = (err as { status?: number })?.status;

      if (isClientError(status)) throw err;
      if (!isRetryableStatus(status)) throw err;
      if (networkAttempt >= NETWORK_RETRY.maxRetries) throw err;

      const delay = NETWORK_RETRY.delaysMs[networkAttempt] ?? 16000;
      // eslint-disable-next-line no-console
      console.error(
        `[anthropic-direct] network/5xx/429 error (attempt ${networkAttempt + 1}/${
          NETWORK_RETRY.maxRetries + 1
        }), retrying in ${delay}ms: ${err instanceof Error ? err.message : String(err)}`
      );
      await sleep(delay);
    }
  }

  throw lastNetworkErr instanceof Error
    ? lastNetworkErr
    : new Error('callLLM (anthropic-direct): exhausted retries with no captured error');
}
