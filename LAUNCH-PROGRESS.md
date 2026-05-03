# Launch Progress — apiq v1

> Live checklist of v1-launch epic implementation. Edit checkboxes as epics ship.
> Source-of-truth for the conditional-spike-trigger workflow (Epics 10–13).

## Epics

### Spike track

- [ ] **Epic 09** — Big-Spec Architecture Spike (S0) · _unconditional_
  - **After ship:** read `specs/09-big-spec-architecture-spike-results.md` last section. It contains a copy-pastable trigger.
  - **Decision-tree:**
    - S1 starten → run `/spec_ind 10 capability-gap-spike "Phase-1 spike per prd-launch.md §4 — capability-gap-generation against 3 reference specs, ≥50% relevance pass-criteria"`
    - S1 abbrechen → defer to v1.1; mark Epic 10–13 below as `[skip]`
    - S1 vertagen v1.1 → same as abbrechen
- [ ] **Epic 10** — Capability-Gap-Generation Spike (S1) · _conditional on Epic 09_
  - Spec-file does not exist yet — created via `/spec_ind 10 ...`
  - **After ship:** decision-tree mirrors above. Triggers `/spec_ind 11 business-improvements-spike "..."` or skip.
- [ ] **Epic 11** — Business-Improvements Spike (S2) · _conditional on Epic 10_
  - **After ship:** triggers `/spec_ind 12 implementation-hints-spike "..."` or skip.
- [ ] **Epic 12** — Implementation-Hints Spike (S3) · _conditional on Epic 11_
  - **After ship:** S3-Implementation is v1.2 territory per PRD §5; no further trigger in v1.
- [ ] **Epic 13** — Capability-Gap-Generation Implementation · _conditional on Epic 10 success_
  - Triggered IN PARALLEL with Epic 11/12 (or after Epic 12), not after Epic 12: `/spec_ind 13 capability-gap-implementation "Implement spike-validated prompt + UI per specs/10-results.md"`
  - **Marketing dependency:** Epic 27 copy must NOT mention capability-gap-hero until this epic ships.

### Engineering track (always-run)

- [ ] Epic 14 — Pre-Launch Spec-Fixes & Export-Hardening
- [ ] Epic 15 — Spec Import — Paste & Drag-Drop
- [ ] Epic 16 — Apply-All Buttons (Critical + Confirm)
- [ ] Epic 17 — UI Redesign (vor Live Preview, per Q2 = A)
- [ ] Epic 18 — Live Preview — Stoplight + Prism
- [ ] Epic 19 — Anonymous Demo + Public Share
- [ ] Epic 20 — MCP Server
- [ ] Epic 21 — CLI
- [ ] Epic 22 — Score Badges + Markdown Findings Export
- [ ] Epic 23 — Auth Hardening
- [ ] Epic 24 — Security Hardening
- [ ] Epic 25 — GDPR, Privacy & Legal
- [ ] Epic 26 — Operational Hygiene
- [ ] Epic 27 — Marketing Surfaces
- [ ] Epic 28 — Production Setup & Smoke-Test → **LAUNCH**

### Out-of-band parallel work

- [ ] **Naming Workshop** — runs in parallel during Week 1–2 (per PRD §9). Not an engineering epic. If rebrand: `/patch <n> rename "apiq → newname"` post-Workshop. If no name found: `apiqual.dev` interim, defer rebrand to post-launch.

## Trigger-cheat-sheet

| Just shipped | Read | If "starten" | If "abbrechen / vertagen" |
|---|---|---|---|
| Epic 09 | `09-...-results.md` last block | `/spec_ind 10 capability-gap-spike "..."` | mark 10–13 `[skip]`, jump to Epic 14 |
| Epic 10 | `10-...-results.md` last block | `/spec_ind 11 business-improvements-spike "..."` AND in parallel `/spec_ind 13 capability-gap-implementation "..."` | mark 11/12/13 `[skip]`, jump to Epic 14 |
| Epic 11 | `11-...-results.md` last block | `/spec_ind 12 implementation-hints-spike "..."` | mark 12 `[skip]`, continue Engineering |
| Epic 12 | `12-...-results.md` last block | nothing — S3-Implementation is v1.2 | continue Engineering |
| Epic 13 | `13-...-results.md` | none — patch Epic 27 marketing-copy to surface capability-gap-hero | n/a |

## Notes

- Skipping any conditional epic is safe — those features defer to v1.1+ and v1 still ships launch-ready.
- After every `/dev` run on Epic 09–13, **read the last section of the corresponding `*-results.md` immediately**. It's structured to give you a copy-pastable next-command.
- Engineering-track epics (14–28) have no dependency on the spike-track outcome (except Epic 27 marketing-copy ↔ Epic 13 dependency noted above).
- Reference: `specs/brainstorming-launch.md` §"Conditional Epic Trigger Workflow" for full mechanism.
