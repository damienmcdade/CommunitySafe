import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface SessionPayload {
  uid: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || !decoded || !("uid" in decoded)) {
    throw new Error("Invalid session payload");
  }
  return decoded as SessionPayload;
}
