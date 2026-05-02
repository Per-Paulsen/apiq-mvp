---
name: dev
description: Implement an epic spec using a self-organizing team. Handles code, tests, verification, and commit.
argument-hint: <spec-file-path>
---

# Dev: Spec to Implementation

## Inputs

- **Spec** — read the file at `$ARGUMENTS`
- **Tech stack** — read `tech-stack.md`
- **PRD** — read `prd.md`
- **Detailed decisions** — read `prd-decisions.md` if it exists, for screen specs, design system, schema, LLM architecture, navigation map
- **Data reference** — read `openapi-examples/README.md` for sample spec schemas when implementing data-layer code
- **Design system** — read `specs/design-guidelines.md` if it exists — authoritative for ALL visual decisions
- **All epic specs** — read all `specs/[0-9]*.md` files (excluding brainstorming files). Understand the full epic sequence so implementation decisions account for what future epics will need.
- **Prior epic results** — read all `specs/*-results.md` files. These contain decisions, deviations from spec, established patterns, and risks flagged by completed epics. Understand these before breaking down work — they document conventions and gotchas that the current spec may not account for.
- **Existing codebase** — explore to understand current patterns and conventions

## Team Lead Role

You are the team lead. You **coordinate and delegate only** — you must not write any code, tests, or configuration yourself.

Your job:
- Read and understand the spec, tech stack, and existing codebase
- Break the work into tasks and delegate to team members using TeamCreate
- Monitor progress, unblock issues, and ensure quality
- Verify all done criteria are met before committing

### Parallelization Rule

**Never bottleneck implementation through a single agent.** Spawn multiple teammates working in parallel — one agent per work stream. Max 2 sequential tasks per agent.

When tasks have a dependency chain (A → B → C), spawn separate agents that can start reading inputs and scaffolding while waiting for blockers to clear. For example, if a view component depends on a data layer, the view agent can read existing patterns, set up the file structure, and define prop types while the data layer agent builds the real implementation.

Typical split for a UI epic:
- **Agent 1**: Shared utilities / data layer
- **Agent 2**: View component(s) — starts reading patterns, scaffolds with type stubs while waiting for data layer types
- **Agent 3**: Tests — starts writing test structure and mocks in parallel
- **Agent 4**: Page component + error boundary (quick, runs after view is ready)

## Expected Results

### Implementation
- All scope items from the spec are implemented and functional
- Code follows existing codebase patterns and conventions
- No placeholder or stub code

### Tests
- Unit tests written for all significant logic (Vitest)
- All tests pass
- Edge cases from the spec's acceptance criteria are covered

### Verification

#### Automated checks
- `npm run test` — all tests pass
- `npm run lint` — no lint errors
- `npm run build` — no type errors

#### Real data pipeline + E2E verification

After automated checks pass, verify the full stack with real data. This is **mandatory for every epic** — it catches data shape mismatches between LLM output and UI expectations.

Choose the verification method based on what the epic builds:

**A) Epic has UI changes** (new pages, modified components, visual output):
Use Playwright for browser verification with a real spec processed end-to-end through the analysis pipeline.

**B) Epic is backend-only** (services, utilities, data logic, no UI):
Write a permanent verification script that tests the logic against a real sample spec and database data.

Both methods may be combined when appropriate.

##### Playwright browser verification (with real pipeline)

**Pre-flight:**
- Kill port 3000 before starting: `npx kill-port 3000`
- **NEVER** kill all `node.exe` (`taskkill /IM node.exe /F`) — this kills the Playwright MCP server
- If the dev server fails to compile (Turbopack panic, CSS errors), clean the cache (`rm -rf .next`) and retry once

**Steps (single browser session):**
1. Start the dev server (`npm run dev`) in the background
2. Load Playwright tools via `ToolSearch` (query: `+playwright navigate`)
3. **Run the real pipeline:**
   a. Navigate to `http://localhost:3000/login`
   b. Log in as the configured test user (credentials defined by the test infrastructure epic — see prior results files)
   c. Upload or select a sample OpenAPI spec from `openapi-examples/`
   d. Trigger the analysis pipeline and wait for completion
4. **Verify UI with real data:**
   a. Navigate to the pages affected by the epic
   b. Confirm the UI renders correctly with real pipeline data and matches spec requirements
   c. Take screenshots for the results file
