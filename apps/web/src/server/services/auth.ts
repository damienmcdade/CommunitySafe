import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { signSession } from "../lib/jwt";
import { env } from "../lib/env";
import { HttpError } from "../lib/http";

// Postgres treats `User.email @unique` as case-sensitive by default,
// so `bob@x.com` and `Bob@x.com` would both be insertable as
// distinct accounts. Schema-review finding #7 — fix at the service
// layer by normalizing every email touch to lowercase. Trimming
// whitespace is the safe-by-default companion (form inputs commonly
// have leading/trailing spaces from paste).
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function register(email: string, password: string, displayName?: string) {
  const normEmail = normalizeEmail(email);
  const existing = await prisma.user.findUnique({ where: { email: normEmail } });
  if (existing) throw new HttpError(409, "email_taken");

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: { email: normEmail, passwordHash, displayName },
    select: { id: true, email: true, displayName: true },
  });
  return { user, token: signSession({ uid: user.id, email: user.email }) };
}

export async function login(email: string, password: string) {
  const normEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normEmail } });
  if (!user) throw new HttpError(401, "invalid_credentials");
  if (user.permanentlyBanned) throw new HttpError(403, "banned");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new HttpError(401, "invalid_credentials");

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    token: signSession({ uid: user.id, email: user.email }),
  };
}

export async function me(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      suspendedUntil: true,
      permanentlyBanned: true,
      alertPreference: true,
    },
  });
}
