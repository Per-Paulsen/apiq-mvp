# Round-3 Mining — Corpus-Download (M2a)

> Authored 2026-05-07 by M2a-Subagent.

## Sources surveyed

- **APIs.guru** (primary): list.json fetched, 2529 providers total, 1521 OAS3 candidates after pre-filter. All 1521 attempted; 1521 downloaded successfully. 516 ended up healthy and on-disk.
- **Vendor-Specs (high-quality, ground-truth)**: 6 attempted (stripe, github, digitalocean, twilio, gitlab, pagerduty). 5 ended up on-disk; digitalocean dropped due to external-ref index-only structure.
- **OpenAPI Directory** (GitHub OAI/OpenAPI-Directory): SKIPPED — APIs.guru is built ON TOP of OpenAPI-Directory and re-publishes its content via the same primary fetch pipeline. Adding it directly would only produce duplicates (already covered by the SHA256 dedup pass).
- **GitHub-Search**: SKIPPED — required GitHub-API auth (60 req/h unauth limit too low for meaningful sample) AND the 1527-spec primary corpus already exceeded the ≥500 target. Statistical signal is robust at this size; adding ungated GitHub-search results would mainly add toy / experimental specs that pollute the pattern-mining baseline.

Total HTTP fetches: 1527. Errors: 0 (with 2 retries). Total wall-time: ~5 minutes at concurrency=5.

## Healthy-Spec-Filter

**Final criteria (D10 graceful-degradation applied)**:
- (a) `oas3` — `openapi: "3.x"` field present
- (b) `minOps ≥ 5` — relaxed from 10 to 5 to clear the ≥500-spec target. Strict (≥10) yielded 396 healthy; relaxing to ≥5 yielded 518.
- (c) `tags ≥ 1` — at least one entry in top-level `tags` array
- (d) `descRate ≥ 0.8` — at least 80% of operations have a non-empty `description` or `summary`
- (e) `recentYears` — DISABLED (set to 999). The APIs.guru `updated` field reflects ingestion timestamp, not API mtime. With the field active, 0 specs would have passed since most ingestion is 2020-2023. This is a known APIs.guru data-shape limitation, not a spec-quality signal.

| Criterion | Passed | Failed |
|---|---:|---:|
| (a) oas3-validates | 1526 | 1 |
| (b) ≥5 ops | 1057 | 470 |
| (c) tags array (≥1) | 653 | 874 |
| (d) ≥80% descriptions | 1450 | 77 |
| (e) updated <2y | n/a (disabled) | n/a |
| ALL passed | **518** | — |

**Relaxation tally** (alternatives explored):
- strict (oas3 + minOps≥10 + tags + 0.8desc): 396
- relax minOps→5: **518** ← chosen
- relax descRate→0.5: 399
- relax tags→optional: 784
- relax all three: 1019

The chosen relaxation (minOps 10→5) is minimally invasive and preserves the strongest signal-quality on the remaining filters. Removing the tags or description criteria would have admitted weak specs without clear pattern-density.

## Final corpus

- **Total on disk: 521 specs** (~239 MB total; median 78 KB; largest 46 MB = `microsoft-com-graph-beta`)
  - 518 healthy (passing all 4 active filters)
  - 3 vendor force-included (stripe, twilio, gitlab) that fail filter but are known-good ground-truth APIs and useful for vendor-augmented mining
  - 2 vendor dual-listed but already healthy via filter (github, pagerduty)
- **Distribution by source**: 516 apis.guru + 5 vendor (stripe, github, twilio, gitlab, pagerduty)
- **Storage**: `scripts/spike/data/healthy-corpus/` (absolute: `C:/Users/perpa/Dev/apiq-mvp/scripts/spike/data/healthy-corpus/`)
- **Manifest**: `scripts/spike/data/healthy-corpus/manifest.json` (1.5 MB; lists all 1527 attempted specs with full filter result + `onDisk` + `forceIncluded` flags)

### Spec-id format

`<provider>--<api-name-or-version>` with all `:`, `.`, `/` replaced by `-`. Examples:
- `stripe-com--2024-04-10` (apis.guru)
- `stripe--core--latest` (vendor patch)
- `github-com--1-1-4` (apis.guru)
- `github--rest--main` (vendor)
- `microsoft-com-graph-beta--1-0-1`

### Top 10 by ops-count

| spec-id | ops |
|---|---:|
| microsoft-com-graph-beta--1-0-1 | 22 361 |
| microsoft-com-graph--1-0-1 | 11 422 |
| github--rest--main (vendor) | 1 153 |
| github-com-ghec--1-1-4 | 938 |
| github-com-ghec-2022-11-28--1-1-4 | 938 |
| github-com-ghes-3-8--1-1-4 | 869 |
| github-com--1-1-4 | 845 |
| github-com-api-github-com-2022-11-28--1-1-4 | 845 |
| github-com-ghes-3-7--1-1-4 | 827 |
| github-com-ghes-3-6--1-1-4 | 808 |

