# Epic 01 — Project Setup

> Scaffolds the apiq Next.js app per [`tech-stack.md`](../tech-stack.md). Mirrors the proven ExpliqAI conventions ([`CLAUDE.md`](../CLAUDE.md) §"Key Conventions").
> Upstream design tokens: [`prd-decisions.md`](../prd-decisions.md) §"Color Palette", §"Typography", §"Theme", §"Layout".

## Scope

- Initialise a Next.js 16 (App Router, Turbopack) project with the `src/` directory layout and route groups `(app)`, `(auth)`, `(public)`.
- Install and configure: TypeScript 5, Tailwind CSS v4 (CSS-first config in `globals.css`), shadcn/ui, lucide-react, ESLint (flat config), Vitest (jsdom + globals) + React Testing Library + jest-dom.
- Install and configure Prisma 7 with the `@prisma/adapter-pg` driver adapter, generated client at `src/generated/prisma/client`, datasource defined in `prisma.config.ts` with `dotenv`. Set up Supabase Postgres connection.
- Provide `src/lib/prisma.ts` singleton.
- Configure path alias `@/*` → `src/*`.
- Provide `(app)/layout.tsx` skeleton with `SidebarProvider` from shadcn (no auth wiring yet — that comes in Epic 02), and an empty `(auth)/layout.tsx`, `(public)/layout.tsx`. Use the **collapsible mini-variant** sidebar (Icon-only when collapsed, ~64 px wide) per `prd-decisions.md` §"Layout".
- Initialise shadcn/ui with **base color = `zinc`** and **accent = `violet`** (per `prd-decisions.md` §"Color Palette"). Run `npx shadcn init` with these tokens; verify the generated `globals.css` `@theme` block reflects them. Install the `Button` component (`npx shadcn add button`) and render an instance on the `/` placeholder page so the violet primary token is visually verifiable.
- Install `next-themes`; wire it in the root layout with `defaultTheme="dark"`, `enableSystem={false}`. Theme toggle UI is owned by Epic 07; Epic 01 only sets up the provider.
- Load fonts via `next/font/local` or `next/font/google`: **Geist Sans** as the UI font (`--font-sans`) and **JetBrains Mono** as the mono font (`--font-mono`). Wire both into `globals.css` via Tailwind v4 `@theme` tokens.
- Set up `npm run` scripts: `dev`, `build`, `lint`, `test`, `test:watch`. Confirm `npx prisma migrate dev` and `npx prisma generate` work end-to-end against a local or Supabase Postgres.
- Add `.env.example` listing `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `INTERNAL_API_SECRET`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` (with comments — values are filled by the operator). Comment on `OPENROUTER_MODEL`: "v0.1 single-call analysis uses `anthropic/claude-sonnet-4` per Epic 00 spike results; future per-endpoint calls may use Haiku." `INTERNAL_API_SECRET` is for the `/api/internal/analyze` route guard (Epic 04). `TURNSTILE_*` keys are Cloudflare Turnstile credentials for the Signup CAPTCHA (Epic 02 anti-enumeration; free tier).
- Update `CLAUDE.md` Commands section with the now-real npm script invocations (replacing the placeholder block).
- Add a basic `(public)/page.tsx` placeholder so `npm run dev` renders without 404.

## Acceptance criteria

1. `npm install` completes without errors on Node 20+.
2. `npm run dev` starts Turbopack and serves a placeholder page at `/` without runtime errors.
3. `npm run build` completes successfully.
4. `npm run lint` passes with zero errors. Warnings are acceptable if they originate from shadcn-generated files; the scaffold's own code (lib, layouts, placeholder page) emits zero warnings.
5. `npm run test` runs the included sanity test (`src/__tests__/scaffold.test.ts`: `expect(true).toBe(true)`) and passes.
6. `npx prisma migrate dev --name init_scaffold` creates an empty initial migration against the configured `DATABASE_URL`.
7. `npx prisma generate` produces the client at `src/generated/prisma/client`.
8. Importing `prisma` from `@/lib/prisma` works in a server component without throwing.
9. Tailwind v4 renders: a Tailwind utility class on the placeholder page (e.g. `bg-violet-500` or `text-zinc-500`) produces the expected colour in the browser, proving the v4 pipeline is wired.
10. shadcn/ui CLI is initialised (`components.json` exists) with `baseColor: 'zinc'` and the `violet` accent token reflected in `globals.css`. `Button` is installed and renders with the violet primary colour.
11. `(app)/layout.tsx` includes a `SidebarProvider` wrapping a placeholder sidebar in the **collapsible mini-variant** (using shadcn's `render` prop pattern, not `asChild`). Toggling the sidebar collapses it to icon-only width (~64 px) and the state persists across reloads via cookie.
12. `next-themes` is wired with `defaultTheme="dark"`, `enableSystem={false}`. Reloading the placeholder page renders dark mode by default.
13. Geist Sans loads as the body font (`font-sans` resolves to it) and JetBrains Mono loads for `font-mono`. Both are visible in DevTools as `--font-sans` / `--font-mono` CSS vars.
14. Path alias `@/*` resolves in TypeScript and at runtime.
15. `.env.example` exists with all listed variables.
16. `CLAUDE.md` "Commands" section is updated to reflect real, working commands.
17. `package.json` declares an `engines` field pinning Node to the current Vercel default (≥22.x at time of writing).

## Out of scope

- Auth.js setup — Epic 02.
- Application data models (Workspace, Spec, Finding, …) — Epic 02 introduces Workspace+User+Account+Session+VerificationToken; later epics add the rest.
- OpenRouter SDK wiring — Epic 04.
- Any UI screens beyond a `/` placeholder — Epics 03 / 05 / 07.
- Vercel deployment configuration (`vercel.json`, build settings) — defer to a later infra task; this epic only ensures local `dev/build/lint/test` work.
- E2E / Playwright harness — out of scope for v0.1 entirely.
- CI/GitHub Actions — out of scope for v0.1 (manual `npm run lint && npm run test` is the gate).

## Domain terms

- **Route group** — Next.js App Router folder convention `(name)/` that does not affect URL paths but groups layouts. Used for `(app)` (protected), `(auth)` (login/signup), `(public)` (marketing).
- **Singleton Prisma client** — a module-scoped `PrismaClient` instance re-used across requests, exported from `src/lib/prisma.ts`. Avoids connection-pool exhaustion in dev.
- **Driver adapter** — Prisma 7 wraps a node-postgres driver via `@prisma/adapter-pg`, configured in `prisma.config.ts`. Required for serverless-edge compatibility paths.
- **CSS-first Tailwind** — Tailwind v4 reads its config from `@theme` blocks in `globals.css` instead of `tailwind.config.ts`.
- **shadcn `render` prop pattern** — current shadcn API for composition: `<SidebarMenuButton render={<Link href="/" />}>` rather than the older `asChild` API.

## Open questions

- Node version pin: 20 LTS or 22? Default to whatever Vercel currently runs as default — record in `package.json` `engines` field. Recommendation: pin `>=22` (Vercel default).
- Supabase project: created upfront by the operator, or scaffold a `supabase/` config folder with a local-dev compose file? Recommendation: operator creates the Supabase project manually, scaffold only stores `DATABASE_URL` / `DIRECT_URL` in `.env.example`. Confirm during implementation.
- `prisma.config.ts` is still considered preview in some Prisma 7 minor versions — verify the installed version uses the stable form. If preview, document the workaround in `CLAUDE.md`.
