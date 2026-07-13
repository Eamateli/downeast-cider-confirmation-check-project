import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { extractConfirmation } from "@/lib/extract";
import { reconcile } from "@/lib/reconcile";
import { loadPos, loadSchedule } from "@/lib/data";

export const maxDuration = 60; // extraction can take a few seconds

const RequestSchema = z.object({
  emailText: z.string().min(1).max(10_000),
});

export async function POST(request: Request) {
  let emailText: string;
  try {
    const body = await request.json();
    emailText = RequestSchema.parse(body).emailText;
  } catch {
    return NextResponse.json(
      { error: "Send JSON like { emailText: string } with 1 to 10,000 characters." },
      { status: 400 }
    );
  }

  try {
    const extraction = await extractConfirmation(emailText);
    const report = reconcile(extraction, loadPos(), loadSchedule());
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
