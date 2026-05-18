-- AlterTable: Analysis.roadmapSnapshot (Faz 7.3.60.1)
-- Nullable String column — mevcut satırlar bozulmaz (lazy migration)
ALTER TABLE "analyses" ADD COLUMN "roadmapSnapshot" TEXT;
