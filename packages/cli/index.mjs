#!/usr/bin/env node
/**
 * resultspace-data — validate ResultSpace external payloads against the
 * versioned contracts, and serve datasets read-only.
 *
 *   resultspace-data validate <file.json> [...] [--json] [--contract <name>]   "-" = stdin
 *   resultspace-data describe [contract] [--json]
 *   resultspace-data vectors [--json]                       self-check all contracts
 *   resultspace-data serve <roots...> [--http PORT] [--bearer KEY]
 *   resultspace-data --help | --version
 *
 * Contracts: dataset-table-v1 (default) · agent-run-request-v1 · agent-response-v1
 *
 * Exit codes: 0 = all valid, 1 = validation failed, 2 = usage or I/O error.
 * Requires Node ≥ 22.18 / 24 (native TypeScript type stripping — the CLI
 * imports the canonical .ts contracts directly; there is no compiled copy).
 */
import { readFileSync } from "node:fs";
import {
  CONTRACTS,
  DATASET_TABLE_V1,
  MAX_FILE_BYTES,
  describeContract,
  validateContract,
} from "./lib/core.mjs";
import { runServe } from "./lib/serve.mjs";

const VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

const HELP = `resultspace-data v${VERSION}

Usage:
  resultspace-data validate <file.json> [...] [--json] [--contract <name>]   "-" reads stdin
  resultspace-data describe [contract] [--json]
  resultspace-data vectors [--json]
  resultspace-data serve <roots...> [--http PORT] [--bearer KEY]   read-only dataset plane
  resultspace-data --help | --version

Contracts: ${CONTRACTS.join(" · ")}

Exit codes: 0 all valid · 1 validation failed · 2 usage or I/O error.

validate enforces the 256 KiB byte gate BEFORE parsing, then the Zod contract
(plus semantic rules for datasets). serve exposes datasets read-only: stdio MCP
by default (agentgateway spawns it as a target), or plain HTTP with --http.`;

function fail(message, code = 2) {
  console.error(`resultspace-data: ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = {
    json: false,
    files: [],
    command: null,
    contract: null,
    http: null,
    bearer: null,
    positional: [],
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.command = "help";
    else if (arg === "--version") args.command = "version";
    else if (arg.startsWith("--contract"))
      args.contract = arg.includes("=") ? arg.split("=")[1] : argv[++i];
    else if (arg.startsWith("--http"))
      args.http = Number(arg.includes("=") ? arg.split("=")[1] : argv[++i]);
    else if (arg.startsWith("--bearer"))
      args.bearer = arg.includes("=") ? arg.split("=")[1] : argv[++i];
    else if (["validate", "describe", "vectors", "serve"].includes(arg)) args.command = arg;
    else if (arg.startsWith("-") && arg !== "-") fail(`unknown option ${arg}`);
    else {
      args.files.push(arg);
      args.positional.push(arg);
    }
  }
  return args;
}

function readInput(path) {
  if (path === "-") return readFileSync(0, "utf8");
  const bytes = readFileSync(path);
  if (bytes.byteLength > MAX_FILE_BYTES) return { __tooBig: bytes.byteLength };
  return bytes.toString("utf8");
}

function validateOne(path, label, contract) {
  const raw = readInput(path);
  if (raw && typeof raw === "object" && raw.__tooBig) {
    return {
      file: label,
      contract,
      ok: false,
      issues: [
        {
          code: "file_too_large",
          path: "$",
          message: `file is ${raw.__tooBig} bytes; the limit is ${MAX_FILE_BYTES} (256 KiB)`,
        },
      ],
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      file: label,
      contract,
      ok: false,
      issues: [
        {
          code: "invalid_json",
          path: "$",
          message: `not valid JSON: ${error.message.slice(0, 120)}`,
        },
      ],
    };
  }
  const result = validateContract(contract, parsed);
  return { file: label, contract, ok: result.ok, issues: result.issues };
}

function printHuman(results) {
  for (const result of results) {
    console.log(
      `${result.ok ? "✔" : "✖"} ${result.file} [${result.contract}]${result.ok ? " — valid" : ` — ${result.issues.length} issue(s)`}`,
    );
    for (const issue of result.issues) {
      console.log(`   ${issue.code}  ${issue.path}  ${issue.message}`);
    }
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.command === "help" || !args.command) {
  console.log(HELP);
  process.exit(args.command ? 0 : 2);
}
if (args.command === "version") {
  console.log(VERSION);
  process.exit(0);
}

if (args.command === "describe") {
  const contract = args.contract ?? args.positional[0] ?? DATASET_TABLE_V1;
  if (!CONTRACTS.includes(contract)) fail(`unknown contract ${contract}`);
  const summary = describeContract(contract);
  console.log(
    args.json
      ? JSON.stringify(summary, null, 2)
      : Object.entries(summary)
          .map(
            ([k, v]) =>
              `${k.padEnd(16)} ${Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : v}`,
          )
          .join("\n"),
  );
  process.exit(0);
}

if (args.command === "vectors") {
  const results = [];
  for (const contract of CONTRACTS) {
    const vectors = JSON.parse(
      readFileSync(new URL(`../../vectors/${contract}.vectors.json`, import.meta.url), "utf8"),
    );
    for (const [name, vector] of Object.entries(vectors)) {
      const result = validateContract(contract, vector.data);
      results.push({
        name,
        contract,
        expected: vector.expect,
        ok: result.ok === (vector.expect === "valid"),
        issues: result.issues,
      });
    }
  }
  const failed = results.filter((r) => !r.ok);
  if (args.json) {
    console.log(JSON.stringify({ total: results.length, failed: failed.length, results }, null, 2));
  } else {
    for (const r of results) {
      console.log(
        `${r.ok ? "✔" : "✖"} ${r.name} (${r.contract}, expect ${r.expected})${r.ok ? "" : ` — ${JSON.stringify(r.issues).slice(0, 200)}`}`,
      );
    }
    console.log(`\n${results.length - failed.length}/${results.length} vectors pass`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

if (args.command === "serve") {
  let handle;
  try {
    handle = await runServe(args.positional, { http: args.http, bearer: args.bearer });
  } catch (error) {
    fail(error.message, 2);
  }
  if (handle.transport === "http") {
    console.log(
      `resultspace-data serve (http) on 127.0.0.1:${handle.port} — roots: ${args.positional.join(", ")}`,
    );
    // keep the process alive for the HTTP server; never fall through to
    // the validate branch (its readFileSync on a root DIR crashed us once)
    await new Promise(() => {});
  } else {
    console.error(
      `resultspace-data serve (stdio MCP) ready — roots: ${args.positional.join(", ")}`,
    );
    // the stdio transport owns the lifecycle: process exits when stdin closes
  }
}

// validate (never reached from serve — serve owns its lifecycle above)
if (args.command === "serve") {
  // serve is long-running; nothing to validate afterwards
} else if (args.files.length === 0) fail('validate needs at least one file (or "-" for stdin)');
else {
  if (args.contract && !CONTRACTS.includes(args.contract))
    fail(`unknown contract ${args.contract}`);
  const contract = args.contract ?? DATASET_TABLE_V1;
  const results = args.files.map((file) =>
    validateOne(file, file === "-" ? "<stdin>" : file, contract),
  );
  if (args.json) {
    console.log(JSON.stringify({ allValid: results.every((r) => r.ok), results }, null, 2));
  } else {
    printHuman(results);
    console.log(`\n${results.filter((r) => r.ok).length}/${results.length} file(s) valid`);
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
