// v93p3 — TOTP-based MFA (DISA STIG IA-2(1)). Standard 6-digit
// 30s-period codes compatible with Google Authenticator, Authy, 1Password,
// Bitwarden. Enrollment flow:
//   1. POST /auth/mfa/enroll → returns base32 secret + otpauth:// URI
//      (QR-encodable on the client) — secret is provisional, NOT
//      stored on the user yet.
//   2. POST /auth/mfa/verify-enroll with the user's first code →
//      stores mfaSecret + sets mfaEnabled=true.
//   3. POST /auth/login first returns a partial token + mfaRequired:true
//      if the user has mfaEnabled. Client then POSTs to /auth/mfa/verify
//      with code + partial token → returns full access+refresh pair.
//   4. POST /auth/mfa/disable requires a current code to disable.
import { generateSecret, generateURI, verifySync } from "otplib";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/error.js";

const ISSUER = "TravelSafe";

export interface EnrollProvisional {
  secret: string;          // base32 secret to render as QR
  otpauthUrl: string;      // otpauth://totp/...
  issuer: string;
  account: string;
}

// v93p3 — otplib v13+ functional API: generateSecret() → base32 string,
// generateURI() → otpauth:// URI, verifySync() → boolean. The default
// step (30s) and digit count (6) match Google Authenticator's expectation.
export function generateProvisional(account: string): EnrollProvisional {
  const secret = generateSecret({ length: 20 });
  const otpauthUrl = generateURI({ secret, label: account, issuer: ISSUER });
  return { secret, otpauthUrl, issuer: ISSUER, account };
}

export async function verifyAndEnableMfa(userId: string, secret: string, code: string): Promise<void> {
  if (!(verifySync({ secret, token: code }).valid)) throw new HttpError(401, "mfa_invalid_code");
  await prisma.user.update({
    where: { id: userId },
    data: { mfaSecret: secret, mfaEnabled: true },
  });
}

export function verifyMfaCode(secret: string, code: string): boolean {
  return (verifySync({ secret, token: code }).valid);
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
