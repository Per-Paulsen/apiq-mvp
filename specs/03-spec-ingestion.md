# Epic 03 — Spec Ingestion (URL-only)

> Pulls OpenAPI 3.x specs from public or header-authed URLs, validates, dereferences `$ref`s, persists Spec + initial SpecVersion. Triggers Epic 04 analysis on success (interface contract — analysis itself ships in Epic 04).
> **PRD abweichung:** PRD §"Spec ingestion" sagt "User uploads a JSON/YAML file or provides a URL". v0.1 unterstützt **nur URL-Pull** (siehe brainstorming Sektion A "Scope-Update"). File-Upload ist v0.2.

## Scope

- Define Prisma models (workspace-scoped via `workspaceId` FK on Spec):
  - `Spec { id, workspaceId, name, sourceType (url|sample), sourceUrl?, sourceFormat (json|yaml), originalJson, currentJson, currentVersionId, endpointCount, qualityScore?, lastAnalyzedAt?, analysisStatus (pending|analyzing|completed|failed), analysisError?, createdAt, updatedAt }`
  - `SpecVersion { id, specId, parentVersionId?, versionNumber, json, label, createdAt }`
- `(app)/specs/new/page.tsx` — "Add Spec" screen with:
  - URL input (required, validated as a URL)
  - optional `Authorization` header free-text field (placeholder: `Bearer xyz` or `Basic <base64>`)
  - submit button → server action `addSpecFromUrlAction({ url, authHeader? })`
- Server action `addSpecFromUrlAction`:
  1. `getRequiredSession()` for `workspaceId`.
  2. Rate-limit check (≤20 URL-pulls per hour per workspace via DB count, see Open Question on shared rate-limit infra).
  3. `fetch(url, { headers: authHeader ? { Authorization: authHeader } : {}, redirect: 'follow', signal: AbortSignal.timeout(30_000) })`. Max 5 redirects (default `fetch` behaviour). Reject non-2xx with structured error `{ kind: 'http_error', status, statusText }`.
  4. Detect format: Content-Type → URL extension (`.json`, `.yaml`, `.yml`) → sniff first non-whitespace char (`{`/`[` ⇒ JSON; else YAML). Reject if neither parses.
  5. Parse to JSON (use `yaml` package for YAML).
  6. Reject Swagger 2.0 (`swagger: "2.0"` field present) with structured error `{ kind: 'unsupported_swagger_2', message: "Swagger 2.0 is not supported in v0.1. Convert with swagger2openapi." }`.
  7. Validate as OpenAPI 3.x (use `@apidevtools/swagger-parser` or `oas3-validator`). On failure, return structured error `{ kind: 'invalid_openapi', issues: Issue[] }` with up to 10 issues.
  8. Reject specs with file size > 5 MB or `endpointCount` > 200 (counted across `paths.*.{get|post|put|patch|delete|options|head|trace}`). Soft-warn at >100 endpoints OR ≥1 MB JSON size (return `{ success: true, warning: 'large_spec', warningReasons: ('many_endpoints'|'large_size')[], spec }` — UI surfaces a banner but proceeds). The size threshold is in addition to the endpoint threshold because spec complexity (not endpoint count) drives LLM hallucination risk per Epic 00 spike measurements (research-spike.md §"Endpoint-cap recommendations"). Suggested UI banner copy: "Large spec: analysis quality may degrade. Some findings may be marked stale on apply (production-safe — see Versions tab)."
  9. Dereference `$ref`s. Local refs only (`#/components/...`); external refs → `{ kind: 'external_refs_unsupported', issues }`. Cyclical refs are replaced with the marker `{ "$ref": "#cyclic" }` before persistence to `currentJson` — so the stored JSON is acyclic and safe for `JSON.stringify` / `structuredClone` / `fast-json-patch`. Reference implementation: `scripts/spike/stringify-spec.ts` (`cycleStripSpec`). The same marker shape is consumed by Epic 04 (LLM prompt) and Epic 06 (patch validator), so DO NOT change the marker key/value without coordinating those epics.
  10. Persist `Spec` (`sourceType = 'url'`, `sourceUrl = url`, `sourceFormat`, `originalJson`, `currentJson` = dereferenced, `endpointCount`, `analysisStatus = 'pending'`, `name = info.title || URL pathname leaf`) and the initial `SpecVersion` (`versionNumber = 1`, `label = 'Initial pull from URL'`, `parentVersionId = null`). Set `Spec.currentVersionId` to the new version.
  11. **Auth-header is NOT persisted** — used only for this one fetch.
  12. Trigger analysis: `fetch('/api/internal/analyze', { method: 'POST', body: { specId } })` fire-and-forget (full implementation in Epic 04; this epic only defines the trigger interface).
  13. Return `{ success: true, specId }` and the UI redirects to `/specs/[specId]` (Spec Detail, owned by Epic 05).
