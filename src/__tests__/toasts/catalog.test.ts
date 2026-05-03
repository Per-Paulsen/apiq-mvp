/**
 * TOASTS catalog + showToast dispatch tests (Epic 08).
 *
 * - Asserts every entry in the canonical catalog has the expected shape.
 * - Asserts `showToast` dispatches to the correct sonner method per kind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  Toaster: () => null,
}));

import { toast } from 'sonner';

import { showToast, TOASTS } from '@/lib/toasts';

describe('TOASTS catalog', () => {
  it('every entry has a valid kind and a non-empty message', () => {
    const entries = Object.entries(TOASTS);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(['info', 'success', 'error']).toContain(value.kind);
      expect(typeof value.message).toBe('string');
      expect(value.message.length, `TOASTS.${key} message must be non-empty`).toBeGreaterThan(0);
    }
  });
});

describe('showToast — sonner dispatch', () => {
  beforeEach(() => {
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.info).mockClear();
  });

  it('success kind calls toast.success with the message', () => {
    showToast(TOASTS.exportedJson);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(TOASTS.exportedJson.message);
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('info kind calls toast.info with the message', () => {
    showToast(TOASTS.reanalyzeStarted);
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.info).toHaveBeenCalledWith(TOASTS.reanalyzeStarted.message);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('error kind calls toast.error with the message', () => {
    showToast({ kind: 'error', message: 'boom' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('boom');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
