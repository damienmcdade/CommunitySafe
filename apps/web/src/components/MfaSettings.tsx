"use client";
import { useState } from "react";
import { api, useApi } from "@/lib/api-client";

// fix(audit auth-mfa-unreachable-3): the web UI enforces MFA at login but had no
// way to ENABLE it. This is the enrollment/management surface: enroll (provisional
// secret) → verify a first code → enabled; or disable with a current code.
interface Me { email: string; mfaEnabled?: boolean }
interface Provisional { secret: string; otpauthUrl: string; issuer: string; account: string }

export function MfaSettings() {
  const { data: me, reload } = useApi<Me>("/auth/me");
  const [provisional, setProvisional] = useState<Provisional | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // MFA is only meaningful for registered accounts, not the anonymous per-device
  // session (device-*@*.local). Don't surface it for anonymous users.
  const isRegistered = !!me?.email && !me.email.endsWith(".local");
  if (!isRegistered) return null;

  async function startEnroll() {
    setError(null); setNotice(null); setBusy(true);
    try {
      setProvisional(await api<Provisional>("/auth/mfa/enroll", { method: "POST", body: "{}" }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function confirmEnroll() {
    if (!provisional) return;
    setError(null); setBusy(true);
    try {
      await api("/auth/mfa/verify-enroll", { method: "POST", body: JSON.stringify({ secret: provisional.secret, code }) });
      setProvisional(null); setCode(""); setNotice("Two-factor authentication is now on.");
      await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function disable() {
    setError(null); setBusy(true);
    try {
      await api("/auth/mfa/disable", { method: "POST", body: JSON.stringify({ code }) });
      setCode(""); setNotice("Two-factor authentication is off.");
      await reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="surface p-6 space-y-3">
      <h2 className="font-display text-lg text-slate2-900">Two-factor authentication</h2>
      <p className="text-sm text-slate2-600">
        Protect your account with a 6-digit code from an authenticator app (Google Authenticator,
        Authy, 1Password, Bitwarden) in addition to your password.
      </p>
      {error && <p role="alert" className="text-sm text-dusk-700">{error}</p>}
      {notice && <p role="status" className="text-sm text-sage-700">{notice}</p>}

      {me?.mfaEnabled ? (
        <div className="space-y-2">
          <p className="text-sm text-sage-700">Two-factor authentication is <strong>on</strong>.</p>
          <label htmlFor="mfa-disable-code" className="text-sm text-slate2-700">Enter a current code to turn it off</label>
          <input id="mfa-disable-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 input tracking-widest" />
          <button onClick={disable} disabled={busy || code.length !== 6} className="btn-secondary text-sm disabled:opacity-50">
            {busy ? "Working…" : "Turn off two-factor"}
          </button>
        </div>
      ) : provisional ? (
        <div className="space-y-2">
          <p className="text-sm text-slate2-700">
            Add this account to your authenticator app. Scan the link below, or enter the key manually:
          </p>
          <p className="font-mono text-sm break-all surface-muted p-2 rounded">{provisional.secret}</p>
          <p className="text-xs text-slate2-500 break-all">Setup link: {provisional.otpauthUrl}</p>
          <label htmlFor="mfa-enroll-code" className="text-sm text-slate2-700">Then enter the 6-digit code it shows</label>
          <input id="mfa-enroll-code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-1 input tracking-widest" />
          <div className="flex gap-2">
            <button onClick={confirmEnroll} disabled={busy || code.length !== 6} className="btn-primary text-sm disabled:opacity-50">
              {busy ? "Verifying…" : "Verify & enable"}
            </button>
            <button onClick={() => { setProvisional(null); setCode(""); }} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={startEnroll} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
          {busy ? "Working…" : "Enable two-factor"}
        </button>
      )}
    </section>
  );
}
