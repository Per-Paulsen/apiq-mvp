# Round-2 Phase B Mining — Standards-Compliance Lens 2 (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 2 Phase B)

- HTTP/JSON/auth/URI standards stack: RFC 9110/9111/9112 (HTTP semantics, caching, message-syntax)
- RFC 7232/7233/7234 (conditional requests, range requests, caching — superseded but semantics-intact)
- RFC 9457 (Problem Details, obsoletes 7807) + RFC 6750 (OAuth bearer)
- RFC 9700 BCP-240 (OAuth Security BCP, Jan 2025) + RFC 8725 (JWT BCP)
- RFC 6648 (X-headers deprecation) + RFC 8288 (Web Linking) + RFC 7240 (Prefer-header)
- RFC 6585 (additional status codes) + draft-ietf-httpapi-ratelimit-headers
- RFC 9651 (Structured Field Values) + RFC 6838 (media-type registration)
- RFC 9745 (Deprecation header) + RFC 8594 (Sunset header)
- IANA registries: media-types, link-relations, header-fields
- JSON Schema draft-versions (2020-12 vs 2019-09 vs draft-07 vs draft-04)

## Extraction-rationale

Round-2 Phase B systematic RFC-sweep for Standards-Compliance (Lens 2). Round-1 caught only RFC 7807 + RFC 6648; Round-2 walks the full stack. Severity-axis convention: verbatim RFC 2119 keywords (MUST/SHOULD/MAY); apiq mapping `MUST → error`, `SHOULD → warn`, `MAY → hint` unless cross-source weight shifts. 105 RFC2-1..RFC2-105 + 28 brainstorm-confirms + 17 OOS + 12 UNS-* surfaced.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Lens 2 + Cross-Lens tables, 99 of 105 RFC2-* patterns adopted)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (no genuine orphans — all RFC2-* present; 95% adoption rate when including UNS-* coverage)

## Original-content-archive (history)

This file previously had 603 lines of content covering systematic HTTP/JSON/auth/URI RFC sweep. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-round2-standards.md` for full provenance).
