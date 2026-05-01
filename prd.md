# PRD — apiq: API Intelligence

> Product requirements for the apiq MVP. Greenfield product, sibling to ExpliqAI.
> This document defines WHAT to build for v0.1 and points to WHERE the details will live.

---

## Product Vision

apiq is **API Intelligence**. Users upload OpenAPI specs (or pull them by URL); apiq uses LLMs to deeply understand each endpoint, evaluates the spec across clarity, design, and risk dimensions, and delivers narrated findings with one-click patches that mutate the spec directly.

**Core principle:** The value is in REASONING and CHANGE, not linting. Every finding carries an engineering-language narration that explains WHY it matters, plus a ready-to-apply JSON patch. apiq is an API design partner, not a rule checker.

**Tagline:** "Understand your APIs like the LLM does — and improve them in one click."

**Two differentiators** that no Spectral-class tool matches:
1. **LLM-narrated findings** — from raw OpenAPI JSON to engineering-grade explanation that grounds in API design practice (REST, OWASP API Top 10, RFC 7807, pagination, naming, domain patterns)
2. **One-click patches** — from finding to corrected spec via deterministic JSON Patch (RFC 6902) operations, with diff preview and rollback

---

## What apiq is NOT (for v0.1)

To stay focused, v0.1 deliberately excludes:

| Excluded | Why | Belongs to |
|---|---|---|
| Multi-spec aggregation, capability/journey mapping | Out of scope until single-spec analysis is solid | Future "Landscape" release |
| Net-new endpoint generation from gaps | Requires landscape view first | Future "Landscape" release |
| Spec-drift detection / change monitoring | Requires versioned baseline + scheduled jobs | Future "Governance" release |
| Deep auth/security scanning (BOLA exploitation, runtime fuzzing) | Crowded market (42Crunch, Salt, Wallarm) — wrong lane | Not on roadmap |
| Spec-discovery from Git repos / API gateways / K8s | Requires connectors per platform | Future release |
| Team features (commenting, approvals, role hierarchy) | Solo-engineer or single-team experience for v0.1 | Future release |
| AsyncAPI, GraphQL, gRPC | OpenAPI 3.x first, expand on demand | Future release |
| Mobile UI | Engineering tool, desktop-first | Not on roadmap |

---

## Users & Use Case

**Primary user:** technical individual contributor on the API side — backend engineer, API platform engineer, integration architect, OpenAPI maintainer at a startup or scale-up.

**Trigger moment:** "I have an OpenAPI spec. I want a knowledgeable second opinion: what's wrong with it, what's risky, what's missing context, and can it be improved without me reviewing it line by line."

**Multi-tenant context:** Each user belongs to a workspace. Specs and findings are scoped to the workspace. v0.1 supports one user per workspace (no team invitations) but the data model is multi-tenant from day 1.

---

## Four Screens (v0.1)

| Screen | User question | One job |
|---|---|---|
| **Specs** | "What have I uploaded?" | List of all specs in workspace, with quality score, finding counts, last analyzed timestamp |
| **Spec Detail** | "What's wrong with this spec, and how do I fix it?" | Per-endpoint findings with narration, patch preview, and one-click apply |
| **Upload** | "Get a new spec into apiq." | File upload + URL pull, with validation and dereferencing preview |
| **Settings** | "Manage my workspace." | Account info, sign-out, (later) integrations |

Plus **Login** and **Signup** (Auth.js).

> **Detailed screen specifications:** to be added in `prd-decisions.md` (deferred — created during `/spec` brainstorming if needed).

---

## Data Architecture

### Spec ingestion

**Phase 1 — Upload or fetch.** User uploads a JSON/YAML file or provides a URL. apiq validates as OpenAPI 3.x (Swagger 2.0 read-only, no patches), stores the original, dereferences `$ref`s into a working `currentJson`, and shows a preview.

**Phase 2 — Analyze.** apiq sends the dereferenced spec to the LLM analysis pipeline (see below). Findings are persisted per-endpoint with patches.

**Phase 3 — Patch loop.** User reviews findings, previews diffs, applies or rejects patches. Each apply mutates `currentJson` (a new `SpecVersion` is created), and the affected findings are re-evaluated as needed.

**Phase 4 — Export.** User downloads the modified spec as JSON or YAML.

### LLM Pipeline — v0.1: Single-Call (proven via spike)

For v0.1, one Sonnet call per spec analysis. Input: dereferenced spec JSON + per-endpoint context. Output: structured `findings[]` with `narration`, `category`, `severity`, `patchOps`.

