import { z } from "zod";
import { datasetTableV1Schema } from "./dataset-table-v1.ts";
import { validateDatasetTableSemantics } from "./semantic-rules.ts";

/**
 * Contract `agent-response-v1` — the normalized envelope a client runtime
 * answers with. The portal maps `kind` straight onto cards:
 * message → RichText, html → CustomHtml (sanitized), dataset → DatasetCard,
 * error → failure notice. `interaction` rides the hitl approval flow.
 *
 * A `dataset` payload is validated by the SAME dataset-table-v1 core — one
 * language for data, whether it arrives as a file or inside an agent answer.
 */

export const AGENT_RESPONSE_V1 = "agent-response-v1" as const;

export const agentResponseSchema = z
  .object({
    kind: z.enum(["message", "html", "dataset", "error"]),
    content: z.string().max(20000).optional(),
    dataset: datasetTableV1Schema.optional(),
    error: z
      .object({
        code: z.string().min(1).max(100),
        message: z.string().min(1).max(1000),
      })
      .strict()
      .optional(),
    interaction: z
      .object({
        type: z.enum(["approval", "clarify"]),
        question: z.string().min(1).max(2000),
        options: z.array(z.string().min(1).max(200)).max(10).optional(),
      })
      .strict()
      .optional(),
    idempotencyKey: z.string().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const payloadKinds = ["content", "dataset", "error"] as const;
    const present = payloadKinds.filter((key) => value[key] !== undefined);
    if (present.length > 1) {
      ctx.addIssue({
        code: "custom",
        path: [present[1]],
        message: `kind=${value.kind} carries ${present.join(" + ")} — exactly one payload field per response`,
      });
      return;
    }
    if (present.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: `kind=${value.kind} needs its payload field (content for message/html, dataset for dataset, error for error)`,
      });
      return;
    }
    if ((value.kind === "message" || value.kind === "html") && value.content === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["content"],
        message: `kind=${value.kind} requires content`,
      });
    }
    if (value.kind === "dataset" && value.dataset === undefined) {
      ctx.addIssue({ code: "custom", path: ["dataset"], message: "kind=dataset requires dataset" });
    }
    if (value.kind === "error" && value.error === undefined) {
      ctx.addIssue({ code: "custom", path: ["error"], message: "kind=error requires error" });
    }
    if (value.kind === "dataset" && value.dataset !== undefined) {
      const semantic = validateDatasetTableSemantics(value.dataset);
      for (const issue of semantic) {
        ctx.addIssue({
          code: "custom",
          path: [
            "dataset",
            issue.path
              .replace(/^\$\.?/, "")
              .split(".")
              .filter(Boolean),
          ].flat(),
          message: issue.message,
        });
      }
    }
    if (value.kind !== "message" && value.interaction !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["interaction"],
        message: "interaction is only carried by kind=message responses in v1",
      });
    }
  });

export type AgentResponseV1 = z.infer<typeof agentResponseSchema>;
