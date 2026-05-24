import { redirect } from "next/navigation";

/// Legacy /safety-score URL preserved as a server redirect. The
/// citywide Safety Score grade lives on /city now (rendered by
/// CityScoreCard); the neighborhood-scoped drill-down lives on
/// /neighborhood. City Awareness is the closer match for the
/// historical /safety-score entry point.
export default function SafetyScoreRedirect() {
  redirect("/city");
}
