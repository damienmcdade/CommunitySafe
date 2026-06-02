import "server-only";
import { generateSecret, generateURI, verifySync } from "otplib";
import { prisma } from "../lib/prisma";
import { HttpError } from "../lib/http";

// fix(audit pentest-authn-1 / auth-mfa-unreachable-3): MFA was fully built on
// the Express API but unreachable from the web (Vercel) surface the client
// actually calls. This is the web port — standard TOTP (6-digit / 30s) codes
// compatible with Google Authenticator, Authy, 1Password, Bitwarden. Mirrors
// apps/api/src/services/mfa.service.ts so the two stacks behave identically.
const ISSUER = "CommunitySafe";

export interface EnrollProvisional {
  secret: string; // base32 secret to render as a QR code
  otpauthUrl: string; // otpauth://totp/...
  issuer: string;
  account: string;
}

// Provisional secret — NOT stored on the user until verifyAndEnableMfa confirms
// the enrolling device can produce a valid code.
export function generateProvisional(account: string): EnrollProvisional {
  const secret = generateSecret({ length: 20 });
  const otpauthUrl = generateURI({ secret, label: account, issuer: ISSUER });
  return { secret, otpauthUrl, issuer: ISSUER, account };
}

export async function verifyAndEnableMfa(userId: string, secret: string, code: string): Promise<void> {
  if (!verifySync({ secret, token: code }).valid) throw new HttpError(401, "mfa_invalid_code");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret, mfaEnabled: true },
  });
}

export function verifyMfaCode(secret: string, code: string): boolean {
  return verifySync({ secret, token: code }).valid;
}

export async function disableMfa(userId: string, code: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, mfaSecret: true },
  });
  if (!u || !u.mfaEnabled || !u.mfaSecret) throw new HttpError(400, "mfa_not_enabled");
  if (!verifySync({ secret: u.mfaSecret, token: code }).valid) throw new HttpError(401, "mfa_invalid_code");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null },
  });
}
