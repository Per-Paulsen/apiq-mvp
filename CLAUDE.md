# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working with this repository.

> **Status:** v0.1 done (Epics 00–08). **Epic 09 Big-Spec Architecture Spike: Phase 0 + Phase A1 DONE (2026-05-05 evening). Two architectural corrections at end-of-day-2: (a) A2 Stripe-domain-knowledge was wrong layer (belongs to LLM, reframed as defensive fallback only), (b) A3 PD/GitHub/dnd5eapi-domain-detectors NOT to build — that's LLM-job. Stage A's primary value = Putz-Niveau (best-in-class linter), not LLM-substitute. Reputation-load-bearing: apiq must not miss what mature linters find. See `specs/big-spec-architecture-spike-critical-review.md` (Iteration 6 = today's load-bearing corrections).** Conditional Spike-Epics 10–13 not yet spec'd.
> **Done:** Epic 00 (Research Spike) → Epic 08 (Export + Polish). 298 tests pass, lint + build clean.
> **Live:** Portfolio-deploy of v0.1 at https://apiq-mvp.vercel.app — pre-seeded demo (`demo@example.com` / `demo`) with daily 03:00 UTC reset. Production-Vercel-Deploy is pinned to `main`. **CV-relevant URL — must stay stable through v1 development.**
>
> **Branch policy (since 2026-05-04):** `main` is FROZEN at the v0.1 portfolio-deploy state. **All v1 epic-implementation work happens on the `v1-launch` branch** — including Epic 09 spike + Epics 14–28 + any conditional spike-epic specs. NEVER `vercel --prod` from `v1-launch`. NEVER run `prisma migrate dev` against the production Supabase while on `v1-launch` — use the separate v1-dev Supabase (set in local `.env`). Merge `v1-launch` → `main` only when v1 is launch-ready and the user explicitly approves cutover.
>
> **Next (resuming Epic 09 — Stage A polish + Phase B v6-test):** read `specs/big-spec-architecture-spike-critical-review.md` (Iteration 6 has end-of-day-2 architectural corrections — load-bearing). Plus memory file `~/.claude/projects/.../memory/project_epic09_spike_handoff.md` for full state. Phase A1 (Spectral + Walkers + Custom-Ruleset) lives at `scripts/spike/deterministic/`. Stage-A-Validation measured 30-50% coverage (vs 85-90% predicted) — predictions were too narcissistic (self-vs-self measurement). **Re-Plan:** (1) Stage A polishing via external linter benchmark (Vacuum + Redocly + community-Spectral-Rulesets) — apiq must NOT miss what mature tools find, otherwise reputation-load-bearing trust kaputt. (2) A2 Stripe-domain-layer reframed as defensive fallback only. A3 explicitly NOT to build — domain-knowledge is LLM-job. (3) Then Phase B = LLM with v6-prompt that explicitly invokes training-knowledge of Stripe/GitHub/PD/dnd5eapi conventions — that's the actual differentiator-test, not yet done. (4) Phase C = Spike-Lock.
>
> **Conditional epics 10–13 (Spike S1/S2/S3 + Capability-Gap-Implementation):** spec'd ON-DEMAND after each preceding spike's `*-results.md` Cancel-Decision. Workflow + cancel-thresholds in `specs/brainstorming-launch.md` §"Conditional Epic Trigger Workflow". Trigger via `/spec_ind <n> <slug> "<context-prompt>"`. Skipping is safe (those features auto-defer to v1.1+); the engineering-track 14→28 ships v1 either way.
>
> **Naming note:** the project may rebrand from "apiq" post-PRD (naming-workshop pending). On rebrand, search-and-replace `apiq` strings codebase-wide; package names and domain-references will need careful update.

## Commands

```bash
npm run dev                              # Dev server (Turbopack, port 3000)
npm run build                            # Production build
npm run lint                             # ESLint flat config
npm run test                             # Vitest single run
npm run test:watch                       # Vitest watch
npx prisma migrate dev --name <name>     # Create + apply migration
npx prisma generate                      # Regen client (auto after migrate)
npx prisma studio                        # DB inspector
```

Spike harness (Epic 00 — kept for regression):
```bash
cd scripts/spike && npx tsx run-prompt.ts <variant> <spec>
```

## Reference map (read on demand)

| File | Purpose | Read when |
|---|---|---|
| `prd.md` | Original v0.1 product vision (still valid as long-term direction) | Product context |
| `prd-launch.md` | **Operative PRD for v1 public launch** — tagline, audience, build scope, spike strategy, distribution, success metrics | Any v1 launch work; input to `/spec` |
| `prd-launch-brainstorming.md` | Full reasoning history that produced `prd-launch.md` (12 rounds of strategic discussion) | Edge cases / "why was X decided?" |
| `specs/brainstorming-launch.md` | v1-launch brainstorming + epic-bundling decisions + Conditional Epic Trigger Workflow (10–13) + 2026-05-03 CI-first/MCP-first repositioning | Before triggering any conditional spike-epic; for "why is epic X bundled this way?" |
| `LAUNCH-PROGRESS.md` | Live launch checklist + branch + DB policy + setup-actions log | Always before non-trivial work — confirms which branch + DB you're operating on |
| `DEPLOY-PORTFOLIO.md` | Portfolio-deploy runbook + file ownership map (which files are owned by the live demo) | Before any change that affects landing / login / cron / seed |
| `prd-decisions.md` | Design system (zinc + violet, Geist Sans + JetBrains Mono, layout, components) | Any UI epic |
| `tech-stack.md` | Pinned stack/versions | Architectural decisions |
| `specs/research-spike.md` | Final v4 prompt + zod schema (canonical, v0.1) | Epic 04, prompt changes |
| `specs/ind-epic-review.md` | Within-epic refinement decisions | "Why does spec X say Y?" |
| `specs/cross-epic-review.md` | Cross-epic refinement decisions | Same, cross-epic semantics |
| `specs/[N]-{name}.md` | Per-epic spec | Implementing that epic |
| `specs/[N]-{name}-results.md` | Implementation results, deviations, risks | Before any subsequent epic |
| `openapi-examples/README.md` | 4 sample specs catalog | Ingestion / analysis / verify |
| `scripts/spike/*` | Reference impls (Epic 04 ports verbatim, Epic 06 reuses validate-patches) | Implementing Epic 04 / 06 |
| `scripts/verify-spec-ingestion.ts` | Permanent regression script for Epic 03 (URL-pull pipeline) | Before changing ingestion |
| `scripts/verify-llm-pipeline.ts` | Permanent regression script for Epic 04 (real LLM calls against fixture) | Before changing analysis |
| `fillow-template-reference.png` | Layout-Vorbild for sidebar/topbar/grid (referenced from `prd-decisions.md`) | UI work |
| `design-reference-{1,2}.png` | Additional design references at repo root | UI work |

## Repo structure

```
.
├── prd.md, prd-launch.md, prd-decisions.md, tech-stack.md, README.md
├── LAUNCH-PROGRESS.md           # Live state + branch+DB policy + setup-actions log
├── DEPLOY-PORTFOLIO.md          # Portfolio-deploy runbook
├── specs/                       # Per-epic specs + results + brainstorming + refinement records
│   └── brainstorming-launch.md  # v1-launch decisions + repositioning history
├── openapi-examples/            # 4 real specs (openweathermap, stripe, pagerduty, dnd5eapi)
├── scripts/
│   ├── spike/                   # Epic 00 standalone harness (own package.json)
│   ├── seed-fixtures/           # Pre-baked demo-data JSON, replayed by seed-demo + cron
│   ├── capture-demo-fixtures.ts # CLI to refresh fixtures from dev DB
│   ├── seed-demo.ts             # CLI to seed demo workspace (one-time post-deploy)
│   └── verify-{spec-ingestion,llm-pipeline}.ts  # Permanent regression scripts
├── prisma/                      # schema.prisma (provider only) + migrations/
├── prisma.config.ts             # Datasource URL (loads .env via dotenv)
├── vercel.json                  # Cron schedule (daily reset-demo)
├── src/
│   ├── app/                     # Next.js App Router
│   │   ├── layout.tsx           # ThemeProvider + fonts
│   │   ├── globals.css          # Tailwind v4 + shadcn theme
│   │   ├── (app)/layout.tsx     # Protected: SidebarProvider + Sidebar collapsible="icon"
│   │   ├── (auth)/layout.tsx    # Centered max-w-sm card
│   │   ├── (public)/            # Landing + demo-login-action (DEMO_MODE-gated)
│   │   └── api/cron/reset-demo  # Daily seed-replay route, CRON_SECRET-protected
│   ├── components/{theme-provider,ui/*}
│   ├── hooks/use-mobile.ts      # shadcn-generated; eslint-disable at top (re-runs of `add sidebar` overwrite)
│   ├── lib/{prisma,utils,seed-demo}.ts
│   ├── generated/prisma/        # gitignored — `npx prisma generate` regenerates
│   └── __tests__/
├── docs/screenshots/            # Browser-verification screenshots
└── .env / .env.example / .env.production.example   # Real / dev-template / prod-template
```

## Skills

- `/spec <prd>` — derive epics from PRD
- `/spec_ind <n> <name> <desc>` — single new epic spec
- `/refine <spec>` — refine one spec via discussion file
- `/refine_all_ind` — batch within-epic refine (after each `*-results.md`)
- `/refine_all` — cross-epic refine
- `/dev <spec>` — implement an epic
- `/patch <n> <slug> <desc>` — focused change to existing implementation

## Key conventions

(Details in respective specs / reference docs — these are the surprises that aren't obvious from spec text alone.)

- **Path alias** `@/*` → `src/*`. Tailwind v4 = CSS-first in `globals.css`. Vitest = jsdom + globals.
- **shadcn 4.6.0** uses `asChild` (NOT `render` — re-check at upgrades). Base color `zinc` + accent `violet` via OKLCH in `globals.css`.
- **next-themes**: `defaultTheme="dark"`, `enableSystem={false}`, `<html suppressHydrationWarning>`.
- **Fonts**: Geist (`--font-sans`) + JetBrains Mono (`--font-mono`) via `next/font/google`.
- **Prisma 7**: datasource URL in `prisma.config.ts` (not schema.prisma). Generator output `../src/generated/prisma` so `@/generated/prisma/client` resolves to `client.ts`. **Model types live under `@/generated/prisma/models`** (verify in Epic 02). Always import singleton from `@/lib/prisma`. Json fields: write with `as Prisma.InputJsonValue`, read with type narrowing.
- **Auth (Epic 02)**: Edge-safe split (`auth.config.ts` no DB/bcrypt + `auth.ts` full). Use `getRequiredSession()` from `@/lib/session` in protected server components/actions. Signup has CAPTCHA (Turnstile) + IP-rate-limit + honeypot + 2s time-trap (anti-enumeration).
- **Rate-limit infra**: `IpActionLog` (Epic 02, IP-scoped, unauth) + `WorkspaceActionLog` (Epic 03, workspace-scoped, authed) — sibling tables, NOT unified.
- **LLM pipeline (Epic 04)**: port `scripts/spike/{prompts/v4,schema,stringify-spec,validate-patches,openrouter}.ts` verbatim into `src/lib/{analysis/*,openrouter}.ts`. Cost guardrail = `$10/24h` per workspace via `SUM(LLMCall.costUSD)` rolling-window. Cycles in dereferenced specs become `{"$ref": "#cyclic"}` markers via `cycleStripSpec`.
- **Patch apply (Epic 06)**: `validatePatchOps` is the production gate. Move/copy ops check `from` only (NOT `path` — destination created by op). Quality-score recomputes on every Apply/Reject/Undo inside the transaction.
- **Toasts (Epic 08)**: canonical catalog at `src/lib/toasts.ts`. Quota-exceeded shapes: `{ kind: 'rate_limited', retryAt }` + `{ kind: 'budget_exceeded', spent, limit, retryAt }`.
- **Sample-spec allow-list** (Epic 03): hard-coded `'openweathermap'` only. PagerDuty excluded from prod CTAs (no upstream LICENSE).
- **Server actions**: `"use server"` at top, `getRequiredSession()` first, return `{success}|{error}` with `error.kind`, never throw to client.
- **Dynamic route params async** (Next.js 15+): `{ params }: { params: Promise<{ id }> }` — must `await params`.

## Workflow rules

- **Do not modify spec files.** If unclear, ask.
- **Do not go beyond the spec.** Only build what the spec defines.
- **Discussions live in markdown files**, not chat. Chat = status updates only.
- **Brainstorming + results files are append-only**.
- **Commit format**: `feat: implement epic {N} — {name}` (epics) or `fix:` / `perf:` / `docs:` / etc. (patches).
- **Never commit `.env`** or anything in `.gitignore`.

## Pre-launch checklist

Most launch-day operator-side items are now resolved (production deploy live, Turnstile real-keys set, OpenRouter prod-key with $20-cap, AUTH/INTERNAL/CRON secrets rotated). Remaining for v1 cutover: Supabase production-project decision (current shared dev/prod DB vs separate v1-DB swap at cutover), final domain post-naming-workshop, real backup-verification drill. Tracked in `LAUNCH-PROGRESS.md` "Cutover" subsection.

Resolved earlier: 3 `{UUID}.png` design-reference renames → `fillow-template-reference.png` + `design-reference-1.png` + `design-reference-2.png` (Epic 08); dev-DB Petstore-failed-spec cleanup (replaced by Petstore demo fixture now that portfolio-deploy uses it intentionally).
