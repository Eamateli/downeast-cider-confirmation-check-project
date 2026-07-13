# Confirmation Check

Supplier order confirmation reconciliation for Downeast Cider's printed cans and labels.

## The problem

Downeast buys printed 12oz cans and 9-pack cartons from packaging suppliers, and the seasonal rotation means frequent new printed-can SKUs, each with its own PO and deadline. Suppliers send confirmations and change notices as emails, where a slipped ship date or a short quantity sits buried in paragraph three. Today a buyer eyeballs those emails against a PO spreadsheet, and a missed slip costs an idle canning line, expedite fees, or a stockout on a launch SKU.

Stated assumptions: long lead times and truckload minimums on printed cans, confirmations arrive as free-form email text, and the buyer's reference data lives in two small tables (open POs and the production schedule).

## What this slice does

Paste a supplier confirmation email and the tool tells you what the supplier actually committed to, how that differs from the PO, and which production run is now at risk. One input (email text), one transformation (AI extraction followed by a deterministic diff), one output (an exception report with green, amber, and red cards). Five sample emails are built in, including one designed to fail gracefully.

![Screenshot](docs/screenshot.png)
<!-- Founder: save a screenshot of the app as docs/screenshot.png -->

## Where the AI is and is not trusted

The Claude call does exactly one job: read the messy email and fill in a strict schema (PO number, quantity, unit, price, ship date, plus a confidence level and notes). Structured outputs guarantee the response matches the schema, and the model is told to return null rather than guess. Everything after that is plain TypeScript in `src/lib/reconcile.ts`: the PO lookup, the date math, the dollar deltas, and the risk verdicts. Same inputs, same report, every time. The AI reads, the code judges.

Two deliberate human-in-the-loop boundaries: an unknown PO routes to a buyer instead of guessing, and a confirmation in pallets against a PO in cans is flagged rather than auto-converted.

## Run locally

```
git clone <this repo>
cd downeast-confirmation-check
npm install
cp .env.example .env.local   # then paste your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000 and click any sample button.

## Live demo

Coming after deploy. <!-- Founder: paste the Vercel URL here -->

## Trade-offs knowingly taken

- Pasted text stands in for an email inbox webhook.
- No PDF parsing or OCR, text only.
- No unit auto-conversion (pallets to cans needs a human).
- No idempotency on re-sent confirmations, checking twice reports twice.
- Reference data is two CSVs, not an ERP connection.

## What the next two weeks would add

- Inbox ingestion via n8n or Zapier so confirmations check themselves on arrival.
- Confidence thresholds that auto-approve clean, high-confidence matches.
- ERP write-back to NetSuite or QuickBooks so the PO record updates itself.
- VIP or iDig depletion data driving reorder points on the same screen.
- An eval set of 30 real-format emails to measure extraction accuracy before trusting it further.
