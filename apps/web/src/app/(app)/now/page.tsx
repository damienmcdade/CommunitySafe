import { redirect } from "next/navigation";

/// Legacy URL preserved as a server redirect. /now was the unified
/// Awareness page before the v6 IA split into City Awareness +
/// Neighborhood Awareness. The City surface is the closest match.
export default function NowRedirect() {
  redirect("/city");
}
