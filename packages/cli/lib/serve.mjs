/**
 * serve — the read-only dataset plane over two transports:
 *
 *   stdio MCP (default): agentgateway spawns this binary as an stdio target;
 *     tools: list_datasets, read_dataset, describe_contract, validate.
 *   plain HTTP (--http PORT [--bearer KEY]): "SFTPGo-lite" mode without a
 *     gateway — GET /health, GET /datasets, GET /datasets/<name>.
 */
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CONTRACTS, DATASET_TABLE_V1, describeContract, validateContract } from "./core.mjs";
import { listDatasets, readDataset } from "./serve-core.mjs";

export async function runServe(roots, { http, bearer } = {}) {
  if (roots.length === 0) {
    throw new Error("serve needs at least one dataset root directory");
  }
  if (http !== null && http !== undefined) {
    return serveHttp(roots, http, bearer);
  }
  return serveStdio(roots);
}

async function serveStdio(roots) {
  const server = new McpServer({ name: "resultspace-data", version: "0.2.0" });

  server.registerTool(
    "server_info",
    {
      description:
        "Handshake: identify this server (service, version, contracts, capabilities). The portal calls this to verify a connection really points at a resultspace-data serve instance before trusting the dataset contract.",
      inputSchema: {},
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            service: "resultspace-data",
            version: "0.2.0",
            mode: "datasets",
            contracts: CONTRACTS,
            capabilities: ["list_datasets", "read_dataset", "describe_contract", "validate"],
          }),
        },
      ],
    }),
  );

  server.registerTool(
    "list_datasets",
    {
      description:
        "List dataset-table-v1 JSON datasets in the served roots, with per-file validity.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: JSON.stringify(listDatasets(roots)) }] }),
  );

  server.registerTool(
    "read_dataset",
    {
      description:
        "Read one dataset by name. Only contract-valid datasets are returned; invalid or unknown names come back as a structured error.",
      inputSchema: { name: z.string().describe("dataset name (file stem)") },
    },
    async ({ name }) => {
      const result = readDataset(roots, name);
      const text =
        result.status === "ok"
          ? JSON.stringify(result.data)
          : JSON.stringify({
              error: "dataset_unavailable",
              status: result.status,
              issues: result.issues,
            });
      return { content: [{ type: "text", text }], isError: result.status !== "ok" };
    },
  );

  server.registerTool(
    "describe_contract",
    {
      description:
        "Describe a contract (dataset-table-v1 | agent-run-request-v1 | agent-response-v1): fields, limits, rules.",
      inputSchema: { contract: z.enum(CONTRACTS).default(DATASET_TABLE_V1) },
    },
    async ({ contract }) => ({
      content: [{ type: "text", text: JSON.stringify(describeContract(contract)) }],
    }),
  );

  server.registerTool(
    "validate",
    {
      description:
        "Validate an already-parsed JSON payload against a contract. Use before answering the portal.",
      inputSchema: {
        contract: z.enum(CONTRACTS).default(DATASET_TABLE_V1),
        payload: z.string().describe("JSON string"),
      },
    },
    async ({ contract, payload }) => {
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                issues: [{ code: "invalid_json", path: "$", message: error.message.slice(0, 120) }],
              }),
            },
          ],
        };
      }
      const result = validateContract(contract, parsed);
      return {
        content: [{ type: "text", text: JSON.stringify({ ok: result.ok, issues: result.issues }) }],
      };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { transport: "stdio", close: () => transport.close() };
}

function serveHttp(roots, port, bearer) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://local");
    const send = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (bearer && req.headers.authorization !== `Bearer ${bearer}`) {
      return send(401, { error: "unauthorized" });
    }
    if (req.method !== "GET") {
      return send(405, { error: "method_not_allowed", allowed: ["GET"] });
    }
    if (url.pathname === "/health") {
      return send(200, { ok: true, service: "resultspace-data", transport: "http" });
    }
    if (url.pathname === "/datasets") {
      return send(200, { datasets: listDatasets(roots) });
    }
    const match = url.pathname.match(/^\/datasets\/([a-zA-Z0-9._-]+)$/);
    if (match) {
      const result = readDataset(roots, match[1]);
      return result.status === "ok"
        ? send(200, result.data)
        : send(result.status, { error: "dataset_unavailable", issues: result.issues });
    }
    send(404, { error: "not_found" });
  });
  return new Promise((resolveP, rejectP) => {
    server.once("error", rejectP);
    server.listen(port, "127.0.0.1", () => {
      resolveP({
        transport: "http",
        port: server.address().port,
        server,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
