import { NextResponse, type NextRequest } from "next/server";
import { CheckInStatus } from "@/generated/prisma/client";
import { prisma } from "@/server/lib/prisma";
import { triggerExpiry } from "@/server/services/safety/check-in";
import { requireCronSecret } from "@/server/lib/bearer-auth";

export const dynamic = "force-dynamic";
// fix(audit infra-cron-checkin-schedule-mismatch): vercel.json schedules this
// DAILY ("0 0 * * *"), not "every minute" as a prior comment claimed (sub-daily
// cron needs a paid Vercel plan). So this endpoint is a once-a-day BACKSTOP —
// the real-time check-in firing is the Railway check-in.worker (30s tick), which
// stays authoritative. If Railway is ever the only path and this stays daily, a
// missed check-in could go un-fired for up to 24h. Gated behind CRON_SECRET so
// it isn't a public trigger.
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req);
  if (denied) return denied;
  const due = await prisma.checkInTimer.findMany({
    where: { status: CheckInStatus.ACTIVE, scheduledFor: { lte: new Date() } },
    select: { id: true },
    take: 50,
  });
  const fired: string[] = [];
  for (const { id } of due) {
    await triggerExpiry(id);
    fired.push(id);
  }
  return NextResponse.json({ ok: true, fired: fired.length, ids: fired });
}
