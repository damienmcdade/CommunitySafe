import { redirect } from "next/navigation";

/// Legacy /threats URL preserved as a server redirect. The Awareness
/// surface lives at /city now; bookmarks land there automatically.
export default function ThreatsRedirect() {
  redirect("/city");
}
