---
name: refine_all_ind
description: Batch within-epic refinement. Runs the same deep checks as /refine on every unrefined spec, applies fixes directly, and produces a single review file. Run this before /refine_all.
---

# Refine All Individual: Batch Within-Epic Spec Refinement

## Inputs

- **All specs** — discover by globbing `specs/[0-9][0-9]-*.md` (exclude `*-brainstorming.md`)
- **PRD** — read `prd.md`
- **Detailed decisions** — read `prd-decisions.md` if it exists, for screen specs, schema, and design system
- **Tech stack** — read `tech-stack.md`
- **Results from completed epics** — glob `specs/*-results.md`. These contain actual versions installed, deviations from specs, and risks flagged for future epics.

Do NOT read `specs/brainstorming.md` — its decisions are already incorporated into each spec.

### Skip logic

**Step 1 — Completed epic gate**: For each spec, derive the results file path (e.g., `specs/02-auth.md` → `specs/02-auth-results.md`). If the results file exists, **always skip this spec** — it is a completed epic and must never be re-refined. List it under "Specs skipped (completed epics)" in the summary.

**Step 2 — Refinement marker check** (only for specs that passed Step 1):

For each remaining spec, derive the brainstorming file path (e.g., `specs/04-llm-pipeline.md` → `specs/04-llm-pipeline-brainstorming.md`).

**Phase detection:** If any `specs/*-results.md` files exist, you are in **in-dev mode**. Otherwise, **pre-dev mode**.

- **Pre-dev mode**: skip specs whose brainstorming file contains `## Refinement Applied`
- **In-dev mode**: For each spec, check its brainstorming file for `## Implementation Refinement Applied`.
  - **Marker absent** → spec needs refinement.
  - **Marker present** → extract the filenames listed under `Results incorporated:` and compare against the current set of `specs/*-results.md` files. If every current results file appears in the list, skip the spec. If any current results file is missing from the list (or the marker has no `Results incorporated:` section at all), the spec is **stale** and needs re-refinement.

## Team-Assisted Investigation

You are the team lead. You read all inputs, determine which specs need review, and apply edits — but you **delegate codebase investigation to team members using TeamCreate**.

For each spec that needs review, create a team member whose job is to verify the spec's assumptions against the actual codebase. Team members should:
- Read the spec and the new results file(s) that triggered this review
- Trace every field reference, component prop contract, and data flow in the spec against current source code
- Check that component APIs match what the spec assumes (e.g., expected prop values, fallback behavior)
- Check that data layer functions provide the normalization/transformation the spec expects
- Report findings with file paths, line numbers, and code snippets

You may launch multiple team members in parallel (one per spec, or grouped logically). Once they report back, you synthesize findings and apply edits to specs, brainstorming files, and the review file yourself.

## Phase 1 — Review & Apply

For each unrefined spec **in numeric order**, perform a thorough within-epic review. These are the same checks that `/refine` performs:

### Within-epic checks

| Check | Description |
|-------|-------------|
| **Ungrounded assumptions** | ACs or scope items that assume something not established in the spec or its dependencies |
| **Hidden scope creep** | Work implied by the spec that isn't explicitly called out (e.g., an AC that requires building an unmentioned component) |
| **Oversized slices** | Scope sections or ACs that bundle too much to implement and verify in a single pass |
| **Missing or untestable acceptance criteria** | ACs that are vague, subjective, or impossible to verify without manual inspection |
| **Inconsistent domain language** | Terms used differently across the spec's own sections, or differently from the PRD or tech stack |

### Applying changes

For each spec:

1. **Structural fixes** — apply directly to the spec file. These include: specifying ambiguous types, adding missing ACs, clarifying vague scope, fixing inconsistent terminology, removing untestable criteria.
2. **Design decisions** — do NOT apply. Instead, add as an open question on the spec tagged `NEEDS CONFIRMATION`. Also collect these in the review file for Phase 2.
3. **Retain structure** — keep the original section order: Scope, Acceptance criteria, Out of scope, Domain terms, Open questions.
4. **Resolve open questions** — if the review provides a clear answer to an existing open question (structural, not a design choice), resolve it.

### After processing each spec

Write the phase-appropriate marker to the epic's brainstorming file. If the brainstorming file already contains a `## Implementation Refinement Applied` section, **replace it entirely** (from the heading through the end of the results list) with the updated marker. Do not append a second marker.

- **Pre-dev mode**:
```markdown
## Refinement Applied

Batch-refined via `/refine_all_ind`. See `specs/ind-epic-review.md` for details.
```

- **In-dev mode** (list all current `specs/*-results.md` filenames):
```markdown
## Implementation Refinement Applied

Batch-refined via `/refine_all_ind` (in-dev mode). See `specs/ind-epic-review.md` for details.

Results incorporated:
- {results-filename-1}
- {results-filename-2}
- ...
```

### Output

Append a new dated pass section to `specs/ind-epic-review.md` (create the file if it doesn't exist). Each run adds a new section — never overwrite previous passes. Use a horizontal rule (`---`) to separate passes:

```markdown
# Individual Epic Review — {date}

## Summary
- Specs reviewed: list
- Specs skipped (completed epics): list
- Specs skipped (already refined): list
- Specs modified: list
- Specs clean: list

## {epic number} — {epic name}

### Findings
- **{issue description}** ({check type})
  - **Change**: what was modified in the spec
  - Or: `NEEDS CONFIRMATION` — added as open question

(repeat for each finding)

### Changes applied
- Bullet list of actual edits made to the spec

(repeat per epic)
```

### Post Phase 1

In chat, give a concise summary: how many specs reviewed, how many modified, most significant findings.

- If there are **no** `NEEDS CONFIRMATION` items → skip Phase 2, recommend `/refine_all` next
- If there **are** `NEEDS CONFIRMATION` items → tell the user that questions are ready in `specs/ind-epic-review.md` and proceed to Phase 2

## Phase 2 — Brainstorming

Only runs if Phase 1 produced `NEEDS CONFIRMATION` items.

Conduct all brainstorming exclusively in `specs/ind-epic-review.md`.

### Expected results

- A `## Brainstorming` section is appended to `specs/ind-epic-review.md` with grouped, focused questions covering all `NEEDS CONFIRMATION` items
- Questions are grouped by epic, with enough context for the user to decide
- Follow-up questions are appended based on answers until all items are resolved

### Rules

- The file is **append-only** — never overwrite or remove existing content
- All questions go into the file, never in chat
- Chat is only for telling the user that questions are ready or that a phase is complete
- Finish brainstorming completely before moving to Phase 3

## Phase 3 — Apply Confirmations

For each resolved `NEEDS CONFIRMATION` item:

1. Apply the confirmed decision to the spec file (update scope, ACs, or remove the open question as appropriate)
2. Remove the `NEEDS CONFIRMATION` tag from the spec's open questions
3. Append a `## Confirmations Applied` section to `specs/ind-epic-review.md` listing what was resolved and how

In chat, give a concise summary and recommend running `/refine_all` next for cross-epic consistency.

## Constraints

- **Do not implement anything.** No code, no configuration, no project setup. Output is only markdown files.
- **Do not invent requirements.** Everything must trace back to a spec, the PRD, the tech stack, or explicit user confirmation.
- **Do not re-review already-refined content.** Use the phase-appropriate skip marker (see Skip logic section).
- **Judgment calls require confirmation.** If a fix involves a design decision (not just a structural correction), flag it as `NEEDS CONFIRMATION` and add it as an open question on the spec — do not apply it.
- **No cross-epic analysis.** This skill reviews each spec in isolation. Cross-epic consistency is the job of `/refine_all`.
