# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working with this repository.

> **Status:** Phase B — implementation in progress.
> **Done:** Epic 00 (Research Spike), Epic 01 (Project Setup).
> **Next:** Epic 02 (Auth + Workspace).

## Commands

```bash
npm run dev                              # Start dev server (Turbopack, port 3000)
npm run build                            # Production build
npm run lint                             # ESLint (flat config)
npm run test                             # Vitest (single run)
npm run test:watch                       # Vitest (watch mode)
npx prisma migrate dev --name <name>     # Create + apply a new migration
npx prisma generate                      # Regenerate Prisma client (auto-runs after migrate)
npx prisma studio                        # Open Prisma Studio (DB inspector)
```

For the standalone research-spike harness (Epic 00 — kept as a regression tool):

```bash
cd scripts/spike
npx tsx run-prompt.ts <variant> <spec>   # Re-run any prompt iteration against a sample spec
```

## Repo structure

```
.
├── prd.md                       # Product vision, screens, data architecture, scope
├── prd-decisions.md             # Design system tokens (zinc + violet, fonts, layout, components)
├── tech-stack.md                # Stack pin (versions, runtime choices)
├── README.md                    # User-facing quick start (filled in Epic 08)
├── CLAUDE.md                    # This file
│
├── specs/
│   ├── brainstorming.md         # Phase-1 PRD brainstorming + scope-update decisions (URL-only ingestion)
│   ├── research-spike.md        # Epic 00 decision record — final v4 prompt + zod schema (canonical)
│   ├── ind-epic-review.md       # /refine_all_ind decision record (within-epic refinement)
│   ├── cross-epic-review.md     # /refine_all decision record (cross-epic refinement)
│   ├── 00-research-spike.md     # Epic 00 spec
│   ├── 00-research-spike-results.md
│   ├── 01-project-setup.md      # Epic 01 spec
│   ├── 01-project-setup-results.md
│   ├── 02-auth-workspace.md     # Epic 02 spec — Auth.js + IpActionLog + Turnstile + signupAction
│   ├── 03-spec-ingestion.md     # Epic 03 spec — URL-only Spec ingestion + WorkspaceActionLog
│   ├── 04-llm-pipeline.md       # Epic 04 spec — Finding model + analysis pipeline + $10/24h budget
│   ├── 05-spec-detail.md        # Epic 05 spec — read-only Spec Detail UI
│   ├── 06-patch-apply.md        # Epic 06 spec — Apply / Reject / Undo + validatePatchOps gate
│   ├── 07-specs-list-settings.md # Epic 07 spec — Specs list + Settings + Theme toggle
│   ├── 08-export-polish.md      # Epic 08 spec — Export + Toast catalog + Polish
│   └── *-brainstorming.md       # Per-epic discussion files (append-only)
│
├── openapi-examples/            # 4 curated real specs (NOT placeholder anymore — Epic 00 populated)
│   ├── openweathermap/          # Reference target (15 hand-authored findings)
│   ├── stripe/                  # Sliced to ≤200 endpoints
│   ├── pagerduty/               # Mid-sized (no upstream LICENSE — dev-fixture only, NOT for production CTA)
│   └── dnd5eapi/                # APIs.guru "messy" pick
│
├── scripts/spike/               # Epic 00 standalone harness (own package.json, kept as regression tool)
│   ├── prompts/v{1,2,3,4}.ts    # v4 is the proven final
│   ├── schema.ts                # zod output schema (mirrors src/lib/analysis/schema.ts in Epic 04)
│   ├── stringify-spec.ts        # cycleStripSpec + stringifySpecForPrompt (cycle handling)
│   ├── validate-patches.ts      # patch validator (mirrors src/lib/analysis/validate-patches.ts in Epic 04)
│   ├── openrouter.ts            # lazy-init OpenAI client wrapper (port to src/lib/openrouter.ts in Epic 04)
│   └── run-prompt.ts            # CLI harness
│
├── prisma/
│   ├── schema.prisma            # Provider only — url lives in prisma.config.ts (Prisma 7 requirement)
│   └── migrations/              # init_scaffold (empty) — Epic 02+ adds real models
│
├── prisma.config.ts             # Prisma 7 datasource config (loads .env via dotenv)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Root: ThemeProvider (defaultTheme="dark"), Geist Sans + JetBrains Mono
│   │   ├── globals.css          # Tailwind v4 @import + shadcn theme blocks (zinc base + violet primary)
│   │   ├── (app)/layout.tsx     # Protected layout with SidebarProvider + Sidebar collapsible="icon"
│   │   ├── (auth)/layout.tsx    # Centered max-w-sm card container (Epic 02 fills with login/signup)
│   │   └── (public)/
│   │       ├── layout.tsx       # Passthrough
│   │       └── page.tsx         # Placeholder at "/" — apiq wordmark + violet Button + JetBrains code
│   ├── components/
│   │   ├── theme-provider.tsx   # next-themes wrapper
│   │   └── ui/                  # shadcn-installed components (button, sidebar, input, sheet, ...)
│   ├── hooks/use-mobile.ts      # shadcn-generated; one eslint-disable line at top (re-runs of `add sidebar` will overwrite)
│   ├── lib/
│   │   ├── prisma.ts            # Prisma singleton with @prisma/adapter-pg
│   │   └── utils.ts             # shadcn cn() helper
│   ├── generated/prisma/        # Prisma generated client (gitignored — regen with `npx prisma generate`)
│   └── __tests__/
│       ├── setup.ts
│       ├── scaffold.test.ts
│       └── prisma-import.test.ts
│
├── docs/screenshots/            # Browser-verification screenshots from /dev runs
│
├── .env                         # Real dev secrets (gitignored)
├── .env.example                 # Template — committed
├── components.json              # shadcn config (baseColor: zinc, style: radix-nova)
├── next.config.ts               # turbopack.root pinned (workaround for user-home stray lockfile)
├── tsconfig.json                # path alias @/* → src/*
├── vitest.config.ts             # jsdom + globals + React plugin + @/ alias
└── eslint.config.mjs            # flat config
```

