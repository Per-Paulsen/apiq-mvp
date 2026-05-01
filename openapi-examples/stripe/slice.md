# Stripe slice — reproducibility note

This document is the source of truth for **what was kept and what was dropped** when reducing the upstream Stripe OpenAPI spec to the 126-endpoint slice in `spec.json`. Anyone reading this should be able to reproduce the same slice deterministically, byte-for-byte.

The slicing script is [`scripts/spike/slice-stripe.mjs`](../../scripts/spike/slice-stripe.mjs). This document explains *why* the script does what it does.

## Source

```
URL:    https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json
Repo:   github.com/stripe/openapi
Branch: master
Commit: 011d8e301d28a95e1b8898229954d79da3e0fa43  (2026-04-28)
```

The full upstream spec is **587 operations across 414 paths** (`openapi: 3.0.0`, `info.version: 2026-04-22.dahlia`). It is ~7.5 MB of JSON.

## Why slice

The v0.1 PRD pre-commits to **single-call analysis** with a soft cap of ~200 endpoints (brainstorming A1 / B4). 587 endpoints would (a) blow the context budget, (b) dilute the reference signal across surface area apiq doesn't need to calibrate against, and (c) not match real-world v0.1 inputs anyway.

## Why path-prefix instead of tags

The originally-suggested slicing strategy was "keep operations whose `tags[]` intersects an allow-list of common Stripe domains (`Charges`, `Customers`, `Invoices`, `PaymentIntents`, `Subscriptions`, `Products`)". That doesn't work — Stripe's `spec3.json` has **no `tags` field on any operation** and **no top-level `tags` array**. (Verified: `0 / 587` operations carry tags; checked all `x-*` extensions on a sample operation, none of them are grouping markers either.)

Path prefix is functionally equivalent. Stripe's URL design groups resources by domain (`/v1/customers/...`, `/v1/charges/...`), and the prefix maps cleanly to the originally-requested allow-list:

| Original allow-list tag | Path prefix(es) used |
| - | - |
| `Charges` | `charges` |
| `Customers` | `customers` |
| `Invoices` | `invoices`, `invoiceitems` |
| `PaymentIntents` | `payment_intents` |
| `Subscriptions` | `subscriptions`, `subscription_items`, `subscription_schedules` |
| `Products` | `products` |

`invoiceitems` is included with invoices because it's the line-item resource for invoice composition. `subscription_items` and `subscription_schedules` are included with subscriptions because they're the dependent resources you cannot use subscriptions without.

## Algorithm

1. Fetch upstream `openapi/spec3.json`.
2. For each path key in `spec.paths`:
   - Strip a leading `/` and a leading `v1/` from the key.
   - Take the first segment as the **prefix**.
   - If the prefix is in `ALLOW_PREFIXES`, **keep the entire path-item** (every method/operation under it).
   - Otherwise, drop the path entirely.
3. Build the output spec preserving these top-level fields **AS-IS**: `openapi`, `info`, `servers`, `security`, `components`. (No top-level `tags` exists upstream, so nothing to filter there.)
4. Write the result to `openapi-examples/stripe/spec.json` pretty-printed with 2-space indent.

`ALLOW_PREFIXES` (verbatim, from `slice-stripe.mjs`):

```
charges
customers
invoices
invoiceitems
payment_intents
products
subscriptions
subscription_items
subscription_schedules
```

## What was kept (kept-by-prefix breakdown)

| Prefix | Operations |
| - | -: |
| `customers` | 47 |
| `invoices` | 18 |
| `charges` | 14 |
| `payment_intents` | 12 |
| `products` | 10 |
| `subscriptions` | 9 |
| `subscription_schedules` | 6 |
| `invoiceitems` | 5 |
| `subscription_items` | 5 |
| **Total** | **126** |

All 126 operations have `operationId` and `description`; 113 have `summary`.

## What was dropped (top-15, by operation count)

| Prefix | Operations dropped |
| - | -: |
| `test_helpers` | 44 |
| `treasury` | 33 |
| `issuing` | 32 |
| `accounts` | 29 |
| `terminal` | 26 |
| `billing` | 24 |
| `tax` | 14 |
| `radar` | 12 |
| `financial_connections` | 11 |
| `quotes` | 10 |
| `climate` | 9 |
| `identity` | 8 |
| `credit_notes` | 8 |
| `payment_records` | 8 |
| `transfers` | 8 |

(67 dropped prefix groups in total, accounting for 461 operations.)

## What was *not* pruned

- **`components.schemas`** stays intact (1385 entries). Pruning unused schemas after slicing paths is brittle (transitive `$ref` resolution, `oneOf`/`allOf`/`discriminator` chains, polymorphic types referenced only as response variants) and the spike harness dereferences the spec anyway, so the schemas-not-referenced-by-kept-paths will not appear in the LLM's input. v0.1 not worth the engineering. v0.2 if needed.
- **`info`, `servers`, `security`** stay intact.

## Reproducing

```
node scripts/spike/slice-stripe.mjs
```

Will print a kept/dropped breakdown matching the tables above (modulo upstream changes since commit `011d8e30`). If upstream has drifted, the script will produce a slightly different `spec.json`; the algorithm and allow-list are unchanged, so the slice is still well-defined.
