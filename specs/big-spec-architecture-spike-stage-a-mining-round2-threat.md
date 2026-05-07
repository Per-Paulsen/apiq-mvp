# Round-2 Phase A Mining — Threat-Modeling Lens 1 (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 2 Phase A)

- OWASP API Security Top 10 (2023) — all 10 categories systematically (BOLA/BFLA/Excessive-Data-Exposure/Lack-of-Resources/Mass-Assignment/Security-Misconfig/Injection/Improper-Inventory/Improper-Asset-Management/Unsafe-API-Consumption)
- OWASP REST Security + Authentication + JWT + CORS + HTTP-Headers cheat-sheets
- 42Crunch's 300+ audit checks (Spectral-ruleset is small subset)
- PII-detection patterns (truffleHog, Gitleaks, Cloudflare-OpenAPI-redaction)
- GitHub + Stripe webhook signature-header conventions
- OAuth2.1 / RFC 9700 PKCE-mandate (post-2024 standard)
- IETF webhook-signature-draft / Webhook-Signature header

## Extraction-rationale

Round-2 Phase A went beyond Round-1's OWASP-Spectral-ruleset (24 rules → Y-1..Y-25) to systematically cover all 10 OWASP-API-Top-10 categories + cheat-sheets + 42Crunch + PII-tooling. Scope-guardrail: apiq Stage-A spec-agnostic, deterministic. Threat-classes requiring runtime observation are LLM-territory or undetectable. 54 TM-A1..TM-A54 patterns + 25 Y-confirmations + 14 S-A* + 18 U-A1..U-A18 surfaced.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Lens 1 + Cross-Lens tables, 53 of 54 TM-A* patterns adopted; TM-A40 + TM-A54 borderline — author's recommendation was move-to-LLM, master should reflect)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (TM-A40 + TM-A54 = decision-not-reflected; U-A8 = source-citation-gap covered by L6-4; 98% adoption rate)

## Original-content-archive (history)

This file previously had 323 lines of content covering systematic OWASP-API-Top-10 + cheat-sheet + 42Crunch + PII-tool pattern extraction. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-round2-threat.md` for full provenance).
