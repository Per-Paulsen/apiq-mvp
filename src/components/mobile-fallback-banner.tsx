'use client';

import { X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'apiq.mobile-banner-dismissed';
const MEDIA_QUERY = '(max-width: 1023px)';

// `useSyncExternalStore` is React 19's recommended pattern for reading
// browser-only sources (media queries, sessionStorage) without triggering
// the `react-hooks/set-state-in-effect` rule. Server snapshot returns the
// "no-op" value so SSR renders nothing visible.

const subscribeMedia = (callback: () => void): (() => void) => {
  const mql = window.matchMedia(MEDIA_QUERY);
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
};
const getMediaSnapshot = (): boolean =>
  window.matchMedia(MEDIA_QUERY).matches;
const getMediaServerSnapshot = (): boolean => false;

const subscribeStorage = (callback: () => void): (() => void) => {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
};
const getStorageSnapshot = (): boolean =>
  window.sessionStorage.getItem(STORAGE_KEY) === '1';
const getStorageServerSnapshot = (): boolean => true;

export function MobileFallbackBanner(): React.JSX.Element | null {
  const isMobile = useSyncExternalStore(
    subscribeMedia,
    getMediaSnapshot,
    getMediaServerSnapshot,
  );
  const dismissedFromStorage = useSyncExternalStore(
    subscribeStorage,
    getStorageSnapshot,
    getStorageServerSnapshot,
  );

  // Local override so dismissing within the same tab (where the `storage`
  // event doesn't fire) takes effect immediately.
  const [localDismissed, setLocalDismissed] = useState(false);
  const dismissed = dismissedFromStorage || localDismissed;

  if (!isMobile || dismissed) return null;

  const handleDismiss = (): void => {
    window.sessionStorage.setItem(STORAGE_KEY, '1');
    setLocalDismissed(true);
  };

  return (
    <div
      role="status"
      className="flex w-full items-center justify-between gap-3 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground"
    >
      <span>
        apiq is best on desktop — some features may not render correctly
      </span>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
