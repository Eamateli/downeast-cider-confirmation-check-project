import { NextResponse } from "next/server";
import { z } from "zod";
import { getAccessToken, gmailGet, parseMessage } from "@/lib/google";

const RequestSchema = z.object({ messageId: z.string().min(1) });

const REPLY_BODY =
  "Hi,\n\nThanks for the confirmation. It matches our purchase order records, no changes needed on our side.\n\nBest,\nDowneast Cider purchasing";

// Sends a short confirmation reply on the original thread. Only called for
// all-green results, either by the button or by the armed auto-send toggle.
export async function POST(request: Request) {
  let messageId: string;
  try {
    messageId = RequestSchema.parse(await request.json()).messageId;
  } catch {
    return NextResponse.json({ error: "Send { messageId }." }, { status: 400 });
  }
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "Not connected to Google." }, { status: 401 });
  }

  try {
    const message = await gmailGet(`messages/${messageId}?format=full`, token);
    const parsed = parseMessage(message);
    const subject = parsed.subject.toLowerCase().startsWith("re:")
      ? parsed.subject
      : `Re: ${parsed.subject}`;

    const headers = [
      `To: ${parsed.from}`,
      `Subject: ${subject}`,
      parsed.messageIdHeader ? `In-Reply-To: ${parsed.messageIdHeader}` : "",
      parsed.messageIdHeader ? `References: ${parsed.messageIdHeader}` : "",
      'Content-Type: text/plain; charset="UTF-8"',
    ].filter((line) => line !== "");
    const raw = headers.join("\r\n") + "\r\n\r\n" + REPLY_BODY;

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        raw: Buffer.from(raw).toString("base64url"),
        threadId: parsed.threadId,
      }),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Gmail refused to send: ${(await res.text()).slice(0, 200)}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ sent: true, to: parsed.from });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