5. **Always close the browser when done** — call `mcp__plugin_playwright_playwright__browser_close` after all browser checks complete (whether pass or fail)

**Cleanup (always, whether verification passed or failed):**
1. Close the browser: `mcp__plugin_playwright_playwright__browser_close`
2. Kill the dev server: `npx kill-port 3000`

##### Verification scripts

For backend-only epics or when Playwright is unavailable, write a verification script.

**Convention:**
- File: `scripts/verify-{epic-name}.ts` (e.g., `scripts/verify-spec-analyzer.ts`)
- Run with: `npx tsx scripts/verify-{epic-name}.ts`
- Scripts are **permanent** — committed with the epic, kept for regression testing
- Scripts connect to the real database via `dotenv/config` + standalone `PrismaClient`
- Scripts import project code using `@/` aliases (tsx resolves them from `tsconfig.json`)
- Scripts should print clear output showing what was tested and whether it passed

#### Acceptance criteria
- Every acceptance criterion from the spec is verified and passing

### Clean Code
- Server-side auth checks where required
- Input validation at system boundaries
- Consistent error handling
- Separation of concerns (data fetching, business logic, presentation)
- No hardcoded secrets, unused imports, dead code, or leftover console.logs

### Production Reliability Baseline
Every implementation must include these as standard practice (no spec entry required):
- **Loading states**: Server components that fetch data should use Suspense boundaries with skeleton/spinner fallbacks
- **Server action error handling**: Every server action must try/catch and return structured errors to the client — never let exceptions bubble as unhandled 500s
- **Error display**: Forms and actions that can fail must show user-facing error messages (not silent failures)
- **Route error boundaries**: Add `error.tsx` to new route segments to catch render-time failures gracefully
- **Null safety**: Defensive checks on data from external sources (uploaded specs, OpenRouter) beyond what the spec explicitly lists

### Bug Fixing
- If tests fail → fix until they pass
- If browser verification fails → fix until it succeeds
- If code review surfaces issues → fix them
- Iterate until all checks are green

### Commit
- When everything passes: stage all changes, commit with a descriptive message
- Message format: `feat: implement epic {number} — {name}`

### Retrospective & Results

After committing, conduct a structured retrospective before writing the results file.

**Step 1 — Self-review.** Evaluate the implementation against these categories:
- **Version/dependency surprises** — what was expected vs what was actually installed or used
- **Deviations from spec** — anything implemented differently than specified, and why
- **Risks for future epics** — compatibility concerns, spec freshness issues, or assumptions in upcoming specs that may no longer hold given what was built
- **Patterns established** — conventions or approaches introduced that future epics should follow
- **Open questions** — unresolved items, known limitations, or things that need revisiting. **For each open question, draft a recommendation** (1–2 sentences with the trade-off you'd flag if the user asked "what should we do?"). Recommendations go inline with each question in the results file — saves a round-trip.

**Step 2 — Write draft results file** at `specs/{epic-number}-{epic-name}-results.md` containing:
- What was built
- Key files created/modified
- Decisions and deviations from spec
- Verification results
- Risks for future epics
- Open questions, **each immediately followed by a `**Recommendation:**` line** with the proposed answer + reasoning. Format:
  ```
  N. **Question text.** Full context...
     **Recommendation:** 1–2 sentence answer with the trade-off / reasoning. The user can override; the goal is to short-circuit the obvious cases.
  ```

**Step 3 — User review.** Tell the user the results file is ready for review. The user may add observations, corrections, or additional risks. Wait for the user to confirm before marking the epic as done.

**The results file is append-only after the initial draft.** Once Step 2 writes the draft, never overwrite or remove existing content — including user additions. If corrections are needed (e.g., fixing inaccurate data), append a clearly labeled correction section rather than editing the original text.

## Done Criteria

The epic is done when **all** of the following are true:

- [ ] Every acceptance criterion from the spec is implemented and verified
- [ ] All unit tests pass
- [ ] Build succeeds
- [ ] Browser verification passes (or verification script passes for backend-only epics)
- [ ] No outstanding code quality issues
- [ ] Changes are committed
- [ ] Results file written and reviewed by user

## Constraints

- **Do not modify specs.** If the spec is unclear, ask — do not interpret ambiguously.
- **Do not go beyond the spec.** Only build what the spec defines. No bonus features.
- **Do not skip verification.** Every change must be self-verified before it is considered done.
