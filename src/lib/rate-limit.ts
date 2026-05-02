import 'server-only';
import { prisma } from '@/lib/prisma';

const SIGNUP_LIMIT_PER_HOUR = 5;
const ONE_HOUR_MS = 60 * 60 * 1000;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAt: Date };

export async function checkSignupIpRateLimit(ip: string): Promise<RateLimitResult> {
  const since = new Date(Date.now() - ONE_HOUR_MS);
  // Use findMany with select to also be able to compute retryAt cheaply.
  const recent = await prisma.ipActionLog.findMany({
    where: { ip, action: 'signup', createdAt: { gt: since } },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (recent.length < SIGNUP_LIMIT_PER_HOUR) return { allowed: true };
  // retryAt = the oldest qualifying row leaving the window
  const oldest = recent[0].createdAt;
  return { allowed: false, retryAt: new Date(oldest.getTime() + ONE_HOUR_MS) };
}

export async function recordIpAction(ip: string, action: string): Promise<void> {
  await prisma.ipActionLog.create({ data: { ip, action } });
}

// Helper to extract IP from request headers (for use in server actions).
// Server actions don't get a Request object directly; the caller should pass headers().
// For Next.js App Router, use:
//   import { headers } from 'next/headers';
//   const ip = await getClientIp();
// (which reads x-forwarded-for / x-real-ip).
export async function getClientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const h = await headers();
  // x-forwarded-for can be a comma-separated list — first IP is the client.
  const xff = h.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return h.get('x-real-ip') ?? 'unknown';
}
