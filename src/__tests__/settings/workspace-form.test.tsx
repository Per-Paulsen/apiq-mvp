/**
 * WorkspaceForm RTL tests (Epic 07).
 *
 * Covers field-level + top-level error rendering, success indicator, and the
 * Save-toast effect. The form-action adapter is stubbed so we can assert
 * against the mock-action call shape directly (FormData round-trip is the
 * adapter's concern, tested via the action's own unit tests).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the server-action adapter — useActionState invokes whatever we pass.
const mockFormAction = vi.fn();
vi.mock('@/app/(app)/settings/workspace-form-action', () => ({
  updateWorkspaceFormAction: (
    prev: unknown,
    formData: FormData,
  ): Promise<unknown> => mockFormAction(prev, formData),
}));

const mockShowToast = vi.fn();
vi.mock('@/lib/toasts', () => ({
  TOASTS: {
    workspaceUpdated: { kind: 'success', message: 'Workspace updated.' },
  },
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { WorkspaceForm } from '@/app/(app)/settings/workspace-form';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('WorkspaceForm', () => {
  it('renders input pre-populated with initialName', () => {
    render(<WorkspaceForm initialName="Acme Inc" />);

    const input = screen.getByLabelText(/workspace name/i) as HTMLInputElement;
    expect(input.value).toBe('Acme Inc');
  });

  it('submits with the entered name as FormData', async () => {
    mockFormAction.mockResolvedValue({ success: true });
    render(<WorkspaceForm initialName="Old Name" />);

    const input = screen.getByLabelText(/workspace name/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockFormAction).toHaveBeenCalledTimes(1);
    const formData = mockFormAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get('name')).toBe('New Name');
  });

  it('renders inline name_required error', async () => {
    mockFormAction.mockResolvedValue({
      success: false,
      error: { kind: 'name_required' },
    });
    render(<WorkspaceForm initialName="Acme" />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText(/workspace name/i)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('renders top-of-form banner for unexpected errors', async () => {
    mockFormAction.mockResolvedValue({
      success: false,
      error: { kind: 'unexpected', message: 'DB exploded' },
    });
    render(<WorkspaceForm initialName="Acme" />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('DB exploded');
  });

  it('shows "Saved" + fires the workspace toast on success', async () => {
    mockFormAction.mockResolvedValue({ success: true });
    render(<WorkspaceForm initialName="Acme" />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith({
      kind: 'success',
      message: 'Workspace updated.',
    });
  });
});
