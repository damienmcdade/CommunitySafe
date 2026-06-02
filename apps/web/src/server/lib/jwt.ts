import "server-only";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "./env";

export interface SessionPayload {
  uid: string;
  email: string;
}

function secret(): string {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be set (min 32 chars) on the API environment");
  }
  return env.JWT_SECRET;
}

export function signSession(payload: SessionPayload): string {
  // Pin algorithm at sign time so verify can require the exact same
  // algorithm — defense-in-depth against historical algorithm-confusion
  // bugs (alg: none, alg: HS256-with-RS256-public-key as secret, etc).
  // Current jsonwebtoken@9.x rejects "none" by default, but explicit
  // pinning is the industry-standard hardening.
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    algorithm: "HS256",
  };
  return jwt.sign(payload, secret(), options);
}

export function verifySession(token: string): SessionPayload {
  // algorithms: ["HS256"] tells jsonwebtoken to REJECT any token whose
  // header.alg isn't exactly HS256. Without this pin, a sufficiently
  // malicious token could (in older jsonwebtoken versions) be verified
  // with a different algorithm than the one used to sign.
  const decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  if (typeof decoded !== "object" || !decoded || !("uid" in decoded)) {
    throw new Error("Invalid session payload");
  }
  // A full session token must NOT carry the mfa_pending marker — otherwise a
  // short-lived first-factor ticket could be replayed as a real session.
  if ((decoded as Record<string, unknown>).typ === "mfa_pending") {
    throw new Error("Invalid session payload");
  }
  return decoded as SessionPayload;
}

// fix(audit pentest-authn-1): MFA enforcement on the web (production) login
// path. After the password factor succeeds for an mfa-enabled user we mint a
// short-lived "mfa_pending" ticket instead of a session token; the client must
// exchange it (plus a valid TOTP code) at /api/auth/mfa/verify for the real
// session. Carries only the uid + a typ marker so it can never be used as a
// session token (verifySession rejects typ:"mfa_pending"). 5-minute TTL.
const MFA_PENDING_TTL = "5m";

export function signMfaPendingToken(uid: string): string {
  return jwt.sign({ uid, typ: "mfa_pending" }, secret(), {
    algorithm: "HS256",
    expiresIn: MFA_PENDING_TTL,
  });
}

export function verifyMfaPendingToken(token: string): { uid: string } {
  const decoded = jwt.verify(token, secret(), { algorithms: ["HS256"] });
  if (
    typeof decoded !== "object" ||
    !decoded ||
    (decoded as Record<string, unknown>).typ !== "mfa_pending" ||
    typeof (decoded as Record<string, unknown>).uid !== "string"
  ) {
    throw new Error("Invalid mfa_pending token");
  }
  return { uid: (decoded as { uid: string }).uid };
}
