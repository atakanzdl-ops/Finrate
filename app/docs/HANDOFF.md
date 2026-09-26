# Finrate — Devir Notu (bulut / yeni oturumlar için)

Son güncelleme: 2026-09-26. Bu dosya, projeyi ilk kez açan bir Claude oturumunun (özellikle
GitHub üzerinden çalışan bulut oturumunun) bağlamı hızla edinmesi içindir. Kullanıcı (Atakan)
teknik değildir: her şeyi sen yaparsın, o onaylar. Türkçe konuş, kısa yaz.

## Ne var, nerede
- Uygulama: `app/` (Next.js 16, Prisma 7 + PostgreSQL/Neon, Jest). Canlı: https://www.finrate.com.tr (Vercel, proje `finrate`).
- Ana dal `main` → canlıya otomatik deploy (Vercel build'de `prisma migrate deploy` çalışır).
  Geliştirme dalı: `feature/motor-aksiyon-v2` (main'e `--no-ff` merge edilir).
- Testler: `cd app && npx jest --silent` (92 paket / ~1900 test, hepsi yeşil olmalı).
  Tip kontrolü: `npx tsc --noEmit -p tsconfig.json` (test dosyalarında eski "duplicate function" hataları normaldir).
- Uçtan uca test: `scripts/e2e-free-plan.ts` (E2E_BASE/E2E_EMAIL/E2E_PASSWORD; localhost + preview DB ile).
- Yedek: `npm run backup:db`; yeniden skorlama: `scripts/rescore-entity.ts <entityId|ALL>`.

## DOKUNULMAZ kurallar (kullanıcı kararı)
- `src/lib/scoring/score.ts`, `src/lib/scoring/benchmarks.ts`, `src/lib/parsers/beyanname.ts` değiştirilmez;
  mizan ters bakiye kuralları (`excel.ts` MIZAN_MAP/MIZAN_SPLIT) değiştirilmez. Motor değişikliği için izin iste.
- 331 ve 431 (ortaklara borçlar) BORÇTUR, özkaynak değildir. 7xx maliyet hesapları sisteme girmez.
- Ara dönem (Q1/Q2/Q3) akış kalemleri yıllıklandırılır, rapor "oranlar yıllıklandırılmış" ibaresi taşır.
- Subjektif faktörler girilmeden rapor ve nihai skor oluşmaz.
- Ücretsiz deneme: 14 gün, SINIRSIZ (firma, dönem, senaryo, PDF). Süre bitince paket (analiz hakkı) gerekir.
  Yönetici (role ADMIN) sınırsız. Kaynak: `src/lib/entitlements.ts`.
- Tek skorlama yolu: `src/lib/scoring/rescoreFinancialData.ts` / `buildRatioInput` / `applyGuardrails` / `resolveFinalScore`.
- Yeni oturum açma / paralel iş: hayır. Her şey tek oturumda, sırayla.

## Ortamlar
- DATABASE_URL: Production+Development = canlı Neon (ep-flat-mode-…), Preview = Neon `preview` dalı (ep-weathered-…).
- Sentry: org `finrate`, proje `javascript-nextjsfinrate-web` (DSN `NEXT_PUBLIC_SENTRY_DSN`).
- Dosya deposu: Vercel Blob `finrate-uploads` (private, `BLOB_READ_WRITE_TOKEN`).
- E-posta: Natro SMTP (`info@finrate.com.tr`); şifreler yalnızca Vercel'de.
- Bulut oturumu gizli değerleri (DATABASE_URL, SMTP vb.) göremez → veritabanına dokunan işler lokal oturumda yapılır.

## Bulut oturumu için çalışma kuralı
1. `feature/...` dalında çalış, test + tsc yeşilse PR aç; `main`'e doğrudan push etme (canlıya çıkar).
2. Migration eklersen `prisma/migrations/<tarih>_<ad>/migration.sql` + `schema.prisma`; nullable/geriye uyumlu olsun.
3. UI: `CLAUDE.md`'deki tasarım sistemi (beyaz kartlar, `#0B3C5D` lacivert, `#2EC4B6` cyan; kart içinde `text-white` yok).

## Açık işler (öncelik sırasıyla)
1. Ödeme: iyzico entegrasyonu (kullanıcı üye işyeri başvurusu yapacak; anahtar gelince kart ödemesi + otomatik hak yükleme).
2. Analizler sayfası (`src/app/dashboard/analiz/page.tsx`) 1000px altında sol firma listesi içeriğin üstüne yığılıyor → dar ekran düzeni.
3. Gruplar/konsolide analiz: sayfalar çalışıyor ama konsolide skor motoru zayıf; ihtiyaç olunca ele alınacak.
4. Yükleme sayfasındaki hata mesajlarını (teknik kodlar) sadeleştirmek.

## Son büyük değişiklikler (2026-09-26)
Subjektif zorunlu rapor; /metodoloji; landing tutarlılığı; hukuk metinleri (ücretsiz kapsam, iade); preview DB;
Sentry; şifre sıfırlama; hak sistemi + `/dashboard/admin`; dosya saklama + "Yeniden işle"; `/api/analyses` hızlandırma;
tek tıkla rapor (yol haritası otomatik); mobil çekmece menü; Şirketler sıralama/filtre; 9 deneme hesabı silindi.
