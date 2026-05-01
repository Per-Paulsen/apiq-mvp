# Reference Target — OpenWeatherMap Findings

> Manually-authored "gold standard" findings document for calibrating the apiq LLM analysis pipeline.
> 15 findings. Distribution: 3 critical, 5 high, 5 medium, 2 low. All three categories represented.
> Used as the coverage baseline (>=70% match required per Epic 00 Acceptance Criterion 4).
> Authoring date: 2026-05-01.

## Spec under review

- Source: `openapi-examples/openweathermap/spec.json`
- Endpoint count: 1
- OpenAPI version: 3.0.1

---

## Finding 1 — API key transported as a query parameter

- **category:** risk
- **severity:** critical
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Move API key from `appid` query parameter to an `Authorization` header scheme.

### narration

The only security scheme declared is `app_id`, an `apiKey` carried `in: query` under the parameter name `appid`. Every authenticated request to `GET /weather` therefore contains the secret in its URL. URLs are written verbatim into web-server access logs, browser history, CDN edge logs, intermediate proxies, error trackers (Sentry / Datadog), and the `Referer` header sent to any third-party host the response links to. Even if the rest of the transport is HTTPS, the credential is replicated at every observation point along the request path. For a paid API where the key is the unit of billing and rate-limiting, this is a credential-leak surface.

The fix is to model the credential as either an HTTP `Authorization` header (`type: http, scheme: bearer`) or a custom header `apiKey`. Header-borne credentials are not logged by default in most server stacks and are not part of the URL.

### rationale

OWASP API Security Top 10 (API2:2023 — Broken Authentication) explicitly calls out credentials carried in URLs as a high-risk anti-pattern because they bypass standard log-redaction practices. RFC 7235 / RFC 6750 establish the `Authorization` header as the conventional carrier for HTTP credentials precisely because intermediaries are expected not to log it.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/securitySchemes/app_id",
    "value": {
      "type": "apiKey",
      "in": "header",
      "name": "X-Api-Key",
      "description": "API key issued by OpenWeatherMap. Send as the X-Api-Key request header. Do not pass via query string."
    }
  }
]
```

---

## Finding 2 — Real working API key embedded in the spec

- **category:** risk
- **severity:** critical
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Remove the live API key value from the security scheme description.

### narration

The `description` of `components.securitySchemes.app_id` reads: *"API key to authorize requests. If you don't have an OpenWeatherMap API key, use `fd4698c940c6d1da602a70ac34f0b147`."* This is a real, working OpenWeatherMap key checked into the spec. Anyone consuming this OpenAPI document — code generators, documentation portals, CI mirrors, public registries — will redistribute the key. Because secret material loses confidentiality the moment it hits a public artifact and the only mitigation is rotation, this is a credential-disclosure issue, not a documentation issue.

The fix is to delete the literal key from the description (keeping only an instruction to obtain one via signup) and to rotate the key out-of-band in the operator's OpenWeatherMap account.

### rationale

OWASP ASVS V14.3 / SANS Top 25 CWE-798 ("Use of Hard-coded Credentials") apply here even though the spec is not "code" in the strict sense — the risk shape is identical: a credential is shipped in a redistributable artifact. Industry practice (GitHub secret scanning, GitGuardian, Trufflehog) treats embedded keys as findable by automated scanners regardless of whether they live in source files or schemas.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/securitySchemes/app_id/description",
    "value": "API key issued to your OpenWeatherMap account. Sign up at https://openweathermap.org/api to obtain one. Do not commit live keys to source-controlled spec files."
  }
]
```

---

## Finding 3 — Placeholder contact email

- **category:** risk
- **severity:** critical
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Replace the placeholder contact email with a routable mailbox.

### narration

`info.contact.email` is `some_email@gmail.com`. This is a default placeholder, not a real contact. Two concrete consequences. First, security researchers and integrators who discover an issue via this spec have no way to reach the maintainer — disclosure goes nowhere or to a bystander who happens to own the Gmail address. Second, any third party can register or claim a similarly-shaped Gmail address and impersonate the API owner in support contexts. For a spec advertised as the contract for a paid service, an unowned `Contact` block is a trust signal, not a documentation polish issue.

The fix is to point `info.contact.email` at a monitored security or support mailbox controlled by the API owner, ideally with a separate `info.contact.url` linking to a public security policy or API-status page.

### rationale

