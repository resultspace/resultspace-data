#!/usr/bin/env node
/** Sync canonical contracts/schemas/vectors into packages/cli/vendor (publish unit). */
import {
  cpSync,
  rmSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const vendor = join(root, "packages/cli/vendor");
rmSync(vendor, { recursive: true, force: true });
mkdirSync(vendor, { recursive: true });
for (const dir of ["contracts", "schemas", "vectors"]) {
  cpSync(join(root, dir), join(vendor, dir), { recursive: true });
}
// Compiled-free package: keep only what the CLI reads
console.log("vendor synced:", readdirSync(vendor).join(", "));
