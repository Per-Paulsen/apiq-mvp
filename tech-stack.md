# Tech Stack

> Upstream: [PRD](prd.md) | [CLAUDE.md](CLAUDE.md)

## Frontend
- Next.js 16 (App Router, Turbopack)
- React 19
- TypeScript 5
- Tailwind CSS v4 (CSS-first config in `globals.css`)
- shadcn/ui + lucide-react

## Backend
- Next.js Route Handlers + Server Actions
- **Vercel Functions on Fluid Compute** (Node 24 LTS runtime) — the 2026 default. Fluid Compute reuses function instances across concurrent requests for amortised low cold-starts; supports graceful shutdown + request cancellation. **Edge Functions are explicitly avoided** (deprecated in 2026 Vercel guidance — compatibility issues with Node-only libraries). All `/api/*` routes default to `runtime: 'nodejs'`.
- Default function execution timeout: 300s on all plans (up from 60-90s).
- Pricing model: Active CPU + provisioned memory + invocations (not wall-clock GB-seconds).

## Database
- PostgreSQL (Supabase-managed)
- Prisma 7 ORM (driver adapter `@prisma/adapter-pg`, generated client at `src/generated/prisma/client`)

## Authentication
- Auth.js v5 (next-auth) — Credentials provider, JWT sessions, bcrypt
- Edge-safe split: `src/lib/auth.config.ts` (route protection only) + `src/lib/auth.ts` (full)

## LLM
- OpenAI SDK against OpenRouter (v0.1 + v1; Vercel AI Gateway is a v1.1 candidate per `specs/brainstorming-launch.md` §"v1.1 tech-stack candidates")
- Default models: `anthropic/claude-sonnet-4` (heavy/aggregation calls), `anthropic/claude-haiku-4-5` (per-item calls)
- Lazy-initialized client, JSON-fence stripping, exponential backoff retry

## Testing
- Vitest (jsdom environment, globals enabled)
- React Testing Library + jest-dom

## Code Quality
- ESLint (flat config)

## Deployment
- Vercel (web application) — Fluid Compute as the default runtime, vercel.json for project config (vercel.ts is a v1.1 nice-to-have)
- Supabase (Postgres) — pooled connection-string for both `DATABASE_URL` and `DIRECT_URL` (session-mode pooler, port 5432). v0.1 and v1-dev use separate Supabase projects per branch-freeze policy in `LAUNCH-PROGRESS.md`.
- Engines: `node >= 22` in `package.json`; Node 24 LTS is the Vercel default.

## Why this stack
Mirrors the proven ExpliqAI stack 1:1 — fast setup, strong TypeScript support, simple full-stack development, production-friendly defaults, low operational overhead. Single deployable web application, no microservices.

## v1.1 candidates (NOT in v1)

Tracked in `specs/brainstorming-launch.md` §"v1.1 tech-stack candidates" with detailed reasoning. Brief:

- **Vercel AI Gateway** as the LLM-call layer (replaces OpenRouter-via-OpenAI-SDK). Bundle with BYOK feature.
- **`vercel.ts`** TypeScript config (replaces `vercel.json`).
- **Vercel BotID** as the anti-bot layer (replaces or complements Cloudflare Turnstile in Epic 23).
- **Cache Components / `cacheTag` / `updateTag`** for fine-grained spec/findings caching (Next.js 16 native).
