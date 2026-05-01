---
name: refine_all
description: Cross-epic refinement pass. Reviews all specs together, flags cross-epic inconsistencies and backward dependency issues, writes findings to each epic's brainstorming file.
---

# Refine All: Cross-Epic Spec Refinement

## Inputs

- **All specs** — discover by globbing `specs/[0-9][0-9]-*.md` (exclude `*-brainstorming.md`)
- **PRD** — read `prd.md`
- **Detailed decisions** — read `prd-decisions.md` if it exists, for screen specs, schema, and cross-epic context
- **Tech stack** — read `tech-stack.md`
- **Results from completed epics** — glob `specs/*-results.md`. These contain actual versions installed, deviations from specs, and risks flagged for future epics.

Do NOT read `specs/brainstorming.md` — its decisions are already incorporated into each spec.

## Completed Epic Handling

Specs with a corresponding results file (e.g., `specs/02-auth.md` → `specs/02-auth-results.md`) are **completed epics**. They are **read-only**: read them to understand data flow, schema, and dependencies, but do NOT flag issues in them, modify their spec files, or add open questions to them. Only unbuilt specs (no results file) can be modified. If a cross-epic issue involves a completed epic, note the issue on the **unbuilt** spec that depends on it — the unbuilt spec is the one that must adapt to reality.

## Team-Assisted Investigation

You are the team lead. You read all inputs and build the cross-epic mental model — but you **delegate codebase investigation to team members using TeamCreate**.

After identifying potential cross-epic issues, create team members to verify assumptions against the actual codebase. Team members should:
- Trace data flow chains end-to-end (producer → consumer) through actual source code
- Verify schema references match current `prisma/schema.prisma`
- Check that component APIs and data layer functions match what specs assume
- Verify patterns established in completed epics are consistent with what unbuilt specs expect
- Report findings with file paths, line numbers, and code snippets

You may launch multiple team members in parallel (e.g., one per data flow chain or one per group of related specs). Once they report back, you synthesize findings and apply edits yourself.

## Phase 1 — Cross-Epic Analysis & Apply

Read every spec in order. Build a mental model of:

1. **Data flow** — which epic produces each piece of data, which epics consume it
2. **Schema dependencies** — fields, types, and enums that are referenced across epics
3. **Assumption chains** — where one epic assumes something that another epic defines (or fails to define)

Then perform these checks across ALL specs:

### Cross-epic checks

| Check | Description |
|-------|-------------|
| **Forward dependency gaps** | Epic N references something that no earlier epic establishes |
| **Backward impact** | A decision in epic N invalidates or changes requirements in an earlier epic |
| **Schema drift** | Field names, types, or enums used inconsistently across specs |
| **Duplicated scope** | Work that appears in multiple epics without clear ownership |
| **Missing handoff** | Epic N's output doesn't match what epic N+1 expects as input |
| **Acceptance criteria gaps** | ACs that can't be verified because a dependency isn't met yet |
| **Implementation drift** | Spec assumes patterns, versions, or APIs that differ from what was actually built in completed epics (per results files) |

### Within-epic checks (same as `/refine`)

- Ungrounded assumptions
- Hidden scope creep
- Oversized slices
- Missing or untestable acceptance criteria
- Inconsistent domain language

### Applying changes

1. Determine the **change order** — if epic 01 and epic 04 both need changes, and epic 04's changes affect epic 01, apply epic 01 changes first
2. **Structural fixes** — apply directly to spec files. Retain the original section structure (Scope, Acceptance criteria, Out of scope, Domain terms, Open questions).
3. **Design decisions** — do NOT apply. Instead, add as an open question on the spec tagged `NEEDS CONFIRMATION`. Also collect these in the review file for Phase 2.
4. Remove resolved open questions; add new ones surfaced during review.

### Cascade handling

If a fix to epic N requires a change to epic M (where M < N):

- Apply the change to epic M as well
- Document the cascade in the review report

### Output

Append a new dated pass section to `specs/cross-epic-review.md` (create the file if it doesn't exist). Each run adds a new section — never overwrite previous passes. Use a horizontal rule (`---`) to separate passes:

```markdown
# Cross-Epic Review — {date}

## Summary
- Total specs reviewed: N
- Specs modified: list
- Specs clean: list

## Changes by Epic

### {epic number} — {epic name}
- **Issue**: description (check type tag)
  - **Involved epics**: which others are affected
  - **Change**: what was modified in the spec
  - **Cascade**: if this caused changes elsewhere, note them
  - Or: `NEEDS CONFIRMATION` — added as open question

(repeat for each issue)

### {next epic}
...

## Cascading Changes
List any chains where a fix in one epic triggered fixes in others.
```

### Post Phase 1

In chat, give a concise summary: how many specs reviewed, how many modified, most significant findings.

- If there are **no** `NEEDS CONFIRMATION` items → skip Phase 2, tell the user the specs are ready for implementation
- If there **are** `NEEDS CONFIRMATION` items → tell the user that questions are ready in `specs/cross-epic-review.md` and proceed to Phase 2

## Phase 2 — Brainstorming

Only runs if Phase 1 produced `NEEDS CONFIRMATION` items.

Conduct all brainstorming exclusively in `specs/cross-epic-review.md`.

### Expected results

- A `## Brainstorming` section is appended to `specs/cross-epic-review.md` with grouped, focused questions covering all `NEEDS CONFIRMATION` items
- Questions are grouped by epic, with enough context for the user to decide
- The user's answers are captured in the same file
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
3. Append a `## Confirmations Applied` section to `specs/cross-epic-review.md` listing what was resolved and how

In chat, give a concise summary. The specs are now ready for implementation.

## Constraints

- **Do not implement anything.** No code, no configuration, no project setup. Output is only markdown files.
- **Do not invent requirements.** Everything must trace back to a spec, the PRD, or explicit user confirmation.
- **Do not re-review already-refined content.** If a brainstorming file has a `## Refinement Applied` section, those changes are settled — only review the current state of the spec.
- **Judgment calls require confirmation.** If a fix involves a design decision (not just a structural correction), flag it as `NEEDS CONFIRMATION` and add it as an open question on the spec — do not apply it.
