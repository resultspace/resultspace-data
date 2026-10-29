/**
 * serve-core — the shared read-only dataset plane behind both transports
 * (stdio MCP and plain HTTP). Only contract-valid dataset-table-v1 files are
 * ever exposed: every read validates through the canonical core.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { DATASET_TABLE_V1, MAX_FILE_BYTES, validateDatasetTable } from "./core.mjs";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

/** A dataset name is URL-safe and maps to `<root>/<name>.json` — no traversal. */
export function safeName(name) {
  return NAME_RE.test(name) && !name.includes("..");
}

export function scanDatasets(roots) {
  const found = [];
  for (const root of roots) {
    let entries;
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith(".json")) {
        found.push({ name: entry.slice(0, -5), root });
      }
    }
  }
  return found;
}

export function datasetPath(root, name) {
  return resolve(join(root, `${name}.json`));
}

/**
 * Read and validate one dataset by name. Returns
 * `{ status: "ok", data } | { status: 404|413|422, issues }`.
 * The mtime cache keeps repeated reads (health checks, agent chatter) free.
 */
const cache = new Map();

export function readDataset(roots, name) {
  if (!safeName(name)) {
    return {
      status: 404,
      issues: [{ code: "unknown_dataset", path: "$", message: `no dataset named "${name}"` }],
    };
  }
  const hit = scanDatasets(roots).find((d) => d.name === name);
  if (!hit) {
    return {
      status: 404,
      issues: [{ code: "unknown_dataset", path: "$", message: `no dataset named "${name}"` }],
    };
  }
  const path = datasetPath(hit.root, name);
  let mtime;
  let bytes;
  try {
    mtime = statSync(path).mtimeMs;
    bytes = statSync(path).size;
  } catch {
    return {
      status: 404,
      issues: [{ code: "unknown_dataset", path: "$", message: `no dataset named "${name}"` }],
    };
  }
  if (bytes > MAX_FILE_BYTES) {
    return {
      status: 413,
      issues: [
        {
          code: "file_too_large",
          path: "$",
          message: `dataset is ${bytes} bytes; the limit is ${MAX_FILE_BYTES} (256 KiB)`,
        },
      ],
    };
  }
  const cached = cache.get(path);
  if (cached && cached.mtime === mtime) {
    return cached.result;
  }
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    const result = {
      status: 422,
      issues: [
        {
          code: "invalid_json",
          path: "$",
          message: `not valid JSON: ${error.message.slice(0, 120)}`,
        },
      ],
    };
    cache.set(path, { mtime, result });
    return result;
  }
  const validation = validateDatasetTable(parsed);
  const result = validation.ok
    ? { status: "ok", data: validation.data }
    : { status: 422, issues: validation.issues };
  cache.set(path, { mtime, result });
  return result;
}

/** List names with per-file validity (cheap: validated on read, cached by mtime). */
export function listDatasets(roots) {
  return scanDatasets(roots).map(({ name, root }) => {
    const result = readDataset(roots, name);
    return { name, valid: result.status === "ok", contract: DATASET_TABLE_V1 };
  });
}
