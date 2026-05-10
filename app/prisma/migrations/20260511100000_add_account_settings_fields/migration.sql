-- AlterTable: passwordChangedAt (nullable — eski kullanıcılar null kalır, sorun değil)
ALTER TABLE "users" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

-- CreateTable: account_deletion_tokens
CREATE TABLE "account_deletion_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_deletion_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: userId unique (her kullanıcı için tek token)
CREATE UNIQUE INDEX "account_deletion_tokens_userId_key" ON "account_deletion_tokens"("userId");

-- CreateIndex: expiresAt (expired token cleanup için)
CREATE INDEX "account_deletion_tokens_expiresAt_idx" ON "account_deletion_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "account_deletion_tokens" ADD CONSTRAINT "account_deletion_tokens_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
