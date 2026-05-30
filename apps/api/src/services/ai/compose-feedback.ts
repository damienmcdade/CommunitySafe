import { env } from "../../env.js";
import { aiConfigured, generateTextWithFallback } from "./provider.js";

// Vercel AI Gateway via the AI SDK v6. Uses the plain "provider/model" string
// convention so the gateway can route + fail over between providers.
//
// The route returns a streaming text response. If AI_GATEWAY_API_KEY isn't
// configured, the route short-circuits with a 503 and the composer falls
// back to the local pre-vetter only — never blocks the user.

const SYSTEM_PROMPT = `
You are CommunitySafe's community-post coach.
A user is drafting a neighborhood safety heads-up using three short fields:
"what they observed", "where (a landmark, not an address)", and "when".
Your job is to give brief, calm coaching that helps the post pass CommunitySafe's
moderation rules.

The rules: posts must describe BEHAVIOR and PLACE, not individuals. They cannot
include street addresses, phone numbers, license plates, or names paired with
accusations. They cannot lead with race, ethnicity, religion, or appearance.
They cannot encourage anyone to confront, film, follow, or otherwise approach
a person.

Respond in 2-3 short sentences. Be friendly and constructive. If the draft is
fine, say so plainly. If something is off, name it and suggest a specific
rephrase. Never repeat the user's full draft back.
`.trim();

// v60 — sanitize before splicing into the prompt. The draft fields are
// user-supplied; without stripping control characters a determined user
// could inject "Ignore previous instructions" on its own line.
// v96 — widened from blocklisting `\r\n\t` to a whitelist of
// printable ASCII + Latin-1 Supplement + Latin Extended-A (so
// accented words like "café" survive). The blocklist missed several
// control characters (U+0000–U+001F, U+007F, U+200B zero-width
// space, U+202E RTL override, U+FEFF BOM) that some LLMs interpret
// as line breaks or instruction boundaries.
const SANITIZE_DROP = /[^ -~ -ſ]/g;
const sanitize = (s: string, max = 800): string =>
  s
    .replace(SANITIZE_DROP, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

// v96 — was AI_GATEWAY_API_KEY-only streamText. The provider audit
// noted the Railway side couldn't fall through to Gemini when Groq
// was rate-limited because this path never touched the chain helper.
// Now mirrors apps/web: generateTextWithFallback iterates Groq →
// Gemini → gateway, and we drop streaming for a single-chunk
// text/plain response. Two-to-three sentence coaching tolerates that
// trade.
export async function streamComposeFeedback(draft: { what: string; where: string; when: string }) {
  if (!aiConfigured() && !env.AI_GATEWAY_API_KEY) {
    return { configured: false as const };
  }
  const result = await generateTextWithFallback({
    system: SYSTEM_PROMPT,
    prompt:
      `What: ${sanitize(draft.what, 800)}\n` +
      `Where: ${sanitize(draft.where, 200)}\n` +
      `When: ${sanitize(draft.when, 200)}\n\n` +
      `Coach this draft.`,
    temperature: 0.4,
  });
  if (!result) return { configured: true as const, text: null };
  return { configured: true as const, text: result.text };
}
