# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Status:** Phase A — repo skeleton with skills and tech stack only. PRD pending. No code yet.
> Architecture details below will be filled in as epics complete.

## Commands

```bash
# To be filled in by Epic 01 (project setup)
# Anticipated:
# npm run dev          # Start dev server (Turbopack)
# npm run build        # Production build
# npm run lint         # ESLint (flat config)
# npm run test         # Vitest (single run)
# npm run test:watch   # Vitest (watch mode)
# npx prisma migrate dev --name <name>  # Run database migration
# npx prisma generate  # Regenerate Prisma client
```

## Intended Architecture

See [`tech-stack.md`](tech-stack.md) for the full stack.

High-level intent (mirrors ExpliqAI conventions):

- **Next.js App Router** with `src/` directory and route groups: `(app)` for protected pages, `(auth)` for login/signup, `(public)` for marketing.
- **Auth.js v5** with split Edge-safe + full configs.
- **Prisma 7** + Supabase Postgres, generated client at `src/generated/prisma/client`, singleton at `src/lib/prisma.ts`.
- **OpenRouter** via OpenAI SDK, lazy-initialized client, model via `OPENROUTER_MODEL` env.
- **Server Actions**: `"use server"`, `getRequiredSession()` first, return `{success}|{error}`, never throw to client.
- **LLM prompts** (v8 architecture): simple prompts + full data, no rubrics, output schema IS the instruction.
- **Workspace-scoped multi-tenancy** — every app model has `workspaceId`.

## Specs & Workflow

**PRD:** [`prd.md`](prd.md) — to be drafted in Phase B.

**Skills** (in `.claude/skills/`):
- `/spec <prd-file>` — derive epics from PRD (brainstorming → epic specs)
- `/spec_ind <number> <name> <description>` — create a single new epic spec
- `/refine <spec-file>` — refine a single epic spec via discussion file
- `/refine_all_ind` — batch within-epic refinement
- `/refine_all` — cross-epic refinement
- `/dev <spec-file>` — implement an epic via team-delegated build
- `/patch <epic-number> <slug> <description>` — focused change to existing implementation

**Reference data:** [`openapi-examples/`](openapi-examples/) — OpenAPI sample specs for development and verification (placeholder until Epic 01).

## Key Conventions (intended)

- **Dynamic route params are async** (Next.js 15+): `{ params }: { params: Promise<{ id: string }> }` — must `await params`
- **shadcn/ui sidebar** uses `render` prop pattern (not `asChild`), `SidebarProvider` in `(app)/layout.tsx`
- **Tailwind v4**: CSS-first config via `src/app/globals.css`, not `tailwind.config.ts`
- **Path alias**: `@/*` maps to `src/*`
- **Prisma 7**: Datasource in `prisma.config.ts` with `dotenv`. Import from `@/generated/prisma/client`. Always use singleton from `@/lib/prisma`.
- **Auth in server components**: Use `getRequiredSession()` from `@/lib/session`
- **New protected pages** go in `src/app/(app)/`, auth pages in `src/app/(auth)/`
- **Vitest**: jsdom environment, globals enabled
- **OpenRouter**: Lazy-init client (not module scope). JSON fence stripping on all responses.
- **Json fields**: Write with `as Prisma.InputJsonValue`, read with type narrowing

## Workflow Rules

- **Do not modify spec files.** If unclear, ask.
- **Do not go beyond the spec.** Only build what the spec defines.
- **All discussions happen in markdown files**, not chat. Chat is for status updates only.
- **Brainstorming and results files are append-only** — never overwrite or remove existing content.
- **Commit format**: `feat: implement epic {number} — {name}` (epics) or `fix:`/`perf:`/etc. (patches).
