// FBI baselines now live in @travelsafe/crime-data. This wrapper
// re-exports them so existing imports keep working unchanged.
//
// New consumers should import directly from @travelsafe/crime-data.
export type { CityFbiBaseline } from "@travelsafe/crime-data";
export { CITY_FBI_BASELINES } from "@travelsafe/crime-data";
