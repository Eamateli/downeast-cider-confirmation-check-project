# Demo kit: test the Gmail flow end to end

Everything in the app is session-only. Ingested POs, schedules, and check
results live in your browser tab and are gone on refresh. That is by design.

## 1. One-time Gmail prep

1. In Gmail, create a label called `suppliers` (Settings, Labels, Create new).
2. Send yourself five emails. The bodies and subjects are in `emails/`,
   each file says which attachment from `attachments/` to add (email-5 has
   none, that is the point of it).
3. Apply the `suppliers` label to those five emails.

## 2. In the app

1. Connect Google (green dot appears when connected).
2. The app lists the five emails, the AI gives each a short label, and each
   attachment is read automatically. The purchase orders land in the Open
   purchase orders table.
3. Upload the three files from `schedules/` with the Upload document button.
   The runs land in the Production schedule table.
4. Turn the Test slider off to hide the built-in demo data and work only
   with what came from your emails and uploads.
5. Pick each email in the dropdown and press Check email.

## 3. What each email should produce

| Email | Attachment | Expected result |
|---|---|---|
| email-1 Order Confirmation PO-4601 | po-4601.pdf | Green. Matches the PO, ships before the due date. |
| email-2 RE: PO-4602 schedule update | po-4602.csv | Red. Ships August 19, seven days late, after RUN-202 starts August 14. |
| email-3 PO-4603 confirmation partial | po-4603.xlsx | Amber twice. 12,000 cartons short (20 percent) and price up $0.03 per carton. |
| email-4 your lemon shandy order | po-4604.csv | Amber. Supplier confirms pallets, PO is in cans, quantity needs a human. |
| email-5 Confirmation PO-4699 | none | Amber. PO-4699 is in no table, likely a supplier typo, routes to a buyer instead of guessing. |

A green result offers Send reply, or sends by itself if the auto-send toggle
is armed.
