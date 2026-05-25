// Types now live in @travelsafe/crime-data. This file re-exports them
// so existing imports from "@/server/services/crime-data/types" keep
// working without a project-wide path rewrite.
//
// New consumers should import directly from @travelsafe/crime-data.
export type {
  DataProvenance,
  AreaStats,
  Incident,
  AreaRiskAlert,
  CrimeDataAdapter,
  KnownArea,
} from "@travelsafe/crime-data";
