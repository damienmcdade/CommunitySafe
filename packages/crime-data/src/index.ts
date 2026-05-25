// Barrel exports for @travelsafe/crime-data.
//
// Currently exports the SHARED TYPES + DATA TABLES that both apps/web
// (Vercel routes) and apps/api (Railway routes) need to import without
// duplicating. The actual ADAPTERS (Phoenix Socrata, NOLA Socrata,
// etc.) still live under apps/web/src/server/services/crime-data/
// for now — moving them is the larger follow-up that lets the
// /api/safezone/* and /api/crime-data/{mix,upticks} endpoints
// migrate to Railway (tracked as #150 and #151).

export type {
  DataProvenance,
  AreaStats,
  Incident,
  AreaRiskAlert,
  CrimeDataAdapter,
  KnownArea,
} from "./types";

export { CITY_POPULATION, POPULATION_VINTAGE, populationFor } from "./population";

export type { CityFbiBaseline } from "./fbi-baselines";
export { CITY_FBI_BASELINES } from "./fbi-baselines";
