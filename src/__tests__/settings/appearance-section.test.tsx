/**
 * AppearanceSection RTL tests (Epic 07). Mocks `next-themes`'s `useTheme`
 * so we can assert that clicking Light / Dark calls `setTheme` with the
 * right string.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setTheme = vi.fn();
let theme = 'dark';

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme, setTheme }),
}));

import { AppearanceSection } from '@/app/(app)/settings/appearance-section';

beforeEach(() => {
  vi.clearAllMocks();
  theme = 'dark';
});

describe('AppearanceSection', () => {
  it('marks the active theme via aria-checked', () => {
    render(<AppearanceSection />);

    const light = screen.getByRole('radio', { name: /light/i });
    const dark = screen.getByRole('radio', { name: /dark/i });

    expect(dark).toHaveAttribute('aria-checked', 'true');
    expect(light).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking Light calls setTheme("light")', async () => {
    render(<AppearanceSection />);

    await userEvent.click(screen.getByRole('radio', { name: /light/i }));
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('clicking Dark calls setTheme("dark")', async () => {
    render(<AppearanceSection />);

    await userEvent.click(screen.getByRole('radio', { name: /dark/i }));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});
