# Epic 02 — Auth + Workspace

> Wires Auth.js v5 (Credentials) and the multi-tenant Workspace + User foundation. Every app model from Epic 03+ is workspace-scoped.

## Scope

- Install Auth.js v5 (next-auth) with the Credentials provider, JWT sessions, bcrypt for password hashing.
- Edge-safe split: `src/lib/auth.config.ts` (route protection only, no Node-only imports) + `src/lib/auth.ts` (full config with Credentials, Prisma adapter).
- Define Prisma models: `User`, `Account`, `Session`, `VerificationToken` (Auth.js standard), `Workspace`, `UserWorkspace` (join — supports many-to-many for v0.2 readiness, but constrained to ≤1 active workspace per user in v0.1).
- Implement signup flow: `(auth)/signup/page.tsx` — email + password form, server action `signupAction()` that:
   - validates email format and password length (≥8 chars)
   - hashes password with bcrypt
   - creates `User`
   - auto-creates a `Workspace` with `name = email.split('@')[0]`
   - creates a `UserWorkspace` linking them
   - signs the user in
   - redirects to `/specs` (placeholder route owned by Epic 07)
- Implement login flow: `(auth)/login/page.tsx` — email + password form, uses Auth.js `signIn('credentials', …)`.
- Implement logout: server action `signOutAction()`, used later by Settings (Epic 07).
- Provide `getRequiredSession()` helper in `src/lib/session.ts`: returns `{ userId, workspaceId, email }` or redirects to `/login` if unauthenticated. Throws if a logged-in user has no workspace (data integrity invariant).
- Wire middleware (`middleware.ts`) using `auth.config.ts` to protect all `(app)/*` routes — unauthenticated requests redirect to `/login?redirectTo=…`.
- Add a placeholder `(app)/specs/page.tsx` that calls `getRequiredSession()` and renders the user's email — proves the auth + session pipeline end-to-end.
- Add `.env` entries for `AUTH_SECRET` (already in Epic 01 `.env.example`).
- Tests (Vitest): unit tests for `signupAction` (happy path, duplicate email, weak password) and `getRequiredSession` (returns shape, throws when no workspace). Auth.js callbacks are mocked.

## Acceptance criteria

1. Prisma migration `add_auth_and_workspace` creates: `User`, `Account`, `Session`, `VerificationToken`, `Workspace`, `UserWorkspace`. All app-model FKs in later epics will reference `Workspace.id`.
2. `Workspace` has fields `id, name, createdAt, updatedAt`. `UserWorkspace` has `userId, workspaceId, role` (role default `'owner'`, future-proofs v0.2 team features but only `'owner'` is used in v0.1).
3. Signup at `/signup` creates `User` + `Workspace` + `UserWorkspace` atomically (single Prisma transaction). On success, the user is redirected to `/specs` and is logged in.
4. Signup form rejects: invalid email format, password <8 chars, duplicate email — each with a clear field-level error.
5. Login at `/login` accepts correct credentials, sets a JWT session cookie, redirects to `/specs` (or to `?redirectTo=` if present).
6. Login rejects wrong password / unknown email with a single non-enumerating error message ("Invalid email or password").
7. Visiting `/specs` while unauthenticated redirects to `/login?redirectTo=/specs`.
8. `getRequiredSession()` returns `{ userId, workspaceId, email }` for an authenticated user.
9. Calling `getRequiredSession()` for a user with no `UserWorkspace` row throws an `Error("user has no workspace — data integrity violation")` (this is a should-never-happen guard).
10. Server-side `signOutAction()` clears the session and redirects to `/login`.
11. All forms use shadcn/ui `Form`, `Input`, `Button`, `Label` components.
12. Vitest tests for `signupAction` and `getRequiredSession` pass.

## Out of scope

- E-mail verification (no mail provider in v0.1 — see brainstorming E2).
- Password reset flow (no mail provider in v0.1).
- OAuth providers (GitHub, Google) — v0.2.
- Magic-link auth — v0.2.
- Workspace switcher / multi-workspace UI — v0.2 (the `UserWorkspace` join is future-proofing only; v0.1 enforces ≤1 row per user via app logic, not a DB constraint).
- Workspace invitations / team roles — v0.2.
- Account deletion — v0.2.
- Rate limiting on signup/login — covered cross-cutting in Epic 04 / Epic 08 hardening.

## Domain terms

- **Workspace** — the multi-tenancy boundary. Every Spec, SpecVersion, Finding, LLMCall is scoped to one Workspace via `workspaceId`.
- **UserWorkspace** — join table between User and Workspace, with `role`. v0.1 always has 1 row per user with `role = 'owner'`.
- **`getRequiredSession()`** — the canonical server-side helper to obtain the current user + workspace. Used by every protected server component and server action. Replaces direct calls to `auth()`.
- **Edge-safe auth config** — `src/lib/auth.config.ts` contains only middleware-relevant config (route matchers, callbacks that don't touch the DB). The full config in `src/lib/auth.ts` imports Prisma and bcrypt and is Node-runtime only.
- **Credentials provider** — Auth.js Credentials provider with a custom `authorize()` that bcrypt-compares the password against `User.passwordHash`.

## Open questions

- Password storage column name: `passwordHash` (recommended, mirrors Auth.js examples) vs `password` (less safe to read in logs). Default to `passwordHash`.
- Should `Workspace.name` default to email local-part or to `"<local-part>'s workspace"`? Brainstorming E3 says local-part — confirm during implementation.
- Should the v0.1 1-workspace-per-user invariant be enforced via a DB unique constraint on `UserWorkspace.userId`, or only in app logic? Recommendation: app logic only, so v0.2 doesn't require a destructive migration. Document the invariant in the Prisma schema comment.
- Session cookie domain / SameSite — defaults are fine for single-domain Vercel deploy; revisit if a custom domain is set up.
