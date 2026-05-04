# PagerDuty REST API (full)

Un-sliced PagerDuty REST API OpenAPI specification — second big-spec for the apiq Big-Spec Architecture Spike (Epic 09).

## Source

- **Repository:** [github.com/PagerDuty/api-schema](https://github.com/PagerDuty/api-schema)
- **File:** `reference/REST/openapiv3.json` on `main`
- **Commit pulled:** `a042fe53fe27a95474198bb6f3b7caa5c6ce79dd` (2026-05-04)
- **OpenAPI version:** `3.0.2`
- **API version:** `2.0.0`

## License

PagerDuty's `api-schema` repository carries no formal `LICENSE` file. Treated as **public API documentation** for development-fixture use, consistent with the v0.1 sliced variant in [`../pagerduty/`](../pagerduty/).

## Spec stats

| | Value |
| - | - |
| Operations (endpoints) | **419** |
| Paths | 246 |
| Raw JSON | 2.40 MB |
| Dereferenced + cycle-stripped JSON | 1.14 MB |
| **Estimated input tokens** | **~299 K** |

## Why this spec for the spike

- Mid-large real-world product API. Fits comfortably in any 1M-token long-context model.
- Existing v0.1 slice (183 ops) is the borderline-large anchor in `specs/research-spike.md` (1 of 15 findings hallucinated under v4 prompt). Un-slicing to 419 ops tests whether (A) Bigger-Context inherits or overcomes that property.
- Different domain than Stripe (incident-response vs payments) → exercises a different finding distribution.

## Reproducibility

To re-fetch the current upstream `main`:

```bash
curl -sL https://raw.githubusercontent.com/PagerDuty/api-schema/main/reference/REST/openapiv3.json -o openapi-examples/pagerduty-full/spec.json
```
