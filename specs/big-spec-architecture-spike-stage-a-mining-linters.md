# Round-1 Mining — Konkurrenz-Linter-Coverage (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 1)

- Vacuum (daveshanley/vacuum, MIT, 90+ built-in rules + OWASP-Set)
- Redocly CLI (Redocly/redocly-cli, MIT, 60+ rule-Dateien)
- IBM openapi-validator (`@ibm-cloud/openapi-ruleset`, Apache-2.0, 78 IBM-rules + spectral:oas-Subset)
- Zalando Zally (zalando/zally, MIT, RESTful-Guidelines-Enforcement)
- Stoplight Spectral (stoplightio/spectral, Apache-2.0, reference-engine baseline)
- PayPal openapilint (paypal/openapilint, Apache-2.0, OAS-2-only legacy reference)
- wework speccy (deprecated/archived 2019 — ruleset largely absorbed by Spectral)
- swagger-cli (npm) — schema-validation only, no style-rules
- openapi-format (thim81/openapi-format, MIT — sortier-/casing-tool, not classical linter)

## Extraction-rationale

Round-1 reality-check: which patterns do mature OpenAPI-Linter (Vacuum, Redocly, IBM, Zally) catch that the apiq-Brainstorm-list might be missing? Reputation-load-bearing — apiq must not find less than Vacuum/Redocly. Source-of-truth via `gh api`-Raw on the linter repos directly. 50 MIN-1..50 patterns extracted as raw rule-IDs + 30 brainstorm-confirmations + 20 SKIP + 20 UNS-1..20.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (per-Lens tables, 47 of 50 MIN-* patterns adopted via apiq-Kategorie-prefix-Übersetzung — e.g. MIN-46 → M-MIN-1, MIN-50 → O2, MIN-9 → A-MIN-7)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (3 borderline orphans: MIN-9 [verified non-orphan via re-mapping], MIN-23 [covered by T-SP-10], MIN-24 [covered by T-SP-10]; 94% adoption rate)

## Original-content-archive (history)

This file previously had 549 lines of content covering tool-by-tool linter coverage analysis. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-linters.md` for full provenance).
