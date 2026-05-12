-- Faz 7.5.4a: Analysis.user onDelete CASCADE
-- Kullanıcı silinince analyses kayıtları otomatik temizlenir (orphan önleme)

-- Mevcut FK'yi düşür
ALTER TABLE "analyses" DROP CONSTRAINT IF EXISTS "analyses_userId_fkey";

-- CASCADE ile yeniden ekle
ALTER TABLE "analyses"
  ADD CONSTRAINT "analyses_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