RFC 9116 ("A File Format to Aid in Security Vulnerability Disclosure") and the broader vulnerability-disclosure-program practice both depend on a discoverable, routable contact for the API owner. OpenAPI's `info.contact` is the spec-native equivalent of `security.txt` and should be filled in for the same reason.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/info/contact",
    "value": {
      "name": "OpenWeatherMap API Support",
      "url": "https://openweathermap.org/api",
      "email": "info@openweathermap.org"
    }
  }
]
```

---

## Finding 4 — No structured error schema; 404 returns plain text

- **category:** design
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Replace text/plain 404 body with an application/problem+json error schema.

### narration

The 404 response on `GET /weather` is declared as `text/plain` with a schema of `type: string` and `example: "Not found"`. A consumer parsing this response cannot programmatically distinguish between "the city name was misspelled", "the zip code is for a region we don't cover", and "the API key is missing" — all of which OpenWeatherMap actually returns 404 for in practice. Without a `code` / `message` / `details` envelope, error handling collapses to substring matching against a free-form string, which is fragile across language versions (the API supports 30+ via the `lang` parameter) and across server-side wording changes.

A stable error envelope (RFC 7807 Problem Details, or a project-defined `Error` schema with `code` / `message` / `details`) lets clients branch on `code` rather than on prose. It also unlocks consistent UX: every error renders the same way regardless of which endpoint produced it.

### rationale

RFC 7807 ("Problem Details for HTTP APIs") is the standardised solution. The advisory is that even when teams choose not to adopt RFC 7807 verbatim, every error response must carry a structured payload with a stable, documented enumeration of failure modes — not a free-form string. Microsoft's REST API guidelines and Zalando's RESTful API guidelines converge on this point.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/components/schemas/Problem",
    "value": {
      "title": "Problem",
      "type": "object",
      "description": "RFC 7807 Problem Details payload.",
      "required": ["type", "title", "status"],
      "properties": {
        "type": { "type": "string", "format": "uri", "description": "URI reference identifying the problem type." },
        "title": { "type": "string", "description": "Short, human-readable summary." },
        "status": { "type": "integer", "description": "HTTP status code." },
        "detail": { "type": "string", "description": "Human-readable explanation specific to this occurrence." },
        "instance": { "type": "string", "format": "uri", "description": "URI reference identifying the specific occurrence." }
      }
    }
  },
  {
    "op": "replace",
    "path": "/paths/~1weather/get/responses/404",
    "value": {
      "description": "No matching location was found for the supplied query.",
      "content": {
        "application/problem+json": {
          "schema": { "$ref": "#/components/schemas/Problem" }
        }
      }
    }
  }
]
```

---

## Finding 5 — Missing 400 / 401 / 429 / 5xx response definitions

- **category:** design
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Document 400, 401, 429, and 500 response definitions for `GET /weather`.

### narration

`GET /weather` declares only `200` and `404`. In real OpenWeatherMap traffic, a missing or revoked `appid` returns `401`, malformed parameters return `400`, exceeding the per-key call quota returns `429`, and outages return `5xx`. None of these are modelled. A code generator (openapi-generator, oazapfts, openapi-typescript) emits a client whose typed response union is `Success | NotFound`, so when the API returns 401 in production the typed client either falls into a `default`/unknown branch or — depending on the generator — throws an unmodelled exception. Either way, integrators silently lose error coverage.

Documenting these statuses also gives the API owner a place to anchor `headers` (e.g. `Retry-After` on 429) and to reuse the `Problem` schema introduced for the 404 response.

### rationale

