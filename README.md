# apiq-mvp

**API Intelligence platform** — LLM-mediated comprehension, scoring, and improvement of OpenAPI specs.

## Live demo

🌐 **https://apiq-mvp.vercel.app** — pre-seeded portfolio demo. State resets daily at 03:00 UTC.

```
email:    demo@example.com
password: demo
```

The demo workspace ships with one analyzed spec (Swagger Petstore 3.0 — score 32, 14 findings) so you can immediately explore the apply-loop, version history, and export. Apply patches, undo, re-analyze — daily reset undoes everything for the next visitor.

## Status

- **v0.1 implementation complete** (Epics 00–08): single-spec analysis, narrated findings, one-click patches, version history, export. 298 tests + lint + build clean.
- **v1 launch in spec phase** (Epics 09 + 14–28): big-spec architecture spike, distribution channels (CLI / MCP / public share / score badges), security + GDPR + auth hardening, UI redesign, marketing surfaces.
- **Production deploy is pinned to `main`** at v0.1 portfolio state. v1 work happens on the `v1-launch` branch with a separate dev Supabase. See `LAUNCH-PROGRESS.md` for the branch policy + setup-actions log.

Sister project: **expliq-mvp** (Automation Intelligence for n8n workflows). Same stack, same workflow, different domain.

## Quick start (local development)

Prerequisites: Node 22+, Postgres database (Supabase free-tier works), OpenRouter API key, Cloudflare Turnstile site/secret pair.

```bash
git clone https://github.com/Per-Paulsen/apiq-mvp.git
cd apiq-mvp
git checkout v1-launch  # active development branch (main is frozen at v0.1)
npm install
cp .env.example .env
# fill the variables in .env (see .env.example for the full list)
npx prisma migrate deploy
npm run dev
```

Open http://localhost:3000/signup to create the first account, then visit `/specs` and use "Add Spec" to pull an OpenAPI URL.

To populate a Petstore-demo workspace locally for testing:

```bash
npm run seed-demo  # idempotent; uses scripts/seed-fixtures/*.json
```

## Workflow

apiq is built spec-driven via Claude Code skills:

- `/spec <prd>` — derive epics from a PRD
- `/spec_ind <n> <name> <desc>` — single new epic spec
- `/refine <spec>` / `/refine_all_ind` / `/refine_all` — refinement passes
- `/dev <spec>` — implement an epic
- `/patch <n> <slug> <desc>` — focused change to existing implementation

See [`CLAUDE.md`](CLAUDE.md) for the full workflow + architecture conventions.

## Reference docs

| File | What it is |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Architecture conventions + branch policy (auto-loaded for Claude Code sessions) |
| [`prd.md`](prd.md) | Original v0.1 product vision |
| [`prd-launch.md`](prd-launch.md) | Operative PRD for v1 public launch |
| [`prd-decisions.md`](prd-decisions.md) | Design system (zinc + violet, Geist + JetBrains Mono, layout, components) |
| [`tech-stack.md`](tech-stack.md) | Pinned stack/versions |
| [`LAUNCH-PROGRESS.md`](LAUNCH-PROGRESS.md) | Live state of v1 launch + branch + DB policy + setup actions log |
| [`DEPLOY-PORTFOLIO.md`](DEPLOY-PORTFOLIO.md) | Portfolio-deploy runbook + file ownership map |
| [`specs/`](specs/) | Per-epic specifications (Epic 00–08 done; Epic 09 + 14–28 spec'd; 10–13 conditional) |
| [`openapi-examples/`](openapi-examples/) | Sample OpenAPI specs for development + spike calibration |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 5 · Tailwind v4 · shadcn/ui · Prisma 7 · Supabase (Postgres) · Auth.js v5 · OpenRouter (Claude Sonnet 4) · Vercel.

See [`tech-stack.md`](tech-stack.md) for the full pinning.
