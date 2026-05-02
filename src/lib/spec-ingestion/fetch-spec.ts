/**
 * Pure-ish helpers for fetching, format-detecting, parsing, and size-checking
 * a raw OpenAPI spec from a URL. No DB / rate-limit logic here — that lives in
 * `src/lib/rate-limit-workspace.ts` and the server actions.
 *
 * Order of format detection per Epic 03 spec scope step 4:
 *   1. Content-Type header (application/json, application/yaml, text/yaml, ...)
 *   2. URL extension (.json, .yaml, .yml)
 *   3. First non-whitespace char sniff (`{` or `[` ⇒ JSON; else YAML)
 */
import 'server-only';

import * as YAML from 'yaml';

const FETCH_TIMEOUT_MS = 30_000;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB hard cap

export type SpecFormat = 'json' | 'yaml';

export type FetchSpecOk = {
  ok: true;
  body: string;
  contentType: string | null;
  format: SpecFormat;
};
export type FetchSpecErr =
  | { ok: false; error: { kind: 'http_error'; status: number; statusText: string } }
  | { ok: false; error: { kind: 'unknown_format'; message: string } };

export async function fetchSpecFromUrl(
  url: string,
  authHeader?: string,
): Promise<FetchSpecOk | FetchSpecErr> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers.Authorization = authHeader;
  }
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers,
  });
  if (!res.ok) {
    return {
      ok: false,
      error: {
        kind: 'http_error',
        status: res.status,
        statusText: res.statusText,
      },
    };
  }
  const body = await res.text();
  const contentType = res.headers.get('content-type');
  const format = detectFormat(body, contentType, url);
  if (!format) {
    return {
      ok: false,
      error: {
        kind: 'unknown_format',
        message:
          'Could not determine spec format from Content-Type, URL extension, or content sniff. Expected JSON or YAML.',
      },
    };
  }
  return { ok: true, body, contentType, format };
}

function detectFormat(
  body: string,
  contentType: string | null,
  url: string,
): SpecFormat | null {
  // 1. Content-Type — case-insensitive substring match. Strip any `; charset=...`.
  if (contentType) {
    const ct = contentType.toLowerCase().split(';')[0].trim();
    if (ct.includes('json')) return 'json';
    if (ct.includes('yaml') || ct.includes('yml')) return 'yaml';
  }
  // 2. URL extension.
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.json')) return 'json';
    if (pathname.endsWith('.yaml') || pathname.endsWith('.yml')) return 'yaml';
  } catch {
    // Malformed URL — fall through to sniff.
  }
  // 3. Content sniff: first non-whitespace char.
  const firstChar = body.trimStart().charAt(0);
  if (firstChar === '{' || firstChar === '[') return 'json';
  // YAML is permissive — if the body has any non-whitespace content, treat as YAML.
  if (firstChar.length > 0) return 'yaml';
  return null;
}

export type ParseOk = { ok: true; json: unknown };
export type ParseErr = {
  ok: false;
  error: { kind: 'parse_error'; message: string };
};

export function parseSpecBody(
  body: string,
  format: SpecFormat,
): ParseOk | ParseErr {
  try {
    if (format === 'json') {
      return { ok: true, json: JSON.parse(body) };
    }
    return { ok: true, json: YAML.parse(body) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { kind: 'parse_error', message } };
  }
}

export type SizeOk = { ok: true; sizeBytes: number };
export type SizeErr = {
  ok: false;
  error: { kind: 'too_large'; sizeMB: number; limitMB: 5 };
};

export function checkSpecSize(body: string): SizeOk | SizeErr {
  const sizeBytes = Buffer.byteLength(body, 'utf8');
  if (sizeBytes > MAX_SIZE_BYTES) {
    // sizeMB rounded to 1 decimal — e.g. a 6_500_000 byte body reports 6.2 MB.
    const sizeMB = Math.round((sizeBytes / (1024 * 1024)) * 10) / 10;
    return { ok: false, error: { kind: 'too_large', sizeMB, limitMB: 5 } };
  }
  return { ok: true, sizeBytes };
}
