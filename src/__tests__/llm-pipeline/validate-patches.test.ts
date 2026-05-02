/**
 * Pure-function tests for `validatePatchOps` (Epic 06 AC #2).
 *
 * Asserts the four hallucination shapes against the real validator.
 * No mocks — the function is pure (no DB / network).
 *
 * AC #2 shapes:
 *   2a. `add` whose parent path does not exist → hallucinated.
 *   2b. `replace` / `remove` / `test` whose path does not exist → hallucinated.
 *   2c. `move` / `copy` whose `from` does not exist → hallucinated.
 *   2d. `move` / `copy` whose destination `path` already exists → NOT hallucinated.
 */
import type { Operation } from 'fast-json-patch';
import { describe, expect, it } from 'vitest';

import { validatePatchOps } from '@/lib/analysis/validate-patches';

const SPEC = {
  paths: {
    '/orders': {
      get: {
        parameters: [
          { name: 'limit', in: 'query' },
          { name: 'offset', in: 'query' },
        ],
      },
    },
  },
};

describe('validatePatchOps — hallucination checks (Epic 06 AC #2)', () => {
  it('add whose parent does NOT exist → hallucinated (AC 2a)', () => {
    const ops: Operation[] = [
      // Parent /paths/~1foo/get doesn't exist.
      { op: 'add', path: '/paths/~1foo/get/parameters/-', value: { name: 'x', in: 'query' } },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
    expect(result.hallucinationCheck.details).toMatch(/parent/i);
  });

  it('replace with missing path → hallucinated (AC 2b)', () => {
    const ops: Operation[] = [
      { op: 'replace', path: '/paths/~1nope/get', value: { responses: {} } },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
  });

  it('remove with missing path → hallucinated (AC 2b)', () => {
    const ops: Operation[] = [
      { op: 'remove', path: '/paths/~1nope/get' },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
  });

  it('test with missing path → hallucinated (AC 2b)', () => {
    const ops: Operation[] = [
      { op: 'test', path: '/paths/~1nope/get', value: 1 },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
  });

  it('move with missing from → hallucinated (AC 2c)', () => {
    const ops: Operation[] = [
      {
        op: 'move',
        from: '/paths/~1nope/get',
        path: '/paths/~1orders/get',
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
    expect(result.hallucinationCheck.details).toMatch(/from/i);
  });

  it('copy with missing from → hallucinated (AC 2c)', () => {
    const ops: Operation[] = [
      {
        op: 'copy',
        from: '/paths/~1nope/get',
        path: '/paths/~1orders/post',
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(true);
  });

  it('move with EXISTING destination path → NOT hallucinated (AC 2d, bug-fix #1)', () => {
    // The destination `path` exists in SPEC at index 1 — but the validator
    // MUST NOT check destination existence. `from` exists; only `from` is
    // checked.
    const ops: Operation[] = [
      {
        op: 'move',
        from: '/paths/~1orders/get/parameters/0',
        path: '/paths/~1orders/get/parameters/1',
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(false);
  });

  it('copy with EXISTING destination path → NOT hallucinated (AC 2d, bug-fix #1)', () => {
    const ops: Operation[] = [
      {
        op: 'copy',
        from: '/paths/~1orders/get/parameters/0',
        path: '/paths/~1orders/get/parameters/1',
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(false);
  });

  it('valid add whose parent exists → not hallucinated, applyClean=true', () => {
    const ops: Operation[] = [
      {
        op: 'add',
        path: '/paths/~1orders/get/parameters/-',
        value: { name: 'sort', in: 'query' },
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(false);
    expect(result.applyClean).toBe(true);
  });

  it('valid replace on existing path → not hallucinated, applyClean=true', () => {
    const ops: Operation[] = [
      {
        op: 'replace',
        path: '/paths/~1orders/get/parameters/0',
        value: { name: 'limit', in: 'query', required: true },
      },
    ];
    const result = validatePatchOps(SPEC, ops);
    expect(result.hallucinationCheck.hallucinated).toBe(false);
    expect(result.applyClean).toBe(true);
  });
});