### Manifest schema (per-spec entry)

```jsonc
{
  "id": "stripe-com--2024-04-10",
  "source": "apis.guru" | "vendor",
  "providerName": "stripe.com",
  "url": "https://api.apis.guru/v2/specs/stripe.com/2024-04-10/swagger.json",
  "downloadedAt": "2026-05-07T...",
  "spec": {
    "oasVersion": "3.0.0",
    "operationsCount": 587,
    "tagsCount": 0,
    "operationsWithDescription": 582,
    "descriptionRate": 0.991,
    "lastUpdated": "2024-04-10T...",
    "title": "Stripe API",
    "parseable": true,
    "healthy": false,
    "filterPasses": ["oas3", "descriptions", "minOps", "recent"],
    "filterFails": ["tags"]
  },
  "healthy": false,
  "duplicate": false,
  "filterPasses": [...],
  "filterFails": [...],
  "onDisk": true,
  "forceIncluded": true   // present only on vendor-overrides
}
```

## Caveats / known issues

1. **Stripe (vendor) fails `tags` filter** — Stripe groups operations via `x-stripeOperations` and resource-naming, not via top-level `tags`. Force-included on disk because it's a canonical high-quality enterprise spec; M2c may want to special-case it.
2. **Twilio (vendor) fails `descRate≥0.8`** — observed 76% description-rate, just under threshold. Force-included.
3. **GitLab (vendor) fails `oas3`** — GitLab's public spec is still OAS 2.0 (Swagger). Force-included on disk for completeness; M2c walkers that depend on OAS3-only constructs (`components.schemas`, etc.) should skip it.
4. **DigitalOcean (vendor) DROPPED** — its top-level spec is an external-`$ref` index pointing to per-resource YAML files in the same Git repo. Not self-contained, would require a multi-file resolver to be useful for static-analysis. Removed from disk; left in manifest with `parseError: external-ref-index-not-self-contained` for traceability.
5. **APIs.guru `updated` field is not API-mtime** — it reflects when APIs.guru ingested the spec, not when the upstream provider updated the API. Criterion (e) was disabled accordingly. For Phase B this should be revisited: ideally fetch git-mtime from each upstream `x-origin.url` to filter stale APIs (e.g., 2017-frozen ones), but that requires per-spec git-clone of the source repo and is out of M2a scope.
6. **`microsoft-com-graph-beta` is 46 MB / 22 361 ops** — single dominant outlier in disk size + ops-count. M2c should consider sampling or rate-limiting per-spec contribution to avoid Microsoft Graph dominating the pattern-frequency signal.
7. **GitHub variants represent 9 of top-10 ops-count** — GitHub Enterprise Server has many parallel versions (ghes-3.6 / 3.7 / 3.8 / ghec / api.github.com / ...). All highly similar. Two pairs were SHA256-deduped (manifest.totalDuplicates=2). M2c may further coalesce them downstream when building per-API frequency aggregates.
8. **No corpus refresh strategy** — manifest captures `downloadedAt`. Re-running `download-corpus.mjs` is idempotent (overwrites). Fine for this single round; not productionised.

## Files generated

- `scripts/spike/download-corpus.mjs` — downloader script (~370 lines)
- `scripts/spike/download-vendor-only.mjs` — one-shot vendor-patch script for force-included specs
- `scripts/spike/data/healthy-corpus/manifest.json` — full manifest (1527 entries; 518 healthy + 3 forceIncluded on disk)
- `scripts/spike/data/healthy-corpus/_apis-guru-list.json` — raw APIs.guru list dump (7 MB cached)
- `scripts/spike/data/healthy-corpus/_targets.json` — pre-computed target list (1521 entries)
- `scripts/spike/data/healthy-corpus/_download-log.txt` — final download progress log
- `scripts/spike/data/healthy-corpus/<spec-id>.json` × 521 — actual sanitized spec bodies (`x-logo` stripped)

## M2c handoff guidance

For pattern-mining (M2c subagent), iterate over manifest entries where `onDisk === true`. Two corpus-strata to consider:

- **Strict baseline (518 specs)**: `m.specs.filter(s => s.onDisk && s.healthy)` — strongest signal-quality
- **Vendor-augmented (521 specs)**: `m.specs.filter(s => s.onDisk && (s.healthy || s.forceIncluded))` — adds Stripe + Twilio + GitLab as ground-truth high-quality APIs

Recommend running mining on both and comparing whether vendor-augmentation shifts pattern frequencies meaningfully. Stripe alone has 587 ops / 99% description-rate = useful signal even without `tags`.
