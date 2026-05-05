# Launch Progress — apiq v1

> Live checklist of v1-launch epic implementation. Edit checkboxes as epics ship.
> Source-of-truth for the conditional-spike-trigger workflow (Epics 10–13).

## Production state — v0.1 portfolio deploy (live since 2026-05-03)

Pre-v1, the v0.1 build is deployed to Vercel as a portfolio-grade demo. The production URL `apiq-mvp.vercel.app` is **CV-relevant** for the user's job-application phase and must stay stable through v1 development.

### Branch + DB policy (since 2026-05-04)

- **`main` is FROZEN** at the v0.1 portfolio-deploy state. NO new commits unless they're freeze-strategy docs or critical v0.1 hotfixes that the user explicitly approves.
- **All v1 epic-implementation work happens on the `v1-launch` branch.** Includes Epic 09 spike + Epics 14–28 + any conditional spike-epic specs.
- **Production Vercel deploy is pinned to `main`.** NEVER run `npx vercel --prod` from `v1-launch`. Vercel auto-deploy from GitHub is NOT configured (the link attempt failed earlier), so production is only updated via explicit CLI deploy from `main`.
- **Production Supabase (`ouzznqiooklxdllhxgiu.eu-north-1`) keeps the v0.1 schema.** All v1 work runs migrations against a SEPARATE v1-dev Supabase project (URL in local `.env` after the user provisions it). NEVER `prisma migrate dev` against the production DB while on `v1-launch`.
- **Cutover:** when v1 is ready, user explicitly approves: merge `v1-launch` → `main`, swap Vercel `DATABASE_URL` env to v1-DB (or run final migration on the production DB after backup), `vercel --prod` once. CV-URL transitions from v0.1 to v1.

### Setup actions log

Concrete steps taken so the policy doesn't read like "we'll set this up someday" — append-only, timestamped, what's been done.

#### 2026-05-04 — branch freeze + v1-dev DB provisioning

1. Updated `CLAUDE.md` header + this file's "Branch + DB policy" section to document the freeze + branch-isolation rules.
2. Saved memory entry `~/.claude/projects/.../memory/project_v1_launch_branch_freeze.md` for cross-session persistence — every future Claude session in this repo now auto-loads the policy.
3. Committed the freeze-policy docs on `main` as `fc02dd3` ("docs: freeze main at v0.1 portfolio state, add v1-launch branch policy") and pushed to GitHub.
4. Created `v1-launch` branch from `main` (so `v1-launch` inherits the freeze-policy docs at base) and pushed to GitHub.
5. User created a fresh Supabase project (project-ref `nmqnnmacvkygnilizzlf`, EU region) — the v1-dev DB.
6. User updated local `.env` `DATABASE_URL` + `DIRECT_URL` to point at the new dev DB. Same pooled-connection-string for both vars (matches existing v0.1 pattern, simpler than separate transaction-pool/direct split).
7. Pre-migrate safety check: extracted only the project-ref portion of `DATABASE_URL` (no password printed) and confirmed it's `nmqnnmacvkygnilizzlf`, NOT prod's `ouzznqiooklxdllhxgiu`.
8. Ran `npx prisma migrate deploy` against v1-dev DB → 5 v0.1 migrations applied successfully.
9. Ran `npm run seed-demo` against v1-dev DB → demo-workspace seeded with the Petstore fixture (Score 32, 14 findings).
10. Currently checked out: `v1-launch`. Production Vercel + production Supabase: untouched. CV-URL stable.

What's next: `/dev specs/09-big-spec-architecture-spike.md` (or `/refine_all_ind` first if spec-hardening preferred). Both run automatically on `v1-launch` + against v1-dev DB.

#### 2026-05-05 — Critical Review Epic 09 → Spike paused, Stage 4 (Deterministic Layer) added

Cross-session deep critique of Spike Draft 0.11. Twelve substantive blind spots identified; three changed the architecture-direction. See `specs/big-spec-architecture-spike-critical-review.md` for full record.

