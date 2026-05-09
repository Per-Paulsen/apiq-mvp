import { describe, it, expect } from 'vitest';
import {
  RATE_LIMIT_HEADER_PATTERNS,
  operationHasRateLimitHeader,
} from '../../../../deterministic/spectral-functions/_helpers/rate-limit-headers.js';

describe('rate-limit-headers helper', () => {
  describe('RATE_LIMIT_HEADER_PATTERNS', () => {
    it('matches all four expected header families (case-insensitive)', () => {
      const samples = [
        'X-RateLimit-Limit',
        'x-ratelimit-remaining',
        'RateLimit-Reset',
        'ratelimit-policy',
        'X-Rate-Limit-Used',
        'x-rate-limit-reset',
        'Retry-After',
        'retry-after',
      ];
      for (const h of samples) {
        expect(
          RATE_LIMIT_HEADER_PATTERNS.some((re) => re.test(h)),
          `expected ${h} to match a rate-limit pattern`
        ).toBe(true);
      }
    });

    it('does NOT match unrelated headers', () => {
      const samples = ['Content-Type', 'X-Request-Id', 'Cache-Control', 'ETag'];
      for (const h of samples) {
        expect(
          RATE_LIMIT_HEADER_PATTERNS.some((re) => re.test(h)),
          `expected ${h} NOT to match`
        ).toBe(false);
      }
    });
  });

  describe('operationHasRateLimitHeader', () => {
    it('returns true when at least one response declares X-RateLimit-Limit', () => {
      const op = {
        responses: {
          '200': {
            headers: {
              'X-RateLimit-Limit': { schema: { type: 'integer' } },
            },
          },
        },
      };
      expect(operationHasRateLimitHeader(op)).toBe(true);
    });

    it('returns true when only Retry-After is declared (single header)', () => {
      const op = {
        responses: {
          '429': { headers: { 'Retry-After': { schema: { type: 'integer' } } } },
        },
      };
      expect(operationHasRateLimitHeader(op)).toBe(true);
    });

    it('returns false when responses exist but no rate-limit header is present', () => {
      const op = {
        responses: {
          '200': { headers: { 'X-Request-Id': { schema: { type: 'string' } } } },
        },
      };
      expect(operationHasRateLimitHeader(op)).toBe(false);
    });

    it('returns false on missing responses / non-object op (defensive)', () => {
      expect(operationHasRateLimitHeader(null)).toBe(false);
      expect(operationHasRateLimitHeader(undefined)).toBe(false);
      expect(operationHasRateLimitHeader({})).toBe(false);
      expect(operationHasRateLimitHeader({ responses: null })).toBe(false);
      expect(operationHasRateLimitHeader({ responses: {} })).toBe(false);
      expect(
        operationHasRateLimitHeader({
          responses: { '200': { headers: null } },
        })
      ).toBe(false);
    });

    it('finds the header even when it appears only in a non-2xx response', () => {
      const op = {
        responses: {
          '200': { headers: {} },
          '429': { headers: { 'RateLimit-Reset': {} } },
        },
      };
      expect(operationHasRateLimitHeader(op)).toBe(true);
    });
  });
});
