import { prisma } from "../../lib/prisma.js";
import { CheckInStatus } from "@prisma/client";
import { env } from "../../env.js";
import { triggerExpiry } from "./check-in.service.js";

let timer: NodeJS.Timeout | null = null;

async function tick() {
  try {
    const due = await prisma.checkInTimer.findMany({
      where: { status: CheckInStatus.ACTIVE, scheduledFor: { lte: new Date() } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of due) {
      const receipts = await triggerExpiry(id);
      console.log(`[checkin-worker] fired ${id} -> ${receipts.length} delivery receipts`);
    }
  } catch (err) {
    console.error("[checkin-worker] tick failed:", err);
  }
}

export function startCheckInWorker() {
  if (timer) return;
  const intervalMs = Math.max(5, env.CHECKIN_WORKER_INTERVAL_SECONDS) * 1000;
  console.log(`[checkin-worker] starting (every ${intervalMs / 1000}s)`);
  timer = setInterval(() => void tick(), intervalMs);
  void tick();
}

export function stopCheckInWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}