1. **Findings-Inspection erstmals durchgeführt:** qualitativer Pass über `specs/big-spec-runs/haiku4-5_x_sonnet4-6__two-call__{pagerduty-full,stripe-full}.json` — Top-30 PD = ~37% repetitive variants of <10 unique Befunde; Top-15 Stripe = ~17% repetitive. Echte unique-Findings nach Rollup auf Stripe geschätzt ~300-500 statt 1423.
2. **Architektur-Korrektur identifiziert:** 50-65% PD / 40-55% Stripe der LLM-Findings sind deterministisch findbar (Spectral-class + erweiterte Custom-Rules). Implikation: apiq-Architektur sollte Hybrid sein (Deterministic Layer + LLM Layer), nicht LLM-First.
3. **User-Decision: Spike pausieren** — Stage 4 (Deterministic Layer) bauen (~2-4 Tage Engineering im `scripts/spike/`-Harness), DANN finale (C-i)-Messung mit deterministisch-vorprozessiertem Spec. Dies validiert die Differentiator-Empirik sauber: der LLM-Output nach Pre-Pass IST das was der LLM wirklich an Knowledge-Asymmetrie liefert.
4. **Cost-Implication:** wenn 50% der LLM-Findings deterministisch werden, schrumpft Stripe-Run von $5.86 auf ~$1.50-2 (mit Prompt-Caching). Self-fundable bis Bull-Case → BYOK kann zurück nach v1.1 als optional-feature, nicht v1-must.
5. **PRD-Revision-Liste teilweise zurückgenommen:** BYOK-as-v1-must, Workspace-Cap-$30-50, Async-Job-Pattern bleiben relevant aber Dringlichkeit hängt von Stage-4-Empirik ab. Final-Liste nach Stage 4.
6. Memory-Handoff (`project_epic09_spike_handoff.md`) auf 2026-05-05 Stage-4-State aktualisiert.

What's next: Stage-4-Engineering — Pattern-Extraktion aus existierenden JSONs → Spectral-Integration-Eval → Custom-Rules implementieren → Validation-Pass gegen JSONs. Dann Phase B (Pre-Pass + v6 + Cache: PD/Stripe-Runs). Konkrete Schritte in `specs/big-spec-architecture-spike-critical-review.md` "Aktualisierter Plan"-Abschnitt.

**Update 2026-05-05 (later same day): Eval-Framework als Phase 0 vor Stage 4.** User-Decision: bevor Stage 4 (Deterministic Layer) gebaut wird, ~1 Tag Engineering in ein leichtes Custom-Eval-Framework investieren (`scripts/spike/eval/*`). Gründe: Multi-Run-Aggregation (löst Critical-Review-Punkt N=1-Varianz), strukturiertes Reference-Format für human-hardening, Repetition-Cluster-Scorer (misst direkt Stage-4-Effekt), Comparison-Reports + Regression-Snapshots. Port-Pattern nach `src/lib/eval/` im Foundation-Block. Verworfen: 3rd-Party-Frameworks (Promptfoo, Inspect, LangSmith — overhead + Drift-Risiko für unseren spezifischen Use-Case) und Code-Discipline-only (Critical-Review-Punkte bleiben unmessbar). Aktualisierte Reihenfolge: Phase 0 (Eval-Framework, ~1 Tag) → Phase A (Deterministic Layer, ~2-4 Tage) → Phase B (finale (C-i)-Messung mit N=3-5 multi-run, ~$5-8) → Phase C (Lock). Konkreter Phase-0-Scope in `specs/big-spec-architecture-spike-critical-review.md` Iteration 3.

#### 2026-05-05 (evening) — Phase 0 Eval-Framework DONE

8 Tasks komplett, alle in einem Tag mit 4 parallel Background-Agents. Eval-Pipeline operational:

