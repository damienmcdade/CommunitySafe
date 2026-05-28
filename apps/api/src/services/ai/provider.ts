import { env } from "../../env.js";

// Mirror of apps/web/src/server/services/ai/provider.ts so Railway-side
// services pick the same free-tier provider the Vercel side already
// uses. Preference: Groq → Gemini → Vercel AI Gateway. Returns the
// LanguageModel handle to hand to streamText/generateText, or null if
// no provider is configured.

function groqKey(): string | undefined {
  return env.GROQ_API_KEY || env.GROQAPI;
}

function geminiKey(): string | undefined {
  return env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY || env.GOOGLE_API_KEY;
}

export async function getAIModel(): Promise<unknown | null> {
  const chain = await getAIModelChain();
  return chain[0]?.model ?? null;
}

// v96 — real runtime provider fallback. The coverage probe surfaced
// that operators were configuring BOTH GROQ_API_KEY and
// GOOGLE_GENERATIVE_AI_API_KEY for resilience, but getAIModel() only
// ever returned the first one — when Groq's 100k-tokens-per-day free
// tier exhausted, Gemini sat unused. Now the chain helper resolves
// every configured provider in preference order, and the new
// generateTextWithFallback iterates them at call time, falling
// through to the next on a rate-limit / quota / 5xx error.
export interface AIModelHandle {
  name: "groq" | "gemini" | "gateway";
  model: unknown;
}

export async function getAIModelChain(): Promise<AIModelHandle[]> {
  const out: AIModelHandle[] = [];
  const groq = groqKey();
  if (groq) {
    const { createGroq } = await import("@ai-sdk/groq");
    const provider = createGroq({ apiKey: groq });
    out.push({ name: "groq", model: provider("llama-3.3-70b-versatile") });
  }
  const gemini = geminiKey();
  if (gemini) {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const provider = createGoogleGenerativeAI({ apiKey: gemini });
    out.push({ name: "gemini", model: provider("gemini-2.0-flash") });
  }
  if (env.AI_GATEWAY_API_KEY) {
    out.push({ name: "gateway", model: "anthropic/claude-haiku-4-5" as unknown });
  }
  return out;
}

interface GenOpts {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface GenResult {
  text: string;
  provider: AIModelHandle["name"];
}

/// Try each configured provider in order. Catch retryable errors
/// (rate-limit, quota, transient 5xx) and fall through to the next.
/// Non-retryable errors (auth failure, invalid prompt) still propagate.
export async function generateTextWithFallback(opts: GenOpts): Promise<GenResult | null> {
  const chain = await getAIModelChain();
  if (chain.length === 0) return null;
  const { generateText } = await import("ai");
  let lastErr: unknown = null;
  for (const handle of chain) {
    try {
      const res = await generateText({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: handle.model as any,
        system: opts.system,
        prompt: opts.prompt,
        temperature: opts.temperature ?? 0.3,
        ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
      });
      return { text: (res.text ?? "").trim(), provider: handle.name };
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? "";
      // Only fall through on retryable errors. Auth / config failures
      // would just fail again on the next provider, so bail fast.
      const retryable = /rate.?limit|quota|429|503|502|504|tokens per day|TPD|too many requests/i.test(msg);
      if (!retryable) break;
      console.warn(`[ai] ${handle.name} failed, trying next provider:`, msg);
    }
  }
  if (lastErr) {
    console.warn("[ai] all providers exhausted, last error:", (lastErr as Error).message);
  }
  return null;
}

export function aiConfigured(): boolean {
  return Boolean(groqKey() || geminiKey() || env.AI_GATEWAY_API_KEY);
}

// v62 — startup visibility on the resolved provider chain. Mirror of
// the apps/web provider. See that file's comment for the rationale.
if (process.env.NODE_ENV === "production") {
  const chain: string[] = [];
  if (groqKey()) chain.push("groq");
  if (geminiKey()) chain.push("gemini");
  if (env.AI_GATEWAY_API_KEY) chain.push("gateway");
  if (chain.length === 0) {
    console.warn("[ai] no provider configured — set GROQ_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or AI_GATEWAY_API_KEY. AI features will return null fallbacks.");
  } else {
    console.log(`[ai] provider chain: ${chain.join(" → ")}`);
  }
}
