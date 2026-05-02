import Link from "next/link";
import { FileSearch, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { prisma } from "@/lib/prisma";
import { getRequiredSession } from "@/lib/session";

// Note: This shadcn version exposes the older `asChild` API (not the newer
// `render` prop). Per CLAUDE.md the project prefers `render`, but we use
// whichever API the installed shadcn ships — Epic 07 may upgrade later.
//
// `SidebarMenuButton` with the `tooltip` prop renders Tooltip primitives
// inline, which require a TooltipProvider ancestor — wrapping here.
//
// Async server component (Epic 07): loads the session + workspace name so the
// sidebar footer renders the real `{workspace.name} • {email}` instead of the
// Epic 01 placeholder. AC #10 — workspace-name edits in `/settings` reflect
// here on next navigation, because `updateWorkspaceAction` calls
// `revalidatePath('/', 'layout')`.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getRequiredSession();
  const workspace = await prisma.workspace.findUnique({
    where: { id: session.workspaceId },
    select: { name: true },
  });

  const workspaceName = workspace?.name ?? "Workspace";

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
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Specs">
                      <Link href="/specs">
                        <FileSearch />
                        <span>Specs</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Settings">
                      <Link href="/settings">
                        <Settings />
                        <span>Settings</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <div className="px-2 py-1 text-xs text-muted-foreground">
              {workspaceName} • {session.email}
            </div>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