- "Re-pull from URL" server action `repullSpecAction({ specId })`:
  - only available if `spec.sourceType === 'url'` AND `spec.sourceUrl` is reachable without auth (auth-headers are not persisted, so authed pulls cannot be re-pulled — UI hides the button for these specs based on a per-spec flag `wasAuthedPull: boolean`)
  - re-fetches, re-validates, re-dereferences (same pipeline as above)
  - creates a new `SpecVersion` with `label = 'Re-pulled from URL'`, `parentVersionId = currentVersionId`, `versionNumber = previousMax + 1`
  - sets `Spec.currentJson` and `Spec.currentVersionId` to the new version
  - **invalidates all open Findings** (status `open` → `outdated`); applied/rejected Findings are untouched (history preserved)
  - sets `analysisStatus = 'pending'` and triggers analysis again
- "Sample spec" loader: server-only helper `loadSampleSpecAction({ sampleId })` for the empty-state CTA (Epic 07). Behaves like `addSpecFromUrlAction` but reads from a static file in `openapi-examples/`. Sets `sourceType = 'sample'`, `sourceUrl = 'apiq:sample/<id>'`. No re-pull button for sample specs (UI hides it).
- `Spec` deletion server action `deleteSpecAction({ specId })`. Cascades to `SpecVersion` and `Finding` (via Prisma `onDelete: Cascade`).

## Acceptance criteria

1. Prisma migration `add_spec_models` creates `Spec` and `SpecVersion` tables with the fields above, indexed on `workspaceId` and `(specId, versionNumber)`.
2. Authenticated POST to `addSpecFromUrlAction` with a valid public OpenAPI 3.x URL (e.g. one of the `openapi-examples/`-equivalent URLs) creates a Spec + SpecVersion and returns `{ success: true, specId }`.
3. The created Spec has `analysisStatus = 'pending'`, `currentJson` is the dereferenced spec, `originalJson` is the parsed-but-not-dereferenced spec.
4. A non-authed call to a URL returning 401 surfaces `{ success: false, error: { kind: 'http_error', status: 401 } }` and does **not** persist a Spec.
5. Same URL with `authHeader = 'Bearer <valid>'` succeeds against an authed mock; the `Authorization` header value is not stored anywhere (verified via DB inspection in test).
6. A YAML spec is parsed correctly; `sourceFormat = 'yaml'` is set; `originalJson` is the JSON-normalised representation.
7. A Swagger 2.0 spec is rejected with the documented error message and is not persisted.
8. An invalid OpenAPI 3.x spec returns `{ kind: 'invalid_openapi', issues: [...] }` with up to 10 issues.
9. A spec with external `$ref`s returns `{ kind: 'external_refs_unsupported', issues: [...] }` listing the offending refs.
10. A 6 MB spec is rejected with `{ kind: 'too_large', sizeMB: 6, limitMB: 5 }`.
11. A 250-endpoint spec is rejected with `{ kind: 'too_many_endpoints', count: 250, limit: 200 }`.
12. A 120-endpoint spec returns `{ success: true, warning: 'large_spec', warningReasons: ['many_endpoints'], spec }` and is persisted.
12a. A 1.5 MB / 50-endpoint spec returns `{ success: true, warning: 'large_spec', warningReasons: ['large_size'], spec }` and is persisted (size threshold trips before the endpoint threshold).
13. URL-pull rate-limit: the 21st pull within an hour for a workspace returns `{ success: false, error: { kind: 'rate_limited', retryAt } }`.
14. `repullSpecAction` on a URL-sourced public-pull spec creates a new SpecVersion with incremented `versionNumber`, sets it as current, sets old `open` Findings to `outdated`, triggers analysis. Applied/rejected Findings remain in their original state.
15. `repullSpecAction` is rejected for `sourceType = 'sample'` and for specs originally pulled with an auth header.
16. `deleteSpecAction` removes the Spec and cascades to all its SpecVersions and Findings.
17. Vitest tests: happy path, every documented error kind, the rate-limit branch, the re-pull invariants. Mock `fetch` and the swagger-parser; do not hit real URLs in tests (`openapi-examples/` files are read from disk in fixture-based tests).

