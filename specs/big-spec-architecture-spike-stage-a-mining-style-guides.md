# Round-1 Mining — Industry-Style-Guides (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 1)

- Zalando RESTful API Guidelines (~190 rules, RFC-2119-tagged, Active)
- Microsoft Azure REST API Guidelines (URL/JSON/HTTP/LRO conventions)
- Google API Design Guide / AIPs (resource naming, methods, fields, pagination)
- JSON:API spec v1.1 (envelope, errors, pagination)
- Heroku Platform API Reference (header-versioning, Range pagination, errors)
- APIs You Won't Hate (book + Spectral ruleset, 18 rules)
- PayPal API Style Guide (archived but cited)
- RFC 7807 / RFC 9457 (Problem Details for HTTP APIs)
- RFC 8288 (Web Linking, `Link` header rel-types)
- RFC 7231 / 7232 (HTTP semantics, conditional requests)
- Atlassian REST design (skipped — overlap with Microsoft+Zalando)

## Extraction-rationale

Round-1 surveyed industry style-guides for generic, mechanically-detectable patterns applicable to any OpenAPI spec. Scope-discipline: Stage-A only takes mech-detectable patterns; design-recommendations needing runtime/LLM go to Phase B or are dropped. Surfaced 50 SG-1..50 patterns + 36 brainstorm-confirmations + 23 OS-1..23 + 18 LL-1..18.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (per-Lens tables, 46 of 50 SG-* patterns adopted)
- **Round-3 cross-reference:** 4 orphan SG-* patterns nachintegriert via Round-3 Re-Audit als R3-RA-9-1 (SG-1 API root), R3-RA-10-1 (SG-2 health endpoint), R3-RA-7-1 (SG-44 ETag/Last-Modified), R3-RA-10-2 (SG-47 Request-Id)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (4 active orphans = SG-1, SG-2, SG-44, SG-47 — all integrated via R3-RA-* IDs in master Round-3-Additions section)

## Original-content-archive (history)

This file previously had 288 lines of content covering industry style-guide pattern extraction. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-style-guides.md` for full provenance).
