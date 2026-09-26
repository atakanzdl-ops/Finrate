-- Yuklenen dosyalarin saklanmasi (Vercel Blob, private)
ALTER TABLE "financial_data_uploads" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "financial_data_uploads" ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "financial_data_uploads" ADD COLUMN "mimeType" TEXT;
