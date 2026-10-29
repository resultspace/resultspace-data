# resultspace-data v2 — serve + runs/dialog contracts (spec, 2026-10-29)

Owner-approved direction: the package becomes the single contract language between
ResultSpace and client-side runtimes (agentgateway, Hermes, Agno, Kestra, CLI agents).
Datasets stay the core; runs and dialog get first-class versioned contracts validated
by the SAME zod core on both sides (portal + client agent via CLI).

## 1. `serve` (from portal research §5h)

- MCP mode: tools `list_datasets`, `read_dataset` (read + validate on the spot),
  `describe_contract`, `validate` — contract-aware replacement for a generic
  filesystem MCP server: only contract-valid datasets are ever exposed.
- Plain-HTTP mode (opt-in): `GET /datasets/<name>` + `Authorization: Bearer <key>`
  — SFTPGo-lite with built-in validation; byte gate 256 KiB before parse.
- Roots = CLI args (like the official filesystem MCP server); write tools NOT
  exposed in v1 (read-only data plane; writes stay SFTPGo/CI-side).
- Transport: stdio MCP for local agents + streamable HTTP behind a gateway.

## 2. Run request/response contracts

- `agent-run-request-v1`: what the portal sends —
  `{ preset: string (curated name), kind: "command" | "prompt", params: object
(bounded), callback?: {url, token}, idempotencyKey? }`. Strict; unknown keys
  rejected. This is the contract the client gateway/agent allowlists against.
- `agent-response-v1`: normalized envelope —
  `{ kind: "message" | "html" | "dataset" | "error", content?,
dataset?: <embedded dataset-table-v1 payload — validated by the SAME core>,
error?: {code, message}, interaction?: {type: "approval" | "clarify", question,
options} }`. Portal maps kind → card (message→RichText, html→CustomHtml sanitized,
  dataset→DatasetCard); `interaction` rides the hitl-backend approval flow.
- Vectors: valid/invalid fixtures for both contracts (negative-first: unknown keys,
  oversized params, dataset-in-response failing dataset-table-v1).

## 3. Dialog process validation

- Chat turns from remote agents validate as `agent-response-v1` per message
  (kind=message with content); tool-progress/stream chunks are transport-level and
  stay unvalidated in v1 (SSE pass-through), only the FINAL message of a turn is
  contract-checked before entering chat history.
- Hermes/Agno/OpenAI-compatible responses are normalized into the envelope by the
  portal-side adapter (their native shapes are transport, not contract).

## 4. CLI surface after v2

```
resultspace-data validate <file> [--contract dataset-table-v1|agent-run-request-v1|agent-response-v1]
resultspace-data describe [contract]
resultspace-data vectors
resultspace-data serve [--http PORT] [--bearer KEY] <roots...>   # MCP (stdio) / HTTP
```

Exit codes and `--json` semantics unchanged. Agents self-check BEFORE answering;
the portal validates on arrival — same core, zero drift (vectors prove it).

## 5. Out of scope (v2)

Writes/uploads, billing (Lago-class), content inspection (Lasso-class follow-up),
HITL internal contracts (hitl-backend owns them; we only carry `interaction`).

## 6. Quality criteria

Node --test suites for both contracts + serve (in-memory vectors through the HTTP
and MCP paths); oxfmt/oxlint clean; CI green on Node 24; README/agent-guide updated
(serve section + runs contract guide for agents).

## 7. Client gateway onboarding: prepared YAML + instructions (added 2026-10-29)

agentgateway config = ONE yaml file (`agentgateway -f config.yaml`; UI edits save back
into it). Therefore we ship a CURATED baseline instead of asking clients to click
securely:

- `templates/gateway/agentgateway.reference.yaml` — our hardened baseline: authn ON by
  default (API-key consumer for the ResultSpace SaaS + placeholder for a second
  consumer), rate limits, EMPTY targets, /ui left to the reverse-proxy/CF layer.
  Commented field-by-field (RU/EN). Authored against the REAL v1.7.0 schema once the
  owner's instance is live (verify in UI -> export; never hand-fabricate schema).
- `docs/gateway-onboarding.md` — the client runbook: (1) docker run with our yaml;
  (2) generate two keys (ours + own), fill placeholders; (3) expose via CF proxied
  subdomain + CF Access whole-host (Service Token for the SaaS, human policy for UI);
  (4) paste base URL + consumer key + CF headers into the portal Connection card;
  (5) add targets (claude mcp serve / resultspace-data serve / kestra) via UI or yaml;
  (6) rotate keys. Security rules called out: never delete authn blocks; API-key
  authn on routes BEFORE adding live targets; /ui not exposed publicly.
- Future CLI helpers (v2+): `resultspace-data gateway init` — render the reference
  yaml with prompted values + generated keys; `gateway check <url>` — probe
  reachability/auth like the portal's data-source Probe.
- Drift note: after clients edit via UI the file diverges from our baseline —
  acceptable (their box, their config); our contract surface is the CONNECTION
  (base URL + key + headers), not their yaml.

Out-of-scope stays the same; template authoring blocked on a live instance (or
official schema docs) — do not guess the schema.

## 8. Delivery: npm + skills (owner direction 2026-10-29)

ONE distribution artifact — the published npm package `resultspace-data`:

- **npm publish** (correct): `packages/cli` is publish-ready (bin, files incl.
  contracts/schemas/vectors, engines >=24, publishConfig public). CI workflow
  `.github/workflows/publish.yml` publishes on `v*` tags after tests+format gates
  (needs owner secret `NPM_TOKEN`; npm provenance via id-token). After publish,
  `npx resultspace-data …` works everywhere with zero install.
- **Skills layer** (how agents receive it): repo carries `skills/use-resultspace-data/SKILL.md`
  — agent-facing when/what/how with npx commands + contract essentials. The skill
  REFERENCES the npm package (no bundled code): one artifact, no drift. Install paths:
  Claude Code skills / OpenCode plugins copy or reference this SKILL.md; agents then
  just run npx. Agent-guide (docs/agent-guide.md) remains the long-form manual.
- Versioning: package version moves with git tags; contracts are versioned inside
  the payloads (dataset-table-v1 etc.) — npm version bump never breaks validation
  semantics of an existing contract version.

### §8a. Lifecycle matrix: skill vs MCP-registration vs daemon

`serve` is long-running — a skill must NOT be its supervisor (agent sessions are
ephemeral). Correct homes:

| Mode                                 | Supervisor                                       | Delivered via                                |
| ------------------------------------ | ------------------------------------------------ | -------------------------------------------- |
| validate/describe/vectors (one-shot) | —                                                | SKILL teaches npx                            |
| serve (stdio MCP, agent tools)       | agent runtime (claude mcp add / opencode config) | MCP registration line — the skill teaches it |
| serve (stdio MCP, portal access)     | agentgateway (spawns the target)                 | gateway config                               |
| serve --http (portal data plane)     | docker/systemd/dokploy                           | operator runbook                             |

So the package = skill (ad-hoc CLI + registration instructions) + MCP server
(registered, runtime-supervised). A combination, by design.
