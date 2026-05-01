# dnd5eapi.co — D&D 5e API

Small, hobbyist-grade public API used as the **"messy" calibration spec** for the apiq research spike. Picked from APIs.guru.

## Source

- **APIs.guru entry:** [`dnd5eapi.co`](https://api.apis.guru/v2/specs/dnd5eapi.co/0.1/openapi.json)
- **Upstream API repo:** [github.com/5e-bits/5e-srd-api](https://github.com/5e-bits/5e-srd-api)
- **Upstream data repo:** [github.com/5e-bits/5e-database](https://github.com/5e-bits/5e-database) (some versions live under `bagelbits/`)
- **API version (per spec):** `0.1`
- **OpenAPI version:** `3.0.1`
- **Pulled:** 2026-05-01 (from APIs.guru's mirror)

## License

**MIT** — declared explicitly in `info.license`:

```json
{
  "name": "MIT License",
  "url": "https://github.com/5e-bits/5e-srd-api/blob/main/LICENSE.md"
}
```

The underlying *data* (D&D rules) is published under the WotC Open Game License (OGL) per the SRD; the spec and API code itself are MIT.

## Endpoint count

**47 operations** across 47 paths. No slicing — fits comfortably under the 200-endpoint single-call budget.

Tag distribution:

| Tag | Ops |
| - | -: |
| Character Data | 6 |
| Subclasses | 5 |
| Class Resource Lists | 4 |
| Class Levels | 4 |
| Equipment | 4 |
| Races | 4 |
| Class | 3 |
| Game Mechanics | 3 |
| Subraces | 3 |
| Common | 2 |
| Monsters | 2 |
| Rules | 2 |
| Spells | 2 |
| Feats | 1 |
| Features | 1 |
| Traits | 1 |

## Why this spec was picked

Selection criteria from the spike kickoff: 20-80 endpoints, obviously not polished, permissive license, single-file JSON, not a copy of Stripe/PagerDuty/Twilio/GitHub, prefer SaaS / dev-tool over government. After probing 15 candidates from APIs.guru's permissive-license + dev-tool/SaaS/open-data shortlist, this one is the **clearest "real-world messiness" signal** in the right size band.

## What makes it "messy"

This is the part that matters for the spike. dnd5eapi exhibits the kind of imperfection apiq exists to surface:

1. **Every operation is missing `operationId`.** All 47 of 47. SDK generators will fall back to method+path-based names; tooling that relies on `operationId` for uniqueness or cross-referencing will struggle.
2. **53% of operations have no `description`.** 25 of 47 carry `summary` only.
3. **No formal response schemas.** Sample operations declare responses as `responses.200.content.application/json.example` with an inline JSON example, not via `schema:` or `$ref:`. The spec describes shapes by example, not by contract.
4. **In-prose schema definitions.** The `info.description` markdown blob defines several core domain types (`APIReference`, `DC`, `Damage`, `Choice`, `OptionSet`, `Option`) inline as prose pseudo-code, instead of as `components.schemas` entries. The actual `components.schemas` has 49 entries, but the most central polymorphic types are described in the description text instead of as schemas.
5. **A `localhost:3000` dev server in `servers[]`.** Two server entries: `https://www.dnd5eapi.co` (production) and `http://localhost:3000` (Local Development). Leaving the local-dev server in a published spec is a common smell.
6. **No security scheme.** The API is genuinely public (the description says so), but the spec has no `securitySchemes` at all — making "is this intentional or forgotten?" exactly the kind of question apiq should help with.
7. **Hobby-project provenance.** Built and maintained by a community on a Discord server. Not enterprise-curated.

## Candidates considered and rejected

From the 53-API permissive-license + dev-tool/SaaS/open-data shortlist, after probing endpoint counts and quality signals:

| Candidate | Ops | Why rejected |
| - | -: | - |
| `redeal.io` | 1 | Too small. |
| `openfigi.com` | 2 | Too small. |
| `color.pizza` | 4 | Too small. |
| `mtaa-api.herokuapp.com` | 5 | Too small. |
| `mermade.org.uk:openapi-converter` | 6 | Too small. |
| `canada-holidays.ca` | 6 | Too small; also gov-data. |
| `apache.org:qakka` | 10 | Too small. |
| `patrowl.local` | 14 | Below band. |
| `corrently.io` | 26 | In band, but too polished (0 missing ids/descs). |
| `microcks.local` | 44 | In band, sparse descriptions (28/44 missing) — a strong runner-up. Less hobby-grade than dnd5eapi though, and `operationId` coverage is much higher. |
| **`dnd5eapi.co`** | **47** | **Picked.** |
| `apicurio.local:registry` | 64 | In band, but too polished. |
| `etherpad.local` | 96 | Above band. |
| `anchore.io` | 112 | Above band. |
| `osf.io` | 156 | Above band. |

`microcks.local` (Apache 2.0, dev-tool, 44 ops) is the strongest backup if dnd5eapi turns out to be unrepresentative. Its messiness is "sparse documentation" rather than "every operation is missing the most basic identity field," which is a different and less spike-revealing kind of mess.

## Verification

```
openapi: 3.0.1
title: D&D 5e API
version: 0.1
license: MIT License
paths: 47
endpoint count: 47
ops without operationId: 47 / 47
ops with description: 22 / 47
ops with summary: 47 / 47
servers: 2
schemas: 49
```
