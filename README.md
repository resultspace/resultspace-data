# resultspace-data

Versioned contracts, JSON Schema exports and the `resultspace-data` CLI for preparing,
validating and publishing external datasets consumed by [ResultSpace](https://resultspace.app) widgets.

## What lives here

```text
contracts/     Versioned Zod contracts and semantic rules (the canonical source)
schemas/       Generated immutable JSON Schema files, one per contract version
vectors/       Valid/invalid synthetic fixtures for cross-runtime conformance
packages/cli/  The `resultspace-data` npm package (validate, publish, describe)
docs/          Guides for AI agents (OpenCode, Claude Code, Hermes) and integrators
```

## Design principles

- **One canonical source**: contracts are defined once in Zod; JSON Schema files are
  generated exports, never hand-written duplicates.
- **Version pinning over latest**: every schema URL is immutable per version; the CLI
  bundles its schemas locally so offline validation works without fetching anything.
- **Deterministic validation**: the same contract version produces the same machine
  diagnostics on the server and in the local CLI — verified by shared conformance vectors.
- **Safe publication**: `publish` re-validates the exact bytes it writes, coordinates
  with the previous writer, and performs an atomic rename. An invalid candidate never
  replaces the last-good file.
- **No credentials in artifacts**: public schemas, vectors, instructions and CLI releases
  contain no user data, endpoint addresses or secrets.

## Status

**CLI v2 (local, not yet on npm)**: three contracts + a read-only dataset server.

```bash
node packages/cli/index.mjs validate my-dataset.json                # dataset-table-v1 (default)
node packages/cli/index.mjs validate run.json --contract agent-run-request-v1
node packages/cli/index.mjs describe agent-response-v1              # any contract summary
node packages/cli/index.mjs vectors                                 # 20/20 conformance vectors
node packages/cli/index.mjs serve /data/datasets --http 8080 --bearer KEY   # read-only HTTP
agentgateway …  resultspace-data serve /data/datasets               # stdio MCP target
```

- `agent-run-request-v1` — what ResultSpace sends to invoke a curated preset
  (preset name is the allowlist key; strict, bounded params, https callback).
- `agent-response-v1` — the normalized answer envelope (message/html/dataset/error
  + optional approval/clarify). An embedded `dataset` is validated by the same
  dataset-table-v1 core — one language for data everywhere.
- `serve` exposes ONLY contract-valid datasets (list/read/describe/validate tools
  over stdio MCP; plain GETs over HTTP; byte-gated, traversal-safe, optional bearer).

The validator enforces the 256 KiB byte gate BEFORE parsing, then structure, then
semantics. It is deliberately stricter than the server's structural acceptance in
one place: a `role=value` column must contain only numbers/`null` (strings would
break charts and KPI math — clean or aggregate the column upstream).

`publish` and the npm release are still ahead; see
[the backlog plan](https://github.com/resultspace/resultspace-app-saas/blob/main/docs/portal-prd/plan-customer-datasets-validation-and-sftpgo-live-path.ru.md)
in the private app repository for the full delivery path.

## License

MIT
