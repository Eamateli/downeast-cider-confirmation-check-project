import { z } from "zod";

// What the LLM extracts. Nullable everywhere: never force the model to invent.
export const ExtractionSchema = z.object({
  po_number: z
    .string()
    .nullable()
    .describe("PO number exactly as written, e.g. PO-4502. Null if absent."),
  supplier_name: z.string().nullable(),
  sku_text: z
    .string()
    .nullable()
    .describe("The product exactly as the supplier described it, verbatim."),
  qty: z.number().nullable().describe("Confirmed quantity as a number."),
  unit: z
    .string()
    .nullable()
    .describe("Unit as stated: cans, cartons, pallets, liters..."),
  unit_price_usd: z.number().nullable(),
  confirmed_ship_date: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD. Null if no date is stated."),
  is_partial_shipment: z
    .boolean()
    .describe("True if the email says more is coming later."),
  confidence: z.enum(["high", "medium", "low"]),
  notes: z
    .string()
    .describe("One sentence on anything ambiguous or unusual in the email."),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

// What reconcile.ts produces. Discriminate findings by `type`.
export type FindingType =
  | "OK"
  | "DATE_SLIP"
  | "QTY_SHORT"
  | "PRICE_CHANGE"
  | "UNIT_MISMATCH"
  | "NEEDS_REVIEW";

export type Finding = {
  type: FindingType;
  severity: "ok" | "warn" | "risk";
  message: string; // human sentence, ready to render
  detail?: string; // second line, e.g. the dollar delta
};

export type ReconcileReport = {
  extraction: Extraction;
  matchedPo: Record<string, string> | null; // the raw PO row, if found
  findings: Finding[];
};
