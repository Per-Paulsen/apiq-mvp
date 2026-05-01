---
name: refine
description: Refine an epic spec through file-based discussion. The user writes challenges and questions in the brainstorming file; Claude responds there. Updates the spec when refinement is complete.
argument-hint: <spec-file-path>
---

# Refine: Spec Refinement Through Discussion

## Inputs

- **Spec** — read the file at `$ARGUMENTS`
- **Discussion file** — derive the path by replacing `.md` with `-brainstorming.md` (e.g., `specs/01-project-setup.md` → `specs/01-project-setup-brainstorming.md`)
- **Results from completed epics** — glob `specs/*-results.md`. These contain implementation learnings, version deviations, and risks that may affect this spec.

Do NOT read `specs/brainstorming.md` — its decisions are already incorporated into each spec.

## Completed Epic Check

Before starting, derive the results file path from the spec path (e.g., `specs/04-llm-pipeline.md` → `specs/04-llm-pipeline-results.md`). If the results file exists, **stop immediately** — this epic is already built. Tell the user in chat that refinement is not applicable to completed epics and suggest they check the results file instead.

## Team-Assisted Investigation

You are the team lead. You read the spec, discussion file, and results files — but you **delegate codebase investigation to a team member using TeamCreate** before responding.

Create a team member whose job is to verify the spec's assumptions against the actual codebase. The team member should:
- Read the spec and any new results files
- Trace every field reference, component prop contract, and data flow in the spec against current source code
- Check that component APIs match what the spec assumes (e.g., expected prop values, fallback behavior)
- Check that data layer functions provide the normalization/transformation the spec expects
- Report findings with file paths, line numbers, and code snippets

Once the team member reports back, you synthesize findings and write responses to the discussion file yourself.

## Phase 1 — Review & Respond

Read the spec and the discussion file. Respond to everything the user has written in the discussion file.

### Expected results

- Every question, concern, or challenge the user wrote in the discussion file has a clear response appended below it
- Responses are grounded in the spec's existing scope and acceptance criteria — no invented requirements
- Each response ends with a concrete recommendation (agree, disagree with reasoning, or propose alternative)
- Beyond responding, the following issues are **proactively flagged** (appended as a new section if any are found):
  - **Ungrounded assumptions** — acceptance criteria or scope items that assume something not established in the spec or its dependencies
  - **Hidden scope creep** — work implied by the spec that isn't explicitly called out (e.g., an AC that requires building an unmentioned UI component)
  - **Oversized slices** — scope sections or ACs that bundle too much to implement and verify in a single pass
  - **Missing or untestable acceptance criteria** — ACs that are vague, subjective, or impossible to verify without manual inspection
  - **Inconsistent domain language** — terms used differently across the spec's own sections, or differently from other specs in `specs/`
- If no issues are found, this is stated explicitly so the user knows the spec was reviewed

### Rules

- The discussion file is **append-only** — never overwrite or remove existing content
- All responses go into the discussion file, never in chat
- Chat is only for telling the user that responses are ready, or that the spec has been updated
- After responding, tell the user to continue writing in the discussion file or confirm they are satisfied

## Phase 2 — Apply Refinements

When the user confirms they are satisfied with the discussion, update the spec.

### Expected results

- The spec file is updated to reflect all agreed refinements from the discussion
- Only agreed changes are applied — nothing the user rejected or left unresolved
- The spec retains its original section structure: Scope, Acceptance criteria, Out of scope, Domain terms, Open questions
- Resolved open questions are removed from the Open questions section
- New open questions surfaced during discussion are added
- A summary of what changed is appended to the discussion file under a `## Refinement Applied` heading

## Constraints

- **Do not implement anything.** No code, no configuration, no project setup. Output is only markdown files.
- **Do not invent requirements.** Everything must trace back to the spec, the discussion, or explicit user confirmation.
- **Do not combine phases.** Respond to all discussion items before applying any changes to the spec.
