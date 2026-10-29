/**
 * Every conformance vector of every contract must produce exactly the labeled
 * verdict through the SAME core the CLI binary uses — the drift detector
 * between the Zod contracts, the semantic rules and the vectors.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONTRACTS, validateContract } from "../lib/core.mjs";

for (const contract of CONTRACTS) {
  const vectors = JSON.parse(
    readFileSync(new URL(`../vendor/vectors/${contract}.vectors.json`, import.meta.url), "utf8"),
  );
  for (const [name, vector] of Object.entries(vectors)) {
    test(`vector: ${name} (${contract}, ${vector.expect})`, () => {
      const result = validateContract(contract, vector.data);
      assert.equal(
        result.ok,
        vector.expect === "valid",
        `${name}: expected ${vector.expect}, got ${result.ok ? "valid" : JSON.stringify(result.issues)}`,
      );
    });
  }
}
