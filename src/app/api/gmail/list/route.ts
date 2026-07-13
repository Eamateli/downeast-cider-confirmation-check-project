import { NextResponse } from "next/server";
import { getAccessToken, gmailGet, googleClient, parseMessage } from "@/lib/google";
import { classifyEmails } from "@/lib/extract";

export const maxDuration = 60;

// Lists recent emails under the supplier label (default "suppliers") with
// sender, subject, body text, and attachments, then asks the AI for a short
// label per email and whether it is a real confirmation.
export async function GET(request: Request) {
  if (!googleClient()) {
    return NextResponse.json(
      { error: "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 }
    );
  }
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Google." }, { status: 401 });
  }

  const label = new URL(request.url).searchParams.get("label") ?? "suppliers";
  try {
    const list = await gmailGet(
      `messages?q=${encodeURIComponent(`label:${label}`)}&maxResults=15`,
      token
    );
    const ids: { id: string }[] = list.messages ?? [];
    const emails = [];
    for (const { id } of ids) {
      const message = await gmailGet(`messages/${id}?format=full`, token);
      const parsed = parseMessage(message);
      emails.push({
        id: parsed.id,
        from: parsed.from,
        subject: parsed.subject,
        date: parsed.date,
        bodyText: parsed.bodyText.slice(0, 10_000),
        attachments: parsed.attachments.map((a) => ({
          attachmentId: a.attachmentId,
          filename: a.filename,
        })),
        shortLabel: "",
        isConfirmation: true,
      });
    }

    // Triage is best effort: if the AI call fails the inbox still renders,
    // just without labels.
    if (emails.length > 0) {
      try {
        const triage = await classifyEmails(
          emails.map((e) => ({
            id: e.id,
            from: e.from,
            subject: e.subject,
            snippet: e.bodyText.slice(0, 500),
            attachments: e.attachments.map((a) => a.filename),
          }))
        );
        for (const item of triage.emails) {
          const email = emails.find((e) => e.id === item.id);
          if (email) {
            email.shortLabel = item.short_label;
            email.isConfirmation = item.is_confirmation;
          }
        }
      } catch {
        // keep defaults
      }
    }

    return NextResponse.json({ label, emails });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gmail request failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
