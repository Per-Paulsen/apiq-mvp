---
tags:
  - type/index
---

# apiq MVP — Map of Content

> Entry point for navigating the apiq project documentation in Obsidian.
>
> **Currently on `v1-launch` branch.** See [Branch Policy](#branch-policy) below before working.

## Status

- **v0.1**: shipped — Epics 00–08 done. Live at https://apiq-mvp.vercel.app
- **v1**: in progress — Epic 09 Stage A (Welle E next); Epics 14–28 spec'd, awaiting implementation
- **Tests**: 2863 pass / 4 skipped / 0 fail on `v1-launch` (post-Welle-I)

## Branch Policy

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | **FROZEN** at v0.1 portfolio-deploy state | Production-Vercel-Deploy pinned here. Never push v1-work directly. |
| `v1-launch` | Active v1 development (Epic 09 spike + Epics 14–28) | All work happens here. Never `vercel --prod`. Never `prisma migrate dev` against prod Supabase (use separate v1-dev Supabase). |

Merge `v1-launch` → `main` only when v1 is launch-ready and explicitly approved.

## Product

- [PRD v0.1](prd.md) — original product vision (still valid long-term direction)
- [PRD v1 launch](prd-launch.md) — operative PRD for v1 public launch
- [PRD v1 brainstorming](prd-launch-brainstorming.md) — 12 rounds of strategic discussion behind `prd-launch.md`
- [Brainstorming launch decisions](specs/brainstorming-launch.md) — epic-bundling decisions + Conditional Epic Trigger Workflow (10–13)
- [Detailed decisions](prd-decisions.md) — design system (zinc + violet, Geist Sans + JetBrains Mono, layout, components)

## Tech & Deploy

- [Tech Stack](tech-stack.md) — pinned versions
- [Launch Progress](LAUNCH-PROGRESS.md) — live checklist + branch/DB policy + setup-actions log
- [Portfolio-Deploy Runbook](DEPLOY-PORTFOLIO.md) — file ownership map (which files are owned by the live demo)
- [Dev Guide / CLAUDE.md](CLAUDE.md) — project instructions for Claude Code (the BIG one)

## Epic Specs — v0.1 (done)

| # | Epic | Spec | Brainstorming | Results |
|---|------|------|---------------|---------|
| 00 | Research Spike | [spec](specs/00-research-spike.md) | [brainstorming](specs/00-research-spike-brainstorming.md) | [results](specs/00-research-spike-results.md) |
| 01 | Project Setup | [spec](specs/01-project-setup.md) | [brainstorming](specs/01-project-setup-brainstorming.md) | [results](specs/01-project-setup-results.md) |
| 02 | Auth + Workspace | [spec](specs/02-auth-workspace.md) | [brainstorming](specs/02-auth-workspace-brainstorming.md) | [results](specs/02-auth-workspace-results.md) |
| 03 | Spec Ingestion | [spec](specs/03-spec-ingestion.md) | [brainstorming](specs/03-spec-ingestion-brainstorming.md) | [results](specs/03-spec-ingestion-results.md) |
| 04 | LLM Pipeline | [spec](specs/04-llm-pipeline.md) | [brainstorming](specs/04-llm-pipeline-brainstorming.md) | [results](specs/04-llm-pipeline-results.md) |
| 05 | Spec Detail | [spec](specs/05-spec-detail.md) | [brainstorming](specs/05-spec-detail-brainstorming.md) | [results](specs/05-spec-detail-results.md) |
| 06 | Patch Apply | [spec](specs/06-patch-apply.md) | [brainstorming](specs/06-patch-apply-brainstorming.md) | [results](specs/06-patch-apply-results.md) |
| 07 | Specs List + Settings | [spec](specs/07-specs-list-settings.md) | [brainstorming](specs/07-specs-list-settings-brainstorming.md) | [results](specs/07-specs-list-settings-results.md) |
| 08 | Export + Polish | [spec](specs/08-export-polish.md) | [brainstorming](specs/08-export-polish-brainstorming.md) | [results](specs/08-export-polish-results.md) |

## Epic Specs — v1 (in progress / pending)

| # | Epic | Spec | Brainstorming | Status |
|---|------|------|---------------|--------|
| 09 | Big Spec Architecture Spike | [spec](specs/09-big-spec-architecture-spike.md) | [brainstorming](specs/09-big-spec-architecture-spike-brainstorming.md) | **In progress** (Stage A — Welle E next) |
| 14 | Pre-launch Spec Fixes + Export Hardening | [spec](specs/14-prelaunch-spec-fixes-export-hardening.md) | [brainstorming](specs/14-prelaunch-spec-fixes-export-hardening-brainstorming.md) | spec'd |
| 15 | Spec Import — Paste / Drag-Drop | [spec](specs/15-spec-import-paste-dragdrop.md) | [brainstorming](specs/15-spec-import-paste-dragdrop-brainstorming.md) | spec'd |
| 16 | Apply-All Buttons | [spec](specs/16-apply-all-buttons.md) | [brainstorming](specs/16-apply-all-buttons-brainstorming.md) | spec'd |
| 17 | UI Redesign | [spec](specs/17-ui-redesign.md) | [brainstorming](specs/17-ui-redesign-brainstorming.md) | spec'd |
| 18 | Live Preview (Stoplight Prism) | [spec](specs/18-live-preview-stoplight-prism.md) | [brainstorming](specs/18-live-preview-stoplight-prism-brainstorming.md) | spec'd |
| 19 | Anonymous Demo + Public Share | [spec](specs/19-anonymous-demo-public-share.md) | [brainstorming](specs/19-anonymous-demo-public-share-brainstorming.md) | spec'd |
| 20 | MCP Server | [spec](specs/20-mcp-server.md) | [brainstorming](specs/20-mcp-server-brainstorming.md) | spec'd |
| 21 | CLI | [spec](specs/21-cli.md) | [brainstorming](specs/21-cli-brainstorming.md) | spec'd |
| 22 | Score Badges + Markdown Export | [spec](specs/22-score-badges-markdown-export.md) | [brainstorming](specs/22-score-badges-markdown-export-brainstorming.md) | spec'd |
| 23 | Auth Hardening | [spec](specs/23-auth-hardening.md) | [brainstorming](specs/23-auth-hardening-brainstorming.md) | spec'd |
| 24 | Security Hardening | [spec](specs/24-security-hardening.md) | [brainstorming](specs/24-security-hardening-brainstorming.md) | spec'd |
| 25 | GDPR / Privacy / Legal | [spec](specs/25-gdpr-privacy-legal.md) | [brainstorming](specs/25-gdpr-privacy-legal-brainstorming.md) | spec'd |
| 26 | Operational Hygiene | [spec](specs/26-operational-hygiene.md) | [brainstorming](specs/26-operational-hygiene-brainstorming.md) | spec'd |
| 27 | Marketing Surfaces | [spec](specs/27-marketing-surfaces.md) | [brainstorming](specs/27-marketing-surfaces-brainstorming.md) | spec'd |
| 28 | Production Setup + Smoke Test | [spec](specs/28-production-setup-smoke-test.md) | [brainstorming](specs/28-production-setup-smoke-test-brainstorming.md) | spec'd |

*Epics 10–13 are conditional spike-epics — spec'd on-demand after each preceding spike's `*-results.md` Cancel-Decision. Workflow in [`specs/brainstorming-launch.md`](specs/brainstorming-launch.md) §"Conditional Epic Trigger Workflow".*

## Epic 09 — Stage A Architecture Spike

> Multi-wave structure within Epic 09. **Verbindlicher Plan**: [Stage A Restwork Plan v2](specs/big-spec-architecture-spike-stage-a-restwork-plan.md) is source-of-truth for wave order and content.

### Plan, Audit & Critical Review

- [Stage A Restwork Plan v2](specs/big-spec-architecture-spike-stage-a-restwork-plan.md) — verbindlicher Welle-Plan (Putzen-First-Reihenfolge)
- [Implementation Priority](specs/big-spec-architecture-spike-stage-a-implementation-priority.md) — Pattern-Source-of-truth for Stage-A patterns + wave-plan
- [Meta-Insights](specs/big-spec-architecture-spike-stage-a-meta-insights.md)
- [Rules Brainstorm](specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md) — Master file, 2327 lines, 972 patterns
- [Implementation Audit](specs/big-spec-architecture-spike-stage-a-implementation-audit.md) — documenting pipeline-wiring gaps
- [Claim Audit](specs/big-spec-architecture-spike-stage-a-claim-audit.md) — claim-vs-reality discrepancies
- [Critical Review](specs/big-spec-architecture-spike-critical-review.md)
- [Phase B Design](specs/big-spec-architecture-spike-phase-b-design.md) — LLM-pipeline design on Stage-A foundation

### Welle-Status (Stage A)

| Welle | Focus | Status |
|-------|-------|--------|
| 0 + A + B (W1–W4) | Foundation | done |
| Q | Code-Quality Cleanup | [done](specs/E09-w-q-code-quality-cleanup-results.md) |
| M | Mining-Optimization (R3+R4, 972 patterns, 80.4% citation coverage) | [done](specs/E09-w-m-mining-optimization-results.md) · [brainstorming](specs/E09-w-m-mining-optimization-brainstorming.md) |
| F | Framework-Optimization (110/110 YAML rules apiq-meta-Block) | [done](specs/E09-w-f-framework-optimization-results.md) · [brainstorming](specs/E09-w-f-framework-optimization-brainstorming.md) |
| C | P2 Spectral Rules (36 Threat + 25 Client) | [done](specs/E09-w-c-p2-spectral-rules-results.md) |
| D | P3 Trail (5 new yamls, 171 rules) | [done](specs/E09-w-d-p3-trail-results.md) |
| Arch+ | Architecture Cleanup (layered structure) | [done](specs/E09-w-arch-architecture-cleanup-results.md) |
| D2 | P4+P5 Niche/Vendor | [done](specs/E09-w-d2-niche-vendor-results.md) |
| I | Inventory + Capability-Map (auto-generated single-source-of-truth + CI-gate) | [done](specs/E09-w-i-inventory-capability-map-results.md) |
| **E** | **Putz-Niveau-Benchmark gegen 28 Springer-Delphi-Rules** | **next** |
| T | Test-Coverage all-specs + Snapshot + CI (parallel to E) | pending |
| Doc | Documentation pass | pending |
| R | R1+R2 Multi-Model cross-validated | pending |
| V | 4-way Cross-Linter (NACH Putzen) | pending |
| → Phase B | N=3×4 Specs | pending |

### Welle E Preparation

- [Welle E Pre-Survey](specs/E09-w-e-pre-survey.md)
- [Welle E Springer-Delphi Benchmark](specs/E09-w-e-springer-delphi-benchmark.md)

## Research Mining (Welle M)

Systematic mining via 7 source families. Master file: [Rules Brainstorm](specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md).

### Foundations

- [Linters](specs/big-spec-architecture-spike-mining-linters.md)
- [Spectral](specs/big-spec-architecture-spike-mining-spectral.md)
- [Style Guides](specs/big-spec-architecture-spike-mining-style-guides.md)

### Round 2 — Meta-Domains

- [Client](specs/big-spec-architecture-spike-mining-round2-client.md) · [Evolution](specs/big-spec-architecture-spike-mining-round2-evolution.md) · [Meta](specs/big-spec-architecture-spike-mining-round2-meta.md)
- [Standards](specs/big-spec-architecture-spike-mining-round2-standards.md) · [Style](specs/big-spec-architecture-spike-mining-round2-style.md) · [Threat](specs/big-spec-architecture-spike-mining-round2-threat.md)

### Round 3 — Books, Postmortems, Corpus

- [Books](specs/big-spec-architecture-spike-mining-round3-books.md)
- [Postmortems](specs/big-spec-architecture-spike-mining-round3-postmortems.md)
- [Corpus](specs/big-spec-architecture-spike-mining-round3-corpus.md) · [Corpus Download Log](specs/big-spec-architecture-spike-mining-round3-corpus-download.md)
- [Re-Audit](specs/big-spec-architecture-spike-mining-round3-reaudit.md)

### Round 4 — Conferences, Papers, Vendor Blogs

- [Conferences](specs/big-spec-architecture-spike-mining-round4-conferences.md)
- [Papers + IETF](specs/big-spec-architecture-spike-mining-round4-papers.md)
- [Vendor Blogs](specs/big-spec-architecture-spike-mining-round4-vendor-blogs.md)

## Reviews

- [Individual Epic Review](specs/ind-epic-review.md) — within-epic refinement decisions
- [Cross-Epic Review](specs/cross-epic-review.md) — cross-epic refinement decisions

## Other Specs

- [General Brainstorming](specs/brainstorming.md) — pre-spec discussion
- [Research Spike (canonical)](specs/research-spike.md) — final v4 prompt + zod schema (v0.1 canonical)

## Demo Infrastructure

- [`scripts/seed-demo.ts`](scripts/seed-demo.ts) — CLI to seed demo workspace (one-time post-deploy)
- [`scripts/capture-demo-fixtures.ts`](scripts/capture-demo-fixtures.ts) — CLI to refresh fixtures from dev DB
- [`scripts/seed-fixtures/`](scripts/seed-fixtures/) — pre-baked demo-data JSON (replayed by seed-demo + cron)
- [`scripts/verify-spec-ingestion.ts`](scripts/verify-spec-ingestion.ts) — Permanent regression script Epic 03
- [`scripts/verify-llm-pipeline.ts`](scripts/verify-llm-pipeline.ts) — Permanent regression script Epic 04
- [`vercel.json`](vercel.json) — Cron schedule (daily 03:00 UTC reset-demo)

## Sample OpenAPI Specs

- [`openapi-examples/README.md`](openapi-examples/README.md) — full catalog
- Specs: `openweathermap/`, `stripe/`, `stripe-full/`, `pagerduty/`, `pagerduty-full/`, `dnd5eapi/`, `github-rest/`

## Spike Harness (Epic 00 — Regression-Kept)

- [`scripts/spike/`](scripts/spike/) — own `package.json`, standalone harness
- Post-Arch+ layered structure: `scripts/spike/deterministic/{classifiers, aggregators, modules, rules, spectral-functions, iana, infra}`
- Inventory artifacts (post-Welle-I, single-source-of-truth): `scripts/spike/eval/{INVENTORY.md, COVERAGE.md, CROSS-REFERENCES.md, DRIFT-REPORT.md, TEST-COVERAGE.md, API-SURFACE.md}`
- Pattern data: `scripts/spike/data/patterns.json` (972 patterns, validated via PatternSchema)
- Source verify CI: [`scripts/source-verify/`](scripts/source-verify/) — quarterly cron + CLI with gh-api-fallback + ETag-cache
