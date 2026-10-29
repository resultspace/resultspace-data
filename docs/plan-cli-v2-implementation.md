# CLI v2 — implementation plan (2026-10-29)

Executes docs/plan-cli-v2-serve-runs.md. Repo: resultspace-data (zero-build, TS via
Node 24 type-stripping, zod canonical core).

## Decisions

- **MCP via official SDK** (`@modelcontextprotocol/sdk`) — protocol compliance for
  free (initialize/capabilities/versions); hitl-backend already proves the pattern.
  v2 transports: **stdio MCP** (agentgateway spawns us as a stdio target — its
  federation model) + **plain HTTP GET** (no-gateway "SFTPGo-lite" mode).
  MCP-over-streamable-HTTP = follow-up (needs the gateway schema anyway).
- **Contract registry** in core: `{name → {schema, semantic?}}`. dataset-table-v1
  keeps its semantic pass; the two new contracts are pure zod with superRefine for
  cross-field rules (kind↔payload). `validate --contract <name>` selects; default
  stays dataset-table-v1 (back-compat).
- **serve internals**: shared lib `lib/serve-core.mjs` — scan roots (*.json), load
  by URL-safe name (traversal-refused), byte gate 256 KiB, validate, mtime cache.
  stdio tools: list_datasets / read_dataset / describe_contract / validate.
  HTTP: GET /health, GET /datasets (list), GET /datasets/<name> (200 valid /
  404 unknown / 413 oversize / 422 invalid+issues), optional Bearer (401). No writes.
- **Limits for new contracts** (documented in describe): preset ≤100 chars;
  params ≤20 keys, values string≤2000 / number / bool / null (no nesting v1);
  content ≤20000; idempotencyKey ≤100; callback.url https only.

## Steps (each: code → test → gates)

1. **Contracts**: `contracts/agent-run-request-v1.ts`, `contracts/agent-response-v1.ts`
   (response reuses `datasetTableV1Schema` for the `dataset` payload — one language);
   vectors for both (negative-first); extend `tools/generate-schemas.mjs`.
2. **Registry + CLI**: `lib/core.mjs` contract registry + validateContract(name, parsed);
   `index.mjs` `validate --contract`; vectors command iterates ALL contract vectors.
3. **serve**: `lib/serve-core.mjs` + `serve` command (stdio MCP default; `--http PORT
[--bearer KEY]`). SDK dependency added to packages/cli.
4. **Tests**: contract vectors (existing pattern); HTTP server tests (ephemeral port:
   list/read/auth/traversal/invalid/oversize); stdio MCP child-process test
   (initialize → tools/list → tools/call read_dataset on a temp fixture).
5. **Docs**: README (serve + runs contracts), agent-guide (validate --contract for
   agents before answering), cf-zero-trust cross-link n/a here. oxfmt/oxlint + full
   `npm test` green; CI unchanged (Node 24).

## Acceptance

`node packages/cli/index.mjs vectors` → all contracts' vectors pass; `validate
--contract agent-response-v1` accepts a sample agent answer with an embedded valid
dataset and rejects a broken one; `serve --http` roundtrip + `serve` (stdio) JSON-RPC
roundtrip proven by tests.
