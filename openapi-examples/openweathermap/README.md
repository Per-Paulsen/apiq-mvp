# OpenWeatherMap

Reference-target spec for the apiq research spike (Epic 00). Used to calibrate the LLM analysis prompt against a manually-authored "gold standard" findings document at `reference/findings-target.md`.

## Source

- Origin: This is the well-known APIs.guru-curated OpenWeatherMap OpenAPI sample, hosted in mirror form at <https://github.com/akashtalole/OpenAPI-Spec-Samples/blob/main/OpenWeatherMap-openapi.json>. The spec was originally derived from a Swagger 2.0 example used by Swagger Inc. as a tutorial sample for the OpenWeatherMap public 2.5 API; the OpenAPI 3.x conversion is the canonical "small public API" surface widely cited in OpenAPI tutorials.
- The current APIs.guru directory no longer lists `openweathermap.org` (the entry was retired upstream); the akashtalole mirror preserves the historical content unchanged.
- Source URL (download): <https://raw.githubusercontent.com/akashtalole/OpenAPI-Spec-Samples/main/OpenWeatherMap-openapi.json>
- Stored locally as `spec.json` (formatted with 2-space indent; otherwise unmodified).

## License

`info.license` declares **CC Attribution-ShareAlike 4.0 (CC BY-SA 4.0)** with URL <https://openweathermap.org/price>. The spec content is therefore redistributable under CC BY-SA 4.0, which is compatible with use as an in-repo development fixture.

## Spec details

- Original spec version: **OpenAPI 3.0.1** (no Swagger 2.0 → 3.x conversion was needed; the source already declared `openapi: "3.0.1"`).
- Endpoint count: **1** (`GET /weather`).
- Component schemas: 9 (response root, `Coord`, `Weather`, `Main`, `Wind`, `Clouds`, `Rain`, `Snow`, `Sys`).
- Security: single `apiKey`-in-query scheme `app_id` named `appid`.

## Why this spec for the spike

The OpenWeatherMap API is small, well-known, and sentimentally tied to the project's 2019 origin (per `prd.md`). Its single-endpoint surface and rich response schema make it the natural reference target for the spike: small enough that a senior engineer can hand-author a complete findings document in one pass, real enough that the LLM has to deal with concrete API-design issues (API key in query string, unstandardised error responses, schema named after an HTTP status code, leaking internal fields, snake_case mixed with numeric-prefixed property names, etc.) rather than synthetic textbook problems.