## Architecture (intent — see `tech-stack.md` for pinned versions)

- **Next.js 16** App Router, Turbopack, React 19, TypeScript 5
- **`src/` directory** with route groups: `(app)` for protected pages, `(auth)` for login/signup, `(public)` for marketing/placeholder
- **Tailwind v4** CSS-first config in `src/app/globals.css` (no `tailwind.config.ts`)
- **shadcn/ui** + lucide-react (NOT base-ui — removed in /refine_all_ind Q1)
- **Auth.js v5** (Credentials provider, JWT sessions) with split Edge-safe (`auth.config.ts`) + full (`auth.ts`) configs — Epic 02
- **Prisma 7** + Supabase Postgres via `@prisma/adapter-pg`, generated client at `src/generated/prisma/client.ts`, singleton at `src/lib/prisma.ts`
- **OpenRouter** via OpenAI SDK, lazy-initialized (NOT module-scope), default model `anthropic/claude-sonnet-4` (Epic 04 — mirror `scripts/spike/openrouter.ts`)
- **Server Actions** with `"use server"`, `getRequiredSession()` first, return `{success}|{error}`, never throw to client
- **Workspace-scoped multi-tenancy** — every app model has `workspaceId` (except `User`/`Account`/`Session`/`VerificationToken`/`IpActionLog` which are unauthenticated/global)

## Reference map

| File | What it contains | When to read |
|---|---|---|
| `prd.md` | Product vision, four screens, data architecture, scope, roadmap | Start here for product context |
| `prd-decisions.md` | Design system: colors (zinc + violet), fonts (Geist Sans + JetBrains Mono), layout, component conventions | Before any UI epic (01, 05, 07, 08) |
| `tech-stack.md` | Stack pin (versions, runtime) | When making architectural decisions |
| `specs/research-spike.md` | Epic 00 result — final proven LLM prompt v4 + zod output schema (canonical) | Before Epic 04 (LLM pipeline) and any change to the analysis prompt |
| `specs/ind-epic-review.md` | Within-epic refinement decision record (5 confirmed design decisions) | When unsure why a spec says X — check the refinement reasoning |
| `specs/cross-epic-review.md` | Cross-epic refinement decision record (TOASTS catalog, sibling rate-limit tables, etc.) | Same — for cross-epic semantics |
| `specs/[N]-{name}.md` | Per-epic spec | During implementation of that epic |
| `specs/[N]-{name}-results.md` | Per-epic implementation results, deviations, risks | Before starting any subsequent epic — these document real-world deviations from spec |
| `openapi-examples/README.md` | Catalog of 4 sample OpenAPI specs | When working on ingestion, analysis, or verification |
| `scripts/spike/*` | Epic 00 reference implementations — Epic 04 ports verbatim, Epic 06 reuses validate-patches | When implementing Epic 04 or 06 |

## Skills (in `.claude/skills/`)

