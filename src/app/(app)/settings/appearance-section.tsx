'use client';

/**
 * Theme toggle. Two-button radio-style (Light / Dark) — matches Linear-style
 * dense engineer UI better than a slider toggle (per `prd-decisions.md`
 * §"Was wir NICHT übernehmen" — no animation flourishes). Persisted by
 * `next-themes` via cookie; no extra wiring needed.
 *
 * Renders a placeholder during SSR/first-paint to avoid the next-themes
 * hydration mismatch (the theme isn't known until after mount).
 */
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';

// Hydration-safe mounted flag without setState-in-effect (which trips
// react-hooks/set-state-in-effect in React 19). useSyncExternalStore returns
// the server snapshot during SSR/first render and the client snapshot after
// hydration — same effect as the next-themes `mounted` pattern, but the
// transition is driven by React's built-in store-subscription path.
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  const active = mounted ? theme : undefined;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex gap-2"
    >
      <Button
        type="button"
        variant={active === 'light' ? 'default' : 'outline'}
        size="sm"
        role="radio"
        aria-checked={active === 'light'}
        onClick={() => setTheme('light')}
      >
        <Sun className="size-4" />
        Light
      </Button>
      <Button
        type="button"
        variant={active === 'dark' ? 'default' : 'outline'}
        size="sm"
        role="radio"
        aria-checked={active === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <Moon className="size-4" />
        Dark
      </Button>
    </div>
  );
}
