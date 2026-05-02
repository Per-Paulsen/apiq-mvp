/**
 * App layout server-component tests (Epic 07).
 *
 * Asserts the layout calls `getRequiredSession()`, fetches the workspace
 * name with the session's workspaceId, and renders `{name} • {email}` in
 * the sidebar footer (replacing the Epic 01 placeholder).
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    workspace: { findUnique: vi.fn() },
  },
}));

vi.mock('@/lib/session', () => ({
  getRequiredSession: vi.fn(),
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
import { prisma } from '@/lib/prisma';
import { getRequiredSession } from '@/lib/session';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRequiredSession).mockResolvedValue({
    userId: 'user-1',
    workspaceId: 'workspace-1',
    email: 'alice@example.com',
  });
});

describe('AppLayout (async)', () => {
  it('renders the sidebar footer with the real workspace name + email', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue({
      name: 'Acme Workspace',
    } as Awaited<ReturnType<typeof prisma.workspace.findUnique>>);

    const ui = await AppLayout({ children: <div>child content</div> });
    render(ui);

    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where: { id: 'workspace-1' },
      select: { name: true },
    });

    expect(
      screen.getByText('Acme Workspace • alice@example.com'),
    ).toBeInTheDocument();

    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('falls back to "Workspace" when prisma returns null', async () => {
    vi.mocked(prisma.workspace.findUnique).mockResolvedValue(null);

    const ui = await AppLayout({ children: <div /> });
    render(ui);

    expect(
      screen.getByText('Workspace • alice@example.com'),
    ).toBeInTheDocument();
  });
});
