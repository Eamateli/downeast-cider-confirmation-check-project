import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";
import { ingestDocument } from "@/lib/extract";
import { getAccessToken, gmailGet } from "@/lib/google";

export const maxDuration = 60;

const MAX_TEXT_CHARS = 10_000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

const GmailAttachmentSchema = z.object({
  messageId: z.string().min(1),
  attachmentId: z.string().min(1),
  filename: z.string().min(1),
});

function bytesToInput(bytes: Buffer, filename: string): { text?: string; pdfBase64?: string } {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) return { pdfBase64: bytes.toString("base64") };
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const workbook = XLSX.read(bytes);
    const text = workbook.SheetNames.map(
      (sheet) => `Sheet: ${sheet}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheet])}`
    ).join("\n\n");
    return { text: text.slice(0, MAX_TEXT_CHARS) };
  }
  return { text: bytes.toString("utf8").slice(0, MAX_TEXT_CHARS) };
}

// Turns a document (browser upload, or a Gmail attachment referenced by id)
// into purchase order rows and production run rows via one AI extraction.
// The rows go back to the browser; nothing is stored on the server.
export async function POST(request: Request) {
  try {
    let bytes: Buffer;
    let filename: string;

    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ error: "Attach one non-empty file." }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({ error: "File too large. Keep documents under 5 MB." }, { status: 400 });
      }
      bytes = Buffer.from(await file.arrayBuffer());
      filename = file.name;
    } else {
      let params: z.infer<typeof GmailAttachmentSchema>;
      try {
        params = GmailAttachmentSchema.parse(await request.json());
      } catch {
        return NextResponse.json(
          { error: "Send a file upload or { messageId, attachmentId, filename }." },
          { status: 400 }
        );
      }
      const token = await getAccessToken();
      if (!token) {
        return NextResponse.json({ error: "Not connected to Google." }, { status: 401 });
      }
      const attachment = await gmailGet(
        `messages/${params.messageId}/attachments/${params.attachmentId}`,
        token
      );
      bytes = Buffer.from(attachment.data, "base64url");
      filename = params.filename;
    }

    const result = await ingestDocument(bytesToInput(bytes, filename));
    return NextResponse.json(result);
  } catch (error) {
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
