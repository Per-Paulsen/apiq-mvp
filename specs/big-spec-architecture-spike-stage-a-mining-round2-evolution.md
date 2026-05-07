# Round-2 Phase C Mining — Evolution-Friction Lens 3 (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 2 Phase C)

- oasdiff (Apache-2.0, 450+ rules across 12 categories)
- OpenAPITools/openapi-diff + openapi-tools/open-api-diff
- pb33f openapi-changes / libopenapi (OAS 3.0/3.1/3.2 single-and-double-spec)
- Azure/openapi-diff (vendor-leaning)
- Optic (`breaking-changes` ruleset + lifecycle-rules `required_on:added`)
- Postman API-versioning best-practices
- Stripe upgrades + versioning (date-based, response-compat-layer, Acacia release)
- GitHub REST API Versioning + breaking-change list
- Twilio Versioning + Support Lifecycle
- Microsoft Azure REST API Guidelines (versioning section)
- Google Protocol Buffers style (PROTO)
- Zalando extensible-enum (ZAL-EXT)
- OpenAPI 3.3 deprecated-object proposal (OAS-3.3-PROP)
- RFC 8594 (Sunset header) + RFC 9745 (Deprecation header) + draft-ietf-httpapi-deprecation-header

## Extraction-rationale

Round-2 Phase C: systematic mining of breaking-change rules. Stage-A constraint (load-bearing): single-spec analysis. Most diff-tool rules operate two-spec — directly out-of-scope. Insight: many breaking-change-categories can be approximated from a single spec by flagging structural patterns that PREDICT future breaking changes (required-field-likely-needs-optional, enum-without-extensibility-hook, deprecated-without-sunset). 62 EV-1..EV-62 + 20 brainstorm-confirms + 20 OOS + 10 UN-1..10 surfaced.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Lens 3 + Cross-Lens tables, all 62 EV-* patterns adopted — 100% adoption rate)
- **Round-3 cross-reference:** see Round-3 Additions section in master for 23 additional EV-* patterns from Books + Postmortems + Corpus (Twitter/Reddit/PayPal/Stripe/Slack/Atlassian postmortems lifted Lens-3 by +16 alone)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (zero genuine orphans confirmed; 100% adoption)

## Original-content-archive (history)

This file previously had 299 lines of content covering systematic breaking-change rule mining + vendor-versioning strategy extraction. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-round2-evolution.md` for full provenance).
