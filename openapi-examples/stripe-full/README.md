# Stripe API (full)

Un-sliced Stripe public OpenAPI specification — the **chosen reference-target spec** for the apiq Big-Spec Architecture Spike (Epic 09).

## Source

- **Repository:** [github.com/stripe/openapi](https://github.com/stripe/openapi)
- **File:** `openapi/spec3.json` on `master`
- **Commit pulled:** `011d8e301d28a95e1b8898229954d79da3e0fa43` (2026-04-28)
- **API version:** `2026-04-22.dahlia`
- **OpenAPI version:** `3.0.0`

## License

**MIT** — per the upstream repository's `LICENSE` file.

## Spec stats

| | Value |
| - | - |
| Operations (endpoints) | **587** |
| Paths | 414 |
| Raw JSON | 7.39 MB |
| Dereferenced + cycle-stripped JSON | 3.53 MB |
| **Estimated input tokens** | **~926 K** |
| Component schemas | 1385 |
| Top-level `tags` | none (Stripe groups by path-prefix instead) |

## Why this spec for the spike

- The PRD (`prd-launch.md` §4) names Stripe FULL as the most likely big-spec calibration anchor: large, polished, "what good looks like" reference, MIT-licensed, well-known industry contract.
- v0.1 already used a sliced 126-op subset (`openapi-examples/stripe/`) as the polished-spec calibration anchor. Un-slicing extends that line of evidence to the full 587-op surface.
- Fits in a 1M-token context window with ~7% headroom — Architecture (A) Bigger-Context is technically feasible.
- Reference-target document at [`reference/findings-target-big.md`](./reference/findings-target-big.md) (20 manually-authored findings) drives the coverage-scoring pass-criterion #3.

## Reproducibility

To re-fetch the current upstream `master`:

```bash
curl -sL https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json -o openapi-examples/stripe-full/spec.json
```

The slicing-script-pair (`scripts/spike/slice-stripe.mjs`) is for the `openapi-examples/stripe/` sliced variant; this folder uses the upstream file verbatim.
