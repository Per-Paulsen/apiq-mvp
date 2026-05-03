'use client';

// Hydration-fix island for the sidebar nav (Task #3 / Epic 08 AC #18).
// `SidebarMenuButton` with the `tooltip` prop wraps its child in a Tooltip
// primitive whose `data-state` mismatches between SSR and post-hydration. We
// pre-mount pass `tooltip={undefined}` so the wrapper is omitted entirely;
// post-mount we attach the tooltip. Lowest-blast-radius option vs. SSR-pinning
// the provider (incomplete) or `suppressHydrationWarning` (hides, not fixes).
//
// Mounted-flag uses `useSyncExternalStore` (same as Epic 07's AppearanceSection)
// to avoid React 19's `react-hooks/set-state-in-effect` rule.

import Link from 'next/link';
import { FileSearch, Settings } from 'lucide-react';
import { useSyncExternalStore } from 'react';

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

const subscribe = (): (() => void) => () => {};
const getClientSnapshot = (): boolean => true;
const getServerSnapshot = (): boolean => false;

export function SidebarNavItems(): React.JSX.Element {
  const mounted = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={mounted ? 'Specs' : undefined}>
          <Link href="/specs">
            <FileSearch />
            <span>Specs</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton asChild tooltip={mounted ? 'Settings' : undefined}>
          <Link href="/settings">
            <Settings />
            <span>Settings</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