1. **Strukturiertes Reference-Format** (`openapi-examples/stripe-full/reference/findings.json`): Stripe-Reference von Markdown nach JSON migriert. 29 Findings + Klassifikations-Tags (`isLintFlavoured` 6/29, `isKnowledgeBackedGap` 14/29, `isDeterministicallyDetectable` 23/29, `narrationKeywords`, `expectedClusterKey`). Markdown bleibt als Companion. Migration via `scripts/spike/eval/migrate-md-to-json.ts`. **User-Review-Action offen:** Klassifikation per F# best-guess von Claude Code; User reviewt nach Bedarf, JSON-Schema dokumentiert.
2. **Pluggable Scorer-Architektur** (`scripts/spike/eval/scorers/`): JaccardScorer (refactored from `score-coverage.ts`, identische Algorithmus + erweiterte Splits substantive/llm-only/knowledge-backed) · RepetitionClusterScorer (token-bag-Normalisierung + Cluster-Gruppierung) · ClassificationScorer (Stub bis Phase A).
3. **Multi-Run-Runner** (`scripts/spike/eval/runner.ts`): YAML-Config-Loader · Replay-Mode (kostenlos, lädt existierende JSONs) · Live-Mode-Stub (Phase B) · N-Run-Aggregation mit mean/p50/p95/std.
4. **Snapshot-Regression-System** (`scripts/spike/eval/snapshot.ts`): lockSnapshot / loadSnapshot / diffAgainstSnapshot · Tolerance-Defaults staffelig (±5% quality, ±10% counts, ±20% cost/latency) · CLI-Subcommands lock/diff · Git-SHA-Capture beim Lock.
5. **Comparison-Reporter** (`scripts/spike/eval/comparison.ts`): Markdown-Tabelle mit Δ + Δ% + Direction-Arrows · per-Metrik direction-lookup (higher-better / lower-better / neutral) · Cross-Spec / Runs-Mismatch Warnungen.
6. **score-run.ts Glue**: Runner-Output → ScoredRunnerOutput. Aggregiert alle Scorer pro spec, fügt aggregate-Stats für coverage / repetition / cluster-Metriken hinzu.
7. **Empirische Stage-3-Reproduktion + Locked Baseline:** `eval-configs/c-i-baseline-stripe.yaml` läuft im Replay-Mode gegen Stripe-FULL JSON. Reproduziert Stage-3 exakt: 1423 findings, $5.8630 cost, 34.1min duration, 99.3% apply-clean, 0.7% hallu, **37.9% Coverage = identisch zum Stage-3 algorithmic** (= valid Refactor). Plus neue Splits: 30.4% substantive (23/29 non-lint refs), 33.3% LLM-only (6/29 non-deterministisch refs), **28.6% knowledge-backed (4/14 differentiator-class)**. Snapshot locked at `scripts/spike/eval/snapshots/c-i-baseline-stripe.json`.
8. **Empirische Headline-Number-Korrekturen** (gegen die existing JSONs):
   - PD-FULL: 623 findings → 437 unique clusters (29.9% repetition rate, top cluster "Missing 429" × 62)
   - Stripe-FULL: 1423 findings → 986 unique clusters (30.7% repetition, top cluster "Missing limit min/max" × 81)
   - Spike-Headline "(C-i) emits 119× more findings than (A)" → realistisch ~21× nach dedup
   - Knowledge-Backed-Coverage 28.6% (4/14) empirisch validiert v6-Prompt-Defizit: nur F8, F16, F22, F23 gematcht; F3, F6, F7, F9, F10, F12, F17, F18, F21, F28 verfehlt — exakt die Critical-Review-prognose.

**Stage 4 baseline + measurement-pipeline ready.** Stage-4-Engineering (Deterministic Layer) startet als nächstes; jeder Run wird automatisch gegen Snapshot diffbar + per Comparison-Reporter visualisierbar gegen baseline.

### Live state (relevant facts below stay valid through v1 dev)

