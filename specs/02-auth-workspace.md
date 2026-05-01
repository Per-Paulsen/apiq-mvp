# Epic 02 — Auth + Workspace

> Wires Auth.js v5 (Credentials) and the multi-tenant Workspace + User foundation. Every app model from Epic 03+ is workspace-scoped.

## Scope

- Install Auth.js v5 (next-auth) with the Credentials provider, JWT sessions, bcrypt for password hashing.
- Edge-safe split: `src/lib/auth.config.ts` (route protection only, no Node-only imports) + `src/lib/auth.ts` (full config with Credentials, Prisma adapter).
- Define Prisma models: `User`, `Account`, `Session`, `VerificationToken` (Auth.js standard), `Workspace`, `UserWorkspace` (join — supports many-to-many for v0.2 readiness, but constrained to ≤1 active workspace per user in v0.1), `IpActionLog { id, ip, action, createdAt }` (IP-scoped rate-limit storage; distinct from Workspace-scoped `WorkspaceActionLog` since signup is unauthenticated). Indexed on `(ip, action, createdAt desc)`.
- Implement signup flow: `(auth)/signup/page.tsx` — email + password form with **anti-enumeration defenses** (decision per `specs/ind-epic-review.md` Q3.1 strict variant: CAPTCHA + IP rate-limit + honeypot):
   - **CAPTCHA:** Cloudflare Turnstile widget (`@marsidev/react-turnstile` or vanilla embed), site key from `TURNSTILE_SITE_KEY`. Server-verifies the token on submit using `TURNSTILE_SECRET_KEY`. Reject submission if Turnstile validation fails.
   - **Honeypot field:** hidden `<input name="website">` styled `display:none` + `aria-hidden`. Reject submission if non-empty (a bot filled it).
   - **Time-trap:** record form-render timestamp in a hidden field; reject submission if (now − rendered) < 2000 ms (instant submit = bot).
- `signupAction()` server action:
   - **IP rate-limit check:** count `IpActionLog WHERE ip = X AND action = 'signup' AND createdAt > NOW()-1h`; reject (`{ kind: 'rate_limited' }`) if ≥5.
   - server-verify Turnstile token via Cloudflare API
   - check honeypot + time-trap (these are usually checked client-side as well, but MUST also be re-checked server-side)
   - validates email format and password length (≥8 chars)
   - hashes password with bcrypt
   - creates `User`
   - auto-creates a `Workspace` with `name = email.split('@')[0]`
   - creates a `UserWorkspace` linking them
   - inserts `IpActionLog` row (action='signup', regardless of success — counts attempts)
   - signs the user in
   - redirects to `/specs` (placeholder route owned by Epic 07)
- Implement login flow: `(auth)/login/page.tsx` — email + password form, uses Auth.js `signIn('credentials', …)`.
- Implement logout: server action `signOutAction()`, used later by Settings (Epic 07).
- Provide `getRequiredSession()` helper in `src/lib/session.ts`: returns `{ userId, workspaceId, email }` or redirects to `/login` if unauthenticated. Throws if a logged-in user has no workspace (data integrity invariant).
- Wire middleware (`middleware.ts`) using `auth.config.ts` to protect all `(app)/*` routes — unauthenticated requests redirect to `/login?redirectTo=…`.
- Add a temporary placeholder `(app)/specs/page.tsx` that calls `getRequiredSession()` and renders the user's email — proves the auth + session pipeline end-to-end. Epic 07 replaces this with the real Specs list.
- Add `.env` entries for `AUTH_SECRET`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (all already in Epic 01 `.env.example`).
- Tests (Vitest): unit tests for `signupAction` (happy path, duplicate email, weak password) and `getRequiredSession` (returns shape, throws when no workspace). Auth.js callbacks are mocked.

## Acceptance criteria

