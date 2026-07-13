import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { extractConfirmation, extractConfirmationFromPdf } from "@/lib/extract";
import { reconcile } from "@/lib/reconcile";
import { loadPos, loadSchedule } from "@/lib/data";
import type { Extraction } from "@/lib/schema";

export const maxDuration = 60; // extraction can take a few seconds

const MAX_TEXT_CHARS = 10_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Session rows ingested in the browser ride along with the check, since the
// server keeps no state. includeBuiltin=false leaves out the demo CSVs.
const ExtraPoSchema = z.object({
  po_number: z.string().min(1),
  supplier: z.string().default(""),
  sku: z.string().default(""),
  description: z.string().default(""),
  qty: z.number(),
  unit: z.string().min(1),
  unit_price_usd: z.number(),
  due_date: z.string().min(1),
  run_id: z.string().default(""),
});
const ExtraRunSchema = z.object({
  run_id: z.string().min(1),
  line: z.string().default(""),
  product: z.string().default(""),
  start_date: z.string().min(1),
  sku_needed: z.string().default(""),
});

const RequestSchema = z.object({
  emailText: z.string().min(1).max(MAX_TEXT_CHARS),
  includeBuiltin: z.boolean().default(true),
  extraPos: z.array(ExtraPoSchema).default([]),
  extraRuns: z.array(ExtraRunSchema).default([]),
});

type ExtraRows = {
  includeBuiltin: boolean;
  extraPos: z.infer<typeof ExtraPoSchema>[];
  extraRuns: z.infer<typeof ExtraRunSchema>[];
};
const NO_EXTRAS: ExtraRows = { includeBuiltin: true, extraPos: [], extraRuns: [] };

// Accepts either JSON { emailText, includeBuiltin?, extraPos?, extraRuns? }
// or multipart form data with a `file` (.txt, .csv, .eml, .xlsx, .xls, .pdf).
async function readInput(
  request: Request
): Promise<{ text?: string; pdfBase64?: string; extras: ExtraRows; error?: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    try {
      const body = RequestSchema.parse(await request.json());
      return {
        text: body.emailText,
        extras: {
          includeBuiltin: body.includeBuiltin,
          extraPos: body.extraPos,
          extraRuns: body.extraRuns,
        },
      };
    } catch {
      return {
        extras: NO_EXTRAS,
        error: "Send JSON like { emailText: string } with 1 to 10,000 characters, or upload a file.",
      };
    }
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { extras: NO_EXTRAS, error: "Attach one non-empty file under the field name 'file'." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { extras: NO_EXTRAS, error: "File too large. Keep attachments under 5 MB." };
  }

  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const bytes = Buffer.from(await file.arrayBuffer());
    return { pdfBase64: bytes.toString("base64"), extras: NO_EXTRAS };
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(await file.arrayBuffer());
    const text = workbook.SheetNames.map(
      (sheet) => `Sheet: ${sheet}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])}`
    ).join("\n\n");
    return { text: text.slice(0, MAX_TEXT_CHARS), extras: NO_EXTRAS };
  }
  // .txt, .csv, .eml and anything else text-like
  const text = (await file.text()).slice(0, MAX_TEXT_CHARS);
  if (text.trim().length === 0) {
    return { extras: NO_EXTRAS, error: "That file has no readable text." };
  }
  return { text, extras: NO_EXTRAS };
}

export async function POST(request: Request) {
  const input = await readInput(request);
  if (input.error) {
    return NextResponse.json({ error: input.error }, { status: 400 });
  }

  try {
    let extraction: Extraction;
    if (input.pdfBase64) {
      extraction = await extractConfirmationFromPdf(input.pdfBase64);
    } else {
      extraction = await extractConfirmation(input.text!);
    }
    const { includeBuiltin, extraPos, extraRuns } = input.extras;
    const pos = [...(includeBuiltin ? loadPos() : []), ...extraPos];
    const schedule = [...(includeBuiltin ? loadSchedule() : []), ...extraRuns];
    const report = reconcile(extraction, pos, schedule);
    return NextResponse.json(report);
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "API key missing or invalid. Check ANTHROPIC_API_KEY in .env.local." },
        { status: 500 }
      );
    }
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Rate limited by the AI service. Wait a moment and try again." },
        { status: 429 }
      );
    }
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: "The AI service returned an error. Try again shortly." },
        { status: 500 }
      );
    }
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
