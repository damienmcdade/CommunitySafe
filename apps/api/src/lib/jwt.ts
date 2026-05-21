import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../env.js";

export interface SessionPayload {
  uid: string;
  email: string;
}

export function signSession(payload: SessionPayload): string {
  // jsonwebtoken v9 narrows expiresIn to its internal StringValue alias, but
  // we receive a plain string from env validation — the runtime accepts it.
  const options: SignOptions = { expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"] };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifySession(token: string): SessionPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || !decoded || !("uid" in decoded)) {
    throw new Error("Invalid session payload");
  }
  return decoded as SessionPayload;
}
