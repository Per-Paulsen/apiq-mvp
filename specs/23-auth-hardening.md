# Epic 23 — Auth Hardening

> Production-ready auth: email-verification (strict block), forgot-password flow, login rate-limit (per-IP + per-email), bcrypt cost-factor 12+. All required before any public access; production launches with a fresh DB, so no migration concern.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Auth & Account block", [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"Auth Hardening".

## Scope

### Email verification (strict block)

- Schema: extend Auth.js `User` model — `emailVerifiedAt: DateTime?`, `verificationTokenHash: String?`, `verificationTokenExpiresAt: DateTime?`.
  - Auth.js's stock `VerificationToken` table already exists (Epic 02); reuse where possible. If NextAuth-shape doesn't fit our flow, add custom fields on `User`.
- After successful signup (`signupAction`):
  - Generate 32-char base62 verification token.
  - Hash via SHA-256 (cheaper than bcrypt; token is single-use + short-lived).
  - Store `verificationTokenHash` + `verificationTokenExpiresAt = now + 24h`.
  - Send verification email via Resend → link `https://apiq.dev/auth/verify?token=<plaintext>&email=<email>`.
  - Redirect post-signup to `/auth/verify-email-pending` page: *"Check your email to verify your account."* — with Resend-button.
- `loginAction` extended: if `User.emailVerifiedAt IS NULL`, refuse login with `{ error: { kind: 'email_not_verified' } }`. UI toast: *"Please verify your email to continue. Resend?"* with Resend button.
- `/auth/verify` route handler:
  - Reads `token` + `email` from query.
  - SHA-256 the token, looks up `User` by email, checks `verificationTokenHash` matches and `verificationTokenExpiresAt > now`.
  - On match → set `emailVerifiedAt = now`, clear the token fields, redirect to `/login?verified=1`.
  - On mismatch / expired → render error page with "Resend verification" button.
- `resendVerificationAction({ email })` server action: rate-limited to 3/email/h (action-key `verification_resend`).

### Forgot-password flow

- New page `/auth/forgot-password` with form (email input + submit).
- `forgotPasswordAction({ email })`:
  - Anti-enumeration: ALWAYS returns success (`*"If your email exists in our system, you'll receive a reset link."*`), regardless of whether the email is in the DB.
  - If email exists, generate 32-char base62 reset token, SHA-256 hash, store `resetTokenHash` + `resetTokenExpiresAt = now + 1h` on User.
  - Send email via Resend with link `https://apiq.dev/auth/reset?token=<plaintext>&email=<email>`.
  - Rate-limit: 3/email/h on `password_reset_request`.
- `/auth/reset` page:
  - Reads token + email. Verifies same as verify-flow (SHA-256 compare + expiry check).
  - Shows "Set new password" form on valid token.
  - On submit: bcrypt-12 hash the new password, update `User.passwordHash`, clear reset-token fields, redirect to `/login?reset=1`.

### Login rate-limit (per-IP + per-email)

- Extend existing `IpActionLog` infrastructure with two new action-keys:
  - `login_attempt` (5 failed/IP/15min)
  - `login_failed_email` (10 failed/email/h, with email-hash as sub-key)
- `loginAction` flow:
  - Pre-check both rate-limits (IP + email-hash). If exceeded → return `{ error: { kind: 'rate_limited', retryAt } }`.
  - Attempt bcrypt compare on User.passwordHash.
  - On failure → log to BOTH `login_attempt` and `login_failed_email`. Return `{ error: { kind: 'invalid_credentials' } }`.
  - On success → log success to neither (success entries are not rate-limited; we only count failures).
- Successful login resets the per-email failure window (delete recent `login_failed_email` rows for that email-hash).
- UI toast on `rate_limited`: *"Too many failed attempts. Try again at {retryAt}."*

### Bcrypt cost-factor 12

- Update `signupAction` and `resetPasswordAction` to use bcrypt cost factor `12` (currently 10).
- `loginAction`'s bcrypt-compare works against any cost factor, no migration needed.
- Production DB starts fresh per `brainstorming-launch.md` §"Existing v0.1-Constraints"; dev DB stays at cost-factor 10 (irrelevant for production).

### Email templates (Resend)

- New `src/lib/email/` directory with three React-Email templates (or plain HTML if React-Email is overkill):
  - `verification-email.tsx` — heading, "Hi {name}", verification button, fallback link.
  - `password-reset-email.tsx` — same shape.
  - `welcome-email.tsx` (handed to Epic 26 Operational, but template lives here).
