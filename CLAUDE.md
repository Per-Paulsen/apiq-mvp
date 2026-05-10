# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working with this repository.

> **Status:** v0.1 done (Epics 00–08). **Epic 09 Stage A — Welle 0+A+B + W1+W2+W3+W4+Q + Welle M (Round-3+4) + Welle F + Welle C (P2) + Welle D (P3 Trail) + Welle Arch+ (Architecture Cleanup) done (2026-05-09).** `runDeterministicLayer` jetzt full + LAYERED: **Spectral 342 active rules across 11 yamls in `rules/`** + **25 aggregators** (was walkers/, in `aggregators/`) + 15 module-classes (in `modules/`) + 4 classifiers (in `classifiers/`: style + json-schema-draft-detector + oauth2-flow + media-type-iana per T12/T13) + **116 custom-functions** (in `spectral-functions/`, korrigiert von 91-Schätzung) + 3 `_helpers/`-modules (rate-limit-headers, request-body, security) + 4 infra files (`infra/`: severity-schema, types, output-mapper, spectral-runner) + new public `index.ts`. 16 von 17 module-classes wired; `spec-diff` bleibt orphan (2-Spec lifecycle). **PatternSchema + apiq-meta validation** at load-time (Welle Arch+ A2). **A1 drift-lint** as CI-gate. **A3 FunctionMetadata** for all 116 functions. **Welle F (Framework-Optimization):** Schema-Erweiterung in `severity-schema.ts` (autoFixSafe + detectionPrecision + ai-agent-stakeholder + privacy-leakage/operational-metadata-missing-defectclass + RuleSourceSchema verbatim/verifiedAt + regulatoryMapping NIST/ASVS/CIS/GDPR/SOC2 + costImpact + mttrImpact + agentReadinessImpact strategic-vision-coupling) + spectral-runner apiq-meta-Block read+propagate + 7 info-tier walkers (SLA4OAI / capability-discovery / RFC-9727 api-catalog / RFC-9728 OAuth Protected Resource Metadata / GitHub brownout-schedule / Slack rate-limit-tier / Arazzo workflow-document) + **110/110 YAML rules apiq-meta-Block** (100% coverage, 4 parallele Subagents per yaml: 27+26+27+30) + Round-3+4 severity-upgrades (EV-1/F-1 hint→warn per RFC 9745, EV-5/6/14/17/23 hint→warn, EV-18 warn→hint) + F5 CI-coverage-gate (`apiq-meta-coverage-gate.test.ts`). **Welle M (Mining-Maximierung aus 7 source-families):** R3 122 candidates (51 books + 42 postmortems + 11 corpus + 18 reaudit) + **R4 88 candidates** (19 conferences + 33 vendor-blogs + 32 papers+IETF). Master `rules-brainstorm.md` 1797→2327 Zeilen. 100% Source-Mapping-Comments auf 110 YAML-rules + 5 custom-functions + 15 module-class headers. **959 patterns** committed `scripts/spike/data/patterns.json` (R1+R2+R3+R4) — **Citation-coverage 80.4%** (war 12% pre-enrich), URL-coverage 72.4%, Verbatim 23.1%. **Pattern-Knowledge-Index** 763 entries via `findRelatedPatterns` API (gitignored 30MB cache, reproducible). **API-Corpus-Library** 10 statistics über 521 healthy public OpenAPI specs (gitignored 253MB). 8 alte Mining-Files konsolidiert zu Stubs — `mining-round2-meta.md` bleibt eigenständig. **2230 tests pass / 4 skipped / 0 fail (post-Welle-Arch+ inkl. Aftercleanup + T12/T13; Welle Arch+ initial added ~150 + Aftercleanup added ~400 + T12/T13 added 49; pre-Arch+ was 1681 post-Welle-D)**. **Top-Round-3+4-Findings:** RFC-7807 + Sunset/Deprecation 0% adoption + 22.2% unsecured-write-ops + RFC 9728 OAuth Protected Resource Metadata (April 2025, MCP-OAuth-foundation) + Hasan-2026 "MCP Tool Descriptions Are Smelly" (97.1% smelly) + RFC 9745 Deprecation Header (März 2025) + RFC 9727 api-catalog (März 2025) + 5-Vendor-date-versioning-consensus + Stripe webhook-order-not-guaranteed. **Welle C (P2 Spectral Rules):** 36 P2-Threat-rules (Y-1/8/10/12/13/14/15/19/21 + TM-A2/5/7/9/12/13/14/18/28/35/36/45/46/47 + RFC2-1/2/3/11/conditional-bundle/32/58/59/65/69/70/74/97) in `apiq-ruleset-threat-p2.yaml` mit 15 custom-functions in `threat-p2-functions.ts`. 25 P2-Client-rules (CL-4/5/7/9/13/15/17/18/21/22/24/25/29/35/48/54/56/64×3/77 + DOLAR F-11/12/13/14) in `apiq-ruleset-client-p2.yaml` mit 5 custom-functions in `client-p2-functions.ts`. 100% apiq-meta-coverage auf alle ~170 active rules. F5 coverage-gate erweitert auf 6 yamls. **Welle D (P3 Trail, 9 parallele Subagents):** 5 NEUE yamls mit 171 P3-rules: threat-p3 (31) + client-p3 (32) + evolution-p3 (25) + standards-p3 (36, 4 bundles cache-header/cache-validators/link-header/multipart-form) + other-p3 (47, SC/SCF/L9/L10/F-tier; F-11/12/13/14 deduped weil in client-p2). 66 NEUE custom-functions (Total 91). 3 NEUE walkers für Welle-C-sentinel-resolution. **T25 Source-Verify-CI:** quarterly cron + CLI mit gh-api-fallback + ETag-cache + 17 tests + baseline. **T-Funcs-Rename:** multi-lang-reserved-keywords.ts → client-p1-functions.ts (file-discipline). **T-F7:** Lens-4-rules ≥80% concrete codegen-targets (war 28%). **T-Verbatim-Cleanup (Schema-Split User-direktive Option 1):** RuleSourceSchema split `verbatim` → `quote` (T25-verifiable, ≤200 char) + `summary` (mining-paraphrase) + `verifiedAt`; 213 entries migriert (alle zu summary, none qualified als quote per heuristic — "when in doubt, summary"); T25 baseline jetzt 0 false-drifts (war 63). **Stripe-full perf:** test-timeout 10min → 30min (12-yaml ruleset = 2.4× workload); Welle-E sub-task T-Stripe-Perf in Plan-Doc §9. **Stage-A-Coverage (unverändert — Welle C ist Differentiator-Pattern-Implementation, kein Coverage-lifter — empirisch-gemessene Coverage gegen Reference-Specs erfordert separate measurement-pass nach Welle V):** stripe-full **62.1%** | pagerduty-full **69.6%** Embedding | dnd5eapi **85.7%** Embedding (= Prediction) | github-rest **64.5%** Embedding. **Round-5-Decision:** skip (discovery-unbounded saturated nach 7 source-families). Welle M2 (post-V) bleibt geplant für gerichtetes agent-readiness-Mining.
> **Done:** Epic 00 (Research Spike) → Epic 08 (Export + Polish). 298 tests pass v0.1 main, **2230 tests pass on v1-launch (Stage A post-Welle-Arch+ inkl. Aftercleanup + T12/T13)**.
> **Live:** Portfolio-deploy of v0.1 at https://apiq-mvp.vercel.app — pre-seeded demo (`demo@example.com` / `demo`) with daily 03:00 UTC reset. Production-Vercel-Deploy is pinned to `main`. **CV-relevant URL — must stay stable through v1 development.**
>
> **Branch policy (since 2026-05-04):** `main` is FROZEN at the v0.1 portfolio-deploy state. **All v1 epic-implementation work happens on the `v1-launch` branch** — including Epic 09 spike + Epics 14–28 + any conditional spike-epic specs. NEVER `vercel --prod` from `v1-launch`. NEVER run `prisma migrate dev` against the production Supabase while on `v1-launch` — use the separate v1-dev Supabase (set in local `.env`). Merge `v1-launch` → `main` only when v1 is launch-ready and the user explicitly approves cutover.
>
> **Next (resuming Epic 09):** Welle Q + W1-W4 + Welle M + Welle F + Welle C + Welle D + Welle Arch+ done. **Welle D2 als nächste Welle (P4+P5 Niche/Vendor ~25 patterns).** Verbindlicher Plan v2 in `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` — Putzen-First-Reihenfolge: ~~Welle Q~~ ✓ → ~~Welle M~~ ✓ → ~~Welle F~~ ✓ → ~~Welle C~~ ✓ → ~~Welle D~~ ✓ → ~~Welle Arch+~~ ✓ (vorgezogen 2026-05-09) → **Welle D2** (P4+P5) → **Welle E** (Putz-Niveau-Benchmark; T-Stripe-Perf bereits in Arch+ done) → **Welle T** (Test-Coverage all-specs + Snapshot + CI; parallel zu D2/E) → **Welle Doc** → **Welle R** (R1+R2 Multi-Model-cross-validated) → **Welle V** (4-way Cross-Linter, **erst hier!**) → **Phase B** (N=3×4 Specs). **Kritisch:** Cross-Linter-Vergleich gehört NACH Putzen. **Memory-Regeln:** niemals Fixes verschieben (`memory/feedback_never_defer_fixes.md`); niemals Time/Cost-Estimates (`memory/feedback_no_engineering_time_estimates.md`); Plan-Doc-Welle-Sections sind source-of-truth (`memory/feedback_plan_doc_is_source_of_truth.md`) — Maximalismus-Setup. Execution via direct-Spec + `/dev`. Plan-Doc §21 hat Welle-Status-Tracker. **Resume-Trigger neue Session:** "welle d2 starten" oder "weiter mit restwork-plan v2 — welle d2". Welle-Arch+-Results: `specs/E09-w-arch-architecture-cleanup-results.md`. Welle-D-Results: `specs/E09-w-d-p3-trail-results.md`. Welle-C-Results: `specs/E09-w-c-p2-spectral-rules-results.md`. Welle-F-Results: `specs/E09-w-f-framework-optimization-results.md`. Welle-M-Results: `specs/E09-w-m-mining-optimization-results.md`. patterns.json single-source: `scripts/spike/data/patterns.json` (validated via PatternSchema). Pattern-Index reproducible via `npx tsx scripts/spike/eval/build-pattern-index.ts` (needs OPENAI_API_KEY). **Layered structure post-Arch+:** `scripts/spike/deterministic/{classifiers,aggregators,modules,rules,spectral-functions,iana,infra,index.ts}`.
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
| `specs/big-spec-architecture-spike-stage-a-implementation-priority.md` | **Pattern-Source-of-truth** for Stage-A pattern-listen + wave-plan (P1/P2/P3/P4/P5 + ~290 patterns) | Welle C/D/E pattern-list lookup |
| `specs/big-spec-architecture-spike-stage-a-restwork-plan.md` | **Verbindlicher Welle-Plan** Welle M/F/C/D/E/Q/R/V → Phase B. Putzen-First-Reihenfolge | Resume jeder Stage-A-Session; Pre-Conditions zwischen Wellen |
| `specs/big-spec-architecture-spike-stage-a-{implementation,claim}-audit.md` | **Audit reports (2026-05-06)** documenting pipeline-wiring gaps + claim-vs-reality discrepancies | Before believing any Epic 09 status-statement |
| `specs/big-spec-architecture-spike-phase-b-design.md` | LLM-pipeline design on Stage-A foundation | Phase B planning, NACH allen Stage-A-Wellen |
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
