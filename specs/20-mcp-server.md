# Epic 20 — MCP Server

> Local-stdio MCP server published as `@apiq/mcp-server` on npm; six tools (`apiq.analyze`, `apiq.get_findings`, `apiq.apply`, `apiq.score`, `apiq.share`, `apiq.export`) thin-wrap `apiq.dev` cloud APIs. Setup-doc page at `apiq.dev/mcp` with copy-paste config snippets for Claude Desktop / Cursor / Continue.
> Upstream: [`prd-launch.md`](../prd-launch.md) §3 "Distribution & Viral block" rows "MCP Server" + "MCP Setup Doc Page", §2 entry-point (3), [`specs/brainstorming-launch.md`](./brainstorming-launch.md) §"MCP Server".

## Scope

### npm package `@apiq/mcp-server`

- New top-level directory `mcp-server/` in the apiq-mvp repo (sibling to `src/`):
  - `mcp-server/package.json` — own package, name `@apiq/mcp-server`, version `0.1.0` initially.
  - `mcp-server/src/index.ts` — entry point. Stdio MCP server using `@modelcontextprotocol/sdk` (latest stable).
  - `mcp-server/tsconfig.json` — own TS config, output to `mcp-server/dist/`.
  - Build script: `npm run build:mcp` → `tsc -p mcp-server/tsconfig.json`.
- Dependencies: `@modelcontextprotocol/sdk`, `zod` (for input validation).
- Bin entry: `bin/apiq-mcp-server.js` → invokes the compiled `dist/index.js`.

### Tool surface (6 tools)

Each tool has a JSON-schema input + structured output. Implementation = HTTP call to `apiq.dev/api/mcp/<tool>` with the user's API key in the `Authorization` header.

```
apiq.analyze({ spec: string }): { specId, score, severityBreakdown, findings: Finding[] }
  - 'spec' is the dereferenced or raw OpenAPI JSON/YAML content
  - Server side: parses + validates + analyzes (full v0.1 analysis pipeline) within the user's workspace
  - Returns full findings list (paged below: see get_findings if too large)

apiq.get_findings({ specId, filter? }): Finding[]
  - filter: { severity?: 'critical'|'high'|'medium'|'low', status?: 'open'|'applied'|'rejected' }
  - Returns matching findings (no pagination in v1; assumes <500 findings per spec post-Epic-09 caps)

apiq.apply({ specId, scope: 'critical' | 'all' | 'finding-ids', findingIds?: string[] }): { newSpecId, newScore, oldScore, applied: Finding[], skipped: Array<{findingId, reason}>, halted?: { findingId, reason } }
  - 'critical' / 'all' map to applyAllAction (Epic 16)
  - 'finding-ids' applies specific findings in order (severity-DESC tie-broken)
  - newSpecId may equal specId (spec is mutated in-place via SpecVersion increment); included for client clarity

apiq.score({ specId }): { score, severityBreakdown }
  - Lightweight; no findings payload

apiq.share({ specId, expiresInDays? }): { url, expiresAt? }
  - Wraps createShareAction (Epic 19); returns the public URL like https://apiq.dev/share/<token>

apiq.export({ specId, format: 'json' | 'yaml' | 'markdown' }): { content, filename }
  - Wraps exportSpecAction (Epic 08) for json/yaml
  - For markdown, wraps exportFindingsMarkdownAction (Epic 22)
```

All tools require `APIQ_API_KEY` env var OR `~/.apiqrc` file with `{ "apiKey": "apiq_pk_..." }`.

### Server-side `/api/mcp/*` routes