**Future (out of scope for v0.1):** two-call architecture analogous to ExpliqAI — per-endpoint with Haiku → spec-level aggregation with Sonnet — for larger specs (>50 endpoints).

The exact prompt, output schema, persona, anti-patterns, and patch reliability are **established by the research spike (Phase 0)** before any implementation begins. Epic 04 then implements what the spike proved out.

> **Prompt architecture details:** see `specs/research-spike.md` (produced by Phase 0).

### Schema (v0.1 minimum)

```
Workspace, User, Account, Session, VerificationToken     (Auth.js standard)

Spec {
  id, workspaceId,
  name, sourceType (upload|url), sourceUrl?,
  originalJson, currentJson,
  endpointCount, qualityScore?, lastAnalyzedAt
}

SpecVersion {
  id, specId, parentVersionId?, json, label, createdAt
}

Finding {
  id, specId, endpointPath, endpointMethod,
  category (clarity | design | risk),
  severity (critical | high | medium | low),
  title, narration, rationale,
  patchOps,                          // JSON Patch RFC 6902
  status (open | applied | rejected),
  appliedAt?, appliedInVersionId?
}
```

All app models scoped by `workspaceId`. JSON fields use Prisma's `Json` type with `as Prisma.InputJsonValue` on writes and type narrowing on reads.

---

## Finding Framework

Inspired by ExpliqAI's recommendation framework, adapted for API specs.

**Sort:** By severity primarily, then by category. Number of endpoints affected shown as evidence.

**Three categories:**
- **Clarity** — documentation completeness, naming, examples, descriptions, missing operationIds, inconsistent terminology.
- **Design** — REST conformance, pagination, idempotency, error schema consistency, response envelope shape, versioning hygiene, deprecation handling.
- **Risk** — pattern-level risk indicators (sensitive fields without auth, missing rate-limit hints, BOLA-shaped endpoints, schema permissiveness). Stays at PATTERN level — does not perform runtime exploitation.

**Four severity levels:** `critical | high | medium | low`. Severity determines sort order, not category.

**Each finding shows:**
- Endpoint(s) affected (path + method)
- Title (short headline)
- Narration (engineering-language explanation, ~3–5 sentences, grounds in API design practice)
- Rationale (why this matters, with reference to the relevant principle or pattern)
- Patch preview (JSON Patch operations + side-by-side diff)
- Apply / Reject buttons

**Patches must be deterministic and reversible.** Every applied patch creates a new `SpecVersion` with `parentVersionId` pointing at the prior version, enabling rollback.

> **Finding categories full taxonomy and target output quality:** to be defined during research-spike phase.

---

## Quality Bar

What makes apiq feel like an API design partner instead of a Spectral-class linter:

1. **Narration depth.** A finding like *"The `/orders` endpoint paginates without a stable cursor. Reporting consumers that page through the full list will see duplicate or missed records when orders are created mid-iteration. Cursor-based pagination on `created_at` plus a strict tie-breaker on `id` would fix this."* — versus Spectral's *"Rule no-pagination violated."*
2. **Patches are real.** Apply must produce a valid OpenAPI document, with all relevant schemas and parameters consistently updated. Not symbolic.
3. **No false confidence.** When the LLM is uncertain (e.g., risk pattern that *might* be intentional), the finding says so. No hard claims without grounding.
4. **No invented fields.** Every patch operation references a path that exists or a field clearly derivable from the spec. No hallucinated schemas.

---

## Future (Post v0.1)

Post-v0.1 releases extend along the same axis the original `cross_sectional_learning` instinct already pointed at — from a single spec to a landscape of specs:

| Release | Theme | Capabilities |
|---|---|---|
| **v0.2 — Landscape** | Multi-spec intelligence | Capability/domain clustering across specs, gap analysis, cross-spec naming-convention drift |
| **v0.3 — Generation** | Net-new endpoints | Generate stub specs for capability gaps; deploy to Git via PR |
| **v0.4 — Governance** | Drift over time | Spec versioning, breaking-change detection, scheduled re-analysis, change diffs in business language |

Roadmap is illustrative — v0.1 ships first, decisions on v0.2+ are made afterward based on usage.

---

## Phase 0 — Research Spike

Before any implementation epic runs, conduct a research spike to **prove out the LLM analysis approach end-to-end on real OpenAPI specs**. This is the apiq equivalent of ExpliqAI's Phase 0 spike.

**Why it matters:** the LLM pipeline is the heart of the product. If the prompt cannot reliably produce findings with engineering-grade narration AND patches that actually apply cleanly, none of the downstream UI/data work matters. We need to know what works before committing to a schema and a UI.