| Item | Value |
|---|---|
| Production URL | https://apiq-mvp.vercel.app |
| GitHub repo | https://github.com/Per-Paulsen/apiq-mvp (private; can be flipped to public via `gh repo edit Per-Paulsen/apiq-mvp --visibility public --accept-visibility-change-consequences`) |
| Vercel project | per-paulsens-projects/apiq-mvp · prj_NxMsbdfCjwdjAsJ73BIJ8tjUhlFy |
| Production DB | Supabase EU-North-1, project `ouzznqiooklxdllhxgiu` — drives `apiq-mvp.vercel.app` Demo-Workspace + Daily-Reset-Cron. Schema frozen at v0.1. |
| v1-dev DB (local only) | Supabase project `nmqnnmacvkygnilizzlf` — drives all `v1-launch` branch work. Local `.env` `DATABASE_URL` + `DIRECT_URL` point here. v0.1 schema applied + Petstore-Demo seeded for local testing. |
| Demo credentials | `demo@example.com` / `demo` — pre-seeded via `scripts/seed-demo.ts`, daily-reset cron at 03:00 UTC via `vercel.json` + `/api/cron/reset-demo` |
| Demo content | 1 fixture: Swagger Petstore 3.0 (score 32, 14 findings, 19 endpoints) — committed at `scripts/seed-fixtures/swagger-petstore-openapi-3-0.json` |
| Env-flag | `DEMO_MODE=true` — gates landing-page banner + auto-login button + reset-cron route |
| OpenRouter cap | $20 lifetime credit-cap on the production key (account-level kill-switch in case of abuse) |
| Workspace LLM cap | $10/24h per workspace (existing v0.1, unchanged) |
| Anti-bot | Cloudflare Turnstile (production keys) on signup; login has no Turnstile per Epic 02 design |

### Files owned by the portfolio deploy (v1 epics must NOT silently break these)

| File | Purpose | v1 epic interaction |
|---|---|---|
| `src/app/(public)/page.tsx` | Landing page with demo banner | **Epic 17 / 27** UI Redesign + Marketing Surfaces — must preserve or migrate the `DEMO_MODE` banner |
| `src/app/(public)/demo-login-action.ts` | Server-action that auto-logs in demo user | **Epic 23** Auth Hardening — if email-verification adds a strict block, the demo user must keep `emailVerified` set (already done by seed-demo) |
| `src/lib/seed-demo.ts` | Idempotent seed logic | **Epic 19** Anonymous Demo introduces a richer anon-flow; demo-account pattern can stay alongside or be retired in favor of `/anon/<token>` |
| `src/app/api/cron/reset-demo/route.ts` | Daily reset cron route | **Epic 26** Operational Hygiene adds more crons — keep this route in `vercel.json` cron list |
| `scripts/capture-demo-fixtures.ts` + `scripts/seed-demo.ts` | CLI scripts | None directly affected; but new fixtures from updated v1 prompt may need re-capture |
| `scripts/seed-fixtures/*.json` | Pre-baked demo analyses | Re-capture if v1's prompt (Epic 04 evolution / Epic 09 spike outcome) significantly changes finding-shape |
| `vercel.json` | Cron schedule | **Epic 26** appends `cleanup-anonymous-analyses` cron — DO NOT replace, append |
| `.env.production.example` | Env-template (committed) | **Epic 23/24/25/26** add new vars (Resend, Sentry, PostHog, etc.) — extend, don't overwrite |
| `DEPLOY-PORTFOLIO.md` | Runbook | Update when v1 launches — either retire the portfolio-deploy mechanism or document the v0.1 → v1 transition |

### Honest gaps in the portfolio deploy (acceptable for v0.1; closed by v1 epics)

- No email verification (Epic 23 fixes)
- No forgot-password (Epic 23)
- No Privacy/ToS pages, no cookie banner (Epic 25)
- No SSRF hardening on URL pull (Epic 24)
- No Sentry / PostHog (Epic 26)
- No prompt-injection delimiters (Epic 24)
- Single-region Vercel + same DB for dev+prod (Epic 28 production setup formalizes this)

