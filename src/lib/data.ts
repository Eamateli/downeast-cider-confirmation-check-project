import fs from "fs";
import path from "path";

export type PoRow = {
  po_number: string;
  supplier: string;
  sku: string;
  description: string;
  qty: number;
  unit: string;
  unit_price_usd: number;
  due_date: string; // ISO YYYY-MM-DD
  run_id: string;
};

export type ScheduleRow = {
  run_id: string;
  line: string;
  product: string;
  start_date: string; // ISO YYYY-MM-DD
  sku_needed: string;
};

// Hand-rolled CSV parse. The data files are tiny and contain no commas
// inside values, so a plain split is safe and a parser dependency is not.
function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const values = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

// Literal file paths below, so Vercel's build tracer bundles the CSVs.
export function loadPos(): PoRow[] {
  const raw = fs.readFileSync(path.join(process.cwd(), "data", "pos.csv"), "utf8");
  return parseCsv(raw).map((row) => ({
    po_number: row.po_number,
    supplier: row.supplier,
    sku: row.sku,
    description: row.description,
    qty: Number(row.qty),
    unit: row.unit,
    unit_price_usd: Number(row.unit_price_usd),
    due_date: row.due_date,
    run_id: row.run_id,
  }));
}

export function loadSchedule(): ScheduleRow[] {
  const raw = fs.readFileSync(path.join(process.cwd(), "data", "schedule.csv"), "utf8");
  return parseCsv(raw).map((row) => ({
    run_id: row.run_id,
    line: row.line,
    product: row.product,
    start_date: row.start_date,
    sku_needed: row.sku_needed,
  }));
}
