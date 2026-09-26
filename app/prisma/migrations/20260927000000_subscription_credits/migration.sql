-- Hak sistemi: analiz kredileri + gecerlilik + yonetici notu
ALTER TABLE "subscriptions" ADD COLUMN "analysisCredits" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "subscriptions" ADD COLUMN "creditsExpireAt" TIMESTAMP(3);
ALTER TABLE "subscriptions" ADD COLUMN "notes" TEXT;

-- Mevcut ucretsiz hesaplara gecis suresi: ucretsiz donem en az 30 gun daha acik kalsin
UPDATE "subscriptions"
SET "currentPeriodEnd" = NOW() + INTERVAL '30 days'
WHERE "plan" = 'DEMO' AND "currentPeriodEnd" < NOW() + INTERVAL '30 days';

-- Abonelik kaydi olmayan eski kullanicilara DEMO kaydi ac
INSERT INTO "subscriptions" ("id", "userId", "plan", "billingCycle", "status", "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'DEMO', 'MONTHLY', 'ACTIVE', NOW(), NOW() + INTERVAL '30 days', false, NOW(), NOW()
FROM "users" u
WHERE NOT EXISTS (SELECT 1 FROM "subscriptions" s WHERE s."userId" = u."id");

-- Platform sahibi: yonetici (sinirsiz)
UPDATE "users" SET "role" = 'ADMIN' WHERE lower("email") IN ('a.ozdel@hotmail.com', 'atakan.zdl@gmail.com');
