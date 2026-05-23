import { NextResponse, type NextRequest } from "next/server";
import { aiConfigured, getAIModel } from "@/server/services/ai/provider";
import { requireCronSecret } from "@/server/lib/bearer-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnostic — runs a real generateText call against the configured AI
// model to verify provider config end to end. Gated behind CRON_SECRET
// because each call costs tokens; without the gate this is a free AI
// generation endpoint anyone could hammer.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req, { softMode: true });
  if (denied) return denied;

  const configured = aiConfigured();
  if (!configured) return NextResponse.json({ configured: false });

  let modelOk = false;
  let modelError: string | null = null;
  let sample: string | null = null;
  try {
    const model = await getAIModel();
    if (!model) throw new Error("getAIModel returned null despite aiConfigured=true");
    modelOk = true;
    const { generateText } = await import("ai");
    const res = await generateText({
      model: model as Parameters<typeof generateText>[0]["model"],
      prompt: "Reply with exactly: AI is alive.",
    });
    sample = res.text;
  } catch (err) {
    modelError = `${(err as Error).name}: ${(err as Error).message}`;
  }
  return NextResponse.json({ configured, modelOk, modelError, sample });
}
