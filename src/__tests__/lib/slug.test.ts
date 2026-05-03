/**
 * Tests for the `slugify` helper (Epic 08).
 *
 * Used by `exportSpecAction` to derive the download filename's base from the
 * spec's display name. Pure function — no I/O.
 */
import { describe, expect, it } from 'vitest';

import { slugify } from '@/lib/slug';

describe('slugify', () => {
  it('lowercases + strips special chars', () => {
    expect(slugify('My Spec!')).toBe('my-spec');
  });

  it('collapses runs of whitespace', () => {
    expect(slugify('  hello   world  ')).toBe('hello-world');
  });

  it('empty input falls back to "spec"', () => {
    expect(slugify('')).toBe('spec');
  });

  it('all-special-chars falls back to "spec"', () => {
    expect(slugify('!!!@@@###')).toBe('spec');
  });

  it('collapses repeated dashes', () => {
    expect(slugify('foo--bar---baz')).toBe('foo-bar-baz');
  });

  it('strips leading and trailing dashes', () => {
    expect(slugify('-leading-and-trailing-')).toBe('leading-and-trailing');
  });

  it('handles parens and version-style names', () => {
    expect(slugify('Petstore (v3)')).toBe('petstore-v3');
  });
});
