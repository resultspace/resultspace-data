# Preparing ResultSpace datasets with your AI agent

This guide is for OpenCode, Claude Code, Hermes or any coding agent running **on the
data owner's server**. The agent prepares a small JSON report from permitted sources,
validates it, and publishes it for ResultSpace to read.

## What you are building

A single JSON file that follows the [`dataset-table-v1` contract](../schemas/dataset-table-v1.schema.json):

```json
{
	"name": "Weekly requests",
	"columns": [
		{ "name": "week", "role": "period" },
		{ "name": "channel", "role": "category" },
		{ "name": "requests", "role": "value" }
	],
	"rows": [
		{ "week": "2026-W40", "channel": "Advertising", "requests": 42 },
		{ "week": "2026-W41", "channel": "Organic", "requests": null }
	]
}
```

## Rules

1. **Read-only access**: only use data sources and credentials the owner has
   explicitly granted for this report. Do not create, modify or delete anything
   in the source systems.
2. **Prepare a candidate first**: write to `./candidate.json`, never directly
   to `latest.json` or the published directory.
3. **Validate before publishing**: run the validation CLI. Fix any issues it
   reports (at most two rounds), then publish only on success.
4. **Null means unknown**: use `null` when the value is genuinely unavailable;
   use `0` only when the measured value really is zero.
5. **Numbers are JSON numbers**, not formatted strings (`42`, not `"42"` or `"1,200"`).
6. **Every row has exactly the declared columns**, no extras, no missing keys.
7. **Column names are unique** (case-insensitive) and stable between updates.
8. **At least one column with `role: "value"`** — charts and KPIs need a numeric column.
9. **No secrets in the file**: no API keys, passwords, connection URLs, internal
   endpoint addresses or personal data beyond what the owner explicitly approved.
10. **Use fictional data for demos**: when the owner says this is a sales
    demonstration, create clearly fictional values, not real customer records.

## Workflow

```bash
# 1. Prepare candidate.json from the permitted source
# 2. Validate
npx resultspace-data validate ./candidate.json

# 3. If issues: read the machine diagnostic, fix the file, validate again
# 4. Publish (atomic, re-validates the exact bytes)
npx resultspace-data publish ./candidate.json --target ./published/latest.json

# 5. Upload to the SFTPGo directory the owner configured
# (the owner provides the exact path and method — do not invent one)
```

## Common validation errors

| Code | Meaning | What to fix |
|---|---|---|
| `invalid_type` | Wrong type (e.g. string where number expected) | Check the column role; `value` columns need numbers or null |
| `too_big` | File/rows/columns exceed limits | Narrow the period or aggregate upstream |
| `duplicate_column` | Two columns share the same name | Rename one column |
| `missing_row_key` | Row doesn't contain a declared column | Add the missing key or remove the column |
| `unknown_row_key` | Row has an undeclared key | Remove the extra key or declare the column |
| `missing_value_column` | No column with `role: "value"` | Mark a numeric column as value |
| `unrecognized_keys` | Unknown top-level property | Remove it — the contract is strict |

## What validation does NOT prove

A green check means the file is **structurally compatible** with the contract.
It does not prove the business values are correct, that the formula matches
the source system, or that the data is complete. The owner must verify numbers
against the real source before relying on the report.
