/**
 * Prompt-stability snapshots (Epic 04 spec — "Tests (Vitest)").
 *
 * Goal: lock down the rendered prompt text so a careless edit to
 * `src/lib/analysis/prompt.ts` is caught in CI rather than silently
 * regressing the v4 prompt that was calibrated against 11 spike runs.
 *
 * Two snapshots:
 *   - `SYSTEM_PROMPT.length` — character count, easy to scan in PR diffs.
 *   - `buildUserPrompt('test', tinyFixture)` — the rendered user prompt
 *     for a deterministic 0-endpoint fixture.
 */
import { describe, expect, it } from 'vitest';

import { SYSTEM_PROMPT, buildUserPrompt } from '@/lib/analysis/prompt';

describe('prompt stability', () => {
  it('SYSTEM_PROMPT length snapshot', () => {
    // If this snapshot fails, you almost certainly edited the v4 prompt.
    // Re-read `specs/research-spike.md` and `scripts/spike/prompts/v4.ts`
    // before updating — the wording is calibrated, not editorial.
    expect(SYSTEM_PROMPT.length).toMatchInlineSnapshot(`10906`);
  });

  it('buildUserPrompt for a tiny fixture spec', () => {
    const fixture = {
      openapi: '3.0.0',
      info: { title: 'X', version: '1.0' },
      paths: {},
    };
    const rendered = buildUserPrompt('test', fixture);
    expect(rendered).toMatchSnapshot();
  });
});
