/// Bounded-concurrency paged fetching with honest outage semantics.
///
/// Every ArcGIS/Socrata adapter that pages through a dataset had grown the
/// same loop by copy-paste:
///
///   results[i] = await fetchPage(i * PAGE_SIZE).catch(() => []);
///
/// The intent was "one flaky page out of thirty shouldn't sink the pull".
/// The effect, when the whole endpoint went down, was that EVERY page
/// swallowed its error and the fetch RESOLVED with zero rows — so the
/// adapter's own `catch` never ran, its last-good cache was never served,
/// nothing was logged, and a dead feed was indistinguishable from a city
/// where no crime was reported. Savannah sat in exactly that state in
/// production (SAGIS put the layer behind a token — ArcGIS code 499
/// "Token Required") and the only visible symptom was a grade of "N/A".
///
/// This helper keeps the tolerance and restores the signal: some pages may
/// fail, ALL pages failing is an outage and throws.
export async function fetchPagesTolerant<T>(
  label: string,
  pages: number,
  concurrency: number,
  fetchPage: (index: number) => Promise<T[]>,
): Promise<T[][]> {
  const results: T[][] = new Array(pages);
  let cursor = 0;
  let failed = 0;
  let lastError = "";

  const workers = Array.from({ length: Math.min(concurrency, pages) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= pages) return;
      try {
        results[i] = await fetchPage(i);
      } catch (err) {
        failed++;
        lastError = (err as Error).message;
        results[i] = [];
      }
    }
  });
  await Promise.all(workers);

  if (pages > 0 && failed === pages) {
    throw new Error(
      `${label}: upstream unreachable — all ${pages} pages failed (last: ${lastError || "unknown"})`,
    );
  }
  if (failed > 0) {
    console.warn(`[${label}] ${failed}/${pages} pages failed; serving a partial pull`);
  }
  return results;
}
