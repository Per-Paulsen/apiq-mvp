/**
 * ProfileForm RTL tests (Epic 07). Same pattern as workspace-form.test.tsx,
 * plus an assertion that email is rendered read-only (cannot be changed in
 * v0.1 — AC #11).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFormAction = vi.fn();
vi.mock('@/app/(app)/settings/profile-form-action', () => ({
  updateUserFormAction: (prev: unknown, formData: FormData): Promise<unknown> =>
    mockFormAction(prev, formData),
}));

const mockShowToast = vi.fn();
vi.mock('@/lib/toasts', () => ({
  TOASTS: {
    profileUpdated: { kind: 'success', message: 'Profile updated.' },
  },
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { ProfileForm } from '@/app/(app)/settings/profile-form';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ProfileForm', () => {
  it('pre-populates name and renders read-only email', () => {
    render(<ProfileForm initialName="Alice" email="alice@example.com" />);

    const name = screen.getByLabelText('Name') as HTMLInputElement;
    expect(name.value).toBe('Alice');

    const email = screen.getByLabelText('Email') as HTMLInputElement;
    expect(email.value).toBe('alice@example.com');
    expect(email).toHaveAttribute('readonly');
    expect(email).toBeDisabled();
  });

  it('submits the new name as FormData', async () => {
    mockFormAction.mockResolvedValue({ success: true });
    render(<ProfileForm initialName="Old" email="alice@example.com" />);

    const input = screen.getByLabelText('Name');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockFormAction).toHaveBeenCalledTimes(1);
    const formData = mockFormAction.mock.calls[0]?.[1] as FormData;
    expect(formData.get('name')).toBe('Alice');
  });

  it('renders inline name_required error', async () => {
    mockFormAction.mockResolvedValue({
      success: false,
      error: { kind: 'name_required' },
    });
    render(<ProfileForm initialName="Alice" email="alice@example.com" />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Name is required.')).toBeInTheDocument();
  });

  it('fires the profile toast on success', async () => {
    mockFormAction.mockResolvedValue({ success: true });
    render(<ProfileForm initialName="Alice" email="alice@example.com" />);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(mockShowToast).toHaveBeenCalledWith({
      kind: 'success',
      message: 'Profile updated.',
    });
  });
});