The OpenAPI specification's responses object is intended to enumerate every status the API actually returns; consumers reasonably treat absence as "this status will not occur". Sound API design (Zalando, Microsoft REST guidelines) requires every endpoint to declare at minimum the 4xx and 5xx classes it can produce. OWASP API4:2023 (Unrestricted Resource Consumption) further argues that 429 must be modelled with `Retry-After` so clients can implement correct backoff.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/paths/~1weather/get/responses/400",
    "value": {
      "description": "The request was malformed or violated the parameter constraints.",
      "content": {
        "application/problem+json": {
          "schema": { "$ref": "#/components/schemas/Problem" }
        }
      }
    }
  },
  {
    "op": "add",
    "path": "/paths/~1weather/get/responses/401",
    "value": {
      "description": "The API key is missing or invalid.",
      "content": {
        "application/problem+json": {
          "schema": { "$ref": "#/components/schemas/Problem" }
        }
      }
    }
  },
  {
    "op": "add",
    "path": "/paths/~1weather/get/responses/429",
    "value": {
      "description": "The per-key call quota has been exceeded.",
      "headers": {
        "Retry-After": {
          "description": "Seconds to wait before retrying.",
          "schema": { "type": "integer", "minimum": 0 }
        }
      },
      "content": {
        "application/problem+json": {
          "schema": { "$ref": "#/components/schemas/Problem" }
        }
      }
    }
  },
  {
    "op": "add",
    "path": "/paths/~1weather/get/responses/500",
    "value": {
      "description": "An unexpected server error occurred.",
      "content": {
        "application/problem+json": {
          "schema": { "$ref": "#/components/schemas/Problem" }
        }
      }
    }
  }
]
```

---

## Finding 6 — Component schema named `200` (an HTTP status code)

- **category:** clarity
- **severity:** high
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Rename `components.schemas.200` to a descriptive name (`CurrentWeatherResponse`).

### narration

The success response schema is registered under `components.schemas["200"]` and referenced as `$ref: "#/components/schemas/200"`. Every other schema in the same components block uses PascalCase nouns (`Coord`, `Weather`, `Main`, `Wind`, `Clouds`, `Rain`, `Snow`, `Sys`), so this one stands out for two reasons. First, naming a schema after the HTTP status code that returned it is brittle — the moment the same shape is reused on a different endpoint or status, the name actively misleads. Second, generated client code from this spec will produce class names like `Model200` / `_200Response` / `Schema200` depending on the generator, all of which read as bugs to a consumer reviewing the SDK.

A direct, descriptive name (`CurrentWeatherResponse`, or split into `WeatherObservation` + envelope) makes both the spec and any generated SDK self-documenting.

### rationale

Both the OpenAPI Initiative's style guide and the de-facto conventions used by Stripe, GitHub, and the OpenAPI specification's own examples treat component schema names as stable, semantic identifiers — they end up as type names in every generated client. Naming by status code violates the "schemas describe shapes, not transport outcomes" principle.

### patchOps (RFC 6902)

```json
[
  {
    "op": "move",
    "from": "/components/schemas/200",
    "path": "/components/schemas/CurrentWeatherResponse"
  },
  {
    "op": "replace",
    "path": "/paths/~1weather/get/responses/200/content/application~1json/schema/$ref",
    "value": "#/components/schemas/CurrentWeatherResponse"
  }
]
```

---

## Finding 7 — All location parameters are optional but at least one is required; `lat`/`lon` must be paired

- **category:** design
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Document the `q` / `id` / `zip` / `lat`+`lon` mutual-exclusion rule in the operation description.

### narration

The endpoint accepts five mutually-substitutable location parameters (`q`, `id`, `lat`, `lon`, `zip`) and all are declared optional. The `info.description` admits the truth ("All parameters are optional, but you must select at least one parameter") but the spec itself does not encode it. A consumer that omits all five gets a 400 the spec does not describe; a consumer that supplies `q` and `id` and `zip` simultaneously gets undefined behaviour the spec does not warn about; and `lat`/`lon` are documented as "Must use with `lon`" / "Must use with `lat`" only in prose, so a generated client treats them as independently optional and lets you call `GET /weather?lat=35`.

This is the canonical case for an `oneOf` constraint at the operation level (or, since OpenAPI 3.0 cannot express cross-parameter constraints natively, for documenting the rule explicitly in the operation `description` and adding `required: true` on a synthetic wrapping body — accepting the v0.1 limitation that the spec cannot machine-enforce it). At minimum, mark each location parameter with `required: false` explicitly and add a clear `description`-level rule statement.

### rationale

OpenAPI 3.0 does not natively support cross-parameter validation, so the practical pattern is (a) document the constraint precisely in the operation `description`, (b) add the rule to each parameter's individual `description`, and (c) where possible, use a `oneOf` schema in a body or a query-object wrapper. Microsoft's REST API guidelines call this out as the "alternative-required-parameters" pattern. Without it, every consumer reinvents the validation logic.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/paths/~1weather/get/description",
    "value": "Access current weather data for any location on Earth including over 200,000 cities. Exactly one of the following location selectors must be supplied: q (city name), id (city ID), zip (postal code), or the lat+lon pair (which must be supplied together). Supplying multiple selectors yields a 400 response."
  },
  {
    "op": "add",
    "path": "/components/parameters/lat/required",
    "value": false
  },
  {
    "op": "add",
    "path": "/components/parameters/lon/required",
    "value": false
  }
]
```

---

## Finding 8 — `lat` and `lon` typed as `string` rather than bounded `number`

