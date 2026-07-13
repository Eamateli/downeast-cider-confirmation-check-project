// The five demo emails. Each one is crafted to trigger a specific
// reconciliation outcome; do not edit the wording or numbers.

export const SAMPLE_CLEAN_MATCH = `Subject: Order Confirmation - PO-4501

Hi Dana,

Thanks for the order. Confirming the details below for Downeast Cider:

Order: PO-4501
Item: 12oz printed can, Original Blend design (our ref CC-88104)
Quantity: 204,000 cans (12 pallets)
Unit price: $0.089/can as quoted
Ship date: on or before July 24, 2026 via our carrier to East Boston.

Artwork is approved and plates are staged. Let us know if anything changes.

Best,
Marco
CanCo Printworks - Customer Service`;

export const SAMPLE_DATE_SLIP = `Subject: RE: RE: PO-4502 - update from production

Hi Dana,

Hope you had a good weekend! Quick update on a few things.

Artwork for the Blueberry Pie seasonal design came out beautifully, the
purple really pops on the matte finish. The team here loves it.

One note from our production scheduler: the printing line had an unplanned
maintenance window last week, so your 102,000 cans on PO-4502 are now
slotted to ship July 29 instead of the original date. Quantity and pricing
($0.094/can) unchanged. Apologies for the shuffle.

Also, are you folks going to CiderCon this year? A few of us will be there.

Cheers,
Marco
CanCo Printworks - Customer Service`;

export const SAMPLE_SHORT_SHIP_PRICE = `Subject: PO-4503 confirmation - partial

Hello,

Confirming PO-4503 for the Apple Mix Pack 9-pack cartons.

Due to a board stock allocation we can release 38,000 cartons for the
July 28 date, with the remaining 7,000 to follow approximately two weeks
later. Additionally, corrugate costs have moved since your last order and
this run prices at $0.34 per carton.

Please advise if you would like us to proceed on this basis.

Regards,
Priya Shah
LabelWorks NE`;

export const SAMPLE_UNKNOWN_PO = `Subject: Confirmation PO-4519

Hi team,

Confirming your order PO-4519, 96,000 12oz cans, Strawberry Dragonfruit
design, shipping August 11 at $0.096/can.

Thanks,
Marco
CanCo Printworks - Customer Service`;

export const SAMPLE_UNIT_MISMATCH = `Subject: your peach order

Hi Dana,

Per our call: 25 pallets of the 12oz sleeved can, Peach Mango Cider
artwork, holding your $0.089 pricing, on the truck August 1.

Marco`;

export const SAMPLES = [
  { label: "Clean match", text: SAMPLE_CLEAN_MATCH },
  { label: "Date slip", text: SAMPLE_DATE_SLIP },
  { label: "Short ship + price", text: SAMPLE_SHORT_SHIP_PRICE },
  { label: "Unknown PO", text: SAMPLE_UNKNOWN_PO },
  { label: "Unit mismatch", text: SAMPLE_UNIT_MISMATCH },
];
