/**
 * Workspace-scoped rate-limit storage backed by `WorkspaceActionLog`.
 *
 * Sibling to `src/lib/rate-limit.ts` (IP-scoped, used for unauthenticated signup).
 * Used by Epic 03 (URL-pull / re-pull) and Epic 06 (apply).
 *
 * v0.1 known actions: `'url_pull'`, `'re_pull'` (Epic 03), `'apply'` (Epic 06).
 *
 * Rolling-window semantics mirror Epic 02:
 *   - Count rows in `[now - windowMs, now]`.
 *   - If count < limit → allowed.
 *   - Else → `retryAt = oldest_qualifying_row.createdAt + windowMs`.
 *   - Caller is responsible for calling `recordWorkspaceAction()` after the
 *     check (every attempt is logged, including denied ones — same pattern as
 *     `signupAction` per Epic 02 results).
 */
import 'server-only';

import { prisma } from '@/lib/prisma';

export const URL_PULL_LIMIT_PER_HOUR = 20;
export const APPLY_LIMIT_PER_HOUR = 30;
export const ONE_HOUR_MS = 60 * 60 * 1000;

export type WorkspaceRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAt: Date };

export async function checkWorkspaceRateLimit(
  workspaceId: string,
  action: string,
  limit: number,
  windowMs: number,
): Promise<WorkspaceRateLimitResult> {
  const since = new Date(Date.now() - windowMs);
  const recent = await prisma.workspaceActionLog.findMany({
    where: { workspaceId, action, createdAt: { gt: since } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (recent.length < limit) return { allowed: true };
  const oldest = recent[0].createdAt;
  return { allowed: false, retryAt: new Date(oldest.getTime() + windowMs) };
}

export async function recordWorkspaceAction(
  workspaceId: string,
  action: string,
): Promise<void> {
  await prisma.workspaceActionLog.create({ data: { workspaceId, action } });
}
