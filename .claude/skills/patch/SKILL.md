---
name: patch
description: Plan and implement a focused patch through file-based brainstorming, then team-delegated implementation. Brainstorms in specs/patches/, implements, tests, verifies, and commits.
argument-hint: <epic-number> <slug> <brief-description>
---

# Patch: Brainstorm → Implement a Focused Change

## Inputs

- **Arguments** — parse `$ARGUMENTS` for:
  - `<epic-number>` — which epic's code is being patched (e.g., `04`, `06`)
  - `<slug>` — kebab-case identifier for this patch (e.g., `parallelize-llm`, `fix-loading-state`)
  - `<brief-description>` — remaining text describing what the patch should accomplish
- **Tech stack** — read `tech-stack.md`
- **Design system** — if the patch involves UI changes, read `specs/design-guidelines.md` if it exists — authoritative for ALL visual decisions
- **Prior epic results** — read all `specs/*-results.md` files. These contain decisions, established patterns, and risks.
- **Existing codebase** — explore to understand current patterns and the code being patched

## Setup

Parse the arguments to extract epic number, slug, and brief description.

Derive file paths:
- Brainstorming: `specs/patches/{slug}-brainstorming.md`
- Results: `specs/{epic}-results.md` (where `{epic}` matches the existing results file for that epic number, e.g., `specs/04-llm-pipeline-results.md`)

**Resume detection:** If the brainstorming file already exists, read it and resume Phase 1 — append a response to any new content the user has written since the last response. Do not recreate the file.

## Phase 1 — Brainstorming

You perform this phase directly — no team delegation.

Create the brainstorming file (if it does not exist) and conduct all discussion there.

### Initial analysis

Before writing questions, explore the codebase to understand:
- The code that will be changed
- Related tests
- Patterns and conventions in the affected area
- Potential side effects

### Expected results

- The brainstorming file is created with a heading: `# Patch: {brief-description} (Epic {epic-number}) — Brainstorming`
- An initial analysis section summarizes what Claude found in the codebase: the affected files, current behavior, and relevant patterns
- Questions are written to the file covering: scope boundaries, implementation approach options, test impact, risk of side effects, and anything unclear from the brief description
- Questions are grouped and focused — only ask what can't be inferred from the description, existing code, and results files
- Each group of questions ends with Claude's recommendation (agree, propose alternative, or flag concern)
- Proactively flag:
  - **Scope creep risk** — if the described change implies touching more code than it appears
  - **Test gaps** — if the affected code lacks test coverage that should be added
  - **Side effects** — if the change could affect other features or epics
  - **Alternative approaches** — if there's a simpler or safer way to achieve the same goal
- The user's answers are captured in the same file
- Follow-up questions are appended based on answers until the patch is well-defined

### Rules

- The brainstorming file is **append-only** — never overwrite, replace, or remove existing content. All subsequent writes are appended to the end of the file.
- All analysis and questions go into the file, never in chat
- Chat is only for telling the user that analysis is ready, or that the patch has been implemented
- After responding, tell the user in chat to continue writing in the brainstorming file or confirm they are satisfied and ready to implement
- Do not begin Phase 2 until the user explicitly confirms

## Phase 2 — Implementation

When the user confirms they are satisfied with the brainstorming, implement the patch.

### Team Lead Role

You are now the team lead. You **coordinate and delegate only** — you must not write any code, tests, or configuration yourself.

Your job:
- Synthesize the brainstorming conclusions into clear implementation tasks
- Break the work into tasks and delegate to team members using TeamCreate
- Monitor progress, unblock issues, and ensure quality
- Verify all checks pass before committing

### Expected Results

#### Implementation
- The described change is implemented per the brainstorming conclusions
- Code follows existing codebase patterns and conventions
- No placeholder or stub code
- Change is minimal and focused — do not refactor surrounding code

#### Tests
- If the patch changes logic with existing tests, ensure tests still pass
- If the patch adds new behavior, add tests for it
- Do not add tests for unchanged code

#### Verification

##### Automated checks
- `npm run test` — all tests pass
- `npm run lint` — no lint errors
- `npm run build` — no type errors

##### Real data pipeline + E2E verification

