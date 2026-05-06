# IANA Registry Snapshots

Spec-agnostic snapshots of the IANA registries that apiq-Wave-2 detector tasks need to validate against.

**Last snapshot:** 2026-05-06
**Refresh cadence:** quarterly (next: 2026-08-06)
**Owner:** Stage A / T22

## Why hand-curated snapshots?

Wave-2 deterministic walkers need to know whether an OpenAPI spec uses IANA-registered values for HTTP status codes, methods, headers, link relations, cache directives, media types, and range units. Pulling these registries at run-time would:

1. Introduce a network dependency in CI (apiq is offline-capable).
2. Mean a specs findings shift if IANA mid-flight registers a new value.
3. Cost time on every analysis run.

Snapshotting at apiq release-time + refreshing quarterly trades currency for determinism, which is the right call for a deterministic-rules layer that must stay reputation-load-bearing ("apiq must not miss what mature linters find, but also must not flag false-negatives because IANA churned a registry overnight").

## Sources

| Module | IANA URL | CSV mirror | Snapshot count |
|---|---|---|---|
| `status-codes.ts` | https://www.iana.org/assignments/http-status-codes/http-status-codes.xhtml | `.../http-status-codes-1.csv` | 64 codes |
| `methods.ts` | https://www.iana.org/assignments/http-methods/http-methods.xhtml | `.../methods.csv` | 41 methods (incl. WebDAV/deltav) |
| `link-relations.ts` | https://www.iana.org/assignments/link-relations/link-relations.xhtml | `.../link-relations-1.csv` | 133 relations |
| `cache-directives.ts` | https://www.iana.org/assignments/http-cache-directives/http-cache-directives.xhtml | `.../cache-directives.csv` | 16 directives |
| `media-types.ts` | https://www.iana.org/assignments/media-types/media-types.xhtml | (top-levels only) | 11 top-levels + 16 suffixes |
| `field-names.ts` | https://www.iana.org/assignments/http-fields/http-fields.xhtml | `.../field-names.csv` | 185 perm + 23 prov + 8 dep + 39 obs = 255 |
| `range-units.ts` | https://www.iana.org/assignments/http-parameters/http-parameters.xhtml#range-units | (RFC 9110 §14) | 2 units (bytes, none) |

## Refresh workflow (manual quarterly)

For each registry above:

1. **Fetch the canonical CSV** via curl with TLS-revocation tolerated on Windows:
   ```bash
   curl -sk "https://www.iana.org/assignments/<registry-slug>/<file>.csv" -o /tmp/<file>.csv
   ```
   On macOS/Linux drop the `-k` (cert-revocation works there).

2. **Diff against existing snapshot** by extracting the first column (entry name) from the CSV and comparing to the in-source Set.

3. **Update the source file** by adding new entries, marking removed/obsoleted entries (do NOT delete entries — backwards-compat for old specs).

4. **Bump the `Snapshot date:` comment** in the source file header.

5. **Update this READMEs `Last snapshot:` line + counts table.**

6. **Run `npm run test`** in `scripts/spike/` — should pass without code changes; if a test fixture asserts a specific entry that has been deprecated, update the fixture.

7. **Commit** with `chore: refresh IANA snapshot YYYY-MM-DD`.

## Fallback if iana.org is unreachable

The CSVs are mirrored at:
- IETF httpwg working-copy: https://github.com/httpwg/http-extensions
- Mnots shadow: https://httpwg.github.io/http-extensions/

For media-type registry specifically, the IANA HTTP page can be slow; the structured-suffix sub-registry lives at https://www.iana.org/assignments/media-type-structured-suffix/.

## Coverage

This snapshot is the foundation for these Wave-2 tasks:

- **T10 http-protocol-pairings** (RFC2-14/15/20-26/30-32/40-41/48/94/96): consumes status-codes + methods + field-names + cache-directives.
- **T13 media-type-IANA-validator** (RFC2-75..80): consumes media-types.
- **RFC2-16** (status code IANA-registered): consumes status-codes.
- **RFC2-35..39** (cache-directives): consumes cache-directives.
- **RFC2-52..55** (Link rel-token): consumes link-relations.
- **RFC2-30..34** (Range / Accept-Ranges): consumes range-units + field-names.

Detectors that need finer-grained registry data than what these helpers expose can import the underlying entries (`HTTP_STATUS_ENTRIES`, `HTTP_METHOD_ENTRIES`, etc.) and walk them directly.
