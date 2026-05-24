import { redirect } from "next/navigation";

/// Legacy /vigilance URL preserved as a server redirect. Vigilance
/// was retired as a top-level tab in v6; Personal Safety lives as
/// a sub-tab on Neighborhood Awareness now.
export default function VigilanceRedirect() {
  redirect("/neighborhood?tab=personal");
}
