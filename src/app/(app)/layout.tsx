import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MobileFallbackBanner } from "@/components/mobile-fallback-banner";
import { getRequiredSession } from "@/lib/session";
import { getWorkspaceNameCached } from "@/lib/workspace-cache";

import { SidebarNavItems } from "./sidebar-nav-items";

// Note: This shadcn version exposes the older `asChild` API (not the newer
// `render` prop). Per CLAUDE.md the project prefers `render`, but we use
// whichever API the installed shadcn ships — Epic 07 may upgrade later.
//
// `SidebarMenuButton` with the `tooltip` prop renders Tooltip primitives
// inline, which require a TooltipProvider ancestor — wrapping here.
//
// Async server component (Epic 07): loads the session + workspace name so the
// sidebar footer renders the real `{workspace.name} • {email}` instead of the
// Epic 01 placeholder. The workspace lookup is wrapped in `unstable_cache`
// keyed by workspaceId so navigation between (app) routes doesn't refetch
// the same row from Postgres on every page load. `updateWorkspaceAction`
// invalidates the cache via `revalidateTag('workspace-name')` AND calls
// `revalidatePath('/', 'layout')` to force the layout to re-render with the
// fresh name (AC #10).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();
  const workspaceName = await getWorkspaceNameCached(session.workspaceId);

  return (
    <TooltipProvider>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="px-2 py-1 font-sans text-sm font-semibold tracking-tight">
              apiq
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarNavItems />
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {workspaceName} • {session.email}
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <MobileFallbackBanner />
          {children}
        </SidebarInset>
        <Toaster position="top-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
