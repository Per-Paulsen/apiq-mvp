# Tech Stack

> Upstream: [PRD](prd.md) | [CLAUDE.md](CLAUDE.md)

## Frontend
- Next.js 16 (App Router, Turbopack)
- React 19
- TypeScript 5
- Tailwind CSS v4 (CSS-first config in `globals.css`)
- shadcn/ui + base-ui + lucide-react

## Backend
- Next.js Route Handlers + Server Actions
- Node.js runtime

## Database
- PostgreSQL (Supabase-managed)
- Prisma 7 ORM (driver adapter `@prisma/adapter-pg`, generated client at `src/generated/prisma/client`)

## Authentication
- Auth.js v5 (next-auth) — Credentials provider, JWT sessions, bcrypt
- Edge-safe split: `src/lib/auth.config.ts` (route protection only) + `src/lib/auth.ts` (full)

## LLM
- OpenAI SDK against OpenRouter
- Default models: `anthropic/claude-sonnet-4` (heavy/aggregation calls), `anthropic/claude-haiku-4-5` (per-item calls)
- Lazy-initialized client, JSON-fence stripping, exponential backoff retry

## Testing
- Vitest (jsdom environment, globals enabled)
- React Testing Library + jest-dom

## Code Quality
- ESLint (flat config)

## Deployment
- Vercel (web application)
- Supabase (Postgres)

## Why this stack
Mirrors the proven ExpliqAI stack 1:1 — fast setup, strong TypeScript support, simple full-stack development, production-friendly defaults, low operational overhead. Single deployable web application, no microservices.
