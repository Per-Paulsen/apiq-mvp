/**
 * Tests for `formatAnalysisError` — the canonical parser for
 * `Spec.analysisError` strings (Epic 08 polish, consumed by Epic 05).
 *
 * Pure function — no mocks needed.
 */
import { describe, expect, it } from 'vitest';

import { formatAnalysisError } from '@/lib/format-analysis-error';

describe('formatAnalysisError', () => {
  describe('rule 1 — budget shape', () => {
    it('matches the canonical budget message and extracts shape', () => {
      const raw =
        'Daily LLM budget reached ($10.45 / $10.00) — resets at 2026-05-03T12:00:00.000Z';
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe('Daily LLM budget reached');
      expect(result.details).toBe(raw);
      expect(result.budgetShape).toEqual({
        spent: 10.45,
        limit: 10.0,
        retryAt: '2026-05-03T12:00:00.000Z',
      });
    });

    it('falls through to rule 3 (plain) when a hyphen is used instead of em-dash', () => {
      // Hyphen-minus (U+002D) instead of em-dash (U+2014).
      const raw =
        'Daily LLM budget reached ($10.45 / $10.00) - resets at 2026-05-03T12:00:00.000Z';
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
      expect(result.budgetShape).toBeUndefined();
    });
  });

  describe('rule 2 — zod-issue JSON', () => {
    it('produces "path.join(".")" + message headline for a single issue with path', () => {
      const issues = [
        {
          code: 'invalid_type',
          path: ['findings', 9, 'rationale'],
          message: 'Invalid input: expected string, received undefined',
        },
      ];
      const raw = JSON.stringify(issues);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(
        'findings.9.rationale: Invalid input: expected string, received undefined',
      );
      expect(result.details).toBe(JSON.stringify(issues, null, 2));
      expect(result.budgetShape).toBeUndefined();
    });

    it('uses just the message when first issue path is empty array', () => {
      const issues = [{ path: [], message: 'Root-level failure' }];
      const raw = JSON.stringify(issues);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe('Root-level failure');
      expect(result.details).toBe(JSON.stringify(issues, null, 2));
    });

    it('uses the first issue path+message when multiple issues are present', () => {
      const issues = [
        { path: ['findings', 0, 'severity'], message: 'Required' },
        { path: ['findings', 1, 'category'], message: 'Required' },
      ];
      const raw = JSON.stringify(issues);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe('findings.0.severity: Required');
      expect(result.details).toBe(JSON.stringify(issues, null, 2));
    });

    it('falls through to rule 3 when JSON is an object, not an array', () => {
      const raw = '{"foo":"bar"}';
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
      expect(result.budgetShape).toBeUndefined();
    });

    it('falls through to rule 3 when array first item is missing the message field', () => {
      const raw = JSON.stringify([{ path: ['x'] }]);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
    });

    it('falls through to rule 3 when array first item is missing the path field', () => {
      const raw = JSON.stringify([{ message: 'hi' }]);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
    });

    it('falls through to rule 3 when JSON.parse throws (invalid JSON)', () => {
      const raw = 'oops';
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe('oops');
      expect(result.details).toBeUndefined();
    });
  });

  describe('rule 3 — plain message fallthrough', () => {
    it('returns headline only for short strings (<=200 chars)', () => {
      const raw = 'Something went wrong';
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
      expect(result.budgetShape).toBeUndefined();
    });

    it('returns headline only at exactly 200 chars (boundary)', () => {
      const raw = 'a'.repeat(200);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe(raw);
      expect(result.details).toBeUndefined();
    });

    it('truncates with ellipsis and keeps full body in details when >200 chars', () => {
      const raw = 'a'.repeat(201);
      const result = formatAnalysisError(raw);
      expect(result.headline).toBe('a'.repeat(200) + '…');
      expect(result.details).toBe(raw);
    });
  });
});
