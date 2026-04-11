CREATE UNIQUE INDEX IF NOT EXISTS "analyses_entityId_year_period_key"
ON "analyses"("entityId", "year", "period");
