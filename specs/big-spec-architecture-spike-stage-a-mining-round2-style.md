# Round-2 Phase E Mining — Style-Coherence Lens 5 (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 2 Phase E)

- Richardson Maturity Model (Level-2 vs Level-3 distinctions)
- JSON:API spec v1.1 (envelope: `data`+`included`+`links`+`relationships`)
- HAL spec (`_links`, `_embedded`)
- Siren spec (class[], actions[], properties)
- OData v4.01 (`@odata.*` annotations, `$`-prefix params, `value` array)
- Google AIPs (AIP-122 resource paths, AIP-132 list, AIP-134 update_mask, AIP-136 custom-method, AIP-140 field-names, AIP-142 *_time, AIP-148 annotations/labels, AIP-151 LRO, AIP-156 singletons, AIP-160 filter-language, AIP-203 IMMUTABLE)
- TM Forum Open API conventions (@type discriminator)
- Schema.org polymorphism conventions
- DOLAR (Palma/Khomh linguistic-anti-pattern catalog: Amorphous URI / Tiny Resource / Forgotten Verbs / Pluralised Nodes)
- Bloch + Qt API design POLA (Principle of Least Astonishment)
- API Docs Smells arXiv (bloated-description, lazy-description)

## Extraction-rationale

Round-2 Phase E: Style-Coherence is hardest Lens — REST itself ambiguous (Level-2 vs Level-3); major API styles mutually-exclusive (REST envelope vs JSON:API vs HAL vs OData). Coherence checks are about INTERNAL consistency, not picking right style. Critical caveat: many style-checks suggestive not prescriptive — apiq must NOT enforce "you should be JSON:API". Detects: style-mixing within one spec, style-conformance gaps when style declared, style-marker leakage across responses. 25 SC-1..SC-25 + 17 SCF-1..SCF-17 + 12 brainstorm + 9 OOS + 9 U-SC-1..U-SC-9 surfaced.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Lens 5 + Cross-Lens tables, all 42 SC + SCF patterns adopted — 100% adoption rate for active patterns)
- **Round-3 cross-reference:** see Round-3 Additions section in master for 7 active + 4 OOS additional Lens-5 patterns (R3-BK-SC-01..05 from Continuous-API-Mgmt + MAP, R3-CO-ST-01 corpus-stat 85.9% REST-L2-dominant, R3-RA-OOS-1..4 = U-SC-3/4/5/8 niche AIP-only patterns)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (4 OOS orphans: U-SC-3 LRO, U-SC-4 annotations/labels, U-SC-5 filter-language, U-SC-8 resource-vs-singleton — all integrated as R3-RA-OOS-* in master Round-3-Additions)

## Original-content-archive (history)

This file previously had 362 lines of content covering systematic style-coherence mining across REST/JSON:API/HAL/Siren/OData/AIP frames + DOLAR linguistic-anti-patterns + POLA + API-Docs-Smells. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-round2-style.md` for full provenance).
