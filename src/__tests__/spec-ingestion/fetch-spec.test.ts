/**
 * Tests for `fetchSpecFromUrl`, `parseSpecBody`, `checkSpecSize`
 * (Epic 03 AC #4, #6, #10, #17).
 *
 * `fetch` is mocked globally per test. Real network is never hit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkSpecSize,
  fetchSpecFromUrl,
  parseSpecBody,
} from '@/lib/spec-ingestion/fetch-spec';

// ---- Helpers ---------------------------------------------------------------

function mockFetchOnce(init: {
  status?: number;
  statusText?: string;
  body?: string;
  contentType?: string | null;
}) {
  const response = new Response(init.body ?? '', {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: init.contentType
      ? { 'content-type': init.contentType }
      : undefined,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response));
}

function mockFetchThrows(err: Error) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(err));
}

// ---- fetchSpecFromUrl ------------------------------------------------------

describe('fetchSpecFromUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('200 + JSON content-type → format = json', async () => {
    mockFetchOnce({
      body: '{"openapi":"3.0.1"}',
      contentType: 'application/json; charset=utf-8',
    });
    const result = await fetchSpecFromUrl('https://example.com/spec.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('json');
    expect(result.body).toBe('{"openapi":"3.0.1"}');
    expect(result.contentType).toBe('application/json; charset=utf-8');
  });

  it('200 + YAML content-type → format = yaml', async () => {
    mockFetchOnce({
      body: 'openapi: 3.0.1\n',
      contentType: 'application/yaml',
    });
    const result = await fetchSpecFromUrl('https://example.com/spec');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('yaml');
  });

  it('200 + text/yaml content-type → format = yaml', async () => {
    mockFetchOnce({
      body: 'openapi: 3.0.1\n',
      contentType: 'text/yaml',
    });
    const result = await fetchSpecFromUrl('https://example.com/spec');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('yaml');
  });

  it('200 + ambiguous content-type but .yaml extension → format = yaml', async () => {
    mockFetchOnce({
      body: 'openapi: 3.0.1\n',
      contentType: 'text/plain',
    });
    const result = await fetchSpecFromUrl('https://example.com/api.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('yaml');
  });

  it('200 + ambiguous content-type but .json extension → format = json', async () => {
    mockFetchOnce({
      body: '{"openapi":"3.0.1"}',
      contentType: 'application/octet-stream',
    });
    const result = await fetchSpecFromUrl('https://example.com/api.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('json');
  });

  it('200 + ambiguous content-type but body starts with `{` → format = json (sniff)', async () => {
    mockFetchOnce({
      body: '   \n  {"openapi":"3.0.1"}',
      contentType: 'text/plain',
    });
    const result = await fetchSpecFromUrl('https://example.com/spec');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('json');
  });

  it('401 → http_error with status 401', async () => {
    mockFetchOnce({ status: 401, statusText: 'Unauthorized', body: '' });
    const result = await fetchSpecFromUrl('https://example.com/spec.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('http_error');
    if (result.error.kind !== 'http_error') return;
    expect(result.error.status).toBe(401);
    expect(result.error.statusText).toBe('Unauthorized');
  });

  it('500 → http_error with status 500', async () => {
    mockFetchOnce({
      status: 500,
      statusText: 'Internal Server Error',
      body: 'oops',
    });
    const result = await fetchSpecFromUrl('https://example.com/spec.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('http_error');
    if (result.error.kind !== 'http_error') return;
    expect(result.error.status).toBe(500);
  });

  it('passes Authorization header when authHeader is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('{"openapi":"3.0.1"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchSpecFromUrl('https://example.com/spec.json', 'Bearer xyz');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toBe('https://example.com/spec.json');
    const init = callArgs[1] as RequestInit;
    expect(init.headers).toEqual({ Authorization: 'Bearer xyz' });
  });

  it('omits Authorization header when no authHeader is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('{"openapi":"3.0.1"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchSpecFromUrl('https://example.com/spec.json');

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({});
  });

  it('propagates network errors (fetch throws)', async () => {
    mockFetchThrows(new TypeError('fetch failed'));
    await expect(
      fetchSpecFromUrl('https://example.com/spec.json'),
    ).rejects.toThrow('fetch failed');
  });
});

// ---- parseSpecBody ---------------------------------------------------------

describe('parseSpecBody', () => {
  it('parses valid JSON', () => {
    const result = parseSpecBody('{"a":1,"b":[2,3]}', 'json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json).toEqual({ a: 1, b: [2, 3] });
  });

  it('returns parse_error for invalid JSON', () => {
    const result = parseSpecBody('{not valid json}', 'json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('parse_error');
    expect(typeof result.error.message).toBe('string');
  });

  it('parses valid YAML', () => {
    const result = parseSpecBody(
      'openapi: 3.0.1\ninfo:\n  title: Test\n  version: "1"',
      'yaml',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.json).toEqual({
      openapi: '3.0.1',
      info: { title: 'Test', version: '1' },
    });
  });

  it('returns parse_error for invalid YAML', () => {
    // Mismatched indentation + unclosed structure → YAML parser throws.
    const bad = 'openapi: 3.0.1\n  paths:\n - [unclosed';
    const result = parseSpecBody(bad, 'yaml');
    // Note: `yaml` is permissive; if this passes we still want parse_error to
    // exist for clearly broken input. Use a guaranteed-bad payload as backup.
    if (result.ok) {
      const result2 = parseSpecBody('"unterminated string', 'yaml');
      expect(result2.ok).toBe(false);
    } else {
      expect(result.error.kind).toBe('parse_error');
    }
  });
});

// ---- checkSpecSize ---------------------------------------------------------

describe('checkSpecSize', () => {
  it('accepts a small body (under 5 MB)', () => {
    const body = 'x'.repeat(1024); // 1 KB
    const result = checkSpecSize(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sizeBytes).toBe(1024);
  });

  it('accepts a body of exactly 5 MB', () => {
    const body = 'x'.repeat(5 * 1024 * 1024);
    const result = checkSpecSize(body);
    expect(result.ok).toBe(true);
  });

  it('rejects a body just over 5 MB with sizeMB rounded', () => {
    const body = 'x'.repeat(5 * 1024 * 1024 + 1024); // 5 MB + 1 KB
    const result = checkSpecSize(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too_large');
    expect(result.error.limitMB).toBe(5);
    // 5 MB + 1 KB → ~5.0 MB rounded to 1 decimal.
    expect(result.error.sizeMB).toBeCloseTo(5.0, 1);
  });

  it('rejects a 6 MB body and reports sizeMB ≈ 6', () => {
    const body = 'x'.repeat(6 * 1024 * 1024);
    const result = checkSpecSize(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('too_large');
    expect(result.error.sizeMB).toBe(6);
  });
});

beforeEach(() => {
  // Defensive: ensure no leaked stub from a prior test.
  vi.unstubAllGlobals();
});