- New route handlers `src/app/api/mcp/[tool]/route.ts` (or one route handling all 6):
  - Bearer-token auth: extract `Authorization: Bearer <key>`, validate against `ApiKey` table (Epic 21's schema; this epic STUBS the table since the API-key UI is Epic 21 — but the schema must land here so MCP can authenticate).
  - On success → call the equivalent v0.1 server action (or a shared core function), return JSON.
  - On error → standard `{ error: { kind, message, retryAt? } }` shapes.
- Workspace context: every API key has a `workspaceId`; all MCP tools operate within that workspace.

### Schema: ApiKey (shared with Epic 21)

```prisma
model ApiKey {
  id           String    @id @default(cuid())
  workspaceId  String
  workspace    Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name         String              // user-supplied label
  hashedKey    String              // bcrypt-12-hashed
  prefix       String              // first 8 chars of plaintext, for UI display
  createdAt    DateTime  @default(now())
  lastUsedAt   DateTime?
  revokedAt    DateTime?

  @@index([workspaceId])
  @@index([prefix])  // for fast lookup before bcrypt-compare
}
```

Migration: this epic's migration includes `ApiKey` + `prefix`-index; Epic 21 ships the management UI on top.

API-key format: `apiq_pk_<22-char-base62>`. Prefix = `apiq_pk_<first 4 chars>` (12 chars). Bcrypt-12 hashed full key stored in `hashedKey`; `prefix` indexed for fast lookup.

### Setup-doc page

- Static MDX page at `src/app/(public)/mcp/page.tsx` (or `mcp.mdx` if MDX is set up in v1; otherwise straight TSX with formatted code blocks).
- Sections:
  - "What is MCP?" — 2-paragraph primer.
  - "Get an API key" — link to `/settings/api-keys` (Epic 21).
  - "Claude Desktop config" — copy-paste JSON snippet for `~/Library/Application Support/Claude/claude_desktop_config.json`.
  - "Cursor config" — copy-paste JSON snippet for Cursor's MCP config UI.
  - "Continue config" — copy-paste JSON for Continue's `config.json`.
  - "Tool reference" — list of 6 tools with input/output sketches.
  - "Troubleshooting" — common errors (key invalid, key revoked, rate-limited).
- Each code block has a "Copy" button.

Example Claude Desktop snippet:

```json
{
  "mcpServers": {
    "apiq": {
      "command": "npx",
      "args": ["-y", "@apiq/mcp-server"],
      "env": { "APIQ_API_KEY": "apiq_pk_..." }
    }
  }
}
```

### Tests

- Vitest (in `mcp-server/__tests__/`):
  - Each tool: input-schema validation; happy-path mock-server response → tool returns expected shape.
  - Auth-fail path: 401 response → tool surfaces error.
  - Network-fail path: ECONNREFUSED → tool surfaces error.
- Vitest (server-side, in `src/__tests__/api/mcp/`):
  - Each route: bearer-token validation, permission check, action invocation.
  - Revoked key returns 401.
- Smoke check: build the package, install locally, configure in Claude Desktop, run a real `apiq.analyze` against OpenWeatherMap — documented in results.

## Acceptance criteria

1. `mcp-server/` directory exists with own `package.json` (`name: @apiq/mcp-server`), `tsconfig.json`, `src/index.ts`, `bin/apiq-mcp-server.js`.
2. `npm run build:mcp` produces `mcp-server/dist/index.js` runnable via `node`.
3. All 6 tools registered with the MCP SDK; input-schemas via zod; outputs match the documented shapes.
4. Each tool calls the corresponding `apiq.dev/api/mcp/<tool>` endpoint with bearer-token auth.
5. `ApiKey` Prisma model exists with migration applied. `prefix`-index allows O(log n) lookup before bcrypt-compare.
6. `/api/mcp/[tool]` route handlers validate bearer-token, dispatch to the equivalent action, return JSON. Revoked keys return 401.
7. Setup-doc page at `/mcp` with sections and copy-paste snippets for Claude Desktop, Cursor, Continue.
8. `APIQ_API_KEY` env var is the primary auth source; `~/.apiqrc` JSON is the fallback (shared with Epic 21's CLI).
9. Vitest tests pass on both client (mcp-server) and server (api/mcp) sides.
10. Smoke check (manual) documented in `specs/20-mcp-server-results.md` showing a Claude Desktop session calling `apiq.analyze` end-to-end.
11. The npm package is publishable (`npm pack` succeeds; tarball is <1 MB).

## Out of scope

- Hosted/Anthropic-Connector-style MCP — local stdio only for v1.
- Anonymous MCP calls — auth-required (per `brainstorming-launch.md` §"MCP Server" decision).
- Tool-call streaming responses — full responses only in v1.
- Pagination on `apiq.get_findings` — assume <500 findings/spec.
- MCP SDK version-pinning policies / dependabot — defer to ops.
- Tools beyond the 6 specified (e.g. `apiq.list_specs`) — v1.1 if user requests.
- Multi-workspace API keys — v2 (one workspace per key in v1).

## Domain terms

- **MCP** — Model Context Protocol; Anthropic's open spec for AI-tool-use integrations.
- **Local-stdio server** — MCP server invoked as a subprocess by the host (Claude Desktop / Cursor), communicating via stdin/stdout JSON-RPC.
- **Tool surface** — the set of callable methods exposed by an MCP server; here, 6 tools.
- **Bearer-token auth** — `Authorization: Bearer apiq_pk_...` header used by every `/api/mcp/*` request.
- **Prefix-indexed lookup** — first 12 chars of the API key are stored unhashed in `prefix` to allow indexed lookup before bcrypt-compare on the full hash.

## Open questions

- Should `apiq.analyze` be synchronous (returns findings) or async (returns specId immediately, client polls `apiq.get_findings`)? Sync for v1 — single round-trip, matches MCP host expectations. Async with polling is v1.1 if specs grow large enough.
- Should we provide a Python or Go MCP server as well? Recommendation: no for v1 — MCP-SDK Node-package is widely available; Python coverage rises if user demand signals.
- Naming: `apiq.analyze` vs `apiq_analyze` vs `analyze` (in MCP, tools are namespaced by server-id automatically). Recommendation: short `analyze` / `get_findings` / `apply` / `score` / `share` / `export` — host-side will display `apiq.analyze` regardless.
- Cost-control on MCP-API: same workspace-cap as v0.1 ($10/24h). MCP calls share that bucket. No special MCP-tier in v1.
