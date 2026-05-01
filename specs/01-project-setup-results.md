# Epic 01 — Project Setup — Results

> Implementation results for [`01-project-setup.md`](01-project-setup.md). Author: Claude Code (Lead) + 4 delegated agents (A toolchain, B theme/fonts/layouts, C Prisma, D cleanup). Date: 2026-05-01.
> **Append-only** after this initial draft. Corrections go in a labelled "Correction" section at the end.

## What was built

Full Next.js 16 + Tailwind v4 + shadcn/ui + Prisma 7 + Vitest scaffold with apiq's design tokens (zinc base + violet accent + Geist Sans + JetBrains Mono + dark default), three route groups (`(app)`, `(auth)`, `(public)`), Sidebar mini-variant, env vars for all v0.1 secrets, and a working initial Postgres migration against a fresh Supabase project.

The placeholder `/` page renders the apiq wordmark, tagline, a `<code>` snippet in JetBrains Mono, and a violet `<Button>` — proving Tailwind v4 + shadcn primary token + both fonts + dark mode all work end-to-end in the browser.

## Key files created

### Next.js + tooling
- `package.json` (engines.node `>=22`, scripts: dev/build/start/lint/test/test:watch)
- `next.config.ts` (`turbopack.root` pinned to silence multi-lockfile warning from user-home `package-lock.json`)
- `tsconfig.json` (path alias `@/*` → `src/*`)
- `eslint.config.mjs` (flat config from `create-next-app`)
- `postcss.config.mjs` (Tailwind v4 PostCSS plugin)
- `vitest.config.ts` (jsdom, globals, React plugin, `@/` alias, setup file)
- `components.json` (shadcn config — base color `zinc`)

