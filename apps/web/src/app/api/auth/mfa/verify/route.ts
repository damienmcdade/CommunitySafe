import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { wrap } from "@/server/lib/http";
import { verifyMfaAndIssueTokens } from "@/server/services/auth";

// fix(audit pentest-authn-1): second-factor exchange endpoint. The client calls
// this after /api/auth/login returns { mfaRequired: true, mfaPendingToken }.
const Body = z.object({
  mfaPendingToken: z.string().min(10).max(2000),
  code: z.string().regex(/^\d{6}$/, "code must be 6 digits"),
});

export const POST = wrap(async (req: NextRequest) => {
  const { mfaPendingToken, code } = Body.parse(await req.json());
  return NextResponse.json(await verifyMfaAndIssueTokens(mfaPendingToken, code));
});
