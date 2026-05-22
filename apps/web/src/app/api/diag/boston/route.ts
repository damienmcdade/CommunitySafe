import { NextResponse } from "next/server";
import { bostonSnapshot } from "@/server/data/boston-snapshot";

export const dynamic = "force-dynamic";

// Diagnostic endpoint — returns the runtime shape of the Boston bundled
// snapshot so we can tell whether the TS module is in the bundle without
// shipping a debug log. Public; no sensitive info exposed.
export async function GET() {
  return NextResponse.json({
    available: true,
    generatedAt: bostonSnapshot.generated_at,
    count: bostonSnapshot.count,
    newest: bostonSnapshot.newest,
    oldest: bostonSnapshot.oldest,
    sample: bostonSnapshot.rows.slice(0, 2),
  });
}
