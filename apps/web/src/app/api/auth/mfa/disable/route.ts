import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { requireSession } from "@/server/lib/auth";
import { disableMfa } from "@/server/services/mfa.service";

// fix(audit auth-mfa-unreachable-3): turning MFA off requires a current valid
// code (so a walk-up attacker on an unlocked session can't silently disable it).
const Body = z.object({ code: z.string().regex(/^\d{6}$/, "code must be 6 digits") });

export const POST = wrap(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { code } = Body.parse(await req.json());
  await disableMfa(session.uid, code);
  return NextResponse.json({ ok: true });
});
