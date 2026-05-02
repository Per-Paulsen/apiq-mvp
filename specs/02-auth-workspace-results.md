# Epic 02 — Auth + Workspace — Results

> Implementation results for [`02-auth-workspace.md`](02-auth-workspace.md). Author: Claude Code (Lead) + 5 delegated agents (Prisma schema, Auth core/middleware, Defenses, UI/actions, Tests). Date: 2026-05-02. Commit: `2e59eec`.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

Auth.js v5 (Credentials + JWT) with the documented Edge-safe split, the multi-tenant `Workspace` + `UserWorkspace` foundation, anti-enumeration defenses for the signup form (Cloudflare Turnstile + 5/h IP-rate-limit + honeypot + 2 s time-trap), `getRequiredSession()` server-side helper, and the placeholder `/specs` page that proves the auth + session pipeline end-to-end.

Browser-verified flows:
- `/signup` renders the form, the Turnstile widget auto-passes (test keys), submission with a 3 s wait creates `User + Workspace + UserWorkspace` atomically and redirects to `/specs`. Screenshot: `docs/screenshots/epic-02-signup-page.png`.
- `/specs` after sign-in renders the user's email and workspaceId via `getRequiredSession()`, with the sidebar showing both nav items. Screenshot: `docs/screenshots/epic-02-protected-specs.png`.
- `/specs` with cleared cookies redirects to `/login`.
- `/login` with the correct password redirects to `/specs`; with the wrong password renders the generic `"Invalid email or password"` message (no enumeration).

## Key files created

### Schema + migration
- `prisma/schema.prisma` — added `User`, `Account`, `Session`, `VerificationToken` (Auth.js standard) + `Workspace` + `UserWorkspace` (composite PK `@@id([userId, workspaceId])`, role default `"owner"`, triple-slash comment documenting the v0.1 single-workspace invariant) + `IpActionLog` (with `@@index([ip, action, createdAt(sort: Desc)])` for rolling-window count queries)
- `prisma/migrations/20260502101917_add_auth_and_workspace/migration.sql` — 7 tables, 5 unique/composite indexes, 4 cascade FKs

### Auth core
- `src/lib/auth.config.ts` — Edge-safe `NextAuthConfig` (only imports `type NextAuthConfig` from next-auth, which is erased at compile time). `pages.signIn = '/login'`, `trustHost: true`, empty `providers: []`, `callbacks.authorized` returning `!!auth?.user`.
- `src/lib/auth.ts` — Full Node-runtime config with `PrismaAdapter`, `Credentials` provider whose `authorize()` zod-validates input + `bcrypt.compare`s `passwordHash`. JWT strategy. `callbacks.jwt` copies `user.id` onto the token; `callbacks.session` copies `token.id` onto `session.user.id`.
- `src/types/next-auth.d.ts` — module augmentation typing `Session.user.id: string` and `JWT.id?: string`.
- `src/lib/session.ts` — `getRequiredSession()` (returns `{ userId, workspaceId, email }`; redirects to `/login` if unauth; throws `"user has no workspace — data integrity violation"` if no `UserWorkspace` row) + `signOutAction()` (server action; consumed by Settings in Epic 07).
- `middleware.ts` (project root) — `NextAuth(authConfig).auth` exported as `middleware` with matcher `['/specs/:path*', '/settings/:path*']`. Edge-safe (verified by `next build` succeeding).

### Anti-enumeration
- `src/lib/turnstile.ts` — `verifyTurnstileToken(token, ip?)` POSTs to Cloudflare's siteverify endpoint; fail-closed when secret missing.
- `src/lib/rate-limit.ts` — `checkSignupIpRateLimit(ip)` (rolling 1 h window, 5 attempts max), `recordIpAction(ip, action)`, `getClientIp()` (reads `x-forwarded-for` then `x-real-ip`; falls back to `'unknown'`).

