import { redirect } from "next/navigation";

/// Legacy /plan URL preserved as a server redirect. The Overwatch /
/// Pathfinder hub holds Crime Map + Safe Route now.
export default function PlanRedirect() {
  redirect("/overwatch?tab=route");
}
