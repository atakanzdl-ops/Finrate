# Finrate — Devir Notu (bulut / yeni oturumlar için)

Son güncelleme: 2026-09-26. Bu dosya, projeyi ilk kez açan bir Claude oturumunun (özellikle
GitHub üzerinden çalışan bulut oturumunun) bağlamı hızla edinmesi içindir. Kullanıcı (Atakan)
teknik değildir: her şeyi sen yaparsın, o onaylar. Türkçe konuş, kısa yaz.

## Ne var, nerede
- Uygulama: `app/` (Next.js 16, Prisma 7 + PostgreSQL/Neon, Jest). Canlı: https://www.finrate.com.tr (Vercel, proje `finrate`).
- Ana dal `main` → canlıya otomatik deploy (Vercel build'de `prisma migrate deploy` çalışır).
  Geliştirme dalı: `feature/motor-aksiyon-v2` (main'e `--no-ff` merge edilir).
- Testler: `cd app && npx jest --silent` (95 paket / ~1925 test, hepsi yeşil olmalı).
  Tip kontrolü: `npx tsc --noEmit -p tsconfig.json` → 0 hata (testler dahil). Lint: `npm run lint` → 0 hata.
  Bu üçü her push öncesi yeşil olmalı; yeni hata eklenmez.
- Kod kalitesi kuralları (2026-09-26 temizliği): `any` üretim kodunda yasak (testlerde serbest); kullanılmayan
  değişken/import yasak (`_` önekiyle bilinçli istisna). `score.ts`, `benchmarks.ts`, `ratios.ts`, `beyanname.ts`
  dokunulmaz olduğu için lint'te "unused/prefer-const" bu dosyalarda kapalı.
- Repoya girmeyen klasörler: `backups/`, `tmp/`, `src/tmp/` (.gitignore). Eski müşteri dosyaları ve yedekler
  git geçmişinde durur ama artık takip edilmez. `middleware.ts` → `proxy.ts` (Next 16 adı), davranış aynı.
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

## Ödeme (iyzico) — iskelet hazır, anahtar bekliyor
- Kod: `src/lib/payments/iyzico.ts` (IYZWSv2 imza, Checkout Form başlat/doğrula, bağımlılık yok),
  `src/app/api/payments/{config,checkout,callback}/route.ts`, `src/components/account/PackagePurchase.tsx` (Ayarlar → Abonelik).
- Tek hak yükleme yolu: `entitlements.grantPackage()` — yönetici paneli (havale) ve iyzico callback aynı fonksiyonu kullanır.
- Paket fiyatları `PACKAGES.priceTRY` (KDV dahil; landing ile aynı: 1.999 / 6.999 / 29.999).
- Anahtar yokken davranış: `/api/payments/config` → `enabled:false`; Ayarlar'da "E-posta ile Satın Al" görünür. Kod canlıya çıksa da kart ödemesi kendini göstermez.
- Migration `20260928000000_payment_iyzico_fields` (payments tablosuna nullable alanlar; build'de otomatik uygulanır).
- **Yerel oturumda yapılacaklar (anahtar gelince):**
  1. Vercel → Environment Variables: `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` (önce sandbox ile Preview'da dene, sonra Production'a `https://api.iyzipay.com`).
  2. Sandbox test kartıyla `Ayarlar → Paket Satın Al → Kartla Satın Al` akışını uçtan uca dene; `?odeme=basarili` bandı ve kalan hak artışı görülmeli.
  3. Alıcı bilgisi: kullanıcı VKN/TCKN girdiyse (`users.taxNumber`, kayıt ve Ayarlar → Profil) iyzico'ya o gider; boşsa yer tutucu.
  4. Yasal: mesafeli satış / ön bilgilendirme metni `/yasal#mesafeli`'de hazır (taslak; avukat kontrolü önerilir).

## Açık işler (öncelik sırasıyla)
1. iyzico anahtarları gelince yukarıdaki "yerel oturumda yapılacaklar".
2. Gruplar/konsolide: dönem hizalama + ara dönem yıllıklandırma yapıldı (`consolidationPeriod.ts`); kullanılmayan
   `/api/groups/[id]/consolidate` rotası kaldırıldı. Kalan tek konu motor kararı gerektirir:
   konsolide skor guardrail/subjektif birleşimi tek firma yolundan (`resolveFinalScore`) geçmiyor.
3. Analizler sayfası dar ekran düzeni yapıldı (25911e2: <1024px firma/dönem seçici) — kapalı.

## Son değişiklikler (2026-09-26, bulut oturumu)
Yükleme hata mesajları sadeleştirildi (`src/lib/i18n/uploadErrorText.ts`); konsolide skor aynı döneme hizalanır ve
ara dönemde yıllıklandırılır; iyzico ödeme iskeleti (anahtar bekliyor); Ayarlar'da yasal bağlantılar `/yasal`'a açıldı.

## Son büyük değişiklikler (2026-09-26)
Subjektif zorunlu rapor; /metodoloji; landing tutarlılığı; hukuk metinleri (ücretsiz kapsam, iade); preview DB;
Sentry; şifre sıfırlama; hak sistemi + `/dashboard/admin`; dosya saklama + "Yeniden işle"; `/api/analyses` hızlandırma;
tek tıkla rapor (yol haritası otomatik); mobil çekmece menü; Şirketler sıralama/filtre; 9 deneme hesabı silindi.
