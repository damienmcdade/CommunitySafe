import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { wrap } from "@/server/lib/http";
import { prisma } from "@/server/lib/prisma";
import { signSession } from "@/server/lib/jwt";
import { optionalSession } from "@/server/lib/auth";
import { setSessionCookie } from "@/server/lib/session-cookie";

export const dynamic = "force-dynamic";

/// Issue a JWT bound to a per-device anonymous user. The client calls this
/// once on first visit and stores the token in localStorage; subsequent visits
/// reuse the token. This removes the explicit login/register flow entirely
/// while keeping the existing await requireSession() backend contracts intact:
/// every device transparently has a session.
///
/// If the client already has a valid bearer token, we echo it back unchanged
/// — no churn, no extra user rows.
export const POST = wrap(async (req: NextRequest) => {
  const existing = await optionalSession(req);
  if (existing) {
    // Sanity: make sure the user still exists. If they were deleted (e.g. data
    // wipe), fall through and mint a fresh one.
    const stillThere = await prisma.user.findUnique({ where: { id: existing.uid }, select: { id: true, email: true, tokenVersion: true } });
    if (stillThere) {
      // fix(audit pentest-authn-4): re-issue a fresh token for the SAME user and
      // plant it in the HttpOnly cookie. This is the migration path — a returning
      // user whose session still lives only in localStorage sends it as Bearer
      // once, and we move them onto the cookie WITHOUT changing their user id
      // (their saved areas / posts / contacts are preserved). The body token is
      // still returned for native callers + the client's presence marker.
      const token = signSession({ uid: stillThere.id, email: stillThere.email, ver: stillThere.tokenVersion });
      const res = NextResponse.json({ token, uid: stillThere.id, reused: true });
      setSessionCookie(res, token);
      return res;
    }
  }

  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const email = `device-${rand}@travelsafe.local`;
  const passwordHash = await bcrypt.hash(`anon-${rand}-${Math.random()}`, 4);
  const user = await prisma.user.create({
    data: { email, passwordHash, displayName: "Anonymous device" },
    select: { id: true, email: true, tokenVersion: true },
  });

  const token = signSession({ uid: user.id, email: user.email, ver: user.tokenVersion });
  const res = NextResponse.json({ token, uid: user.id, reused: false }, { status: 201 });
  setSessionCookie(res, token);
  return res;
});
