#!/usr/bin/env node
/**
 * Generate immutable JSON Schema files from canonical Zod contracts.
 * Output: schemas/<contract-version>.schema.json — never hand-edit.
 *
 * Run: node tools/generate-schemas.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const zod = require("zod");
const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Dynamic import because contracts use TS syntax; we use tsx-style eval for now.
// In production this will be a proper tsup/esbuild step.
const contracts = [
  {
    version: "dataset-table-v1",
    description:
      "ResultSpace tabular dataset: named columns with roles (label/period/category/value) and rows of string/number/null cells",
    schemaPath: "contracts/dataset-table-v1.ts",
  },
];

const outDir = join(root, "schemas");
mkdirSync(outDir, { recursive: true });

const manifest = { generatedAt: new Date().toISOString(), contracts: [] };

for (const contract of contracts) {
  const source = readFileSync(join(root, contract.schemaPath), "utf-8");

  // For now, generate from the inline Zod definition (matching what the TS file exports).
  // This is a bootstrap: the full build pipeline will import the TS directly.
  const schema = zod.z
    .object({
      name: zod.z.string().min(1).max(200),
      columns: zod.z
        .array(
          zod.z.object({
            name: zod.z.string().min(1).max(100),
            role: zod.z.enum(["label", "period", "category", "value"]).default("label"),
          }),
        )
        .min(1)
        .max(20),
      rows: zod.z
        .array(
          zod.z.record(
            zod.z.string(),
            zod.z.union([zod.z.string().max(1000), zod.z.number(), zod.z.null()]),
          ),
        )
        .max(500),
    })
    .strict();

  const jsonSchema = zod.z.toJSONSchema(schema, {
    name: contract.version,
    description: contract.description,
  });

  const outPath = join(outDir, `${contract.version}.schema.json`);
  writeFileSync(outPath, `${JSON.stringify(jsonSchema, null, "\t")}\n`);
  manifest.contracts.push({
    version: contract.version,
    description: contract.description,
    file: `schemas/${contract.version}.schema.json`,
  });

  console.log(`Generated: ${outPath}`);
}

writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
console.log("Done.");