After automated checks pass, verify the full stack with real data. This is **mandatory for every patch** that changes runtime behavior — it catches data shape mismatches between LLM output and UI expectations.

**Pre-flight:**
- Kill port 3000 before starting: `npx kill-port 3000`
- **NEVER** kill all `node.exe` (`taskkill /IM node.exe /F`) — this kills the Playwright MCP server
- If the dev server fails to compile, clean the cache (`rm -rf .next`) and retry once

**Steps (single browser session):**
1. Start the dev server (`npm run dev`) in the background
2. Load Playwright tools via `ToolSearch` (query: `+playwright navigate`)
3. **Run the real pipeline:**
   a. Navigate to `http://localhost:3000/login`
   b. Log in as the configured test user (credentials defined by the test infrastructure epic — see prior results files)
   c. Upload or select a sample OpenAPI spec from `openapi-examples/`
   d. Trigger the analysis pipeline and wait for completion
4. **Verify UI with real data:**
   a. Navigate to the pages affected by the patch
   b. Confirm the UI renders correctly with real pipeline data
   c. Take screenshots for the results file
5. **Always close the browser when done** — call `mcp__plugin_playwright_playwright__browser_close`

**Cleanup (always):**
1. Close the browser: `mcp__plugin_playwright_playwright__browser_close`
2. Kill the dev server: `npx kill-port 3000`

#### Bug Fixing
- If tests fail → fix until they pass
- If verification surfaces issues → fix them
- Iterate until all checks are green

#### Commit
- When everything passes: stage all changes, commit with a descriptive message
- Message format: `fix: <description>` or `perf: <description>` (use the appropriate conventional commit prefix)
- Do NOT use `feat: implement epic` format — that's for full epic implementations

#### Results

After committing, perform two append operations:

**1. Brainstorming file — append implementation summary.**

Append a `## Implementation Applied` section to `specs/patches/{slug}-brainstorming.md`:

```markdown
---

## Implementation Applied (<today's date YYYY-MM-DD>)

**Commit:** `<hash>` — `<message>`

**Files modified:**
- `path/to/file.ts` — <what changed>

**Verification:**
| Check | Result |
|-------|--------|
| `npm run test` | Pass/Fail (N tests) |
| `npm run lint` | Pass/Fail |
| `npm run build` | Pass/Fail |
| Real data pipeline | Pass/Fail (sample spec processed end-to-end) |
| E2E verification | <method + result> |
```

**2. Epic results file — append patch section.**

Append a patch section to `specs/{epic}-results.md`. The results file is **append-only** — never overwrite or remove existing content.

```markdown
---

## Patch: <description> (<today's date YYYY-MM-DD>)

**What changed:** <brief summary of the change>

**Files modified:**
- `path/to/file.ts` — <what changed in this file>

**Why:** <motivation — why this patch was needed>

**Verification:**
| Check | Result |
|-------|--------|
| `npm run test` | Pass/Fail (N tests) |
| `npm run lint` | Pass/Fail |
| `npm run build` | Pass/Fail |
| Real data pipeline | Pass/Fail (sample spec processed end-to-end) |
| E2E verification | <method + result> |

**Commit:** `<hash>` — `<message>`
```

After writing both results sections, tell the user in chat that the patch is ready for review.

## Done Criteria

The patch is done when **all** of the following are true:

- [ ] Brainstorming completed and user confirmed satisfaction (Phase 1)
- [ ] The described change is implemented per brainstorming conclusions
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No outstanding code quality issues
- [ ] E2E verified (if the patch changes runtime behavior)
- [ ] Changes are committed
- [ ] Implementation summary appended to brainstorming file
- [ ] Results appended to the relevant epic's results file

## Constraints

- **Do not combine phases.** Complete brainstorming and get user confirmation before implementing.
- **Stay focused.** Only change what the patch describes. No bonus features, no refactoring beyond scope.
- **Do not modify specs.** Patches change code, not specifications.
- **Do not skip verification.** Every change must be self-verified before it is considered done.
- **Brainstorming file is append-only.** Never overwrite or remove existing content in the brainstorming file.
- **Results file is append-only.** Never overwrite or remove existing content in the results file.
