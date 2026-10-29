/**
 * HTTP transport: list/read, auth, traversal refusal, invalid-dataset status.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runServe } from "../lib/serve.mjs";

const root = mkdtempSync(join(tmpdir(), "rsd-http-"));
writeFileSync(
  join(root, "good.json"),
  JSON.stringify({
    name: "G",
    columns: [
      { name: "m", role: "period" },
      { name: "v", role: "value" },
    ],
    rows: [{ m: "Jan", v: 1 }],
  }),
);
writeFileSync(
  join(root, "bad.json"),
  JSON.stringify({ name: "B", columns: [{ name: "a" }], rows: [] }),
);

async function withServer(opts, fn) {
  const handle = await runServe([root], { ...opts, http: 0 });
  try {
    return await fn(`http://127.0.0.1:${handle.port}`);
  } finally {
    await handle.close();
  }
}

test("http: health and dataset list with per-file validity", async () =>
  withServer({}, async (base) => {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.ok, true);
    const list = await (await fetch(`${base}/datasets`)).json();
    const good = list.datasets.find((d) => d.name === "good");
    const bad = list.datasets.find((d) => d.name === "bad");
    assert.equal(good.valid, true);
    assert.equal(bad.valid, false);
  }));

test("http: valid dataset 200, invalid 422, unknown 404, traversal 404", async () =>
  withServer({}, async (base) => {
    assert.equal((await fetch(`${base}/datasets/good`)).status, 200);
    const invalid = await fetch(`${base}/datasets/bad`);
    assert.equal(invalid.status, 422);
    const issues = await invalid.json();
    assert.ok(issues.issues.length > 0);
    assert.equal((await fetch(`${base}/datasets/nope`)).status, 404);
    assert.equal((await fetch(`${base}/datasets/..%2Fetc`)).status, 404);
    assert.equal((await fetch(`${base}/datasets/..%5Cetc`)).status, 404);
  }));

test("http: bearer gate — 401 without, 200 with", async () =>
  withServer({ bearer: "s3cret" }, async (base) => {
    assert.equal((await fetch(`${base}/datasets`)).status, 401);
    assert.equal(
      (await fetch(`${base}/datasets`, { headers: { Authorization: "Bearer s3cret" } })).status,
      200,
    );
  }));

test("http: writes are not offered", async () =>
  withServer({}, async (base) => {
    assert.equal((await fetch(`${base}/datasets/good`, { method: "PUT", body: "{}" })).status, 405);
  }));
