/**
 * stdio MCP transport: spawn the CLI (`serve <root>`, no --http) as a child
 * process and run a JSON-RPC handshake — the exact way agentgateway would
 * consume us as a stdio target.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliEntry = resolve(here, "..", "index.mjs");
const nodeBin = process.execPath;

const root = mkdtempSync(join(tmpdir(), "rsd-stdio-"));
writeFileSync(
  join(root, "demo.json"),
  JSON.stringify({
    name: "Demo",
    columns: [
      { name: "m", role: "period" },
      { name: "v", role: "value" },
    ],
    rows: [{ m: "Jan", v: 7 }],
  }),
);

class McpChild {
  constructor() {
    this.child = spawn(nodeBin, [cliEntry, "serve", root], { stdio: ["pipe", "pipe", "pipe"] });
    this.nextId = 1;
    this.pending = new Map();
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.id !== undefined && this.pending.has(message.id)) {
          this.pending.get(message.id)(message);
          this.pending.delete(message.id);
        }
      }
    });
  }
  send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  request(method, params) {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolveP, rejectP) => {
      const timer = setTimeout(() => rejectP(new Error(`timeout waiting for ${method}`)), 10000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolveP(message);
      });
    });
  }
  async close() {
    this.child.stdin.end();
    await new Promise((r) => this.child.on("exit", r));
  }
}

test("stdio MCP: initialize, list tools, read a dataset, refuse a bad name", async (t) => {
  const mcp = new McpChild();
  t.after(() => mcp.close());

  const init = await mcp.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "rsd-test", version: "0" },
  });
  assert.equal(init.result.error, undefined);
  assert.ok(init.result.serverInfo.name.length > 0);
  mcp.send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const tools = await mcp.request("tools/list", {});
  const names = tools.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("read_dataset"));
  assert.ok(names.includes("list_datasets"));

  const info = await mcp.request("tools/call", { name: "server_info", arguments: {} });
  const handshake = JSON.parse(info.result.content[0].text);
  assert.equal(handshake.service, "resultspace-data");
  assert.ok(handshake.contracts.includes("dataset-table-v1"));

  const read = await mcp.request("tools/call", {
    name: "read_dataset",
    arguments: { name: "demo" },
  });
  const payload = JSON.parse(read.result.content[0].text);
  assert.equal(payload.name, "Demo");
  assert.notEqual(read.result.isError, true); // SDK may answer isError:false explicitly

  const missing = await mcp.request("tools/call", {
    name: "read_dataset",
    arguments: { name: "../etc/passwd" },
  });
  assert.equal(missing.result.isError, true);
  const errorPayload = JSON.parse(missing.result.content[0].text);
  assert.equal(errorPayload.error, "dataset_unavailable");
});
