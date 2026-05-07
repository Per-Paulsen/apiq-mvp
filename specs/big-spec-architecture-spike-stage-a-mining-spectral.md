# Round-1 Mining — Spectral-Universum (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 1)

- stoplightio/spectral-rulesets (curated index of 17 community rulesets, MIT)
- OWASP Spectral Ruleset (24 rules + 2 custom functions, OWASP API Top 10 2023)
- APIs You Won't Hate Style-Guide (Phil Sturgeon, 17 rules)
- Spectral URL-Versioning Ruleset (3 rules)
- Corporate style-guide rulesets: Adidas, Azure (`az-*`, ~50 rules), DigitalOcean (21 rules), Box, Red Hat (`rhoas-*`), VTEX, SmartBear (`sps-*`), Toolbox, Zalando, RHOAS
- npm-registry community packages

## Extraction-rationale

Round-1 mined the Spectral-ruleset universe (community + corporate) for generic, mechanically-detectable OpenAPI-rule patterns that mature linters catch. Goal: ensure apiq's Stage-A doesn't miss what reputable tools already find. Output classified four ways: Generic (take into apiq), Vendor-/Org-Specific (skip), Already-in-apiq-brainstorm (cross-ref), Unsure (orchestrator decides).

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (per-Lens tables, ~118 of ~125 surveyed Round-1 patterns adopted)
- **Round-3 cross-reference:** see "Round-3 Additions" section in master for additions that build on this round's patterns

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (no genuine Round-1-spectral orphans found; 94% adoption rate)

## Original-content-archive (history)

This file previously had 411 lines of content covering the full Spectral-Universum survey. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-spectral.md` for full provenance).
