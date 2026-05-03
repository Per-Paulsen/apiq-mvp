/**
 * Tests for the versions-drawer pulse (Epic 08 polish).
 *
 * When the `versions` array grows (a new SpecVersion arrives via polling),
 * the trigger button briefly highlights with `bg-violet-500/15` for ~1.2 s.
 */
import { render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpecVersion } from '@/generated/prisma/client';

import { VersionsDrawer } from '@/app/(app)/specs/[specId]/versions-drawer';

function makeVersions(count: number): SpecVersion[] {
  return Array.from(
    { length: count },
    (_, i) =>
      ({
        id: `sv-${i + 1}`,
        specId: 'spec-1',
        parentVersionId: i === 0 ? null : `sv-${i}`,
        versionNumber: i + 1,
        json: {},
        label: `Version ${i + 1}`,
        createdAt: new Date('2026-05-01T00:00:00Z'),
      }) as SpecVersion,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VersionsDrawer — pulse on new version', () => {
  it('adds bg-violet-500/15 to the trigger when versions.length grows', () => {
    const initial = makeVersions(1);
    const { rerender, container } = render(
      <VersionsDrawer versions={initial} currentVersionId="sv-1" />,
    );

    const trigger = container.querySelector('button[aria-haspopup="dialog"]')
      ?? container.querySelector('button');
    expect(trigger).not.toBeNull();
    expect(trigger!.className).not.toContain('bg-violet-500/15');

    // Re-render with a longer versions array — the effect should set flash=true.
    rerender(
      <VersionsDrawer versions={makeVersions(2)} currentVersionId="sv-2" />,
    );

    const triggerAfter = container.querySelector('button[aria-haspopup="dialog"]')
      ?? container.querySelector('button');
    expect(triggerAfter!.className).toContain('bg-violet-500/15');
  });

  it('clears the pulse class after 1.2 s', () => {
    const { rerender, container } = render(
      <VersionsDrawer versions={makeVersions(1)} currentVersionId="sv-1" />,
    );

    rerender(
      <VersionsDrawer versions={makeVersions(2)} currentVersionId="sv-2" />,
    );

    let trigger = container.querySelector('button[aria-haspopup="dialog"]')
      ?? container.querySelector('button');
    expect(trigger!.className).toContain('bg-violet-500/15');

    act(() => {
      vi.advanceTimersByTime(1200);
    });

    trigger = container.querySelector('button[aria-haspopup="dialog"]')
      ?? container.querySelector('button');
    expect(trigger!.className).not.toContain('bg-violet-500/15');
  });

  it('does NOT pulse on the initial render', () => {
    const { container } = render(
      <VersionsDrawer versions={makeVersions(3)} currentVersionId="sv-3" />,
    );
    const trigger = container.querySelector('button[aria-haspopup="dialog"]')
      ?? container.querySelector('button');
    expect(trigger!.className).not.toContain('bg-violet-500/15');
  });
});
