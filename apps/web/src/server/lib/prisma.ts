import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// fix(audit db-ssl-1): force verify-full whenever ANY sslmode is present (the
// old regex no-op'd on sslmode=disable / no sslmode, failing the SSL guarantee
// open). A DSN with no sslmode is left as-is for local/no-SSL dev.
function pinSslVerifyFull(url: string): string {
  if (!url) return url;
  return /sslmode=/i.test(url) ? url.replace(/sslmode=[^&\s]*/i, "sslmode=verify-full") : url;
}

// fix(db-1): Vercel DATABASE_URL still points to exhausted Neon free tier.
// DATABASE_PUBLIC_URL = Railway Postgres public TCP proxy (Production + Preview).
// Prefer it; fall back to DATABASE_URL for local dev.
const connStr = process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? "";

// fix(deploy logs): tune the pg pool — Smaller max than the API because each
// Vercel (Fluid Compute) instance holds its own pool; fail fast + recycle
// idle conns + TCP keepalive.
const adapter = new PrismaPg({
  connectionString: pinSslVerifyFull(connStr),
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  max: 5,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

declare global {

  var __travelsafePrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__travelsafePrisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__travelsafePrisma = prisma;
}
