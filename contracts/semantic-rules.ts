/**
 * Semantic rules that JSON Schema alone cannot express.
 * These run after the structural Zod parse in both the CLI and the server.
 */

import type { z } from "zod";
import type { DatasetTableV1 } from "./dataset-table-v1";

export type SemanticIssue = {
  code: string;
  path: string;
  expected?: string;
  message: string;
};

export function validateDatasetTableSemantics(data: DatasetTableV1): SemanticIssue[] {
  const issues: SemanticIssue[] = [];
  const columnNames = data.columns.map((col) => col.name);

  // Column names must be unique (case-insensitive after trim).
  const seen = new Set<string>();
  for (const col of data.columns) {
    const key = col.name.trim().toLowerCase();
    if (seen.has(key)) {
      issues.push({
        code: "duplicate_column",
        path: `$.columns[?(@.name=="${col.name}")`,
        message: `Column name "${col.name}" is used more than once (case-insensitive)`,
      });
    }
    seen.add(key);
  }

  // Every row must contain exactly the declared columns, no extras.
  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    if (!row) continue;

    for (const name of columnNames) {
      if (!(name in row)) {
        issues.push({
          code: "missing_row_key",
          path: `$.rows[${i}].${name}`,
          message: `Row ${i} is missing declared column "${name}"`,
        });
      }
    }

    for (const key of Object.keys(row)) {
      if (!columnNames.includes(key)) {
        issues.push({
          code: "unknown_row_key",
          path: `$.rows[${i}].${key}`,
          message: `Row ${i} contains undeclared column "${key}"`,
        });
      }
    }
  }

  // At least one `value`-role column is required for chart/KPI widgets.
  if (!data.columns.some((col) => col.role === "value")) {
    issues.push({
      code: "missing_value_column",
      path: "$.columns",
      expected: "at least one column with role=value",
      message: "No column has role=value; charts and KPI widgets need a numeric column",
    });
  }

  // A `value`-role column feeds chart series and KPI math: only finite
  // numbers or null (= unknown) are allowed there — never strings. Cells in
  // label/period/category columns stay free-form strings.
  for (const col of data.columns) {
    if (col.role !== "value") {
      continue;
    }
    for (let i = 0; i < data.rows.length; i++) {
      const cell = data.rows[i]?.[col.name];
      if (typeof cell === "string") {
        issues.push({
          code: "value_column_string",
          path: `$.rows[${i}].${col.name}`,
          expected: "number or null",
          message: `Value column "${col.name}" row ${i} contains a string "${cell.slice(0, 40)}"; clean or aggregate it upstream`,
        });
      }
    }
  }

  return issues;
}
