import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { googleClient, setTokenCookie } from "@/lib/google";

// Google redirects here after consent. Exchange the code for tokens, store
// them in the httpOnly cookie, and land back on the dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = (await cookies()).get("google_oauth_state")?.value;

  const client = googleClient();
  if (!client || !code || !state || state !== expectedState) {
    return NextResponse.redirect(`${url.origin}/?google=error`);
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.id,
      client_secret: client.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${url.origin}/api/google/callback`,
    }),
  });
  if (!res.ok) {
    return NextResponse.redirect(`${url.origin}/?google=error`);
  }
  const data = await res.json();
  // Set the cookie on the redirect response itself so it actually reaches the
  // browser and the connection survives refreshes.
  const response = NextResponse.redirect(`${url.origin}/?google=connected`);
  setTokenCookie(response, {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  });
  return response;
}
