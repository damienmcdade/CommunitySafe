import "server-only";

// safety-score moved to @travelsafe/crime-data/safety-score in v35
// so Railway routes can share it. This shim re-exports for
// backwards compat with `@/server/services/watch/safety-score`.
export * from "@travelsafe/crime-data/safety-score";
