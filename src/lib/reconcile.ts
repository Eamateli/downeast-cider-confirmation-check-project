import type { Extraction, Finding, ReconcileReport } from "./schema";
import type { PoRow, ScheduleRow } from "./data";

// "cans" and "Cans " and "can" all count as the same unit.
function normalizeUnit(unit: string): string {
  const lower = unit.trim().toLowerCase();
  return lower.endsWith("s") ? lower.slice(0, -1) : lower;
}

// Both dates are ISO YYYY-MM-DD, so parsing is safe and unambiguous.
function daysBetween(laterIso: string, earlierIso: string): number {
  return Math.round((Date.parse(laterIso) - Date.parse(earlierIso)) / 86_400_000);
}

function formatUsd(amount: number): string {
  const fixed = amount.toFixed(3);
  return fixed.endsWith("0") ? fixed.slice(0, -1) : fixed;
}

function formatQty(n: number): string {
  return n.toLocaleString("en-US");
}

// Fallback for emails with no PO number: match the supplier's product wording
// against PO descriptions. Requires two or more shared distinctive words and a
// single clear winner, otherwise we refuse to guess.
function findPoByDescription(skuText: string, pos: PoRow[]): PoRow | undefined {
  const words = new Set(
    skuText.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
  );
  let best: PoRow | undefined;
  let bestScore = 1; // a single shared word is not enough
  let tied = false;
  for (const po of pos) {
    const descWords = po.description.toLowerCase().split(/[^a-z0-9]+/);
    const score = descWords.filter((word) => words.has(word)).length;
    if (score > bestScore) {
      best = po;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && best) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

// Pure function: same inputs always produce the same report. Every verdict
// below is plain TypeScript. The LLM never computes any of this.
export function reconcile(
  extraction: Extraction,
  pos: PoRow[],
  schedule: ScheduleRow[]
): ReconcileReport {
  const findings: Finding[] = [];

  // Rule 1: PO lookup. A stated PO number must match exactly; an email with
  // no PO number gets one conservative match attempt by product description.
  // Anything else routes to a human, no guessing.
  let po: PoRow | undefined;
  let matchedByDescription = false;
  if (extraction.po_number) {
    po = pos.find((row) => row.po_number === extraction.po_number);
  } else if (extraction.sku_text) {
    po = findPoByDescription(extraction.sku_text, pos);
    matchedByDescription = po !== undefined;
  }
  if (!po) {
    const message = extraction.po_number
      ? `${extraction.po_number} not found in open POs. Possible supplier typo or missing PO. Route to a buyer.`
      : "No PO number stated in the email and no confident product match. Route to a buyer.";
    return {
      extraction,
      matchedPo: null,
      findings: [{ type: "NEEDS_REVIEW", severity: "warn", message }],
    };
  }

  // Rule 2: Date. A slip is a warning; a slip past the production run start is a risk.
  if (extraction.confirmed_ship_date && extraction.confirmed_ship_date > po.due_date) {
    const slipDays = daysBetween(extraction.confirmed_ship_date, po.due_date);
    const dateFinding: Finding = {
      type: "DATE_SLIP",
      severity: "warn",
      message: `Ship date slipped ${slipDays} day${slipDays === 1 ? "" : "s"}: PO due ${po.due_date}, supplier now says ${extraction.confirmed_ship_date}.`,
    };
    const run = schedule.find((row) => row.run_id === po.run_id);
    if (run && extraction.confirmed_ship_date > run.start_date) {
      dateFinding.severity = "risk";
      dateFinding.detail = `${run.run_id} (${run.product}) on ${run.line} starts ${run.start_date}, cans arrive ${extraction.confirmed_ship_date}. Run at risk.`;
    }
    findings.push(dateFinding);
  }

  // Rule 3: Unit. If the supplier confirmed in a different unit, we do not
  // auto-convert (pallets per truck vary); a human confirms the quantity.
  const unitsMismatch =
    extraction.unit !== null && normalizeUnit(extraction.unit) !== normalizeUnit(po.unit);
  if (unitsMismatch && extraction.unit) {
    findings.push({
      type: "UNIT_MISMATCH",
      severity: "warn",
      message: `Supplier confirmed in ${extraction.unit}, PO is in ${po.unit}. Quantity not compared, needs human confirmation.`,
      detail: matchedByDescription
        ? `No PO number in the email. Matched to ${po.po_number} by product description, worth confirming.`
        : undefined,
    });
  }

  // Rule 4: Quantity. Only compared when the units agree.
  if (!unitsMismatch && extraction.qty !== null && extraction.qty < po.qty) {
    const shortfall = po.qty - extraction.qty;
    const pct = Math.round((shortfall / po.qty) * 100);
    let message = `Quantity short: supplier confirmed ${formatQty(extraction.qty)} ${po.unit} of ${formatQty(po.qty)} ordered, a shortfall of ${formatQty(shortfall)} (${pct}%).`;
    if (extraction.is_partial_shipment) {
      message += " Supplier says balance to follow.";
    }
    findings.push({ type: "QTY_SHORT", severity: "warn", message });
  }

  // Rule 5: Price. Per-unit delta always; extended delta only when the
  // confirmed quantity is trustworthy (units match).
  if (extraction.unit_price_usd !== null && extraction.unit_price_usd !== po.unit_price_usd) {
    const delta = extraction.unit_price_usd - po.unit_price_usd;
    const sign = delta > 0 ? "+" : "-";
    const perUnit = `${sign}$${formatUsd(Math.abs(delta))}/unit`;
    const finding: Finding = {
      type: "PRICE_CHANGE",
      severity: "warn",
      message: `Unit price changed from $${formatUsd(po.unit_price_usd)} to $${formatUsd(extraction.unit_price_usd)} (${perUnit}).`,
    };
    if (!unitsMismatch && extraction.qty !== null) {
      const extended = delta * extraction.qty;
      finding.detail = `About ${sign}$${Math.abs(extended).toLocaleString("en-US", { maximumFractionDigits: 2 })} on the confirmed quantity of ${formatQty(extraction.qty)}.`;
    }
    findings.push(finding);
  }

  // Rule 6: Nothing fired means the confirmation is clean.
  if (findings.length === 0) {
    findings.push({
      type: "OK",
      severity: "ok",
      message: `Confirmation matches ${po.po_number}. No action needed.`,
    });
  }

  const matchedPo = Object.fromEntries(
    Object.entries(po).map(([key, value]) => [key, String(value)])
  );
  return { extraction, matchedPo, findings };
}
