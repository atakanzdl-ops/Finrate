CREATE TABLE IF NOT EXISTS "financial_data_uploads" (
  "id" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "financialDataId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "period" TEXT NOT NULL DEFAULT 'ANNUAL',
  "source" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "parsedFieldCount" INTEGER NOT NULL DEFAULT 0,
  "unmapped" TEXT,
  "parseWarnings" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_data_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "financial_data_uploads_entityId_year_period_idx"
ON "financial_data_uploads"("entityId", "year", "period");

CREATE INDEX IF NOT EXISTS "financial_data_uploads_financialDataId_createdAt_idx"
ON "financial_data_uploads"("financialDataId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_data_uploads_entityId_fkey'
  ) THEN
    ALTER TABLE "financial_data_uploads"
      ADD CONSTRAINT "financial_data_uploads_entityId_fkey"
      FOREIGN KEY ("entityId") REFERENCES "entities"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'financial_data_uploads_financialDataId_fkey'
  ) THEN
    ALTER TABLE "financial_data_uploads"
      ADD CONSTRAINT "financial_data_uploads_financialDataId_fkey"
      FOREIGN KEY ("financialDataId") REFERENCES "financial_data"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
