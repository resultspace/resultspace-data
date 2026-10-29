import { z } from "zod";

/**
 * Contract `agent-run-request-v1` — what ResultSpace sends to a client runtime
 * (agent gateway target, Kestra flow, CLI agent) to invoke a curated preset.
 *
 * The PRESET NAME is the allowlist key: the client side permits only names it
 * published; `params` carry the bounded invocation arguments. Everything is
 * strict — unknown keys are rejected so both sides can evolve the contract
 * version-by-version, never silently.
 */

export const AGENT_RUN_REQUEST_V1 = "agent-run-request-v1" as const;

/** Flat bounded param values — no nesting in v1 (agents log them verbatim). */
export const runRequestParamValueSchema = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const agentRunRequestSchema = z
  .object({
    preset: z.string().trim().min(1).max(100),
    kind: z.enum(["command", "prompt"]),
    params: z.record(z.string().min(1).max(100), runRequestParamValueSchema),
    callback: z
      .object({
        url: z.string().url().startsWith("https://").max(2000),
        token: z.string().min(8).max(500),
      })
      .strict()
      .optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.params && Object.keys(value.params).length > 20) {
      ctx.addIssue({
        code: "custom",
        path: ["params"],
        message: "params accepts at most 20 keys in v1",
      });
    }
    if (value.kind === "command" && value.params && Object.keys(value.params).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["params"],
        message: "A command preset needs at least one param in v1 (use kind=prompt for free text)",
      });
    }
  });

export type AgentRunRequestV1 = z.infer<typeof agentRunRequestSchema>;
