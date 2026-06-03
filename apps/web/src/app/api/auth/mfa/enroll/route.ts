import { NextResponse, type NextRequest } from "next/server";
import { wrap } from "@/server/lib/http";
import { requireSession } from "@/server/lib/auth";
import { generateProvisional } from "@/server/services/mfa.service";

// fix(audit auth-mfa-unreachable-3): MFA enrollment on the web surface. Step 1 —
// return a provisional base32 secret + otpauth:// URI. The secret is NOT stored
// yet; the client holds it and POSTs it back with the first valid code to
// /api/auth/mfa/verify-enroll. requireSession ensures only the signed-in user
// can enroll their own account.
export const POST = wrap(async (req: NextRequest) => {
  const session = await requireSession(req);
  return NextResponse.json(generateProvisional(session.email));
});
