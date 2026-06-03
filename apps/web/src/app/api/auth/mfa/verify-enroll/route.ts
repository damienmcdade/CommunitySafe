import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { requireSession } from "@/server/lib/auth";
import { verifyAndEnableMfa } from "@/server/services/mfa.service";

// fix(audit auth-mfa-unreachable-3): MFA enrollment step 2 — confirm the
// enrolling device can produce a valid code for the provisional secret, then
// store it (encrypted) + set mfaEnabled.
const Body = z.object({
  secret: z.string().min(10).max(100),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});

export const POST = wrap(async (req: NextRequest) => {
  const session = await requireSession(req);
  const { secret, code } = Body.parse(await req.json());
  await verifyAndEnableMfa(session.uid, secret, code);
  return NextResponse.json({ ok: true });
});
