import "server-only";
import { type NextRequest, type NextResponse } from "next/server";

// fix(audit pentest-authn-4): session tokens used to live ONLY in localStorage,
// where any XSS could read and exfiltrate them. They now also ride in an
// HttpOnly cookie that JavaScript cannot read, so a script-injection can no
// longer steal the session. The client stops persisting the raw JWT (it keeps
// only a non-sensitive "I have a session" marker); the cookie is the credential.
//
// Same-origin only: the web IS the API (Next route handlers on the same host),
// so the cookie auto-flows on every /api/* request with no CORS/credentials
// dance. The Authorization: Bearer path is kept as a fallback (mobile native
// callers, and existing localStorage sessions during the migration window).
export const SESSION_COOKIE = "cs_session";

// 24h — matches JWT_EXPIRES_IN's default. The JWT's own exp is the real
// authority; this just bounds how long the browser retains the cookie.
const MAX_AGE_SECONDS = 60 * 60 * 24;

/// Attach the session cookie to a response. HttpOnly (no JS read), Secure in
/// production (HTTPS only; omitted in dev so http://localhost works), SameSite
/// =Lax (sent on top-level navigation + same-site requests, withheld on
/// cross-site POST/fetch — a solid CSRF baseline for a same-origin app).
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/// Clear the session cookie (logout). Mirrors the attributes so the browser
/// matches and deletes it.
export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/// Read the raw JWT from the session cookie, if present.
export function readSessionCookie(req: NextRequest): string | null {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null;
}