## Out of scope

- File upload — v0.2.
- Multi-file specs / ZIP upload — v0.2.
- Persistent storage of auth credentials for URL re-pull — v0.2 (would need encryption at rest and a separate `SpecCredential` model).
- Automatic / scheduled re-pull — v0.4 ("Governance" release per PRD).
- Manual in-browser editing of specs — v0.2 or later.
- Quality-score computation — Epic 04 (computed after analysis).
- Findings list / Spec Detail UI — Epic 05.
- Export — Epic 08.
- Specs list — Epic 07.
- Cross-spec / multi-spec landscape — v0.2 ("Landscape" release).

## Domain terms

- **Spec** — a single OpenAPI 3.x document tracked in a Workspace. Has many SpecVersions; one is "current".
- **SpecVersion** — an immutable snapshot of the dereferenced spec JSON at a point in time. The first one is created on initial pull (`label = 'Initial pull from URL'`); subsequent ones come from patch-apply (Epic 06) or re-pull.
- **Re-pull** — fetches the spec from its URL again, creates a new SpecVersion, invalidates open Findings as `outdated`. Only available for URL-sourced specs that were originally pulled without an auth header.
- **`originalJson` vs `currentJson`** — `originalJson` is the parsed-but-not-dereferenced raw spec (Json field). `currentJson` is the dereferenced, possibly patched, current state. Both are Prisma `Json` fields.
- **`sourceFormat`** — `'json' | 'yaml'`. Drives the default export format in Epic 08 (the user can still export the other format).
- **`sourceType`** — `'url' | 'sample'`. `'sample'` is reserved for specs created via the empty-state "Try with a sample spec" CTA from Epic 07.
- **`outdated` finding status** — set when a re-pull invalidates open findings. Distinct from `stale` (Epic 06: a single patch is no longer applicable). Both are read-only in the UI.
- **Soft-warn / hard-cap** — soft-warn returns `success: true` with a warning code (UI shows a banner). Hard-cap returns `success: false` and the spec is not persisted.

## Open questions

- Library choice for OpenAPI validation + dereferencing: `@apidevtools/swagger-parser` is the proven pick — Epic 00 spike uses it across all 4 sample specs. RESOLVED: `SwaggerParser.dereference()` produces real JS object cycles for recursive schemas; do NOT rely on the library's "internal" cycle handling. Apply `cycleStripSpec` from `scripts/spike/stringify-spec.ts` immediately after dereference, before any `JSON.stringify` / `structuredClone` / DB write. Fallback to `@redocly/openapi-core` is no longer warranted for v0.1.
- **External `$ref` rejection path is unverified by the spike.** Epic 00 used only internal-ref specs; the rejection branch must be exercised explicitly during Epic 03 implementation, ideally with a hand-crafted fixture spec that contains an `https://...` ref. Add a Vitest case to AC #17 covering this path.
- Library choice for YAML parsing: `yaml` package (eemeli) is the de-facto choice. Confirm during implementation.
- Rate-limit storage: a dedicated `RateLimitBucket` table or count over `Spec.createdAt` per workspace? Recommendation: a generic `WorkspaceActionLog { workspaceId, action, createdAt }` table introduced here, reused by Epic 04 (LLM-call limits) and Epic 06 (apply rate-limit). Confirm during implementation.
- "Re-pull only for non-authed URLs" is enforced via a `wasAuthedPull: boolean` flag on Spec (set on initial pull). Alternative: enforce by checking whether `sourceUrl` is reachable without auth at re-pull time — slower, less deterministic. Default to the flag.
- Endpoint counting: count unique `(path, method)` combinations across `paths.*`. Should the count include `OPTIONS` / `HEAD` / `TRACE`? Recommendation: yes (they are real endpoints), but record the per-method breakdown in `endpointCount` only as a single number for v0.1.
- Should the analyze trigger fail silently or return an error if the `/api/internal/analyze` route is unreachable? Recommendation: log + set `analysisStatus = 'failed'`; the spec is still persisted and the user can retry from Spec Detail.
