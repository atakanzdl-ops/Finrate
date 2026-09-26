-- iyzico Checkout Form akisi icin odeme alanlari (hepsi nullable — geriye uyumlu)
ALTER TABLE "payments" ADD COLUMN "packageKey" TEXT;
ALTER TABLE "payments" ADD COLUMN "credits" INTEGER;
ALTER TABLE "payments" ADD COLUMN "iyzicoToken" TEXT;
ALTER TABLE "payments" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "payments" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "payments" ADD COLUMN "paidAt" TIMESTAMP(3);

CREATE INDEX "payments_iyzicoToken_idx" ON "payments"("iyzicoToken");
