# GitHub REST API

GitHub's full v3 REST API OpenAPI specification — third big-spec for the apiq Big-Spec Architecture Spike (Epic 09).

## Source

- **Repository:** [github.com/github/rest-api-description](https://github.com/github/rest-api-description)
- **File:** `descriptions/api.github.com/api.github.com.json` on `main`
- **Commit pulled:** `d3a3c2a50bb45b5f437bdfd8e0c700091bb1fb7b` (2026-05-04)
- **OpenAPI version:** `3.0.3`
- **API version:** `1.1.4`

## License

**MIT** — per the upstream repository's `LICENSE.md` file (Copyright (c) 2020 GitHub).

## Spec stats

| | Value |
| - | - |
| Operations (endpoints) | **1145** |
| Paths | 758 |
| Raw JSON | 11.70 MB |
| Dereferenced + cycle-stripped JSON | 5.98 MB |
| **Estimated input tokens** | **~1.57 M** |

## Spike role: out-of-(A)-reach stress-test

GitHub REST exceeds the 1M-token context window of every long-context model practically available on OpenRouter as of May 2026 (Sonnet 4.6, Opus 4.7, Gemini 2.5 Pro, Gemini 3 Flash Preview — all 1M-ctx; Gemini 3.1 Pro nominally 2M but listed "not available — request via Discord"). Single-call analysis is therefore **not technically feasible** with Architecture (A).

This is itself a valuable spike datum — it sets the **endpoint-cap** for the (A) winning architecture: roughly **≤1M tokens dereferenced**, ≈ **≤600 ops** depending on schema density. Specs above that cap require Architecture (B) Naive-Chunking or (C) Two-Call, which the spike defers to v1.1 territory unless (A) fails on Stripe FULL or PagerDuty FULL too.

The dereferenced JSON is committed for completeness so that a future revisit (when 2M+ context becomes routine on OpenRouter, or when (B)/(C) is implemented) has the spec on hand.

## Reproducibility

To re-fetch the current upstream `main`:

```bash
curl -sL https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json -o openapi-examples/github-rest/spec.json
```

Other variants in the upstream repo (`api.github.com.2026-03-10.json`, `api.github.com.2022-11-28.json`, GitHub Enterprise descriptions in `descriptions/ghes-*` and `descriptions/ghec/`) are not used here.