- `/spec <prd-file>` — derive epics from PRD (brainstorming → epic specs)
- `/spec_ind <number> <name> <description>` — create a single new epic spec
- `/refine <spec-file>` — refine a single epic spec via discussion file
- `/refine_all_ind` — batch within-epic refinement (especially after a new `*-results.md` lands)
- `/refine_all` — cross-epic refinement
- `/dev <spec-file>` — implement an epic via team-delegated build
- `/patch <epic-number> <slug> <description>` — focused change to existing implementation

## Established conventions

### TypeScript / Next.js

- **Path alias**: `@/*` maps to `src/*`
- **Dynamic route params are async** (Next.js 15+): `{ params }: { params: Promise<{ id: string }> }` — must `await params`
- **Tailwind v4**: CSS-first config via `src/app/globals.css` `@theme` blocks, NOT `tailwind.config.ts`
- **Vitest**: jsdom environment, globals enabled, setup at `src/__tests__/setup.ts`
- **New protected pages** go in `src/app/(app)/`, auth pages in `src/app/(auth)/`, public/marketing in `src/app/(public)/`

### shadcn/ui

- **Base color** `zinc`, **accent** `violet` (set via OKLCH in `globals.css` `:root` + `.dark`)
- **Sidebar uses `asChild`, NOT `render`** — shadcn 4.6.0 (current) ships `asChild`; `render` not yet available. Re-check at shadcn upgrades. Inline-comment in `(app)/layout.tsx` documents this.
- **Sidebar collapse mode**: `collapsible="icon"` (mini-variant per `prd-decisions.md`)
- **`use-mobile.ts` workaround**: top-of-file `eslint-disable react-hooks/set-state-in-effect` comment in shadcn-generated file. Re-running `npx shadcn add sidebar` will overwrite — re-apply.

### Theme + fonts

- **next-themes**: `defaultTheme="dark"`, `enableSystem={false}`, `attribute="class"`. `<html suppressHydrationWarning>` is required.
- **Fonts** via `next/font/google`: `Geist` → `--font-sans`, `JetBrains_Mono` → `--font-mono`. Both wired into Tailwind via `globals.css` `@theme` block.

### Prisma 7

- **Datasource URL lives in `prisma.config.ts`** (loads `.env` via `dotenv`) — NOT in `schema.prisma` (P1012 validation error in 7.x).
- **Generator output** = `../src/generated/prisma` (NOT `/prisma/client`) so `import { PrismaClient } from '@/generated/prisma/client'` resolves to `client.ts`.
- **Model types** (e.g. `User`, `Spec`) live under `@/generated/prisma/models` (NOT under `@/generated/prisma/client`). Verify path when Epic 02+ adds first models.
- **Always use singleton from `@/lib/prisma`** — never instantiate `PrismaClient` elsewhere.
- **Driver adapter** is `@prisma/adapter-pg` (GA in 7.x; no `previewFeatures` flag needed).
- **Json fields**: write with `as Prisma.InputJsonValue`, read with type narrowing.
- **DB migrations** vs **app runtime**: currently `DATABASE_URL == DIRECT_URL` (both Supabase session pooler port 5432). Production should set `DIRECT_URL` to a real direct-connection URL (port 5432 non-pooler) for migrations.

### Auth (Epic 02)

- Use `getRequiredSession()` from `@/lib/session` in protected server components and server actions
- Edge-safe split: `src/lib/auth.config.ts` (no DB / no bcrypt imports — verifiable by `next build` succeeding without Edge-runtime errors) + `src/lib/auth.ts` (full)
- Signup is protected by **anti-enumeration defenses**: Cloudflare Turnstile CAPTCHA + IP rate-limit (5/h via `IpActionLog`) + honeypot field + 2s minimum submit time

### Rate-limit infra (sibling tables)

- **`IpActionLog { id, ip, action, createdAt }`** — IP-scoped (Epic 02; for unauthenticated actions like signup). Defined in Epic 02.
- **`WorkspaceActionLog { id, workspaceId, action, createdAt }`** — Workspace-scoped (Epic 03; for authenticated actions like URL-pull, apply). Defined in Epic 03.
- They share shape but are intentionally NOT unified — Prisma doesn't model polymorphic scopes cleanly.

### LLM pipeline (Epic 04)

