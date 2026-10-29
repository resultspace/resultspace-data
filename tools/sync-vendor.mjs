#!/usr/bin/env node
/**
 * Sync the publish unit inside packages/cli/vendor:
 * - contracts.mjs — esbuild ESM bundle of ALL canonical contracts (Node forbids
 *   type-stripping under node_modules, so .ts cannot ship as-is);
 * - schemas/, vectors/ — verbatim JSON copies.
 * Repo tests exercise the same vendor paths the tarball uses — no drift.
 */
import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const vendor = join(root, "packages/cli/vendor");
rmSync(vendor, { recursive: true, force: true });
mkdirSync(join(vendor, "contracts"), { recursive: true });

const shim = join(vendor, "contracts", "_shim.ts");
writeFileSync(shim, `export * from "${join(root, "contracts/dataset-table-v1.ts")}";
export * from "${join(root, "contracts/semantic-rules.ts")}";
export * from "${join(root, "contracts/agent-run-request-v1.ts")}";
export * from "${join(root, "contracts/agent-response-v1.ts")}";
`);

await build({
  entryPoints: [shim],
  outfile: join(vendor, "contracts/contracts.mjs"),
  format: "esm",
  platform: "node",
  target: "node20",
  bundle: true,
  logLevel: "warning",
});
rmSync(shim, { force: true });
for (const dir of ["schemas", "vectors"]) {
  cpSync(join(root, dir), join(vendor, dir), { recursive: true });
}
console.log("vendor synced: contracts.mjs (bundled) + schemas + vectors");