**Inputs to the spike:**
- 3–5 **real-world public OpenAPI specs** in `openapi-examples/`, taken as-is from production sources. **No synthetic specs, no toy `petstore`-style specs, no specs constructed to exercise specific cases.** Real specs naturally exhibit pagination, auth, error envelopes, schema complexity, and design quirks that no synthetic suite can anticipate — and the spike must calibrate the prompt against this real-world messiness, not against cases we invented for ourselves.

  Suggested shortlist (final pick decided in spike kickoff):
  - **Stripe** — published OpenAPI spec from `github.com/stripe/openapi`. Large, polished, the de-facto gold standard. Useful as the "what good looks like" reference.
  - **OpenWeatherMap** — small, well-known, sentimentally tied to the project's 2019 origin.
  - **Twilio** or **PagerDuty** — mid-sized, real-world product API with auth + pagination + error patterns.
  - **GitHub REST API** (or a slice of it) — large, complex, very real-world quirks.
  - One spec from **APIs.guru** representing genuine messiness (a smaller / less-polished public API).

- Manually-written reference output: a "this is what good looks like" findings document for **one of the real specs above**, used as the calibration target.

**Activities (iterative):**
- Iterate on the system prompt: persona, output schema, anti-patterns, confidence calibration, narration tone
- Test single-call vs two-call architecture on the largest sample (decide threshold for two-call)
- Validate that JSON Patch operations actually apply cleanly to the source specs (no hallucinated paths, no broken `$ref` resolution after patching)
- Establish severity calibration: what counts as `critical` vs `high`, etc.
- Establish category boundaries: when is something Clarity vs Design

**Decisions produced by the spike (locked in before Epic 04):**
- Final system prompt + output JSON schema
- Single-call vs two-call decision (with size threshold if two-call)
- Persona definition
- Anti-pattern list (false confidence, hallucinated paths, generic advice without grounding, etc.)
- Patch-reliability checklist (every patch op must reference an existing path or a clearly derivable new one)
- Reference target-output document analogous to ExpliqAI's `ANALYSIS-FINAL.md`

**Outputs:**
- `specs/research-spike.md` — iterations, decisions, proven prompts
- `openapi-examples/` — curated sample specs with descriptions
- `openapi-examples/{spec}/reference/findings-target.md` — reference quality target for one sample

## Suggested Epic Sequence

| Phase | Epic | Scope |
|---|---|---|
| **0** | **00: Research spike** | **Iterate on prompt + output schema + patch reliability against real sample specs. Produce `specs/research-spike.md` with proven prompts and reference target output.** |
| 1 | 01: Project setup | Next.js + TypeScript + Tailwind v4 + shadcn/ui + Prisma 7 + Supabase scaffold + ESLint + Vitest |
| 1 | 02: Auth + Workspace | Auth.js v5 (Credentials), signup/login, multi-tenant Workspace + User models, `getRequiredSession()` |
| 1 | 03: Spec ingestion | Spec model, upload + URL-pull, OpenAPI 3.x validation, `$ref` dereferencing, original/current versions |
| 2 | 04: LLM pipeline | OpenRouter integration, prompt + schema as proven by spike, Finding model, retry/backoff |
| 2 | 05: Spec Detail screen | Endpoint list, finding cards with narration, severity/category filters |
| 2 | 06: Patch apply | JSON Patch (RFC 6902) application, SpecVersion creation, diff preview, apply/reject flow, rollback |
| 3 | 07: Specs list + Settings | Specs list with quality scores, settings page, sign-out |
| 3 | 08: Export + polish | JSON/YAML export, loading states, error boundaries, empty states |

> **Detailed scopes per epic:** generated by `/spec prd.md`.

---

## Reference Map

| Document | What it contains | When to read |
|---|---|---|
| **This file** (`prd.md`) | Product vision, screens, data architecture, scope, roadmap | Start here |
| `tech-stack.md` | Stack and runtime versions | When making architectural decisions |
| `CLAUDE.md` | Workflow + conventions for Claude Code | Before any implementation |
| `prd-decisions.md` | Design system: color palette, typography, layout, component conventions | Read before any UI epic (Epic 01, 05, 07, 08) |
| `openapi-examples/README.md` | Catalog of sample OpenAPI specs for development and verification | When working on ingestion, analysis, or verification |
| `specs/research-spike.md` | Phase 0 spike results — proven prompts, output schema, patch reliability findings | Before Epic 04 (LLM pipeline) and any change to the analysis prompt |
| `specs/[N]-{name}.md` | Per-epic specifications | During implementation |
| `specs/[N]-{name}-results.md` | Per-epic implementation results, deviations, risks | Before starting dependent epics |
