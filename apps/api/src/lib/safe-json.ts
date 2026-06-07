// v108 audit — safe JSON reader for the Express API's hand-rolled upstream
// fetches (NWS alerts, Nominatim geocode, SANDAG SODA). Mirrors the crime-data
// package's readJson: read the body as text first, then parse, so a non-JSON
// error page (a CDN/WAF 5xx HTML page, an "An error occurred" maintenance
// notice) becomes a clear, classified error instead of a raw SyntaxError.
//
// These call sites already wrap their fetch in try/catch with a last-known-good
// fallback, so behavior is unchanged on the happy path — this makes the failure
// self-describing in logs and brings the api side in line with the v108
// crime-data hardening (a single place to evolve upstream-parse handling).
export async function readJsonSafe<T = unknown>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trimStart();
  const head = trimmed[0] ?? "";
  const looksJson =
    head === "{" || head === "[" || head === '"' || head === "-" || (head >= "0" && head <= "9") ||
    trimmed.startsWith("true") || trimmed.startsWith("false") || trimmed.startsWith("null");
  if (!trimmed || !looksJson) {
    const snippet = text.slice(0, 120).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    throw new Error(`non-JSON response from ${res.url || "upstream"} (HTTP ${res.status}): ${snippet}`);
  }
  return JSON.parse(text) as T;
}