- **category:** design
- **severity:** high
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Type `lat` as number in [-90, 90] and `lon` as number in [-180, 180].

### narration

`components.parameters.lat` and `components.parameters.lon` are both declared with `schema: { type: "string" }`. Latitude and longitude are numeric quantities with well-known bounds (`[-90, 90]` and `[-180, 180]`), and OpenWeatherMap accepts them as decimal numbers in practice. Typing them as `string` forces every consumer to (a) generate a `string`-typed field in their SDK, (b) re-validate the format on the consumer side, and (c) pass values through their own number-to-string serialisation — three steps that should be the spec's job, not the consumer's.

The fix is straightforward: `type: number` with `format: float`, `minimum`, and `maximum`. A consumer's generated SDK then carries the bounds into compile-time or runtime validation for free.

### rationale

The OpenAPI specification's own JSON Schema integration is explicit that primitive types should be modelled as their natural type. The pattern of "type a number as a string because some legacy serializer is squeamish" is a well-known anti-pattern (Stripe's API guidelines, Zalando's API guidelines both call it out). Bounded types unlock client-side validation without code, which is the entire point of having a typed schema.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/parameters/lat/schema",
    "value": {
      "type": "number",
      "format": "float",
      "minimum": -90,
      "maximum": 90
    }
  },
  {
    "op": "replace",
    "path": "/components/parameters/lon/schema",
    "value": {
      "type": "number",
      "format": "float",
      "minimum": -180,
      "maximum": 180
    }
  }
]
```

---

## Finding 9 — Missing rate-limit hints on responses

- **category:** risk
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Add `X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers to the 200 response.

### narration

OpenWeatherMap's pricing model is explicitly call-volume-based — the free tier publishes a "60 calls/minute, 1,000,000 calls/month" cap, paid tiers are higher. A consumer building against the spec has no way to see the cap, no way to track remaining budget without making an extra observability request, and no way to detect when they are approaching it before they get hit with a 429. Documenting `X-RateLimit-*` (or `RateLimit` / `RateLimit-Policy` per RFC 9331) headers on the 200 response gives every successful call a low-cost signal of remaining budget, which consumers can use to throttle proactively rather than reactively.

This is a risk-shaped finding because the absence of the hint pushes the consumer toward "retry on 429" behaviour, which under load amplifies the outage rather than dampening it. Documenting the hint is a few lines of YAML; not documenting it is an invitation to thundering-herd retries.

### rationale

OWASP API4:2023 (Unrestricted Resource Consumption) and the IETF draft `RateLimit Header Fields for HTTP` (RFC 9331) both treat published rate-limit headers as the canonical way to coordinate client and server on consumption. Stripe, GitHub, and Twilio all expose them; the absence on a paid weather API is a deviation from real-world expectation.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/paths/~1weather/get/responses/200/headers",
    "value": {
      "X-RateLimit-Limit": {
        "description": "The maximum number of calls permitted in the current window.",
        "schema": { "type": "integer", "minimum": 0 }
      },
      "X-RateLimit-Remaining": {
        "description": "The number of calls remaining in the current window.",
        "schema": { "type": "integer", "minimum": 0 }
      },
      "X-RateLimit-Reset": {
        "description": "Seconds until the current rate-limit window resets.",
        "schema": { "type": "integer", "minimum": 0 }
      }
    }
  }
]
```

---

## Finding 10 — `units` default contradicts its description

- **category:** clarity
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Reconcile the `units` default — set `default: "standard"` to match the prose.

### narration

`components.parameters.units.schema.default` is `"imperial"`, but the `description` says: *"When you do not use units parameter, format is `standard` by default."* These two statements cannot both be true. A code generator that honours the `default` keyword will pre-populate the field with `"imperial"`, so a consumer who reads the description and assumes "if I don't pass it I get standard" will silently get Fahrenheit and miles-per-hour instead of Kelvin and metres-per-second.

This is a documentation-vs-machine-readable disagreement that resolves only one way: the schema's `default` is what client generators honour, and OpenWeatherMap's actual server-side default is `standard` (Kelvin), so the description is correct and the `default` field is wrong. Flipping the default to match avoids unit mismatches in generated SDKs.

### rationale

The OpenAPI specification states that `default` is what tooling will substitute when a value is absent. Whenever a `default` and a description disagree, the resolution rule is to make them agree by changing whichever one contradicts the actual server behaviour. The cost of this finding is one character; the cost of leaving it in is potentially every consumer generating a metric/imperial conversion bug.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/parameters/units/schema/default",
    "value": "standard"
  }
]
```

