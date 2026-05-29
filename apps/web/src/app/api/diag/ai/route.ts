import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, getAIModelChain, generateTextWithFallback } from "@/server/services/ai/provider";
import { requireCronSecret } from "@/server/lib/bearer-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnostic — runs a real generateText call against the configured AI
// model chain to verify provider config end to end. Gated behind
// CRON_SECRET because each call costs tokens; without the gate this
// is a free AI generation endpoint anyone could hammer.
// v96p2 — migrated from the legacy getAIModel() single-handle path
// to the chain-aware helpers introduced in v96. Reports every
// configured tier so operators can see whether Gemini / gateway are
// armed (the legacy diag only ever exercised the first tier and
// hid silent Gemini-key drift). The call goes through
// generateTextWithFallback so if Groq's TPD is exhausted at probe
// time we still get a successful Gemini hit instead of failing the
// diag.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const configured = aiConfigured();
  if (!configured) return NextResponse.json({ configured: false });

  const chain = await getAIModelChain();
  const tiers = chain.map((h) => h.name);

  let modelOk = false;
  let modelError: string | null = null;
  let sample: string | null = null;
  let usedTier: string | null = null;
  try {
    const result = await generateTextWithFallback({
      system: "Health check.",
      prompt: "Reply with exactly: AI is alive.",
      temperature: 0,
    });
    if (!result) throw new Error("generateTextWithFallback returned null despite aiConfigured=true");
    modelOk = true;
    sample = result.text;
    usedTier = result.provider;
  } catch (err) {
    modelError = `${(err as Error).name}: ${(err as Error).message}`;
  }
  return NextResponse.json({ configured, tiers, modelOk, usedTier, modelError, sample });
}
