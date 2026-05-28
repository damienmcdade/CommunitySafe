import { PrismaClient, Prisma } from "@prisma/client";

declare global {

  var __travelsafePrisma: ReturnType<typeof buildClient> | undefined;
}

// v96 — Prisma client extension that auto-filters out soft-deleted
// users (`deletedAt IS NULL`) on every read against the User model.
// The security audit flagged that the soft-delete contract relied on
// every handler remembering to include the filter — one missed
// findFirst / findMany would leak a deleted user's data. Wrapping it
// at the client layer makes the filter unforgettable. Writes (update,
// upsert) intentionally pass through so softDeleteAccount() can
// still set the deletedAt column. The auth middleware also short-
// circuits soft-deleted sessions before any handler runs, so this is
// defense in depth.
function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
  return base.$extends({
    name: "soft-delete-user-filter",
    query: {
      user: {
        async findUnique({ args, query }) {
          return query({ ...args, where: { ...args.where, deletedAt: null } as Prisma.UserWhereUniqueInput });
        },
        async findFirst({ args, query }) {
          return query({ ...args, where: { ...(args.where ?? {}), deletedAt: null } });
        },
        async findMany({ args, query }) {
          return query({ ...args, where: { ...(args.where ?? {}), deletedAt: null } });
        },
        async count({ args, query }) {
          return query({ ...args, where: { ...(args.where ?? {}), deletedAt: null } });
        },
      },
    },
  });
}

export const prisma = globalThis.__travelsafePrisma ?? buildClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__travelsafePrisma = prisma;
}
