# Epic 21 — CLI

> `@apiq/cli` npm package — `apiq check / apply / preview / share / login / logout / whoami` commands. Auth via `~/.apiqrc` (shared with MCP server). Settings UI for API-key management at `/settings/api-keys`. Local Prism preview as optional dependency.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Distribution & Viral block" row "CLI", §2 entry-point (2), [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"CLI".

## Scope

### npm package `@apiq/cli`

- New top-level directory `cli/` (sibling to `mcp-server/`):
  - `cli/package.json` — `name: @apiq/cli`, version `0.1.0`.
  - `cli/src/index.ts` — entry, parses argv via `commander` (~10 KB).
  - `cli/src/commands/{check,apply,preview,share,login,logout,whoami}.ts` — one file per command.
  - `cli/src/lib/{api-client,auth,format-output}.ts` — helpers.
  - `cli/tsconfig.json` + build script `npm run build:cli`.
- Bin entry: `bin/apiq.js` → invokes compiled `cli/dist/index.js`.
- Dependencies: `commander`, `chalk` (terminal colors), `ora` (spinners). Optional: `@stoplight/prism-cli` as `optionalDependencies` for `apiq preview`.

### Command surface

```
apiq check <file>
  Options:
    --json            Emit JSON instead of pretty-print
    --markdown        Emit markdown findings (Epic 22 format)
    --severity=<x>    Filter to severity ≥ x (critical | high | medium | low)
  Behaviour:
    - Reads file, calls apiq.dev/api/cli/check (or analyze) with bearer-token
    - Default exit code 0; exit 1 if any critical findings exist (CI-friendly gate)

apiq apply <file>
  Options:
    --critical-only       Apply only critical
    --severity=<x>        Apply severity ≥ x
    --finding=id1,id2     Apply specific findings
    --dry-run             Show diff, don't modify file
    --no-backup           Skip .bak file creation (default: backup is on)
  Behaviour:
    - Reads file, sends to apiq.dev to analyze (if not already), apply patches in scope, write modified spec back to file
    - Default: creates <file>.bak before mutation

apiq preview <file>
  Options:
    --port=<n>            Port for local preview (default: 5173)
  Behaviour:
    - Boots local Stoplight Elements + Prism on localhost:<port>
    - Requires @stoplight/prism-cli (prompts to install on first use)

apiq share <file>
  Options:
    --expires=<duration>  e.g. "30d", "1y", "never" (default: never)
  Behaviour:
    - Uploads spec, runs analysis, generates share-link, copies to clipboard, prints URL

apiq login
  Behaviour:
    - Prompts for API key (stdin, masked)
    - Validates against apiq.dev/api/auth/whoami
    - Saves to ~/.apiqrc as { apiKey: "..." }
    - chmod 600 the file

apiq logout
  Behaviour:
    - Deletes ~/.apiqrc

apiq whoami
  Behaviour:
    - Reads ~/.apiqrc, calls /api/auth/whoami
    - Prints "Logged in as <email> (workspace: <name>)" or "Not logged in"
```

Anonymous CLI calls allowed (no `~/.apiqrc` present): `check` works against the anonymous-demo backend (1/IP/24h) — useful for quick try-it without signup. `apply / share / preview` require login.

### `~/.apiqrc` format

```json
{
  "apiKey": "apiq_pk_...",
  "lastUsedAt": "2026-05-03T12:00:00Z"
}
```

Path resolution: `os.homedir() + '/.apiqrc'`. Permissions chmod 600 on creation.

### Local Prism preview (`apiq preview`)

- `@stoplight/prism-cli` listed in `cli/package.json` as `optionalDependencies` (~50 MB transitively).
- `apiq preview <file>` command:
  - Detects if `prism-cli` resolves; if not, prompt: *"Local preview requires @stoplight/prism-cli (~50MB). Install? [Y/n]"* → on Y, runs `npm install --no-save @stoplight/prism-cli` (or recommend global install).
  - Once available: spawns Prism mock against the file (`prism mock <file> --port <n+1>`).
  - Boots a tiny static HTML page on `localhost:<port>` serving Stoplight Elements pointed at the Prism mock.
  - Opens the browser via `open` package.
  - On Ctrl+C, kills both processes.

### API-Keys management UI (`/settings/api-keys`)

Schema already added in Epic 20 (`ApiKey` model). This epic ships the UI:

- New route `src/app/(app)/settings/api-keys/page.tsx`:
  - Table of existing keys: Name | Prefix (display only first 8 chars + `...`) | Created | Last used | Actions (Revoke).
  - "Generate new key" button → modal:
    - Input: `name` (required, 1–50 chars).
    - On submit → server action `createApiKeyAction({ name })` returns `{ id, plaintextKey, prefix }`.
    - Modal then displays the FULL plaintext key with a Copy button + warning *"Save this key now — you won't see it again."*.
    - On modal close, plaintext key is forgotten (only `hashedKey` + `prefix` persisted).
  - "Revoke" button per row → confirm modal → `revokeApiKeyAction({ id })` sets `revokedAt`. Subsequent CLI/MCP calls with this key get 401.