### v1-launch-day: portfolio-deploy disposition

Three options when v1 ships, decide post-Epic 28:

1. **Retire** — flip `DEMO_MODE=false`, demo-banner disappears, the same Vercel project becomes the v1 launch site. Demo workspace + reset cron stay (harmless), or get cleaned up.
2. **Coexist** — keep `DEMO_MODE=true` for the demo experience, separately deploy v1 to a new Vercel project at the post-naming-workshop domain. Two live deploys.
3. **Migrate to Epic 19's `/anon/<token>`** — replace the pre-seeded demo-account model with the proper anonymous-demo flow. Cleanest long-term; means deleting `demo-login-action.ts` + the seed cron, and relying on Epic 19's UX instead.

Recommendation: option 1 (retire). The pre-seeded demo-account is a v0.1 stopgap; Epic 19's anon-flow is the v1 native answer.

---

## Epics

### Spike track

- [ ] **Epic 09** — Big-Spec Architecture Spike (S0) · _unconditional_
  - **After ship:** read `specs/09-big-spec-architecture-spike-results.md` last section. It contains a copy-pastable trigger.
  - **Decision-tree:**
    - S1 starten → run `/spec_ind 10 capability-gap-spike "Phase-1 spike per prd-launch.md §4 — capability-gap-generation against 3 reference specs, ≥50% relevance pass-criteria"`
    - S1 abbrechen → defer to v1.1; mark Epic 10–13 below as `[skip]`
    - S1 vertagen v1.1 → same as abbrechen
- [ ] **Epic 10** — Capability-Gap-Generation Spike (S1) · _conditional on Epic 09_
  - Spec-file does not exist yet — created via `/spec_ind 10 ...`
  - **After ship:** decision-tree mirrors above. Triggers `/spec_ind 11 business-improvements-spike "..."` or skip.
- [ ] **Epic 11** — Business-Improvements Spike (S2) · _conditional on Epic 10_
  - **After ship:** triggers `/spec_ind 12 implementation-hints-spike "..."` or skip.
- [ ] **Epic 12** — Implementation-Hints Spike (S3) · _conditional on Epic 11_
  - **After ship:** S3-Implementation is v1.2 territory per PRD §5; no further trigger in v1.
- [ ] **Epic 13** — Capability-Gap-Generation Implementation · _conditional on Epic 10 success_
  - Triggered IN PARALLEL with Epic 11/12 (or after Epic 12), not after Epic 12: `/spec_ind 13 capability-gap-implementation "Implement spike-validated prompt + UI per specs/10-results.md"`
  - **Marketing dependency:** Epic 27 copy must NOT mention capability-gap-hero until this epic ships.

### Pre-Foundation-Block follow-ups (must complete BEFORE Engineering track starts)

- [ ] **PRD revision post-Spike-09** — `prd-launch.md` updates required from spike-output (`specs/big-spec-architecture-spike.md` §"Cost-sustainability" + §"Operational architecture"):
  - §3 Foundation-Block: add **BYOK (Bring Your Own Anthropic Key)** as v1-must (1-2 days). Move from §5 v1.1-out-of-scope.
  - §3 Operational: revise **Pricing-page** from "Free during beta" to "Free + Pro + BYOK" tier-design.
  - §3 Foundation-Block: add **DB-migration** for `Finding.confidence` / `Finding.impact` / `category=correctness`.
  - §3 Operational: raise **workspace-cost-cap** from $10/24h to $30-50/24h (calibrated for (C-i)-cost-realität).
  - §3 Foundation-Block: add **Long-running-job async pattern** (kick-off → polling/SSE) — required for (C-i) on big specs (~34 min runtime).
  - §3 Foundation-Block: add **Tier-0a/0b correctness-check** as MUST (reputation-protection for v1).
  - §7 Success-Metrics: add "Cost per active user per month" with BYOK-segmentation.
  - Affected Epics: 20 (MCP) + 21 (CLI) need async-API-contract; 17 (UI Redesign) needs findings-prioritisation-at-scale; 14+ get extended scope.