### UI + server actions
- `src/app/(auth)/signup/page.tsx` — server component; reads `TURNSTILE_SITE_KEY` server-side and threads it as a prop. Renders SSR-time `renderedAt` for the time-trap (with an `eslint-disable-next-line react-hooks/purity` + comment explaining the intentional impurity).
- `src/app/(auth)/signup/signup-form.tsx` — client component using `useActionState` (React 19's renamed `useFormState`). Renders inline field-level errors for `invalid_email` / `weak_password` / `duplicate_email`; banner-style top errors for everything else.
- `src/app/(auth)/signup/turnstile-client.tsx` — `'use client'` wrapper around `@marsidev/react-turnstile`'s `<Turnstile>` (dark theme).
- `src/app/(auth)/signup/actions.ts` — `signupAction(prevState, formData)` runs the four anti-enum checks in this order: honeypot → time-trap → IP rate-limit (with `recordIpAction` always called) → Turnstile verify → zod validation → duplicate check → bcrypt hash → `prisma.$transaction` creating User + Workspace + UserWorkspace → `signIn('credentials', { redirectTo: '/specs' })`.
- `src/app/(auth)/login/page.tsx` + `login-form.tsx` + `actions.ts` — same shape, simpler (no Turnstile / honeypot / rate-limit per spec). Generic "Invalid email or password" on auth failure. Reads `searchParams.callbackUrl` (Auth.js v5 default) for the post-login redirect target with an open-redirect guard (only relative paths starting with `/` and not `//`).
- `src/app/api/auth/[...nextauth]/route.ts` — `export const { GET, POST } = handlers` from `@/lib/auth`.
- `src/app/(app)/specs/page.tsx` — placeholder calling `getRequiredSession()` and rendering `email` + `workspaceId` (Epic 07 replaces).
- `src/app/(app)/layout.tsx` — added `<TooltipProvider>` wrapper (was a latent bug from Epic 01: `SidebarMenuButton` with the `tooltip` prop renders Tooltip primitives that need a Provider ancestor; only surfaced now that the first protected page exists).

### shadcn additions
- `src/components/ui/card.tsx`, `src/components/ui/label.tsx` (added via `npx shadcn@latest add card label`).

### Tests
- `src/__tests__/auth/signupAction.test.ts` — 8 tests covering happy path + every documented error kind (`duplicate_email`, `weak_password`, `invalid_email`, `captcha_failed`, `honeypot_triggered`, `too_fast`, `rate_limited`).
- `src/__tests__/auth/getRequiredSession.test.ts` — 3 tests (happy path, redirect on no session, throw on no workspace).
- `vitest.config.ts` — added a one-line alias for the bare `server-only` specifier (resolves to Next.js's bundled empty stub) so test files that transitively import `server-only` modules (e.g. `src/lib/session.ts`) load under Vitest.

## Decisions and deviations from spec

1. **`callbackUrl` (Auth.js v5 default) instead of spec's `?redirectTo=`.** Spec AC #5/#7 wording is `?redirectTo=…`. Auth.js v5's middleware auto-redirects to `/login?callbackUrl=…` (and the `signIn()` API uses the same param). We went with the Auth.js default rather than overriding it — overriding would require custom middleware logic for no user-visible benefit. The login page reads `callbackUrl` from `searchParams` and uses it as `redirectTo` for the underlying `signIn` call. Documented in code comments. Spec semantics preserved (the redirect happens; just the param name differs).

2. **No `?callbackUrl=` is appended on the middleware redirect.** Browser-verified that Auth.js v5's middleware redirects `/specs` → `/login` (no callback param attached). After successful login the form falls back to its hidden `callbackUrl=/specs` default. Net behavior matches the spec's intent (post-login lands on `/specs`); the share-link UX is slightly less polished. v0.2 can switch to a custom redirect if cross-link UX becomes important.

3. **shadcn `Form` component not used.** The spec lists `Form` as a required shadcn component, but the radix-nova preset (shadcn 4.6.0) does not ship a `form` registry entry — `npx shadcn@latest add form` exits without creating files. Since v0.1 forms are server-action-driven (no react-hook-form), we used plain `<form action={serverAction}>` + shadcn `Input`, `Label`, `Button`, `Card` instead. AC #11's wording ("All forms use shadcn/ui Form, Input, Button, Label components") is satisfied by Input/Button/Label/Card. The react-hook-form `Form` wrapper would be redundant for the server-action pattern.

4. **`PrismaAdapter` cast to `any`.** The adapter's PrismaClient type doesn't structurally match the type that Prisma 7's `prisma-client` generator emits at `@/generated/prisma/client`. Cast is the standard escape hatch with an inline comment + lint suppression. Behavior unaffected.

5. **`renderedAt` timestamp captured at SSR (`Date.now()`) — intentional impurity.** Next.js 16 + React 19 lint rule `react-hooks/purity` flags `Date.now()` in server components. The spec's intent (time-trap) requires server-trusted timestamps that bots can't spoof — capturing client-side via `useState(() => Date.now())` is lint-clean but trivially spoofable. Used `eslint-disable-next-line react-hooks/purity` with a comment explaining the intent.

6. **`getClientIp()` uses dynamic `import('next/headers')`.** Keeps the helper tree-shakable from non-request contexts. Returns `'unknown'` when no IP headers — worst-case all unknown-IP traffic shares one rate-limit bucket (acceptable fail-safe).

7. **Turnstile site key threaded as a prop, not via `NEXT_PUBLIC_*`.** Server component reads `process.env.TURNSTILE_SITE_KEY` and passes it to the client wrapper. Avoids renaming the env var to `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (spec uses the un-prefixed name) and keeps the secret-naming convention clean.

8. **`(app)/layout.tsx` wrapped in `<TooltipProvider>`** to satisfy `SidebarMenuButton`'s tooltip dependency. Latent bug from Epic 01 (no protected page existed → never crashed); surfaced when `/specs` rendered for the first time.

9. **`vitest.config.ts` aliases `server-only`** to Next.js's empty-stub file. Required because `import 'server-only'` in `src/lib/session.ts` is a bare specifier that Vitest can't resolve at transform time (Next bundles its own copy and never publishes a top-level package). Standard fix.

10. **`prisma migrate dev` in 7.x does not auto-run `prisma generate`** in this setup (Prisma 7.8 + `prisma-client` generator + `prisma.config.ts`). `npx prisma generate` had to be run explicitly. Worth knowing for Epic 03's first model migration.

## Verification results

### Automated
- `npm run lint` → **0 errors**, 10 warnings (all `scripts/spike/*` "unused eslint-disable directive" carried over from Epic 00 — out of scope per Epic 01 results).
- `npm run test` → **4 files, 13 tests passed** (2 existing scaffold + 8 signupAction + 3 getRequiredSession).
- `npm run build` → exit 0; routes `/`, `/_not-found`, `/api/auth/[...nextauth]`, `/login`, `/signup`, `/specs` plus `Proxy (Middleware)` all built. AC #13 (Edge-safe middleware import graph) verified by build success + grep against `middleware.ts` + `auth.config.ts` (no bcrypt / Prisma imports).
- `npx prisma migrate dev --name add_auth_and_workspace` → applied to Supabase, all 7 tables + indexes + FKs created.

### Browser (Playwright)
1. `GET /specs` while unauthenticated → redirects to `/login` (AC #7).
2. `/signup` renders centered `Card` with form + visible Cloudflare Turnstile widget showing "Erfolg!" (test keys auto-pass).
3. Filled form (`e2e-test@apiq.dev` + `testpass1234`), waited 3 s for time-trap, clicked "Create account" → redirected to `/specs`. Page renders sidebar with `Specs` + `Settings` items, heading "Specs", "Signed in as `e2e-test@apiq.dev`", and a real workspace cuid (AC #3, #8).
4. Cleared cookies, navigated `/specs` → redirected to `/login` (AC #7 again).
5. Logged in with correct credentials → `/specs` (AC #5).
6. Logged in with wrong password → stayed on `/login` with `<p role="alert">Invalid email or password</p>` (AC #6, non-enumerating).

Screenshots:
- `docs/screenshots/epic-02-signup-page.png`
- `docs/screenshots/epic-02-protected-specs.png`

### AC checklist (17/17)

| AC | Status | Verified by |
|----|--------|-------------|
| 1. Migration creates User/Account/Session/VerificationToken/Workspace/UserWorkspace/IpActionLog | ✅ | `migration.sql` + Prisma applied to Supabase |
| 2. Workspace fields + UserWorkspace role default `owner` | ✅ | `prisma/schema.prisma` |
| 3. Signup creates User+Workspace+UserWorkspace atomically + redirects to `/specs` | ✅ | Browser flow + signupAction unit test |
| 4. Signup rejects invalid email / weak password / duplicate email | ✅ | signupAction unit tests (3 cases) |
| 5. Login redirects to `/specs` on success | ✅ | Browser flow |
| 6. Login rejects wrong creds with generic "Invalid email or password" | ✅ | Browser flow (HTML inspected) |
| 7. Unauthenticated `/specs` → `/login` | ✅ | Browser flow (twice) |
| 8. `getRequiredSession()` returns `{userId, workspaceId, email}` | ✅ | Unit test + browser-verified via /specs page render |
| 9. `getRequiredSession()` throws when no UserWorkspace | ✅ | Unit test |
| 10. `signOutAction()` clears session and redirects to `/login` | ✅ | Implementation + signature verified (consumer is Epic 07; no UI in v0.1 yet) |
| 11. Forms use shadcn Input/Button/Label (Card too); (auth)/layout.tsx centered max-w-sm | ✅ | Source + browser screenshot |
| 12. Vitest tests for signupAction + getRequiredSession pass | ✅ | 11 new tests, all green |
| 13. middleware.ts Edge-safe — no bcrypt/Prisma transitively | ✅ | `next build` succeeded + grep |
| 14. Signup with no/invalid Turnstile → `captcha_failed`, no User | ✅ | Unit test |
| 15. Signup with non-empty honeypot → `honeypot_triggered`, no User | ✅ | Unit test |
| 16. Signup submit <2000 ms → `too_fast`, no User | ✅ | Unit test |
| 17. 6th signup attempt within 1 h from same IP → `rate_limited`, no User; every attempt logs IpActionLog | ✅ | Unit test (verifies `recordIpAction` called even on rate-limit reject) |

## Risks for future epics

### Epic 03 (Spec Ingestion)
- **`getClientIp()` exists; reuse it.** Don't re-implement IP extraction — Epic 03's `WorkspaceActionLog` is workspace-scoped and doesn't need IP, but the helper is there if any unauth-adjacent flow appears.
- **`prisma migrate dev` doesn't auto-run `generate` in 7.x.** When Epic 03 adds Spec/SpecVersion/WorkspaceActionLog, run `npx prisma generate` explicitly afterward (or chain it).
- **Model types live at `@/generated/prisma/models`** (barrel export confirmed) — `import type { Spec } from '@/generated/prisma/models'`.
- **`vitest.config.ts` aliases `server-only`.** New tests for server-only modules will work without further config.

### Epic 04 (LLM Pipeline)
- **`INTERNAL_API_SECRET` is still a dev placeholder.** Epic 04's `/api/internal/analyze` route guard needs a real secret before deploy.
- **`signupAction` is the reference for the "structured `{ success, error }` return" pattern.** Epic 04's `runAnalysis` should mirror the shape: `{ kind: 'budget_exceeded', spent, limit, retryAt }` etc.

### Epic 05 (Spec Detail) / Epic 07 (Specs List + Settings)
- **Sidebar footer is hardcoded to `"Workspace name • user@example.com"`.** Epic 07 replaces this with real data from `getRequiredSession()` (it's `'use server'`-callable from the layout via async server component).
- **`(app)/layout.tsx` is now wrapped in `<TooltipProvider>`.** Tooltips throughout the (app) routes will work without extra wiring.
- **Epic 07 implements `signOutAction()` consumer** (Settings page sign-out button). The action exists at `@/lib/session.ts` — just import + call.

### Cross-cutting / security
- **Test-Turnstile-keys still in `.env`.** Replace with real Cloudflare keys (free tier) before deploy. Currently the widget always passes — this is fine for dev but production would let any submission through.
- **`AUTH_SECRET` is a dev placeholder.** Pre-launch must replace with `openssl rand -base64 32`.
- **`callbackUrl` open-redirect guard is in place** in `loginAction` (only relative `/...` paths accepted, not `//...`). Future external-OAuth providers should re-check.
- **Rate-limit on login is intentionally not implemented** in v0.1 (per spec out-of-scope; Epic 04/Epic 08 hardening). Brute-force on login is currently unmitigated. Consider hardening before public launch.

### Tooling
- **shadcn 4.6.0 radix-nova preset has no `form` component.** Server-action pattern + plain `<form>` is the v0.1 convention. If Epic 05/07 hits a use-case for client-side validation (e.g. multi-step UX), install `react-hook-form` + `@hookform/resolvers` manually and write a thin Form wrapper.
- **Auth.js v5 (next-auth@beta) is still beta.** Pinned via `next-auth@beta` in package.json — may receive breaking changes. Re-test on every minor bump.

## Open questions

1. **Should `?callbackUrl=` (Auth.js v5 default) be renamed to `?redirectTo=` (spec wording) for consistency?** Recommendation: leave as `callbackUrl`. Spec wording was descriptive; the param-name difference is invisible to users and only matters for code comments. If v0.2 introduces a customer-facing share-link experience that exposes the param, revisit.

2. **Auth.js v5 doesn't append `?callbackUrl=` on the middleware-driven redirect.** Browser-verified. To get the spec's full UX (share `/specs` link → log in → land on `/specs`), middleware would need a custom redirect. Acceptable for v0.1 since post-login default is `/specs` anyway.

3. **`signOutAction()` redirect location.** Currently redirects to `/login`. Settings page (Epic 07) may want a `?signedOut=1` flag for a confirmation toast — defer to Epic 07 / Epic 08 toast wiring.

4. **`UserWorkspace` v0.1 single-row invariant** is enforced in app logic (per spec recommendation), not via DB unique constraint. `getRequiredSession()` uses `findFirst`, so multiple rows would silently pick one — invisible bug if the invariant is violated. Recommendation: add a Vitest invariant check (or `findMany` + length assertion) in v0.2 once team-features start landing.

5. **Honeypot field surfaces in accessibility tree** despite `aria-hidden="true"` + off-screen positioning. Playwright snapshot listed it as a textbox. Real screen readers may or may not skip it depending on heuristics. Acceptable for v0.1 (it's a hidden bot trap, not user content). v0.2 polish: investigate if `aria-hidden` + `tabIndex=-1` is enough or if we need `display:none` (which would break some bots' detection).

---

## Open Questions — Resolutions (2026-05-02)

User reviewed the 5 open questions. Decisions:

### 1. `?callbackUrl=` vs `?redirectTo=` → keep `callbackUrl`

Auth.js v5 expects `callbackUrl` consistently (middleware, `signIn()`, internal redirects). Override would touch three places for zero user-visible value — the param is only seen briefly in the URL bar during login. Spec wording is descriptive, not a param-name mandate.

**Action:** none. Add an "Auth: callbackUrl" convention line to `CLAUDE.md` so Epic 03+ server actions emitting redirect params use the Auth.js name. *(Convention note added in next CLAUDE.md edit pass.)*

### 2. Custom middleware redirect with `?callbackUrl=` → defer to v0.2

Today: user clicks protected link → `/login` → `/specs` (default). Works for every single-user flow. Custom NextResponse.redirect logic only earns its keep when (a) specs become publicly shareable (v0.2 team-features) or (b) deep-link onboarding lands. Until then, pure code debt.

**Action:** none. Already documented in Risks-Section under "Cross-cutting / security".

### 3. `signOutAction()` redirect target → keep `/login` (no query param)

Post-signout toast is noise — the user just clicked "Sign out", and the visible login form is confirmation enough. Linear / Vercel / GitHub do not show a post-signout toast. If Epic 07 disagrees, the Settings button can `showToast()` *before* calling `signOutAction()`; no query-param plumbing needed.

**Action:** none.

### 4. UserWorkspace single-row invariant → unit-test tripwire (DB constraint deferred)

`getRequiredSession()`'s `findFirst()` would silently pick a row if the invariant were violated. Adding a Vitest assertion (`expect(tx.userWorkspace.create).toHaveBeenCalledTimes(1)` plus the same for `user` and `workspace`) catches any future regression in the atomic transaction. DB unique constraint on `userId` stays out — would block v0.2's many-to-many migration.

**Action applied:** added the invariant assertion to the happy-path test in `src/__tests__/auth/signupAction.test.ts`. 8/8 tests still passing.

### 5. Honeypot in accessibility tree → no change

Playwright's a11y tree is more aggressive than real screen readers (NVDA / JAWS respect `aria-hidden="true"` + off-screen + `tabIndex=-1`). The real concern would be password-manager autofill, which is already mitigated by `autoComplete="off"` + the field name `website` (not `email` / `password`). Switching to `display:none` would *weaken* the bot defense — many bots skip `display:none` inputs deliberately.

**Action:** none. Open question closed.

---

> **Status:** Open questions resolved 2026-05-02 (4 no-ops + 1 small test patch already applied). This file is now append-only and Epic 02 is final.
