import 'server-only';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileResult =
  | { success: true }
  | { success: false; errorCodes: string[] };

export async function verifyTurnstileToken(token: string, ip?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Fail closed — don't accept signups if the server isn't configured.
    return { success: false, errorCodes: ['missing-secret'] };
  }
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.append('remoteip', ip);
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    const data = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
    if (data.success) return { success: true };
    return { success: false, errorCodes: data['error-codes'] ?? [] };
  } catch {
    return { success: false, errorCodes: ['network-error'] };
  }
}
