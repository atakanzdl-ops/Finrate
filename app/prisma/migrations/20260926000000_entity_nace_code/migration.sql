-- Entity: NACE faaliyet kodu ve sektör kaynağı (bos birakilabilir, geriye uyumlu)
ALTER TABLE "entities" ADD COLUMN "naceCode" TEXT;
ALTER TABLE "entities" ADD COLUMN "sectorSource" TEXT;
