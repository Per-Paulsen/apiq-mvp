# Round-2 Phase D Mining — Client-Friction Lens 4 (STUB)

> **STUB FILE — content consolidated to master `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` 2026-05-07 (Welle M / M3-Konsolidierung). Per Subagent-A's Audit-Empfehlung: Round-1 + Round-2-non-meta-Files konsolidiert zu Stub-Files; meta-File bleibt eigenständig.**

## Sources surveyed (Round 2 Phase D)

- openapi-generator (multi-language: Java/Python/Go/Rust/TS, issue-tracker mining)
- openapi-typescript (TS-typing pain-points, oneOf/anyOf union complexity)
- openapi-python-client (recursive-schema parse-failure, pattern-loss)
- oapi-codegen (Go inconsistencies, leading-digit operationIds)
- utoipa (Rust generic-arg limitations, recursion attribute)
- ReDoc (rendering-failure modes, deeply-nested allOf/oneOf)
- Swagger-UI (discriminator.mapping display, deepObject query-param handling)
- Stoplight Elements (schema-render errors, hash-routing)
- Stripe OpenAPI (`x-expandableFields`, idempotency-key as Header)
- GitHub Octokit OpenAPI (`x-octokit` extensions, deprecation-warnings strategy)
- Twilio openapi (per-product spec-files, callback-pattern docs)
- Speakeasy SDK best-practices (`x-speakeasy-name-override`, OpenAPI 3.1 recommended)
- Postman 2025 State of the API (89% REST/OpenAPI; AI-agent-consumption emerging)
- OpenAPI Initiative blog (specification-evolution governance signals)
- Redocly discriminator best-practices guide
- Speakeasy oneOf/allOf/anyOf polymorphism guide

## Extraction-rationale

Round-2 Phase D: systematic mining of patterns causing friction for client-developers + tools (codegen, SDK-Builder, doc-renderer). Round-1 hinted at this lens (X-headers, casing-mix, bare-array). Round-2 widens to: openapi-generator pain, openapi-typescript pain, ReDoc/Swagger-UI rendering, mature SDK-pipelines (Stripe/GitHub/Twilio) conventions, refactoring antipatterns. 81 CL-1..CL-81 + cross-confirmations + 8 OOS-CL + 10 UN-CL-1..10 surfaced.

## Pointer to actual patterns

Patterns originally mined in this file are now consolidated into:
- **Master:** `specs/big-spec-architecture-spike-stage-a-rules-brainstorm.md` (Lens 4 + Cross-Lens tables, all 81 CL-* patterns adopted — 100% adoption rate)
- **Round-3 cross-reference:** see Round-3 Additions section in master for 13 additional CL-* patterns from Books (Wilde/Geewax/Massé) + Corpus (R3-CO-CL-01/02 — 57% no-pagination-convention, no industry-std operationId-naming)

For Round-3 Re-Audit findings (orphan patterns in this file that were not adopted in master), see:
- `specs/big-spec-architecture-spike-stage-a-mining-round3-reaudit.md` (CL-71 = OOS Octokit-pattern requires diff-mode = explicitly OOS, integrated as R3-RA-OOS-5; 100% adoption excluding diff-OOS)

## Original-content-archive (history)

This file previously had 268 lines of content covering systematic codegen-tool + SDK-vendor + state-of-API + refactoring-antipattern mining. The original is preserved in git-history (search `git log --all -- specs/big-spec-architecture-spike-stage-a-mining-round2-client.md` for full provenance).
