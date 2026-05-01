---
name: spec
description: Derive technical specs from a PRD through file-based brainstorming. All questions and answers live in specs/brainstorming.md. Produces structured epic specifications.
argument-hint: <prd-file-path>
---

# Spec: PRD → Brainstorming → Epic Specifications

## Inputs

- **PRD** — read the file at `$ARGUMENTS`
- **Tech stack** — read `tech-stack.md` if it exists
- **Detailed decisions** — read `prd-decisions.md` if it exists, for screen specs, design system, schema, LLM architecture
- **Data reference** — read `openapi-examples/README.md` for available sample specs and reference data structures
- **Reference materials** — read any screenshots, prototypes, design files, or wireframes the user provides

## Phase 1 — Brainstorming

Conduct all brainstorming exclusively in `specs/brainstorming.md`.

### Expected results

- `specs/brainstorming.md` contains grouped, focused questions covering gaps in: features, logic, user behavior, edge cases, data model, auth requirements, third-party integrations, and MVP scope boundaries
- Questions are **only** about things that are essential and not already answered by the PRD, tech stack, or reference materials — skip anything that can be inferred
- Related questions are grouped together, not asked one at a time
- The user's answers are captured in the same file
- Follow-up questions are appended based on answers until brainstorming is naturally complete

### Rules

- The file is **append-only** — never overwrite or remove existing content
- All questions go into the file, never in chat
- Chat is only for telling the user that questions are ready or that a phase is complete
- Finish brainstorming completely before moving to Phase 2

## Phase 2 — Epic Derivation

Derive epics from the PRD and brainstorming answers.

### Expected results

For each epic, produce a pair of files:

| File | Purpose |
|------|---------|
| `specs/{nr}-{name}.md` | The spec |
| `specs/{nr}-{name}-brainstorming.md` | For future per-epic discussion |

Epics are numbered sequentially (`01`, `02`, `03`, …) with kebab-case names (e.g., `01-project-setup`).

Each spec contains exactly these sections:

| Section | Content |
|---------|---------|
| **Scope** | What this epic covers. Clear boundary of what will be built. |
| **Acceptance criteria** | Testable conditions that define "done." Concrete, verifiable statements. |
| **Out of scope** | What this epic explicitly does NOT cover. |
| **Domain terms** | Glossary of terms that need shared understanding. |
| **Open questions** | Unresolved items needing decision before or during implementation. |

Per-epic brainstorming files are created empty alongside each spec for future discussion. Append-only when used.

## Constraints

- **Do not implement anything.** No code, no configuration, no project setup. Output is only markdown files.
- **Do not invent requirements.** Everything must trace back to the PRD, reference materials, or explicit user answers.
- **Do not combine phases.** Brainstorming must be complete before epic derivation begins.