- Server actions `createApiKeyAction`, `revokeApiKeyAction` in `src/app/(app)/settings/api-keys/actions.ts`:
  - `createApiKeyAction({ name })`:
    - Generate random 22-char base62 key body → `apiq_pk_<body>`.
    - Compute prefix (first 12 chars: `apiq_pk_<first 4>`). Bcrypt-12 hash full key.
    - Insert row.
    - Return `{ id, plaintextKey, prefix }` — ONCE.
  - `revokeApiKeyAction({ id })`:
    - Workspace-scope check, set `revokedAt`.

### `/api/cli/*` route handlers (or shared with `/api/mcp`)

- For commands that don't trivially map to MCP tools (e.g. `apiq check --markdown` outputting CLI-friendly markdown vs MCP's structured data), add `/api/cli/{check,apply,share,export}` routes. These reuse the same core actions as MCP/web but format response for CLI consumption.
- For `apiq whoami`: `/api/auth/whoami` returns `{ email, workspaceName }` if API key valid; 401 otherwise.

### Version-skew handling

- Server returns header `apiq-min-cli-version: 0.1.0` on every response.
- CLI compares against own version; if outdated, prints warning *"Your apiq CLI is outdated. Run `npm install -g @apiq/cli@latest`"* but proceeds.
- CLI ignores unknown response fields (graceful forward-compat).

### Tests

- Vitest (`cli/__tests__/`):
  - Each command's argv parsing.
  - `check --json` happy path against mock server.
  - `apply --dry-run` doesn't write file.
  - `apply` writes `.bak` by default; `--no-backup` skips.
  - `login` saves `~/.apiqrc` with chmod 600.
  - `whoami` returns correct status when logged-in / logged-out.
  - Version-skew: CLI proceeds with warning when server says outdated.
- Vitest (server-side, in `src/__tests__/api/cli/`):
  - Each `/api/cli/*` route — auth, dispatch, response shape.
  - `createApiKeyAction` happy path → row created, plaintext returned, prefix matches.
  - `revokeApiKeyAction` → row updated, subsequent auth-checks fail.
- Smoke check: install CLI globally, run `apiq check openweathermap.json` against dev server, verify output. Documented in results.

## Acceptance criteria

1. `cli/` directory with own `package.json` (`name: @apiq/cli`), build script, bin entry `bin/apiq.js`.
2. All 7 commands implemented per Scope §"Command surface", with all listed flags.
3. `~/.apiqrc` file created/read with chmod 600 and the documented JSON shape.
4. `apiq preview` boots Stoplight Elements + Prism mock when prism-cli is available; prompts install otherwise.
5. `/settings/api-keys` UI page renders the keys table, Generate-new modal, Revoke flow.
6. `createApiKeyAction` returns plaintext key ONCE; subsequent reads only expose `prefix`.
7. `revokeApiKeyAction` sets `revokedAt`; subsequent CLI/MCP calls with the revoked key get 401.
8. `/api/cli/*` routes (or shared `/api/mcp/*`) handle the CLI's HTTP calls.
9. Anonymous `apiq check` (no API key) works against `/api/anonymous-demo` (Epic 19) with 1/IP/24h limit.
10. Version-skew: CLI prints warning when server header indicates outdated, but proceeds.
11. `npm pack` on `cli/` produces a tarball <1 MB (excluding optional Prism).
12. Vitest tests pass.
13. Smoke documented in `specs/21-cli-results.md`: full flow `apiq login → apiq check → apiq apply --critical-only → apiq share`.

## Out of scope

- Bundled Prism (always-installed) — kept as optional-dep for v1.
- CLI for Windows-shell-Powershell-specific quoting bugs — best-effort; `commander` handles cross-platform.
- Multi-account login (switch between workspaces) — single-account v1; multi-account is v1.1.
- `apiq init` scaffold command — not in v1.
- `apiq watch <file>` (re-analyze on file-change) — v1.1.
- GitHub-Action wrapper around CLI — v1.1 (PRD §5 "GitHub PR Integration" deferred).
- API-key scopes / permissions (read-only vs full) — v2 (single permission level in v1).

## Domain terms

- **`@apiq/cli`** — the npm package shipped by this epic.
- **`~/.apiqrc`** — the JSON file storing the user's API key + last-used timestamp.
- **`.bak` backup** — the `<file>.bak` snapshot created automatically before `apiq apply` mutates the file in place.
- **Anonymous CLI** — `apiq check` without `~/.apiqrc`; uses the anonymous-demo backend (1/IP/24h).
- **Prefix-display** — UI shows the first 8 chars of `apiq_pk_<...>` followed by `...` (e.g. `apiq_pk_4f8x...`).

## Open questions

- Should `apiq preview` use Stoplight Elements as a static-served HTML page or as a Vite dev server? Recommendation: static HTML (simpler, no Vite dep). Locked at impl.
- Multi-key UX: power-users want a key per machine. Default no-limit on key count per workspace; revisit if abuse signals.
- `apiq logout` should it ALSO revoke the API key on the server? Recommendation: no — logout is local; revoke is explicit in Web UI. CLI doesn't have permission to revoke.
- Auto-update mechanism: prompt-only is enough for v1. Self-update via `npm install -g` is v1.1 if friction-signal arrives.
