import "server-only";

// Population data now lives in @travelsafe/crime-data. This wrapper
// keeps the server-only marker (so the population table can't be
// dragged into a client bundle by accident) and re-exports.
//
// New consumers should import directly from @travelsafe/crime-data.
export {
  POPULATION_VINTAGE,
  CITY_POPULATION,
  populationFor,
} from "@travelsafe/crime-data";