1. Prisma migration `add_auth_and_workspace` creates: `User`, `Account`, `Session`, `VerificationToken`, `Workspace`, `UserWorkspace`, `IpActionLog`. All app-model FKs in later epics will reference `Workspace.id`.
2. `Workspace` has fields `id, name, createdAt, updatedAt`. `UserWorkspace` has `userId, workspaceId, role` (role default `'owner'`, future-proofs v0.2 team features but only `'owner'` is used in v0.1).
3. Signup at `/signup` creates `User` + `Workspace` + `UserWorkspace` atomically (single Prisma transaction). On success, the user is redirected to `/specs` and is logged in.
4. Signup form rejects: invalid email format, password <8 chars, duplicate email — each with a clear field-level error.
5. Login at `/login` accepts correct credentials, sets a JWT session cookie, redirects to `/specs` (or to `?redirectTo=` if present).
6. Login rejects wrong password / unknown email with a single non-enumerating error message ("Invalid email or password").
7. Visiting `/specs` while unauthenticated redirects to `/login?redirectTo=/specs`.
8. `getRequiredSession()` returns `{ userId, workspaceId, email }` for an authenticated user.
9. Calling `getRequiredSession()` for a user with no `UserWorkspace` row throws an `Error("user has no workspace — data integrity violation")` (this is a should-never-happen guard).
10. Server-side `signOutAction()` clears the session and redirects to `/login`.
11. All forms use shadcn/ui `Form`, `Input`, `Button`, `Label` components. The `(auth)/layout.tsx` renders a centered card container (max-w-sm, vertically centered, no sidebar/topbar) per `prd-decisions.md` §"Layout".
12. Vitest tests for `signupAction` and `getRequiredSession` pass.
13. `middleware.ts` builds and runs in the Edge runtime: its import graph (transitively via `auth.config.ts`) does NOT include `bcrypt`, `@/generated/prisma/client`, or `@/lib/prisma`. Verifiable via `next build` succeeding without an "Edge runtime" import error.
14. Signup with no Turnstile token (or invalid token) is rejected with `{ kind: 'captcha_failed' }` and no User is created. Verifiable via Vitest by mocking the Turnstile verify endpoint to return failure.
15. Signup with the honeypot field non-empty is rejected with `{ kind: 'honeypot_triggered' }`; no User created.
16. Signup submitted in <2000 ms after render is rejected with `{ kind: 'too_fast' }`; no User created.
17. The 6th signup attempt from the same IP within 1 hour returns `{ kind: 'rate_limited', retryAt }`; no User created. Each attempt (success OR fail) writes an `IpActionLog` row.

## Out of scope

- E-mail verification (no mail provider in v0.1 — see brainstorming E2).
- Password reset flow (no mail provider in v0.1).
- OAuth providers (GitHub, Google) — v0.2.
- Magic-link auth — v0.2.
- Workspace switcher / multi-workspace UI — v0.2 (the `UserWorkspace` join is future-proofing only; v0.1 enforces ≤1 row per user via app logic, not a DB constraint).
- Workspace invitations / team roles — v0.2.
- Account deletion — v0.2.
- Rate limiting on **login** — covered cross-cutting in Epic 04 / Epic 08 hardening. (Signup IP-rate-limit IS in scope here per Q3.1 anti-enumeration decision.)
- Full signup-enumeration prevention via "always say 'check your email'" pattern — requires mailer, deferred to v0.2 (E2). v0.1 accepts the residual enumeration risk after CAPTCHA + IP-rate-limit + honeypot mitigations.

## Domain terms

- **Workspace** — the multi-tenancy boundary. Every Spec, SpecVersion, Finding, LLMCall is scoped to one Workspace via `workspaceId`.
- **UserWorkspace** — join table between User and Workspace, with `role`. v0.1 always has 1 row per user with `role = 'owner'`.
- **`getRequiredSession()`** — the canonical server-side helper to obtain the current user + workspace. Used by every protected server component and server action. Replaces direct calls to `auth()`. In v0.1 it queries the user's single `UserWorkspace` row; if multiple rows exist (should never happen in v0.1), it throws — there is no "active workspace" selection logic until v0.2.
- **Edge-safe auth config** — `src/lib/auth.config.ts` contains only middleware-relevant config (route matchers, callbacks that don't touch the DB). The full config in `src/lib/auth.ts` imports Prisma and bcrypt and is Node-runtime only.
- **Credentials provider** — Auth.js Credentials provider with a custom `authorize()` that bcrypt-compares the password against `User.passwordHash`.
- **Anti-enumeration defenses** — Signup is protected by Cloudflare Turnstile CAPTCHA + IP-rate-limit (5/h per IP) + honeypot field + 2s minimum submit time. These mitigate but do not fully prevent signup-enumeration; the residual risk is accepted for v0.1 per `specs/ind-epic-review.md` Q3.1. v0.2 + mailer can implement the "always show 'check your email'" pattern for full prevention.
- **`IpActionLog`** — IP-scoped rate-limit storage. Sibling table to Epic 03's `WorkspaceActionLog`; the two tables share the same `{ id, scope_field, action, createdAt }` shape but `IpActionLog.ip` (string) is the scope key while `WorkspaceActionLog.workspaceId` (FK) is. Use `IpActionLog` for unauthenticated actions where no workspace context exists (signup); use `WorkspaceActionLog` for authenticated actions (URL pull, apply, …). They are intentionally NOT unified into one polymorphic table because Prisma doesn't model that cleanly and the two scoping concepts are conceptually different.

## Open questions

- Password storage column name: `passwordHash` (recommended, mirrors Auth.js examples) vs `password` (less safe to read in logs). Default to `passwordHash`.
- Should `Workspace.name` default to email local-part or to `"<local-part>'s workspace"`? Brainstorming E3 says local-part — confirm during implementation.
- Should the v0.1 1-workspace-per-user invariant be enforced via a DB unique constraint on `UserWorkspace.userId`, or only in app logic? Recommendation: app logic only, so v0.2 doesn't require a destructive migration. Document the invariant in the Prisma schema comment.
- Session cookie domain / SameSite — defaults are fine for single-domain Vercel deploy; revisit if a custom domain is set up.
