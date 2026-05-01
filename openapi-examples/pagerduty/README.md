# PagerDuty API (sliced)

Sliced subset of the PagerDuty public REST OpenAPI specification. Mid-sized real-world product API used as one of the four calibration specs for the apiq research spike.

## Source

- **Repository:** [github.com/PagerDuty/api-schema](https://github.com/PagerDuty/api-schema)
- **File:** `reference/REST/openapiv3.json` on `main`
- **Commit pulled:** `a042fe53fe27a95474198bb6f3b7caa5c6ce79dd` (2026-04-30)
- **API version:** `2.0.0` (per `info.version`)
- **OpenAPI version:** `3.0.2`

## License

**Not explicitly declared.**

The repository has no `LICENSE` / `LICENSE.md` file, no `info.license` field in the spec, and no GitHub-detectable license (the GitHub `/license` API returns 404). The repo's `README.md` describes the schema as "our OpenAPI defined public APIs" published from an internal source for documentation purposes, and the repo accepts pull requests against the OpenAPI files.

For research-spike purposes (local development, no redistribution, no derived product), we treat this as **public-developer-documentation** and consume it under fair use as published API reference material. **Do not redistribute** this spec as part of the apiq product without re-checking PagerDuty's terms.

If license clarity is required before product use, raise an issue on the upstream repo and update this README with the resolution.

## Endpoint counts

| | Endpoints | Paths |
| - | - | - |
| Original (full PagerDuty spec) | **419** | 246 |
| Sliced (this folder, `spec.json`) | **183** | 105 |

Slicing is required because the full spec exceeds the v0.1 single-call analysis budget of ~200 endpoints (brainstorming A1 / B4).

## What was kept

The slice keeps the **incident-response operational core** — the surface area someone running PagerDuty actually touches day-to-day. Operations are kept iff their `tags[]` intersects this allow-list:

| Tag | Operations kept |
| - | -: |
| `Users` | 37 |
| `Incidents` | 29 |
| `Schedules_v3` | 24 |
| `Services` | 19 |
| `Teams` | 14 |
| `Webhooks` | 12 |
| `Schedules` | 11 |
| `Tags` | 7 |
| `Change Events` | 6 |
| `Escalation Policies` | 6 |
| `Extensions` | 6 |
| `Maintenance Windows` | 5 |
| `Service Dependencies` | 4 |
| `Log Entries` | 3 |
| **Total** | **183** |

## What was dropped

Top-level tags filtered out (kept top-level `tags` array shrinks from 42 entries to 14). Largest dropped tag groups, by operation count:

- `Event Orchestrations` (39), `Status Pages` (26), `Automation Actions` (25)
- `Analytics` (16), `Business Services` (16), `Incident Workflows` (15)
- `Incident Types` (14), `Rulesets` (10), `Service Custom Fields` (10)
- `Incident Custom Fields` (9), `Workflow Integrations` (8), `Templates` (7)
- plus 16 smaller tag groups

These are real PagerDuty product surfaces but are peripheral to the operational-core scenarios apiq calibrates against in v0.1.

## Slicing algorithm

Documented inline in [`scripts/spike/slice-pagerduty.mjs`](../../scripts/spike/slice-pagerduty.mjs). Summary:

1. Fetch upstream `openapiv3.json`.
2. For each operation under each path: keep iff `op.tags ∩ ALLOW_TAGS ≠ ∅`.
3. If a path-item has zero kept operations, drop the path entirely.
4. Filter top-level `tags[]` to those still referenced by kept operations.
5. Keep `info`, `servers`, `security`, `components` AS-IS.
6. Write `spec.json` pretty-printed with 2-space indent.

To regenerate `spec.json` from the current upstream `main`:

```
node scripts/spike/slice-pagerduty.mjs
```

## Notes

- All 183 kept operations have an `operationId`, a `description`, and (with one exception) a `summary`. The full PagerDuty spec is well-curated even before slicing — this is *not* the "messy" spec; that role goes to `dnd5eapi/`.
- `components.schemas` is kept intact (272 entries) for the same reasons described in `stripe/slice.md`.
