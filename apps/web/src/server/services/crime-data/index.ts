import "server-only";

// Dispatcher moved to @travelsafe/crime-data/dispatcher in v35.
// This shim re-exports for backwards compat.
export type {
  DataProvenance,
  AreaStats,
  Incident,
  AreaRiskAlert,
  CrimeDataAdapter,
} from "@travelsafe/crime-data";

export { crimeData } from "@travelsafe/crime-data/dispatcher";
