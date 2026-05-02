/**
 * Vitest unit tests for `signupAction` (Epic 02 — Auth + Workspace).
 *
 * Covers AC #4, #14, #15, #16, #17 plus the happy path. All external
 * dependencies (Prisma, Auth.js, Turnstile, rate-limit, bcrypt,
 * next/navigation) are mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mocks (must be declared before importing the module under test) ------

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    workspace: {
      create: vi.fn(),
    },
    userWorkspace: {
      create: vi.fn(),
    },
    ipActionLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({
  signIn: vi.fn(),
  auth: vi.fn(),
}));

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkSignupIpRateLimit: vi.fn(),
  recordIpAction: vi.fn(),
  getClientIp: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
}));

vi.mock('bcrypt', () => ({
  default: {
    hash: vi.fn(async (pw: string) => `hashed-${pw}`),
    compare: vi.fn(),
  },
}));

// ---- Imports (after mocks) -------------------------------------------------

import { signupAction } from '@/app/(auth)/signup/actions';
import { signIn } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  checkSignupIpRateLimit,
  getClientIp,
  recordIpAction,
} from '@/lib/rate-limit';
import { verifyTurnstileToken } from '@/lib/turnstile';

// ---- Helpers ---------------------------------------------------------------

type FormDataInit = {
  email?: string;
  password?: string;
  website?: string; // honeypot
  renderedAt?: number | string;
  'cf-turnstile-response'?: string;
};

/**
 * Build a FormData object with the right keys for `signupAction`.
 * Pass overrides via `init`. Defaults yield a "valid happy path" payload.
 */
function buildFormData(init: FormDataInit = {}): FormData {
  const fd = new FormData();
  const defaults: FormDataInit = {
    email: 'alice@example.com',
    password: 'correcthorse',
    website: '',
    // 5s ago — passes the 2s time-trap.
    renderedAt: Date.now() - 5000,
    'cf-turnstile-response': 'turnstile-token',
  };
  const merged = { ...defaults, ...init };
  for (const [k, v] of Object.entries(merged)) {
    if (v === undefined || v === null) continue;
    fd.set(k, String(v));
  }
  return fd;
}

// ---- Tests -----------------------------------------------------------------

describe('signupAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default "happy path" mock setup — individual tests override as needed.
    vi.mocked(getClientIp).mockResolvedValue('1.2.3.4');
    vi.mocked(checkSignupIpRateLimit).mockResolvedValue({ allowed: true });
    vi.mocked(recordIpAction).mockResolvedValue(undefined);
    vi.mocked(verifyTurnstileToken).mockResolvedValue({ success: true });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    // Transaction mock: invoke the callback with a mock `tx` that mirrors the
    // Prisma model surface used by the action.
    vi.mocked(prisma.$transaction).mockImplementation(async (cb: unknown) => {
      const tx = {
        user: {
          create: vi.fn(async (args: { data: { email: string; passwordHash: string } }) => ({
            id: 'user-id-1',
            email: args.data.email,
            passwordHash: args.data.passwordHash,
            name: null,
          })),
        },
        workspace: {
          create: vi.fn(async (args: { data: { name: string } }) => ({
            id: 'workspace-id-1',
            name: args.data.name,
          })),
        },
        userWorkspace: {
          create: vi.fn(async (args: unknown) => args),
        },
      };
      // Expose the inner mocks so individual tests can assert against them.
      // We stash the latest `tx` on the $transaction mock itself.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (prisma.$transaction as any).__lastTx = tx;
      return await (cb as (t: typeof tx) => Promise<unknown>)(tx);
    });

    vi.mocked(signIn).mockResolvedValue(undefined as never);
  });

  it('happy path — creates user, workspace, userWorkspace, signs in', async () => {
    const fd = buildFormData({
      email: 'alice@example.com',
      password: 'correcthorse',
    });

    const result = await signupAction(null, fd);

    expect(result).toEqual({ success: true });

    // Transaction was invoked.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    // Inner tx mock created user with hashed password.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tx = (prisma.$transaction as any).__lastTx as {
      user: { create: ReturnType<typeof vi.fn> };
      workspace: { create: ReturnType<typeof vi.fn> };
      userWorkspace: { create: ReturnType<typeof vi.fn> };
    };

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: 'alice@example.com',
        passwordHash: 'hashed-correcthorse',
      },
    });
    expect(tx.workspace.create).toHaveBeenCalledWith({
      data: { name: 'alice' },
    });
    expect(tx.userWorkspace.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-id-1',
        workspaceId: 'workspace-id-1',
        role: 'owner',
      },
    });

    // signIn was called.
    expect(signIn).toHaveBeenCalledWith('credentials', {
      email: 'alice@example.com',
      password: 'correcthorse',
      redirectTo: '/specs',
    });

    // IP action was recorded.
    expect(recordIpAction).toHaveBeenCalledWith('1.2.3.4', 'signup');
  });

  it('duplicate email — returns duplicate_email, no user.create', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'existing-user',
      email: 'alice@example.com',
      passwordHash: 'whatever',
      name: null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const fd = buildFormData({ email: 'alice@example.com' });
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'duplicate_email' },
    });

    // No user.create on the prisma surface.
    expect(prisma.user.create).not.toHaveBeenCalled();
    // The transaction was never entered.
    expect(prisma.$transaction).not.toHaveBeenCalled();
    // signIn was not called.
    expect(signIn).not.toHaveBeenCalled();
  });

  it('weak password (<8 chars) — returns weak_password, no DB writes', async () => {
    const fd = buildFormData({ password: 'short' });
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'weak_password' },
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('invalid email format — returns invalid_email', async () => {
    const fd = buildFormData({ email: 'not-an-email' });
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'invalid_email' },
    });

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('captcha fails (AC #14) — returns captcha_failed, no User created', async () => {
    vi.mocked(verifyTurnstileToken).mockResolvedValue({
      success: false,
      errorCodes: ['invalid-input-response'],
    });

    const fd = buildFormData();
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'captcha_failed' },
    });

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('honeypot triggered (AC #15) — returns honeypot_triggered, no User created', async () => {
    const fd = buildFormData({ website: 'bot' });
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'honeypot_triggered' },
    });

    // Honeypot is checked first, before any I/O.
    expect(getClientIp).not.toHaveBeenCalled();
    expect(checkSignupIpRateLimit).not.toHaveBeenCalled();
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('time-trap too fast (AC #16) — returns too_fast, no User created', async () => {
    const fd = buildFormData({ renderedAt: Date.now() - 100 }); // 100ms old
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: { kind: 'too_fast' },
    });

    expect(getClientIp).not.toHaveBeenCalled();
    expect(checkSignupIpRateLimit).not.toHaveBeenCalled();
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('IP rate-limit (AC #17) — returns rate_limited, still records IP action, no User created', async () => {
    const retryAt = new Date(Date.now() + 30 * 60 * 1000); // 30min from now
    vi.mocked(checkSignupIpRateLimit).mockResolvedValue({
      allowed: false,
      retryAt,
    });

    const fd = buildFormData();
    const result = await signupAction(null, fd);

    expect(result).toEqual({
      success: false,
      error: {
        kind: 'rate_limited',
        retryAt: retryAt.toISOString(),
      },
    });

    // Per spec: every attempt counts.
    expect(recordIpAction).toHaveBeenCalledWith('1.2.3.4', 'signup');

    // Captcha verification short-circuited; no User created.
    expect(verifyTurnstileToken).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });
});