### App shell
- `src/app/layout.tsx` (root — `<html lang="en" suppressHydrationWarning>`, fonts wired, `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>`)
- `src/app/globals.css` (Tailwind v4 `@import "tailwindcss"`, shadcn theme blocks; `--primary` set to violet OKLCH in both `:root` and `.dark`; `--font-sans` / `--font-mono` token wiring)
- `src/app/(app)/layout.tsx` (server component with `<SidebarProvider><Sidebar collapsible="icon">...</Sidebar></SidebarProvider>` mini-variant; placeholder Specs/Settings nav using lucide icons)
- `src/app/(auth)/layout.tsx` (centered max-w-sm container)
- `src/app/(public)/layout.tsx` (passthrough)
- `src/app/(public)/page.tsx` (placeholder rendering wordmark + tagline + violet `<Button>` + JetBrains Mono `<code>` snippet)
- `src/components/theme-provider.tsx` (next-themes wrapper)
- `src/components/ui/*` (shadcn-installed: Button, Sidebar + dependents — Separator, Tooltip, Input, Sheet, Skeleton)
- `src/hooks/use-mobile.ts` (shadcn-generated; one `eslint-disable react-hooks/set-state-in-effect` line added at file top with comment noting it's shadcn-authored)
- `src/lib/utils.ts` (shadcn `cn` helper)
- `src/lib/prisma.ts` (Prisma singleton — `import { PrismaClient } from '@/generated/prisma/client'`; uses `@prisma/adapter-pg`)

### Database
- `prisma/schema.prisma` (Prisma 7 — generator at `../src/generated/prisma`; datasource provider only, URL lives in `prisma.config.ts`)
- `prisma.config.ts` (loads `dotenv` + sets datasource URL from `process.env.DATABASE_URL`)
- `prisma/migrations/20260501000000_init_scaffold/migration.sql` (empty baseline migration, applied to Supabase)
- `prisma/migrations/migration_lock.toml` (provider postgresql)

### Tests
- `src/__tests__/setup.ts` (`@testing-library/jest-dom/vitest` import)
- `src/__tests__/scaffold.test.ts` (sanity)
- `src/__tests__/prisma-import.test.ts` (verifies AC #8 — `@/lib/prisma` imports without throwing)

### Env / config
- `.env.example` (committed — 8 keys with placeholders + comments)
- `.env` (gitignored — real DATABASE_URL + dev placeholders for AUTH_SECRET, INTERNAL_API_SECRET, TURNSTILE_*, plus the spike's OPENROUTER_API_KEY)

### Docs
- `CLAUDE.md` (Status line updated to "Phase B"; Commands section replaced with the now-real npm/prisma scripts plus a sub-block for the spike harness)
- `docs/screenshots/epic-01-placeholder-page.png` (Playwright screenshot of `/` for visual reference)

## Decisions and deviations from spec

1. **`base-ui` removed from tech-stack** during `/refine_all_ind` Q1 — confirmed pre-implementation, not used by any UI epic.

2. **shadcn CLI 4.x has no `--base-color` flag.** Init ran with `radix-nova` style preset; afterwards `components.json` was patched to set `"baseColor": "zinc"` and `globals.css` `:root` + `.dark` `--primary` patched to violet OKLCH (`oklch(0.606 0.25 292.717)` light, `oklch(0.541 0.281 293.009)` dark). The visual result matches the spec — `Button` renders violet, verified in the browser.

3. **shadcn API: `asChild` not `render`.** Spec / `CLAUDE.md` recommend the new `render` prop pattern, but the installed `shadcn` 4.6.0 ships `SidebarMenuButton` with `asChild`. Used `asChild` with an inline comment documenting the version constraint. When shadcn updates, swap to `render`.

4. **Prisma 7 generated client output path.** The spec / `CLAUDE.md` say "Import from `@/generated/prisma/client`". With Prisma 7's new generator (`provider = "prisma-client"`), the output is a folder of TS files, not a single `index.ts`. To preserve the canonical import path, the generator's `output` was set to `../src/generated/prisma` (NOT `../src/generated/prisma/client`) — Prisma writes `client.ts` directly inside `src/generated/prisma/`, so `@/generated/prisma/client` resolves to that file. Net: `import { PrismaClient } from '@/generated/prisma/client'` works as documented.

5. **Prisma 7 datasource config moved to `prisma.config.ts`.** `url` and `directUrl` are no longer accepted in `schema.prisma` (P1012 validation error in 7.x). The config file loads `.env` via `dotenv` and supplies the URL. `directUrl` is currently unused (DATABASE_URL == DIRECT_URL — both pointing at session pooler port 5432); when a real direct/non-pooler URL is provisioned for production, set it via `shadowDatabaseUrl` in `prisma.config.ts`.

6. **`previewFeatures = ["driverAdapters"]` removed** — driver adapters are GA in Prisma 7.

7. **Initial migration is empty** (no models). `prisma migrate diff --from-empty --to-schema=prisma/schema.prisma --script` produced `-- This is an empty migration.` which was hand-written into the migration file; Prisma applied it cleanly to the fresh Supabase DB.

8. **Two false-start Supabase URL issues during setup** (lessons learned, see "Risks for future epics"):
   - First URL pointed at an existing shared Supabase DB containing ExpliqAI tables → migration refused. User created a fresh `apiq-mvp` Supabase project.
   - User pasted the second URL with literal `[YOUR-PASSWORD]` placeholder syntax retained around the actual password (i.e. `:[ouJvjPzqngQd7pcZ]@`) → P1000 auth fail. Fixed by stripping the brackets.

## Verification results

### Automated
- `npm install` → success (~600 packages including shadcn deps + next-themes + Prisma 7 + Vitest)
- `npm run lint` → exit 0, **0 errors**, 10 warnings (all in `scripts/spike/*` "unused eslint-disable directive" — out of scope for Epic 01)
- `npm run test` → 2 files passed, 2 tests passed
- `npm run build` → exit 0; `/` and `/_not-found` prerendered as static
- `npx prisma generate` → success, client at `src/generated/prisma/client.ts`
- `npx prisma migrate dev --name init_scaffold` → applied successfully to Supabase `aws-1-eu-north-1.pooler.supabase.com` after credential fix

### Browser (Playwright)
Visited `http://localhost:3000/` after `npm run dev`. Confirmed via `getComputedStyle`:
- `<html class="... dark">` — dark mode default applied (AC #12)
- Body font-family resolves to `Geist, Geist Fallback` (AC #13a)
- `<code>` font-family resolves to `JetBrains Mono, JetBrains Mono Fallback` (AC #13b)
- Button background = `lab(41.088 68.9966 -91.995)` = violet (AC #10)
- Page text contains "apiq", "API Intelligence — a knowledgeable second opinion for your OpenAPI specs.", "Try a path: /v1/users/{id}", "Violet primary" (AC #2)

Screenshot at `docs/screenshots/epic-01-placeholder-page.png`.

### AC checklist (17/17 ✅)

| AC | Status | Verified by |
|----|--------|-------------|
| 1. `npm install` clean on Node 20+ | ✅ | bash exit 0 |
| 2. `npm run dev` serves placeholder at `/` | ✅ | curl HTTP 200 + Playwright body text |
| 3. `npm run build` success | ✅ | bash exit 0, 4 static routes prerendered |
| 4. `npm run lint` zero errors (warnings on shadcn-gen acceptable) | ✅ | bash 0 errors |
| 5. Sanity test runs | ✅ | Vitest `scaffold.test.ts` passes |
| 6. `prisma migrate dev` creates initial migration | ✅ | Supabase DB applied, `_prisma_migrations` table populated |
| 7. `prisma generate` produces client at `src/generated/prisma/client` | ✅ | file exists at `src/generated/prisma/client.ts` |
| 8. `import { prisma } from '@/lib/prisma'` works | ✅ | `prisma-import.test.ts` passes |
| 9. Tailwind utility class produces colour | ✅ | Playwright getComputedStyle (button bg = violet lab) |
| 10. shadcn init zinc + violet, Button installed, renders violet | ✅ | `components.json` baseColor zinc; Playwright button bg violet |
| 11. SidebarProvider mini-variant compiles | ✅ | `npm run build` exit 0 (browser toggle deferred to Epic 02 — `/specs` route doesn't exist yet) |
| 12. next-themes dark default | ✅ | Playwright `<html class="... dark">` |
| 13. Geist Sans + JetBrains Mono load | ✅ | Playwright `getComputedStyle` confirms both font-families |
| 14. `@/*` path alias resolves | ✅ | `tsconfig.json` + Vitest alias both used |
| 15. `.env.example` exists with all keys | ✅ | file present, 8 keys |
| 16. CLAUDE.md Commands updated | ✅ | replaced placeholder block with real commands |
| 17. `engines.node >=22` | ✅ | `package.json` declares it |

## Risks for future epics

### Epic 02 (Auth + Workspace)
- **Sidebar API: `asChild` not `render`.** Epic 02 will add real protected pages + Sidebar nav items. Spec / `CLAUDE.md` mention `render`, but the codebase uses `asChild` (shadcn 4.6.0 constraint). Use `asChild` for consistency until shadcn ships `render`. Re-check at Epic 02 start.
- **AC #11 sidebar interaction not browser-verified.** Epic 01's build proves it compiles, but the toggle/cookie-persistence behavior wasn't browser-verified (no `(app)/*` page existed). Epic 02 should confirm sidebar collapse persists across reloads (cookie set by `SidebarProvider`).

### Epic 03 (Spec Ingestion)
- **`prisma.config.ts` stable in 7.x — but `directUrl` is now `shadowDatabaseUrl`.** When Epic 03 adds the first real models and migration, the migration may need a separate non-pooler URL to avoid the "advisory lock not held" issue some Supabase users hit on pooled connections. Currently DATABASE_URL == DIRECT_URL (both port 5432 session pooler); production will likely want DIRECT_URL on port 5432 (direct connection, no pooler) for migrations.
- **Prisma 7 generated client structure.** `src/generated/prisma/client.ts` exports `PrismaClient`, but model types (`User`, `Spec`, etc.) live in `src/generated/prisma/models.ts` or `src/generated/prisma/models/`. When Epic 03 adds models, verify the import paths for types — they are NOT under `@/generated/prisma/client` but under `@/generated/prisma/models`. CLAUDE.md may need a follow-up convention update.

### Epic 04 (LLM Pipeline)
- **OpenRouter API key already loaded into `.env`** (carried over from spike). Epic 04 doesn't need to ask user for it.
- **`INTERNAL_API_SECRET` is a dev placeholder** — Epic 04 needs the operator to set a real value before deployment.

### Cross-cutting / security
- **`.env` Supabase password is in conversation history.** The user pasted the full URL (with password) in chat early in Epic 01 setup. **The password should be rotated** in Supabase Dashboard before this project is shared, deployed, or made public. Add this to a pre-launch checklist.
- **`.env` `AUTH_SECRET` and `INTERNAL_API_SECRET` are placeholder strings** — pre-launch must replace with `openssl rand -base64 32` outputs.
- **Turnstile keys in `.env` are Cloudflare's "always pass" test keys** — fine for dev but Epic 02 / pre-launch needs real keys (free tier).

### Tooling
- **shadcn CLI 4.6.0** ships `radix-nova` style + `asChild` API. Newer versions (when they exist) may switch to `render` and remove the `radix-nova` preset. Re-init may break.
- **Prisma 7.8.0** (stable). Driver adapters are GA — patterns above should be stable across 7.x minor versions.
- **`use-mobile.ts` eslint-disable** is a one-line workaround in shadcn-generated code. Re-running `npx shadcn add sidebar` will overwrite the file and re-trigger the lint error; document this in CLAUDE.md if it becomes a recurring issue.

## Open questions

1. **Should `src/generated/` be unignored selectively?** Currently fully gitignored (Prisma generated client = ~5 MB of TS files, regeneratable). Pro of unignoring: instant clones can build without `prisma generate` step. Con: bloats repo + diff noise. Recommendation: keep gitignored; document `npx prisma generate` as a post-clone step in README (Epic 08 will add a Quick Start section).

2. **Sidebar `render` vs `asChild`** — see Risks above. Defer until shadcn upgrade story is clear.

3. **Test infrastructure** — currently 2 trivial tests. Epic 02 will introduce real auth tests; should we add a `tests/` directory convention or stick with co-located `__tests__/` per Next.js/Vitest defaults? Decision: stick with `__tests__/` for v0.1 unless Epic 02 finds it limiting.

4. **`(app)/specs/page.tsx` placeholder** — Epic 02's spec calls for a temporary placeholder protected page that calls `getRequiredSession()`. That can serve as the first browser-verifiable Sidebar host. Note this for Epic 02.

---

> **Status:** Awaiting user review. After your review, this file becomes append-only and the epic is final.