---

## Finding 11 — Server URL has trailing slash

- **category:** design
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Strip the trailing slash from the `servers[0].url` value.

### narration

`servers[0].url` is `"https://api.openweathermap.org/data/2.5/"` — note the trailing slash. The path templates in `paths` start with `/` (e.g. `/weather`). When tooling concatenates the two, a strict implementation produces `https://api.openweathermap.org/data/2.5//weather` (double slash); a permissive implementation silently normalises. Different OpenAPI clients fall on different sides of this: Swagger UI, redoc, and openapi-generator are tolerant; some hand-rolled fetch wrappers are not, and the underlying HTTP semantics treat the two paths as distinct (RFC 3986 path normalisation does *not* collapse adjacent slashes).

The fix is a one-character edit: drop the trailing slash from the server URL. The OpenAPI 3.x specification recommends server URLs that do not end with `/`, and every documented Stripe/GitHub/Twilio server URL follows this rule.

### rationale

OpenAPI 3.x specification text (Server Object) demonstrates server URLs without trailing slashes; the OpenAPI Initiative's published style guidance treats trailing slashes as an inconsistency. RFC 3986 confirms that double slashes in the path component are semantically distinct from single slashes — so the bug is not "unsightly", it is a real URL-construction defect.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/servers/0/url",
    "value": "https://api.openweathermap.org/data/2.5"
  }
]
```

---

## Finding 12 — `mode` enum lists `json` while the description treats `json` as the empty-default

- **category:** clarity
- **severity:** medium
- **scope:** endpoint
- **affectedEndpoints:**
  - GET /weather
- **patchSummary:** Drop `json` from the `mode` enum; document `json` as the implicit default for an absent value.

### narration

`components.parameters.mode` declares `enum: ["json", "xml", "html"]` with `default: "json"` and a description that reads: *"Possible values are `xml` and `html`. If mode parameter is empty the format is `json` by default."* The description and the schema disagree about whether `json` is a value that may be supplied. If `json` is truly only the implicit default for an absent parameter, it should not appear in the enum (and no `default` is needed); if `json` is a valid value to supply, the description's "Possible values are `xml` and `html`" wording is wrong.

A consumer relying on machine-readable validation will accept `json` as a value; a consumer reading the description will not pass it. Either resolution is fine, but the spec must pick one. The conservative fix is to remove `json` from the enum and the `default` keyword (matching the description's behaviour, which is server-defined "no `mode` parameter means JSON").

### rationale

OpenAPI's `enum` defines the *complete* set of acceptable values; OpenAPI's `default` defines what tooling substitutes when a value is absent. These two keywords therefore must be consistent with the prose description. Whenever the description, enum, and default disagree, the schema is by definition ambiguous and consumers will diverge.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/parameters/mode/schema",
    "value": {
      "type": "string",
      "enum": ["xml", "html"]
    }
  },
  {
    "op": "replace",
    "path": "/components/parameters/mode/description",
    "value": "Mode. Example: html. Selects an alternative response format. Permitted values: xml, html. Omitting this parameter returns JSON, which is the default and only available format when this parameter is absent."
  }
]
```

---

## Finding 13 — Numeric-prefixed property names `Rain.3h` and `Snow.3h`

- **category:** clarity
- **severity:** medium
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Rename `3h` to `last3h` on `Rain` and `Snow` schemas.

### narration

`components.schemas.Rain` and `components.schemas.Snow` each have a single property literally named `3h`. Property names that start with a digit are valid JSON, but they cannot be projected into Java/Kotlin/C#/Go/Rust field names without an explicit `@JsonProperty` / serde-rename annotation, and they are awkward in JavaScript (`obj.3h` is a syntax error; consumers are forced into `obj["3h"]`). Generated SDKs in those languages either rename the field to something like `_3h` / `n3h` / `Rain3H`, or refuse to compile, depending on the generator.

The fix is to rename the property to a leading-letter form (`last3h`, `volumeLast3h`) and document the meaning in the description. Because this is a breaking change for existing consumers, in a real-world rollout it would happen behind a versioned namespace; in the spec we document the new name and note the deprecation.

### rationale

JSON itself permits any string key, but the JSON ecosystem (JS-as-a-language, JSON Schema property-name conventions, code generators for typed languages) consistently treats identifier-shaped names as a precondition for ergonomic SDKs. The OpenAPI Initiative's style guide and Microsoft's REST API guidelines both recommend that schema property names be valid identifiers in the major target languages — meaning leading letter, underscores or alphanumerics afterward.

