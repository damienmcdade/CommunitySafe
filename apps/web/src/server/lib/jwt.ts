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
  return decoded as SessionPayload;
}