- **Final prompt is `scripts/spike/prompts/v4.ts`** (5503 chars, multi-pass framing, severity examples, anti-pattern D, large-spec strategy, path-verification rules). Port verbatim to `src/lib/analysis/prompt.ts`.
- **Final output schema is `scripts/spike/schema.ts`** (zod; `rationale.min(50)` relaxed in v3). Port verbatim to `src/lib/analysis/schema.ts`.
- **Cycle markers**: dereferenced specs may contain real JS object cycles (recursive schemas). Apply `cycleStripSpec` from `src/lib/analysis/stringify-spec.ts` before any `JSON.stringify` / `structuredClone` / DB write. Cycles become `{"$ref": "#cyclic"}` markers.
- **Cost guardrail**: `$10/24h per workspace` via rolling-window SUM on `LLMCall.costUSD` (NOT a call-count cap). Reject with `{ kind: 'budget_exceeded', spent, limit, retryAt }`.
- **OpenRouter retry policy**: 3 net retries 1s/4s/16s on 5xx/network/429; 4xx (other than 429) → throw immediately; JSON-parse-failure after fence-strip → 1 retry without burning a network attempt.
- **`LLMCall.prompt` storage**: structured Json `{ systemPromptHash, systemPromptVersion: 'v4', userPromptPreamble, specName, specSizeBytes, specEndpointCount }` — NOT the full spec body (would write 100s of MB/day per workspace).
- **Hallucinated patches are an expected residual** (≤6.7% in spike). Epic 06's `validatePatchOps` gate catches them and marks the finding `stale` before the user sees a broken apply.

### Patch apply (Epic 06)

- **`validatePatchOps`** from `src/lib/analysis/validate-patches.ts` (port from `scripts/spike/validate-patches.ts`) is the production gate. Combines `fast-json-patch.validate` + hallucination check + apply dry-run on `structuredClone`.
- **Move/copy ops**: check `from` exists, do NOT check `path` (destination — created by the op). This is the spike's bug-fix; must remain green.
- **Quality-score recompute** on every Apply / Undo Apply / Reject / Undo Reject inside the transaction. Pure function `computeQualityScore` from Epic 04. Note: `reject` raises score (rejected drops out of open-set) — known v0.1 trade-off.
- **Stale-flow UX** MUST NOT show error toast on `patch_stale`. Show inline hint + "Re-analyze" button instead.

### Toasts (Epic 08)

- **`TOASTS` canonical catalog at `src/lib/toasts.ts`** (NOT hard-coded strings). Each emitting epic imports + uses `showToast(TOASTS.<key>)`.
- **Standardised quota-exceeded shapes**: `{ kind: 'rate_limited', retryAt }` (count limit) and `{ kind: 'budget_exceeded', spent, limit, retryAt }` (Epic 04 dollar budget). Layout-level toast handler recognises both.

### Sample specs (Epic 03 / 07)

- **Sample-spec allow-list** in `loadSampleSpecAction({ sampleId })` is hard-coded (v0.1: only `'openweathermap'`). PagerDuty / Stripe-sliced / dnd5eapi are dev-fixtures only — **PagerDuty explicitly excluded from production CTAs** (no upstream LICENSE).

### Server actions

- Always `"use server"` directive at top
- Always call `getRequiredSession()` first (workspace-scoped check)
- Always return `{ success: true, ... } | { success: false, error: { kind, ... } }` — never throw to client
- Errors structured by `kind` per spec (e.g., `'rate_limited'`, `'patch_stale'`, `'unknown_sample'`, etc.)

### Workflow

- **Do not modify spec files.** If unclear, ask.
- **Do not go beyond the spec.** Only build what the spec defines.
- **All discussions happen in markdown files**, not chat. Chat is for status updates only.
- **Brainstorming and results files are append-only** — never overwrite or remove existing content.
- **Commit format**: `feat: implement epic {number} — {name}` (epics) or `fix:` / `perf:` / `docs:` / etc. (patches and supporting work).
- **Never commit `.env`**, secrets, or anything matching `.gitignore` patterns.

## Open / known issues (v0.1)

- **Supabase password rotation needed pre-launch** — early `.env` setup pasted password into chat history; rotate via Dashboard → Database before public sharing.
- **`AUTH_SECRET` and `INTERNAL_API_SECRET` are dev placeholders** — replace with `openssl rand -base64 32` outputs pre-launch.
- **Turnstile keys** in `.env` are Cloudflare's "always pass" test keys — fine for dev; Epic 02 / pre-launch needs real keys (free tier).
- **3 PNG screenshots at repo root** (`{1B526...}.png`, etc.) are design references for `prd-decisions.md`. Consider renaming to descriptive filenames before broader collaboration.
