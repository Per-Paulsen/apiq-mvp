/**
 * Tests for `<MobileFallbackBanner />` (Epic 08).
 *
 *   - Renders when matchMedia matches AND sessionStorage dismiss key absent.
 *   - Does not render when sessionStorage flag is present.
 *   - Clicking X persists the flag and hides the banner.
 *
 * jsdom's setup.ts polyfill returns matches:false by default; we override
 * `window.matchMedia` per test to drive the breakpoint.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { MobileFallbackBanner } from '@/components/mobile-fallback-banner';

const STORAGE_KEY = 'apiq.mobile-banner-dismissed';

function setMatchMedia(matches: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).matchMedia = (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  setMatchMedia(false);
});

describe('MobileFallbackBanner', () => {
  it('renders when the viewport matches AND the dismiss flag is absent', () => {
    setMatchMedia(true);
    render(<MobileFallbackBanner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/best on desktop/i)).toBeInTheDocument();
  });

  it('does NOT render when the dismiss flag is present', () => {
    setMatchMedia(true);
    sessionStorage.setItem(STORAGE_KEY, '1');
    render(<MobileFallbackBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does NOT render when the viewport does not match', () => {
    setMatchMedia(false);
    render(<MobileFallbackBanner />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('clicking the dismiss button persists the flag and hides the banner', async () => {
    setMatchMedia(true);
    const user = userEvent.setup();
    render(<MobileFallbackBanner />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Dismiss banner/i }));

    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
