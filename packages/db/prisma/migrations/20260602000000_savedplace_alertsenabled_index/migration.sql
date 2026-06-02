-- fix(audit perf-savedplace-index): index SavedPlace.alertsEnabled so the
-- proximity worker's `WHERE alertsEnabled = true` tick (every 5 min) is a
-- ranged read instead of a full table scan.
-- CreateIndex
CREATE INDEX "SavedPlace_alertsEnabled_idx" ON "SavedPlace"("alertsEnabled");
