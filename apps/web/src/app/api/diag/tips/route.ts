import { NextResponse, type NextRequest } from "next/server";
import { generateAITipsForArea, getAITipsDebug, type AITip } from "@/server/services/safety/ai-tips";
import { requireCronSecret } from "@/server/lib/bearer-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Diagnostic — runs the AI tips generator for an area to check the
// adapter + AI pipeline end to end. Gated because each call costs
// AI tokens.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;

  const area = req.nextUrl.searchParams.get("area") ?? "chi-loop";
  const start = Date.now();
  let tips: AITip[] = [];
  let error: string | null = null;
  try {
    tips = await generateAITipsForArea(area);
  } catch (err) {
    error = `${(err as Error).name}: ${(err as Error).message}`;
  }
  return NextResponse.json({
    area,
    elapsedMs: Date.now() - start,
    count: tips.length,
    error,
    sample: tips.slice(0, 2),
    debug: getAITipsDebug(),
  });
}
