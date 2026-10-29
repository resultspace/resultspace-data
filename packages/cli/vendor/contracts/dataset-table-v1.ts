import { z } from "zod";

/**
 * Contract `dataset-table-v1` — the legacy ResultSpace tabular dataset shape.
 *
 * This is the canonical source; `schemas/dataset-table-v1.schema.json` is a
 * generated immutable export. Do not hand-edit the JSON file.
 *
 * Limits mirror the SaaS consumer (`PREVIEW_CEILINGS` in the app repository):
 * 500 rows, 20 columns, 1000 characters per string cell, 256 KiB per file.
 * The schema enforces structure; byte-size limits are checked separately by
 * the CLI before parsing (an unbounded `JSON.parse` is not a byte gate).
 */

export const DATASET_TABLE_V1 = "dataset-table-v1" as const;

export const columnRoleSchema = z.enum(["label", "period", "category", "value"]);

export const datasetColumnSchema = z.object({
  name: z.string().min(1).max(100),
  role: columnRoleSchema.default("label"),
});

export const cellValueSchema = z.union([z.string().max(1000), z.number().finite(), z.null()]);

export const datasetRowSchema = z.record(z.string(), cellValueSchema);

export const datasetTableV1Schema = z
  .object({
    name: z.string().min(1).max(200),
    columns: z.array(datasetColumnSchema).min(1).max(20),
    rows: z.array(datasetRowSchema).max(500),
  })
  .strict();

export type DatasetTableV1 = z.infer<typeof datasetTableV1Schema>;