- [ ] **Cross-Layer Findings-Deduplication** (~2-3 Tage, neu identifiziert 2026-05-05 in Phase A): Stage-A pre-pass (Spectral + Walkers + Domain-Knowledge) + LLM Phase-1+2 emit overlapping findings across layers. Ohne Dedup sieht User 3-5× duplikate pro Spec-Issue (Spectral per-occurrence + Walker aggregated + LLM-Phase-1 per-endpoint + LLM-Phase-2 spec-level für dasselbe Issue). Mechanik bereits modular im Spike-Harness (Phase-0 Token-Jaccard + Repetition-Cluster + Phase-A narrationKeywords-aware + Phase-A Embedding-Similarity); Port nach `src/lib/analysis/dedup/` analog zu Epic-04-Pattern. Siehe `specs/big-spec-architecture-spike-critical-review.md` Iteration 5 Punkt 16.

### Engineering track (always-run)

- [ ] Epic 14 — Pre-Launch Spec-Fixes & Export-Hardening
- [ ] Epic 15 — Spec Import — Paste & Drag-Drop
- [ ] Epic 16 — Apply-All Buttons (Critical + Confirm)
- [ ] Epic 17 — UI Redesign (vor Live Preview, per Q2 = A)
- [ ] Epic 18 — Live Preview — Stoplight + Prism
- [ ] Epic 19 — Anonymous Demo + Public Share
- [ ] Epic 20 — MCP Server
- [ ] Epic 21 — CLI
- [ ] Epic 22 — Score Badges + Markdown Findings Export
- [ ] Epic 23 — Auth Hardening
- [ ] Epic 24 — Security Hardening
- [ ] Epic 25 — GDPR, Privacy & Legal
- [ ] Epic 26 — Operational Hygiene
- [ ] Epic 27 — Marketing Surfaces
- [ ] Epic 28 — Production Setup & Smoke-Test → **LAUNCH**

### Out-of-band parallel work

- [ ] **Naming Workshop** — runs in parallel during Week 1–2 (per PRD §9). Not an engineering epic. If rebrand: `/patch <n> rename "apiq → newname"` post-Workshop. If no name found: `apiqual.dev` interim, defer rebrand to post-launch.

## Trigger-cheat-sheet

| Just shipped | Read | If "starten" | If "abbrechen / vertagen" |
|---|---|---|---|
| Epic 09 | `09-...-results.md` last block | `/spec_ind 10 capability-gap-spike "..."` | mark 10–13 `[skip]`, jump to Epic 14 |
| Epic 10 | `10-...-results.md` last block | `/spec_ind 11 business-improvements-spike "..."` AND in parallel `/spec_ind 13 capability-gap-implementation "..."` | mark 11/12/13 `[skip]`, jump to Epic 14 |
| Epic 11 | `11-...-results.md` last block | `/spec_ind 12 implementation-hints-spike "..."` | mark 12 `[skip]`, continue Engineering |
| Epic 12 | `12-...-results.md` last block | nothing — S3-Implementation is v1.2 | continue Engineering |
| Epic 13 | `13-...-results.md` | none — patch Epic 27 marketing-copy to surface capability-gap-hero | n/a |

## Notes

- Skipping any conditional epic is safe — those features defer to v1.1+ and v1 still ships launch-ready.
- After every `/dev` run on Epic 09–13, **read the last section of the corresponding `*-results.md` immediately**. It's structured to give you a copy-pastable next-command.
- Engineering-track epics (14–28) have no dependency on the spike-track outcome (except Epic 27 marketing-copy ↔ Epic 13 dependency noted above).
- Reference: `specs/brainstorming-launch.md` §"Conditional Epic Trigger Workflow" for full mechanism.
