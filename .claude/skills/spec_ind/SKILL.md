---
name: spec_ind
description: Create a single new epic spec through file-based brainstorming. Takes a brief description, brainstorms in the epic's own brainstorming file, and produces a structured spec.
argument-hint: <epic-number> <short-name> <brief-description>
---

# Spec Individual: Create a Single Epic Specification

## Inputs

- **Arguments** — `$ARGUMENTS` provides: epic number, short kebab-case name, and a brief description of what the epic should accomplish (e.g., `05.5 test-infrastructure Set up a persistent test account with seeded data for e2e testing`)
- **PRD** — read `prd.md`
- **Detailed decisions** — read `prd-decisions.md` if it exists, for screen specs, design system, schema, LLM architecture
- **Data reference** — read `openapi-examples/README.md` for available sample specs and reference data structures
- **Tech stack** — read `tech-stack.md`
- **Existing specs** — glob `specs/[0-9][0-9]-*.md` and `specs/[0-9][0-9].[0-9]-*.md` (exclude `*-brainstorming.md`) to understand what's already defined
- **Results from completed epics** — glob `specs/*-results.md` to understand what's actually built

Do NOT read `specs/brainstorming.md` — its decisions are already incorporated into each spec.

## Setup

Parse the arguments to extract:
- **Epic number** (e.g., `05.5`, `10`)
- **Short name** (kebab-case, e.g., `test-infrastructure`)
- **Brief description** (remaining text)

Derive file paths:
- Spec: `specs/{number}-{name}.md` (e.g., `specs/05.5-test-infrastructure.md`)
- Brainstorming: `specs/{number}-{name}-brainstorming.md`

If the spec file already exists, stop and tell the user. If only the brainstorming file exists (from a previous interrupted run), resume Phase 1.

## Phase 1 — Brainstorming

Create the brainstorming file and conduct all discussion there.

### Expected results

- The brainstorming file is created with a heading: `# {number} — {title} — Brainstorming`
- Initial questions are written to the file, covering: scope boundaries, dependencies on existing epics, acceptance criteria candidates, data/schema needs, edge cases, and anything unclear from the brief description
- Questions are grouped and focused — only ask what can't be inferred from the description, existing specs, and results files
- The user's answers are captured in the same file
- Follow-up questions are appended based on answers until brainstorming is naturally complete

### Rules

- The brainstorming file is **append-only** — never overwrite or remove existing content
- All questions go into the file, never in chat
- Chat is only for telling the user that questions are ready or that a phase is complete
- Read existing specs and results to avoid asking questions already answered elsewhere
- Finish brainstorming completely before moving to Phase 2

## Phase 2 — Spec Writing

Produce the spec file from the brainstorming answers.

### Expected results

The spec file `specs/{number}-{name}.md` contains exactly these sections:

| Section | Content |
|---------|---------|
| **Scope** | What this epic covers, including dependencies on prior epics. Clear boundary of what will be built. |
| **Acceptance criteria** | Testable conditions that define "done." Concrete, verifiable statements. |
| **Out of scope** | What this epic explicitly does NOT cover. |
| **Domain terms** | Glossary of terms that need shared understanding. |
| **Open questions** | Unresolved items needing decision before or during implementation. |

### Rules

- Follow the same structure and style as existing specs in the `specs/` directory
- Dependencies must reference specific epics by number and name
- Acceptance criteria must be testable — no vague or subjective conditions
- The spec must be self-contained: someone reading only this file (plus its dependencies) should understand what to build

After writing the spec, tell the user it's ready and recommend running `/refine` on it, then `/refine_all` for cross-epic consistency.

## Constraints

- **Do not implement anything.** No code, no configuration, no project setup. Output is only markdown files.
- **Do not invent requirements.** Everything must trace back to the user's description, brainstorming answers, existing specs, or the PRD.
- **Do not combine phases.** Brainstorming must be complete before spec writing begins.
- **Do not modify existing specs.** This skill only creates new files. Cross-epic adjustments are the job of `/refine_all`.
