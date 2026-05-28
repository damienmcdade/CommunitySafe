import nodemailer from "nodemailer";
import { env } from "../../lib/env";

let transport: nodemailer.Transporter | null = null;

function getTransport() {
  if (transport) return transport;
  if (!env.SMTP_URL) {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else {
    transport = nodemailer.createTransport(env.SMTP_URL);
  }
  return transport;
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
): Promise<{ ok: boolean; messageId?: string | null; reason?: string }> {
  // v47 — when SMTP_URL is unset we used jsonTransport which silently
  // succeeds without sending anything. That caused the user-reported
  // "links are not sending to inputted email address" — the API
  // returned 201 but no message ever left the building. Now we
  // surface an explicit reason="smtp_not_configured" so the caller
  // (live-share createLiveShare) can show "saved but not sent" in
  // the UI instead of pretending delivery succeeded.
  if (!env.SMTP_URL) {
    // v96 — strip the full address; only emit obfuscated to + length
    // signal. Matches apps/api/src/services/notifications/email.ts so
    // both runtimes leak the same minimal info in dev logs.
    const hashedTo = `${to.slice(0, 2)}…@${to.split("@")[1] ?? "?"}`;
    console.log("[email:dev-noop]", { hashedTo, subject, previewLen: text.length });
    return { ok: false, reason: "smtp_not_configured" };
  }
  try {
    const t = getTransport();
    const result = await t.sendMail({
      from: env.NOTIFY_EMAIL_FROM,
      to,
      subject,
      text,
    });
    return { ok: true, messageId: result.messageId ?? null };
  } catch (e) {
    console.warn("[email] send failed:", (e as Error).message);
    return { ok: false, reason: (e as Error).message };
  }
}
