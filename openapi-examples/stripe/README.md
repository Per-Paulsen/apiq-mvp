# Stripe API (sliced)

Sliced subset of the Stripe public OpenAPI specification, used as the "what good looks like" reference for the apiq research spike.

## Source

- **Repository:** [github.com/stripe/openapi](https://github.com/stripe/openapi)
- **File:** `openapi/spec3.json` on `master`
- **Commit pulled:** `011d8e301d28a95e1b8898229954d79da3e0fa43` (2026-04-28)
- **API version:** `2026-04-22.dahlia`
- **OpenAPI version:** `3.0.0`

## License

**MIT** — per the upstream repository's `LICENSE` file.

## Endpoint counts

| | Endpoints | Paths |
| - | - | - |
| Original (full Stripe spec) | **587** | 414 |
| Sliced (this folder, `spec.json`) | **126** | 78 |

The full Stripe spec is roughly 4× the v0.1 single-call analysis budget (200 endpoints, brainstorming A1 / B4). The slice keeps only the most common payment / billing surface so the spike can iterate in one LLM call.

## What was kept

Six core domains — kept in full:

| Path prefix | Endpoints |
| - | -: |
| `customers` | 47 |
| `invoices` | 18 |
| `charges` | 14 |
| `payment_intents` | 12 |
| `products` | 10 |
| `subscriptions` | 9 |
| `subscription_schedules` | 6 |
| `subscription_items` | 5 |
| `invoiceitems` | 5 |
| **Total** | **126** |

The full slicing strategy (algorithm, allow-list rationale, what was dropped) is documented in [`slice.md`](./slice.md) for reproducibility.

## Notes

- Sliced for v0.1 single-call analysis budget; full Stripe spec is v0.2 material.
- `components.schemas` is kept intact (1385 entries) — schema pruning is brittle and not needed for the spike. The LLM reads the dereferenced spec, so unreferenced schemas don't add token cost where it matters.
- Stripe's spec carries no `tags` on operations, so the slice is by **path prefix** rather than by tag. This is functionally equivalent to Stripe's resource-domain grouping.
- To regenerate `spec.json` from the current upstream `master`:
  ```
  node scripts/spike/slice-stripe.mjs
  ```
