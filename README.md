# Confirmation Check

In order to prevent production line shortages of cans the app checks supplier emails for order confirmation and issues.
Suppliers email us to confirm when our printed cans and cartons will arrive. A delay or a short quantity is easy to miss when it is buried in a long email, and we only notice when a production line has nothing to run. This app reads each confirmation, compares it to what we ordered and when we plan to make it, and tells us in plain colours whether anything is wrong.

## Where this fits in the bigger picture

This is one slice of a larger supply-chain and manufacturing system. It handles the **Raw Materials and Packaging** corner: checking supplier confirmations for cans, glass, labels, and ingredients. The same idea can be reused across the other areas.

<img width="1008" height="509" alt="Where this slice fits in the bigger system" src="https://github.com/user-attachments/assets/d16aa27a-e363-4441-bc67-2519197749a7" />


## Reading the results

Every check gives one of three colours:

- 🟢 **Green**: the confirmation matches the purchase order. Nothing to do.
- 🟡 **Amber**: something needs a human look (a short quantity, a price change, or a unit that does not match).
- 🔴 **Red**: a delay puts a production run at risk. Act on this first.

## How to use it

There are two ways to use the app. A slider in the top right switches between them.

### A. Try it instantly (Test mode, the slider is ON)

1. Open the app in your browser.
2. Under **Check a confirmation**, click one of the sample buttons (for example **Date slip**). It fills the box with an example email.
3. Click **Check confirmation**.
4. Read the coloured result on the right. The matching purchase order and production run highlight in the tables below.

That is the whole loop. The five samples cover a clean match, a delay, a short shipment, an unknown order, and a unit mismatch.

### B. Use your real Gmail (turn the slider OFF)

**One-time prep in Gmail:** create a label called `suppliers` (spelled exactly like that) and apply it to the supplier emails you want checked.

Then, in the app:

1. Turn the **Test** slider OFF (top right).
2. Click **Connect to Google** and sign in. You only do this once; it stays connected.
3. Your labelled emails appear in the **Select a supplier email** dropdown. Any attachments (PDF, spreadsheet, CSV) are read automatically, and the orders inside them fill the **Open purchase orders** table.
4. To load your production schedule, click **Upload document** (top right) and pick your schedule file. It fills the **Production schedule** table.
5. Pick an email from the dropdown, then click **Check confirmation**. The box border turns green, amber, or red.
6. If the result is green, a **Send reply** button appears so you can confirm back to the supplier. Tick **Auto-send reply when green** to have it reply on its own.

> **Note:** uploaded documents and email data live only in your browser tab and clear when you refresh or close the page. Your Google connection stays. Nothing is stored on a server.

## Try the full Gmail flow with ready-made examples

The `demo-kit` folder has five example emails, their attachments, and three schedule files, with a short guide (`demo-kit/README.md`). Send them to yourself, label them `suppliers`, and follow the steps above to see one green, one red (a run at risk), and three ambers.

## Where the AI is and is not trusted

The AI does one job only: read the messy email and pull out the facts (order number, quantity, unit, price, ship date). Every comparison, date calculation, and risk verdict after that is done by plain, predictable code, not the AI. So the same email always gives the same answer, and a person can explain every result. Two cases are handed to a human on purpose: an order number we do not recognise, and a confirmation measured in pallets when the order is in cans.

## Get the code and run it (one-time setup)

You only need this once. It takes about 10 minutes.

**Before you start, install these two free tools** (skip any you already have):

- **Node.js** (version 20 or newer): https://nodejs.org (download, run the installer, click through).
- **Git**: https://git-scm.com/downloads

**Get your Anthropic key** (this is what powers the AI reading):

1. Go to https://console.anthropic.com and sign in.
2. Open **API Keys**, click **Create Key**, and copy it (starts with `sk-ant-`).
3. Open **Billing** and add a small amount of credit (the minimum is plenty; the whole demo costs a few cents).

**Download and start the app.** Open a terminal (on Windows: "Command Prompt";
on Mac: "Terminal") and run these lines one at a time:

```
git clone <paste-the-repo-URL-here>
cd downeast-cider-test-task
npm install
cp .env.example .env.local
```

Now open the file `.env.local` in a text editor and paste your key after the
equals sign:

```
ANTHROPIC_API_KEY=sk-ant-...your key...
```

Save it, then start the app:

```
npm run dev
```

Open **http://localhost:3000** in your browser. The app works fully in Test
mode with just the Anthropic key.

**For the Gmail feature (optional):** also add `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` to `.env.local`. The one-time Google setup is a separate
guide: [docs/GOOGLE-SETUP.md](docs/GOOGLE-SETUP.md). Restart the app after
adding them.

**To put it online (optional):** it hosts for free on Vercel. Import the repo,
and add the same keys (`ANTHROPIC_API_KEY`, and the two `GOOGLE_` keys if using
Gmail) as environment variables in the Vercel project settings.

## Is it secure?

Yes, for a demo. Your Gmail sign-in is stored only in your own browser, so no one else can read your email or send on your behalf. The secret keys live on the server, never in the page. Ingested data is never saved to a database. While the app is unverified by Google, only email addresses you add as test users can connect.

## What the next two weeks would add

- Emails that check themselves automatically the moment they arrive.
- Auto-approval of clean, high-confidence matches.
- Writing results back into an ERP like NetSuite or QuickBooks.
- Sales and depletion data to drive reorder timing.
- A test set of real emails to measure accuracy before trusting it further.