### patchOps (RFC 6902)

```json
[
  {
    "op": "add",
    "path": "/components/schemas/Rain/properties/last3h",
    "value": {
      "type": "integer",
      "format": "int32",
      "description": "Rain volume over the last 3 hours, in millimetres.",
      "example": 3
    }
  },
  {
    "op": "remove",
    "path": "/components/schemas/Rain/properties/3h"
  },
  {
    "op": "add",
    "path": "/components/schemas/Snow/properties/last3h",
    "value": {
      "type": "number",
      "description": "Snow volume over the last 3 hours, in millimetres.",
      "example": 6
    }
  },
  {
    "op": "remove",
    "path": "/components/schemas/Snow/properties/3h"
  }
]
```

---

## Finding 14 — "Internal parameter" fields documented but not explained

- **category:** clarity
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Either explain or mark as unstable the fields documented as "Internal parameter".

### narration

Five fields in the response schema are described literally as `"Internal parameter"`: the response-root `base` and `cod`, plus `Sys.type`, `Sys.id`, and `Sys.message`. A consumer reading the spec has no way to know whether these fields are stable, whether they should be parsed, whether they will change shape on a future release, or whether they are meant for support tickets only. Including them in the documented response schema while also signalling "you should not look at this" is the worst of both worlds — consumers will end up parsing them anyway because they are present, and they will break when the field shape drifts.

The fix is one of two paths: either document what each "internal" field is and what stability guarantee it carries, or mark the fields with a clear "do not rely on this — may change without notice" annotation, so a consumer knows to skip them.

### rationale

The OpenAPI specification's `description` field is the canonical place to set stability expectations. The de-facto convention across API style guides (Stripe, Microsoft, Google) is that anything in a published response schema is part of the contract unless explicitly marked otherwise. A field documented as "Internal parameter" is neither — it is in the contract by virtue of being in the schema, but the description withholds the meaning. That is unstable by construction.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/schemas/200/properties/base/description",
    "value": "Internal weather-station-source identifier. Subject to change without notice; not part of the consumer contract."
  },
  {
    "op": "replace",
    "path": "/components/schemas/200/properties/cod/description",
    "value": "Internal status code echo, mirroring the HTTP status. Subject to change without notice; consumers should branch on the HTTP status code, not on this field."
  },
  {
    "op": "replace",
    "path": "/components/schemas/Sys/properties/type/description",
    "value": "Internal system marker. Subject to change without notice; not part of the consumer contract."
  },
  {
    "op": "replace",
    "path": "/components/schemas/Sys/properties/id/description",
    "value": "Internal system identifier. Subject to change without notice; not part of the consumer contract."
  },
  {
    "op": "replace",
    "path": "/components/schemas/Sys/properties/message/description",
    "value": "Internal diagnostic value. Subject to change without notice; not part of the consumer contract."
  }
]
```

---

## Finding 15 — Typo "cordinate" in `lat` and `lon` parameter descriptions

- **category:** clarity
- **severity:** low
- **scope:** spec
- **affectedEndpoints:**
- **patchSummary:** Fix the spelling "cordinate" -> "coordinate" in `lat` and `lon` descriptions.

### narration

`components.parameters.lat.description` reads "The latitude cordinate of the location of your interest." and `components.parameters.lon.description` reads "Longitude cordinate of the location of your interest." Both contain the same misspelling of "coordinate". This is the most superficial finding in the document, but typo-level errors in a published spec are a small but real signal: they indicate the spec has not been through editorial review, and they degrade the impression of polish for first-time readers (engineers evaluating the API for adoption).

The fix is a string replacement on both descriptions.

### rationale

Documentation quality contributes to the perceived professionalism of an API and to the velocity at which consumers can integrate. Typos in published surfaces are the easiest finding to fix and the easiest to verify, which is why they belong in any review pass — not because each typo is consequential, but because their accumulation correlates with bigger documentation-debt that is harder to detect.

### patchOps (RFC 6902)

```json
[
  {
    "op": "replace",
    "path": "/components/parameters/lat/description",
    "value": "Latitude. Example: 35. The latitude coordinate of the location of your interest. Must use with lon."
  },
  {
    "op": "replace",
    "path": "/components/parameters/lon/description",
    "value": "Longitude. Example: 139. Longitude coordinate of the location of your interest. Must use with lat."
  }
]
```
