import { NextResponse, type NextRequest } from "next/server";
import { wrap } from "@/server/lib/http";
import { requireSession } from "@/server/lib/auth";
import { logout } from "@/server/services/auth";

// fix(audit auth-no-revocation-web-2): bumps the caller's tokenVersion so every
// token issued to them (including a leaked one) stops authenticating. The client
// should drop its stored token after a 200.
export const POST = wrap(async (req: NextRequest) => {
  const session = await requireSession(req);
  await logout(session.uid);
  return NextResponse.json({ ok: true });
});
