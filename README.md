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

Initial scaffold — no npm release yet. See
[the backlog plan](https://github.com/resultspace/resultspace-app-saas/blob/main/docs/portal-prd/plan-customer-datasets-validation-and-sftpgo-live-path.ru.md)
in the private app repository for the full delivery path.

## License

MIT
