import { runDailyDigest } from "./digest.service.js";

// Daily-fire scheduler for the push digest. Replaces Vercel Cron's
// "0 16 * * *" entry; Railway runs a persistent container so we can
// just check the wall clock every minute.
//
// Restart-safety: lastFiredYmd lives in process memory. If the
// container restarts after the day's fire we'll re-fire on next tick;
// web push de-dupes notifications by `tag: "digest-daily"` so the
// user only sees one bubble even on a double-send. If we ever scale
// to >1 Railway instance, this needs DB persistence to avoid
// per-instance fan-out (use a SystemSetting row or advisory lock).

const DIGEST_HOUR_UTC = 16;
const TICK_INTERVAL_MS = 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let lastFiredYmd: string | null = null;

function ymdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function tick() {
  const now = new Date();
  const todayYmd = ymdUtc(now);
  if (lastFiredYmd === todayYmd) return;
  if (now.getUTCHours() < DIGEST_HOUR_UTC) return;
  try {
    const result = await runDailyDigest();
    console.log(`[digest-worker] fired ${todayYmd}: ${JSON.stringify(result)}`);
    lastFiredYmd = todayYmd;
  } catch (err) {
    console.error("[digest-worker] tick failed:", err);
  }
}

export function startDigestWorker() {
  if (timer) return;
  console.log(`[digest-worker] starting (daily fire at ${DIGEST_HOUR_UTC}:00 UTC, tick every ${TICK_INTERVAL_MS / 1000}s)`);
  timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  void tick();
}

export function stopDigestWorker() {
  if (timer) clearInterval(timer);
  timer = null;
  lastFiredYmd = null;
}
