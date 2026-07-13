import { NextResponse } from "next/server";
import crypto from "crypto";
import { googleClient, OAUTH_SCOPES } from "@/lib/google";

// Starts the Google sign-in. The redirect URI is derived from the request
// origin, so the same code works on localhost and on Vercel.
export async function GET(request: Request) {
  const client = googleClient();
  if (!client) {
    return NextResponse.json(
      { error: "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET." },
      { status: 400 }
    );
  }

  const origin = new URL(request.url).origin;
  const state = crypto.randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: client.id,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: OAUTH_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  );
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