- All templates have `Reply-To: founder@apiq.dev`. From-address: `apiq <noreply@apiq.dev>` (until SPF/DKIM warm-up complete; then `noreply@apiq.dev`). Apex-domain DNS for SPF/DKIM/DMARC configured in Epic 28 (Production).

### Tests

- Vitest:
  - `signupAction` happy path → User created with `emailVerifiedAt = null`, verification token stored, email sent (mock Resend).
  - `loginAction` with unverified user → `kind: 'email_not_verified'`.
  - `/auth/verify` with valid token → User.emailVerifiedAt set; redirect to login.
  - `/auth/verify` with expired token → error page rendered.
  - `forgotPasswordAction` always returns success (anti-enumeration); only sends email if user exists.
  - `/auth/reset` with valid token → bcrypt-12 hash on the new password.
  - Login rate-limit: 6th failed attempt within 15 min returns rate_limited.
  - Login rate-limit: 11th failed attempt for same email within 1 h returns rate_limited.
  - Successful login resets the failure-count window for that email.
  - `resendVerificationAction` 4th call within 1 h returns rate_limited.
- Browser smoke check: full signup → email arrives (use Resend test mode) → click → verified → log in. Documented in results.

## Acceptance criteria

1. Schema migration adds `User.emailVerifiedAt`, `verificationTokenHash`, `verificationTokenExpiresAt`, `resetTokenHash`, `resetTokenExpiresAt`.
2. Signup redirects to `/auth/verify-email-pending` after creating User; verification email is sent.
3. `/auth/verify` route validates token + expiry, sets `emailVerifiedAt`, redirects to login.
4. Login refuses `User` with `emailVerifiedAt = null`; UI surfaces the specific error + Resend button.
5. `resendVerificationAction` rate-limited 3/email/h.
6. `forgotPasswordAction` always returns success; only sends email when user exists; rate-limited 3/email/h.
7. `/auth/reset` validates token, sets new password (bcrypt-12), redirects to login.
8. Login rate-limit 5/IP/15min + 10/email/h with `IpActionLog`.
9. Successful login resets the per-email failure window.
10. Bcrypt cost-factor 12 in signup and reset paths.
11. Email templates exist for verification + password-reset; Resend-configured.
12. Vitest tests pass.
13. Browser smoke documented in results: full signup-verify-login + forgot-password-reset flows.

## Out of scope

- 2FA — v2+ per PRD §5.
- SSO / SAML — v2+.
- Magic-link login (passwordless) — v1.1 if user demand.
- Login-from-multiple-devices session-management UI — v1.1.
- Admin-impersonation flow — v2.
- Password-strength meter on signup form (UI polish only) — Epic 27 if desired.
- Email-change flow (existing user changes email) — v1.1.
- Bcrypt-cost-factor migration for existing dev users — irrelevant per production-fresh-start.

## Domain terms

- **Email verification (strict-block)** — User cannot log in until `emailVerifiedAt != null`.
- **Verification token** — single-use random base62 string, SHA-256 hashed at rest, 24 h TTL.
- **Reset token** — single-use random base62 string, SHA-256 hashed at rest, 1 h TTL.
- **Anti-enumeration** — forgot-password endpoint never reveals whether an email is registered.
- **Login failure window** — rolling 15 min (per-IP) + 1 h (per-email) windows tracking failed attempts.
- **`IpActionLog`** — existing v0.1 table extended with new action-keys (`login_attempt`, `login_failed_email`, `verification_resend`, `password_reset_request`).

## Open questions

- Should we also rate-limit successful logins (e.g. anti-credential-stuffing where attacker has valid creds)? Recommendation: no for v1; successful login = legitimate user. Re-evaluate if abuse signals.
- Reset-token TTL: 1 h vs 24 h? 1 h is industry-tight; 24 h is friendlier for slow-readers. Recommendation: 1 h with easy "Resend" mechanism.
- Resend (email service) sandboxing: dev should use Resend test-mode API key, production uses live key. Wire env-var split in Epic 28.
- SPF/DKIM/DMARC warm-up: cold-domain emails to gmail/outlook get spam-foldered. Plan: send 100 transactional/day for first 2 weeks, ramp slowly. Detail in Epic 28 or separate runbook.
- Edge case: User signs up but forgets to verify, then tries to sign up again with same email. Handling: signup with already-existing-but-unverified email → re-send verification + show *"Account already exists; new verification email sent."*. Avoids account-creation-spam loop.
