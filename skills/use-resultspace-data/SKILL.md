---
name: use-resultspace-data
description: Validate and serve ResultSpace datasets — check JSON against the dataset-table-v1 contract before sending, expose local datasets read-only to the portal over MCP/HTTP. Use when the user mentions ResultSpace, dataset contracts, or connecting their data to a ResultSpace portal.
---

# ResultSpace datasets for agents

One npm package is the single source of truth: `resultspace-data`.

## When to use

- **Before sending any dataset** to a ResultSpace portal (SFTPGo upload, gateway, chat): validate it first — the portal will reject invalid files.
- **To expose local dataset files** to a portal page: run the read-only server.

## Commands (no install needed — npx)

```bash
# Validate a dataset file (exit 0 = valid; prints exact issues otherwise)
npx resultspace-data validate my-dataset.json

# Validate the other contracts (what the portal sends / expects back)
npx resultspace-data validate run.json --contract agent-run-request-v1
npx resultspace-data validate answer.json --contract agent-response-v1

# Contract cheat-sheet (roles, limits, rules)
npx resultspace-data describe            # dataset-table-v1
npx resultspace-data describe agent-response-v1

# Serve datasets read-only (the portal/agentgateway connects to this)
npx resultspace-data serve /path/to/datasets              # stdio MCP
npx resultspace-data serve /path/to/datasets --http 8080 --bearer KEY
```

## Contract essentials (dataset-table-v1)

- `columns`: `{name, role}` — roles: `label` (default) | `period` | `category` | `value`.
- At least ONE `role: "value"` column (charts/KPIs need numbers; strings in value columns are rejected — clean upstream).
- Every row: exactly the declared column keys, no extras/missing; cell = string ≤1000 | finite number | null (null = unknown, never 0/"").
- Limits: ≤500 rows, ≤20 columns, ≤256 KiB per file; column names unique (case-insensitive).

## Long-running serve: register as MCP, don't babysit

`validate/describe` are one-shot commands — fine to run ad hoc. `serve` is a
LONG-RUNNING process: do not just spawn it from a chat and leave — register it
where a runtime supervises it:

- **As the agent's MCP server** (agent gets list/read/describe/validate as TOOLS):
  ```bash
  claude mcp add resultspace-data -- npx resultspace-data serve /path/to/datasets
  # OpenCode/Hermes: same command in their MCP config (stdio)
  ```
  The agent runtime spawns/supervises the process — it is not the skill's job.
- **For portal/agentgateway access**: agentgateway spawns it as an stdio MCP
  target (gateway = supervisor), or run `serve --http` under docker/systemd.

## Rules

- Never invent or "fix" data to pass validation — report issues to the user.
- Value columns hold JSON numbers, not formatted strings (`42`, not `"1,200"`).
- `serve` exposes only valid datasets; invalid files are reported by name — fix them, do not bypass.
