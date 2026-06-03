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

// fix(deploy logs): tune the Neon pg pool to avoid the ETIMEDOUT-on-stale-
// connection failure seen in the workers. Smaller max than the API because each
// Vercel (Fluid Compute) instance holds its own pool and Neon caps total
// connections; fail fast + recycle idle conns + TCP keepalive.
const adapter = new PrismaPg({
  connectionString: pinSslVerifyFull(process.env.DATABASE_URL ?? ""),
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
