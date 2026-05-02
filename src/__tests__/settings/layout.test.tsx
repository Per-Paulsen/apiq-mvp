/**
 * App layout server-component tests (Epic 07).
 *
 * Asserts the layout calls `getRequiredSession()` + `getWorkspaceNameCached`
 * (the `unstable_cache` wrapper around `prisma.workspace.findUnique` — see
 * `src/lib/workspace-cache.ts`) and renders `{name} • {email}` in the
 * sidebar footer (replacing the Epic 01 placeholder).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
}));

vi.mock('@/lib/workspace-cache', () => ({
  getWorkspaceNameCached: vi.fn(),
  WORKSPACE_NAME_CACHE_TAG: 'workspace-name',
}));

// next/link doesn't render in jsdom without a router; the simple stub keeps
// the markup minimal so our footer assertion is robust.
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

import AppLayout from '@/app/(app)/layout';
import { getRequiredSession } from '@/lib/session';
import { getWorkspaceNameCached } from '@/lib/workspace-cache';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    email: 'alice@example.com',
  });
});

describe('AppLayout (async)', () => {
  it('renders the sidebar footer with the real workspace name + email (via the cached lookup)', async () => {
    vi.mocked(getWorkspaceNameCached).mockResolvedValue('Acme Workspace');

    const ui = await AppLayout({ children: <div>child content</div> });
    render(ui);

    expect(getWorkspaceNameCached).toHaveBeenCalledWith('workspace-1');

    expect(
      screen.getByText('Acme Workspace • alice@example.com'),
    ).toBeInTheDocument();

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('renders the cache helper\'s "Workspace" fallback string verbatim (the helper handles null internally)', async () => {
    vi.mocked(getWorkspaceNameCached).mockResolvedValue('Workspace');

    const ui = await AppLayout({ children: <div /> });
    render(ui);

    expect(
      screen.getByText('Workspace • alice@example.com'),
    ).toBeInTheDocument();
  });
});
