import { cookies } from "next/headers";

// Minimal Gmail OAuth + API helpers, hand-rolled with fetch. Tokens live in
// an httpOnly cookie, so there is no database and nothing server-side to
// clean up. Scopes: read mail + send mail, nothing else.

const TOKEN_COOKIE = "google_tokens";
export const OAUTH_SCOPES =
  "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // ms epoch
};

export function googleClient(): { id: string; secret: string } | null {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export async function saveTokens(tokens: GoogleTokens) {
  (await cookies()).set(TOKEN_COOKIE, JSON.stringify(tokens), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

// Returns a valid access token, refreshing once if expired. Null when the
// user has not connected Google (or the refresh fails).
export async function getAccessToken(): Promise<string | null> {
  const raw = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!raw) return null;
  let tokens: GoogleTokens;
  try {
    tokens = JSON.parse(raw);
  } catch {
    return null;
  }
  if (Date.now() < tokens.expires_at - 30_000) return tokens.access_token;

  const client = googleClient();
  if (!client || !tokens.refresh_token) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const refreshed: GoogleTokens = {
    access_token: data.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  };
  await saveTokens(refreshed);
  return refreshed.access_token;
}

export async function gmailGet(path: string, accessToken: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// ---- Gmail message payload parsing (headers, plain-text body, attachments) --

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

export type ParsedEmail = {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  messageIdHeader: string;
  bodyText: string;
  attachments: { attachmentId: string; filename: string; mimeType: string }[];
};

function header(part: GmailPart, name: string): string {
  return part.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function walkParts(part: GmailPart, out: { text: string[]; attachments: ParsedEmail["attachments"] }) {
  if (part.filename && part.body?.attachmentId) {
    out.attachments.push({
      attachmentId: part.body.attachmentId,
      filename: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
    });
  } else if (part.mimeType === "text/plain" && part.body?.data) {
    out.text.push(Buffer.from(part.body.data, "base64url").toString("utf8"));
  }
  for (const child of part.parts ?? []) walkParts(child, out);
}

export function parseMessage(message: {
  id: string;
  threadId: string;
  snippet?: string;
  payload: GmailPart;
}): ParsedEmail {
  const out = { text: [] as string[], attachments: [] as ParsedEmail["attachments"] };
  walkParts(message.payload, out);
  return {
    id: message.id,
    threadId: message.threadId,
    from: header(message.payload, "From"),
    subject: header(message.payload, "Subject"),
    date: header(message.payload, "Date"),
    messageIdHeader: header(message.payload, "Message-ID"),
    bodyText: out.text.join("\n").trim() || message.snippet || "",
    attachments: out.attachments,
  };
}
