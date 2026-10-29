/**
 * CLI validation core — a thin wrapper over the CANONICAL contracts.
 *
 * Every contract lives in `contracts/*.ts` as Zod and is executed as-is via the
 * Node type stripper (Node ≥ 22.18 / 24) — there is no compiled copy to drift.
 * `dataset-table-v1` additionally runs its semantic-rules pass; the agent
 * contracts carry their cross-field rules in superRefine.
 */
import {
  columnRoleSchema,
  DATASET_TABLE_V1,
  datasetTableV1Schema,
} from "../vendor/contracts/dataset-table-v1.ts";
import { validateDatasetTableSemantics } from "../vendor/contracts/semantic-rules.ts";
import {
  AGENT_RUN_REQUEST_V1,
  agentRunRequestSchema,
} from "../vendor/contracts/agent-run-request-v1.ts";
import { AGENT_RESPONSE_V1, agentResponseSchema } from "../vendor/contracts/agent-response-v1.ts";

export { DATASET_TABLE_V1, AGENT_RUN_REQUEST_V1, AGENT_RESPONSE_V1 };

/** Byte gate BEFORE parsing — an unbounded JSON.parse is not a byte gate. */
export const MAX_FILE_BYTES = 256 * 1024;

function zodIssues(error) {
  return error.issues.map((issue) => ({
    code: issue.code ?? "invalid",
    path:
      "$" +
      issue.path.map((part) => (typeof part === "number" ? `[${part}]` : `.${part}`)).join(""),
    message: issue.message,
  }));
}

/**
 * Validate one parsed payload against a contract by name.
 * Returns `{ ok, issues, data? }` with issues normalized to `{code, path, message}`.
 */
export function validateContract(contract, parsed) {
  if (contract === DATASET_TABLE_V1) {
    return validateDatasetTable(parsed);
  }
  const schema =
    contract === AGENT_RUN_REQUEST_V1
      ? agentRunRequestSchema
      : contract === AGENT_RESPONSE_V1
        ? agentResponseSchema
        : null;
  if (!schema) {
    throw new Error(`unknown contract ${contract}`);
  }
  const result = schema.safeParse(parsed);
  return result.success
    ? { ok: true, issues: [], data: result.data }
    : { ok: false, issues: zodIssues(result.error) };
}

/** All contract names, canonical order (dataset first — the original core). */
export const CONTRACTS = [DATASET_TABLE_V1, AGENT_RUN_REQUEST_V1, AGENT_RESPONSE_V1];

/**
 * Validate one parsed dataset: structural Zod parse, then semantic rules.
 * Returns `{ ok, issues, data? }` with issues normalized to
 * `{ code, path, message }`.
 */
export function validateDatasetTable(parsed) {
  const structural = datasetTableV1Schema.safeParse(parsed);
  if (!structural.success) {
    return { ok: false, issues: zodIssues(structural.error) };
  }
  const semantic = validateDatasetTableSemantics(structural.data);
  if (semantic.length > 0) {
    return {
      ok: false,
      issues: semantic.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    };
  }
  return { ok: true, issues: [], data: structural.data };
}

/** Contract summaries for `describe` — derived from the live schemas, not copied. */
export function describeContract(contract = DATASET_TABLE_V1) {
  if (contract === AGENT_RUN_REQUEST_V1) {
    return {
      contract: AGENT_RUN_REQUEST_V1,
      structuralCore: "zod (contracts/agent-run-request-v1.ts)",
      purpose: "what ResultSpace sends to invoke a curated preset on a client runtime",
      fields: {
        preset: "string 1..100 — the allowlist key the client published",
        kind: "command | prompt",
        params: "flat map, ≤20 keys, values string≤2000 / number / boolean / null",
        callback: "optional {url: https, token} — where the runtime POSTs the answer",
        idempotencyKey: "optional string ≤100 — safe retries",
      },
      notes: [
        "strict: unknown keys are rejected",
        "kind=command needs ≥1 param (use kind=prompt for free text)",
      ],
    };
  }
  if (contract === AGENT_RESPONSE_V1) {
    return {
      contract: AGENT_RESPONSE_V1,
      structuralCore: "zod (contracts/agent-response-v1.ts)",
      purpose: "the normalized envelope a client runtime answers with",
      fields: {
        kind: "message | html | dataset | error — maps straight onto portal cards",
        content: "string ≤20000 — required for message/html",
        dataset: "dataset-table-v1 payload — required for kind=dataset (same core)",
        error: "{code, message} — required for kind=error",
        interaction: "optional approval/clarify question — hitl flow (message only)",
        idempotencyKey: "optional string ≤100",
      },
      notes: [
        "exactly one payload field per response (content xor dataset xor error)",
        "embedded datasets are validated by the shared dataset-table-v1 core",
      ],
    };
  }
  const roles = [...columnRoleSchema.options];
  return {
    contract: DATASET_TABLE_V1,
    structuralCore: "zod (contracts/dataset-table-v1.ts)",
    semanticRules: "contracts/semantic-rules.ts",
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      maxRows: datasetTableV1Schema.shape.rows.maxValue ?? 500,
      maxColumns: datasetTableV1Schema.shape.columns.maxValue ?? 20,
      maxCellStringLength: 1000,
      maxNameLength: 200,
    },
    columnRoles: roles,
    defaultColumnRole: "label",
    rowShape: "flat object keyed by column names; string ≤1000 / finite number / null",
    notes: [
      "at least one role=value column is required (charts and KPI widgets)",
      "row keys must match declared columns exactly (no extras, none missing)",
      "column names are unique case-insensitively",
    ],
  };
}
