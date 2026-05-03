# apiq-mvp

API Intelligence platform — LLM-mediated comprehension, scoring, and improvement of OpenAPI specs.

Sibling project to ExpliqAI. Same stack, same workflow philosophy, different domain (OpenAPI specs instead of n8n workflows).

## Status

Phase A: repo skeleton with skills and tech stack. PRD pending.

## Quick start

Prerequisites: Node 20+, a Postgres database (Supabase works), an OpenRouter API key, and a Cloudflare Turnstile site/secret pair.

```bash
git clone https://github.com/<your-fork>/apiq-mvp.git
cd apiq-mvp
npm install
cp .env.example .env
```

Fill the required variables in `.env`:

- `DATABASE_URL` — Postgres connection string (must include `?pgbouncer=true&connection_limit=1` for Supabase pooler)
- `AUTH_SECRET` — generate with `openssl rand -base64 32`
- `INTERNAL_API_SECRET` — generate with `openssl rand -base64 32`
- `OPENROUTER_API_KEY` — from https://openrouter.ai
- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — from Cloudflare Turnstile (free tier)

Apply the schema and start the dev server:

```bash
npx prisma migrate dev
npm run dev
```

Open http://localhost:3000/signup to create the first account, then visit `/specs` and use "Add Spec" to pull an OpenAPI URL.

## Workflow

See [`CLAUDE.md`](CLAUDE.md) for architecture conventions and the spec-driven development workflow.

## Key files

- [`CLAUDE.md`](CLAUDE.md) — guidance for Claude Code
- [`tech-stack.md`](tech-stack.md) — tech stack
- [`prd.md`](prd.md) — product requirements (pending)
- [`.claude/skills/`](.claude/skills/) — custom skills for the spec-driven workflow
- [`specs/`](specs/) — epic specifications (generated from PRD via `/spec`)
- [`openapi-examples/`](openapi-examples/) — sample OpenAPI specs for development
