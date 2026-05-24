import { redirect } from "next/navigation";

/// Legacy /trends URL preserved as a server redirect. TrendPanel
/// content now lives inline under Neighborhood Awareness (area
/// trends) and within the City Awareness Safety Score section.
export default function TrendsRedirect() {
  redirect("/city");
}
