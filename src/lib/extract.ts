import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractionSchema, type Extraction } from "./schema";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

const SYSTEM = `You extract structured data from supplier order-confirmation
emails for a beverage manufacturer. Extract ONLY what the email states.
Never guess a value that is not present: use null. Do not convert units.
Report quantities in the unit the supplier used. Dates become YYYY-MM-DD;
the current year is 2026 if the email omits the year.`;

export async function extractConfirmation(emailText: string): Promise<Extraction> {
  const call = () =>
    client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: emailText }],
      output_config: { format: zodOutputFormat(ExtractionSchema) },
    });

  let response = await call();
  if (!response.parsed_output) response = await call(); // one retry
  if (!response.parsed_output) {
    throw new Error("Extraction failed: model output did not match schema.");
  }
  return response.parsed_output;
}
