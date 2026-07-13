import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import {
  ExtractionSchema,
  IngestSchema,
  EmailClassificationSchema,
  type Extraction,
  type IngestResult,
  type EmailClassification,
} from "./schema";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

type UserContent = Anthropic.MessageParam["content"];

// One structured-output call, one retry, then a clean error. Every AI read in
// the app goes through here; the schema decides what comes back.
async function parseWith<Schema extends z.ZodType>(
  schema: Schema,
  system: string,
  content: UserContent
): Promise<z.infer<Schema>> {
  const call = () =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(schema) },
    });

  let response = await call();
  if (!response.parsed_output) response = await call(); // one retry
  if (!response.parsed_output) {
    throw new Error("Extraction failed: model output did not match schema.");
  }
  return response.parsed_output;
}

function pdfContent(pdfBase64: string, instruction: string): UserContent {
  return [
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
    },
    { type: "text", text: instruction },
  ];
}

// ---- Confirmation extraction (the original job) ----------------------------

const SYSTEM = `You extract structured data from supplier order-confirmation
emails for a beverage manufacturer. Extract ONLY what the email states.
Never guess a value that is not present: use null. Do not convert units.
Report quantities in the unit the supplier used. Dates become YYYY-MM-DD;
the current year is 2026 if the email omits the year.`;

export async function extractConfirmation(emailText: string): Promise<Extraction> {
  return parseWith(ExtractionSchema, SYSTEM, emailText);
}

// PDFs go to Claude as-is; the API reads them natively, so no OCR dependency.
export async function extractConfirmationFromPdf(pdfBase64: string): Promise<Extraction> {
  return parseWith(
    ExtractionSchema,
    SYSTEM,
    pdfContent(pdfBase64, "Extract the supplier order confirmation from this document.")
  );
}

// ---- Document ingest (PO lists and production schedules) -------------------

const INGEST_SYSTEM = `You read purchasing documents for a beverage
manufacturer: purchase orders and production schedules, arriving as CSV,
spreadsheet text, or PDF. Extract every purchase order row and every
production run row you can find. Extract ONLY what the document states,
use null for anything missing. Dates become YYYY-MM-DD; the current year
is 2026 if omitted. Quantities and prices are plain numbers.`;

export async function ingestDocument(input: {
  text?: string;
  pdfBase64?: string;
}): Promise<IngestResult> {
  if (input.pdfBase64) {
    return parseWith(
      IngestSchema,
      INGEST_SYSTEM,
      pdfContent(input.pdfBase64, "Extract purchase orders and production runs from this document.")
    );
  }
  return parseWith(IngestSchema, INGEST_SYSTEM, input.text ?? "");
}

// ---- Inbox triage -----------------------------------------------------------

const CLASSIFY_SYSTEM = `You label supplier emails for a purchasing dashboard.
For each email return a short label of at most three words, and whether it is
a real supplier order confirmation with usable order content. Greetings,
tests, and empty emails are not confirmations. Keep every id exactly as given.`;

export async function classifyEmails(
  emails: { id: string; from: string; subject: string; snippet: string; attachments: string[] }[]
): Promise<EmailClassification> {
  return parseWith(EmailClassificationSchema, CLASSIFY_SYSTEM, JSON.stringify(emails));
}
