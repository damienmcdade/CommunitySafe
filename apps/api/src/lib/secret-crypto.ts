import crypto from "node:crypto";
import { env } from "../env.js";

// fix(audit pentest-authn-7): encrypt TOTP secrets at rest (AES-256-GCM keyed on
// MFA_ENCRYPTION_KEY, 32 raw bytes base64-encoded). Values without the enc:v1:
// prefix are treated as legacy plaintext for back-compat; when no key is
// configured encryption is a no-op (dev / pre-rollout). Mirrors the web helper.
const PREFIX = "enc:v1:";

function key(): Buffer | null {
  const raw = env.MFA_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = Buffer.from(raw, "base64");
  return buf.length === 32 ? buf : null;
}

export function encryptSecret(plaintext: string): string {
  const k = key();
  if (!k) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(":");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) throw new Error("MFA_ENCRYPTION_KEY is required to decrypt an encrypted mfaSecret");
  const [ivB64, tagB64, ctB64] = stored.slice(PREFIX.length).split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
