'use server';

/**
 * Signup server action. Implements all four anti-enumeration defenses
 * (CAPTCHA + IP rate-limit + honeypot + 2s time-trap) per spec AC #14–17,
 * then atomically creates `User` + `Workspace` + `UserWorkspace` and signs
 * the user in with `signIn('credentials', ...)`.
 *
 * Returns a `SignupResult` for `useActionState` consumption — never throws
 * to the client per CLAUDE.md "Server actions" convention. The single
 * exception is `signIn()` itself, which throws a redirect on success that
 * Next.js intercepts; we re-throw it (it's not an `Error`-shaped object the
 * `try/catch` semantically owns).
 */
import bcrypt from 'bcrypt';
import { z } from 'zod';

import { signIn } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  checkSignupIpRateLimit,
  getClientIp,
  recordIpAction,
} from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';

const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type SignupErrorKind =
  | 'honeypot_triggered'
  | 'too_fast'
  | 'rate_limited'
  | 'captcha_failed'
  | 'invalid_email'
  | 'weak_password'
  | 'invalid_input'
  | 'duplicate_email'
  | 'unexpected';

export type SignupResult =
  | { success: true }
  | {
      success: false;
      error: {
        kind: SignupErrorKind;
        message?: string;
        retryAt?: string;
      };
    };

const TIME_TRAP_MIN_MS = 2000;

export async function signupAction(
  _prevState: SignupResult | null,
  formData: FormData,
): Promise<SignupResult> {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');
  const honeypot = String(formData.get('website') ?? '');
  const renderedAt = Number(formData.get('renderedAt') ?? '0');
  const turnstileToken = String(formData.get('cf-turnstile-response') ?? '');

  // 1. Honeypot — bots fill the hidden `website` field; humans never see it.
  //    Per spec AC #15: reject silently with `{ kind: 'honeypot_triggered' }`.
  if (honeypot.length > 0) {
    return { success: false, error: { kind: 'honeypot_triggered' } };
  }

  // 2. Time-trap — humans take >2s to type/tab through the form; bots submit
  //    instantly. Per spec AC #16. `renderedAt` is the SSR timestamp of the
  //    page load (a hidden input on the form). Negative or zero means missing.
  if (!renderedAt || Date.now() - renderedAt < TIME_TRAP_MIN_MS) {
    return { success: false, error: { kind: 'too_fast' } };
  }

  const ip = await getClientIp();

  // 3. IP rate-limit. Spec AC #17: 6th attempt within 1h fails, every attempt
  //    (success or fail) writes an `IpActionLog` row. Order matters: check
  //    BEFORE recording so the limit returns the boundary at the 5th attempt.
  const rateCheck = await checkSignupIpRateLimit(ip);
  if (!rateCheck.allowed) {
    // Still record this attempt — the spec is unambiguous: every attempt
    // counts, including ones we reject. This means the rolling window slides
    // forward as long as bots keep trying, which is the intended deterrent.
    await recordIpAction(ip, 'signup');
    return {
      success: false,
      error: {
        kind: 'rate_limited',
        retryAt: rateCheck.retryAt.toISOString(),
      },
    };
  }

  // Record the attempt now — before any further work. If we crash later, the
  // IP still gets credit for the attempt. (Doing this AFTER captcha would let
  // an attacker burn unlimited captcha verifications without a record.)
  await recordIpAction(ip, 'signup');

  // 4. Turnstile server-side verify (spec AC #14). Pass remote IP so
  //    Cloudflare can correlate widget renders with verifications.
  const captcha = await verifyTurnstileToken(turnstileToken, ip);
  if (!captcha.success) {
    return { success: false, error: { kind: 'captcha_failed' } };
  }

  // 5. Input validation. Distinguish email-format vs weak-password so the UI
  //    can render the right field-level error (spec AC #4).
  const parsed = SignupSchema.safeParse({ email, password });
  if (!parsed.success) {
    const issues = parsed.error.issues;
    if (issues.some((i) => i.path.includes('email'))) {
      return { success: false, error: { kind: 'invalid_email' } };
    }
    if (issues.some((i) => i.path.includes('password'))) {
      return { success: false, error: { kind: 'weak_password' } };
    }
    return { success: false, error: { kind: 'invalid_input' } };
  }

  // 6. Duplicate-email check BEFORE bcrypt — saves ~100ms on the duplicate
  //    case (bcrypt cost factor 12). Spec AC #4 lists duplicate as a
  //    field-level error, so we surface it explicitly. (The brainstorming
  //    Q3.1 decision accepts the residual enumeration risk for v0.1.)
  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) {
    return { success: false, error: { kind: 'duplicate_email' } };
  }

  // 7. Hash + atomically create User + Workspace + UserWorkspace.
  //    Spec AC #3: single Prisma transaction.
  //    Workspace.name = email local-part per brainstorming E3 / spec open Q.
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const localPart = parsed.data.email.split('@')[0] ?? parsed.data.email;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: parsed.data.email, passwordHash },
    });
    const workspace = await tx.workspace.create({
      data: { name: localPart },
    });
    await tx.userWorkspace.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'owner',
      },
    });
  });

  // 8. Sign the user in. `signIn` throws a `redirect()` on success which
  //    Next.js's runtime catches — we MUST let it propagate (do not wrap in
  //    try/catch). This call returns no value when it succeeds; the redirect
  //    interrupts the function below. The fall-through `return` is for type
  //    safety only.
  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/specs',
  });

  return { success: true };
}
