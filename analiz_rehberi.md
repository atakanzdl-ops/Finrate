# Finrate — Uçtan Uca Mimari Analiz Rehberi

Bu dosya, Finrate projesi üzerinde yapılabilecek tüm analiz başlıklarını sistematik bir biçimde sunar. Her başlık bağımsız bir inceleme oturumu olarak ele alınabilir.

---

## ✅ Tamamlanan Analizler

- [x] **Proje Genel Bakış** — Amaç, teknoloji yığını, framework
- [x] **Kullanılmayan / Ölü Kod** — Atıl paketler, DB modelleri, TS tipleri → `olu_kod.md`
- [x] **Frontend Mimari** — State management, localStorage, authentication → `frontend_degerlendirmesi.md`

---

## 📋 Bekleyen Analiz Başlıkları

### 🔐 Güvenlik

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **JWT Güvenliği** | Token süre ayarı (7d), algoritma (HS256), brute-force koruması | 🔴 Yüksek |
| **Rate Limiting Derinliği** | Upstash sliding-window ayarları, fail-open riskleri, eksik kapsanan endpointler | 🔴 Yüksek |
| **CORS Politikası** | Hangi originlere izin veriliyor, API uç noktaları açık mı? | 🔴 Yüksek |
| **HTTP Güvenlik Başlıkları** | CSP (Content Security Policy) eksikliği, mevcut `X-Frame-Options` vb. | 🟡 Orta |
| **Giriş Validasyonu** | API endpoint'lerinde input sanitization yeterliliği | 🔴 Yüksek |
| **Şifre Sıfırlama Akışı** | Şifre sıfırlama mekanizması var mı, yoksa eksik mi? | 🟡 Orta |
| **TypeScript Build Hatası Görmezgelme** | `next.config.ts` içindeki `ignoreBuildErrors: true` — gizlenen hatalar | 🔴 Yüksek |

---

### ⚙️ Backend ve API Katmanı

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **API Endpoint Envanteri** | Tüm route'ların (`/api/**`) listesi, hangileri korumalı/açık? | 🟡 Orta |
| **Middleware Kapsam Analizi** | `middleware.ts` matcher'ın kapsadığı ve **kaçırdığı** endpoint'ler | 🔴 Yüksek |
| **Hata Yönetimi (Error Handling)** | API'lerde try/catch tutarlılığı, standardize edilmiş hata yanıtları var mı? | 🟡 Orta |
| **API Yanıt Süresi (Latency)** | Ağır hesaplama yapan endpointler (senaryo motoru, konsolidasyon), timeout riskleri | 🟡 Orta |
| **Prisma Sorgu Optimizasyonu** | N+1 sorgu riski, gereksiz `findMany` kullanımları, index eksikliği | 🟡 Orta |
| **Subscription API Tamamlığı** | `iyzicoSubKey` vs ödeme sağlayıcısı çelişkisi (schema'da iyzico, başka yerde PayTR?) | 🔴 Yüksek |

---

### 🗄️ Veritabanı (Prisma + NeonDB)

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **Migration Yönetimi** | Migration dosyaları sağlıklı mı, production'da `migrate deploy` güvenli mi? | 🔴 Yüksek |
| **Index Stratejisi** | Hangi alanlarda index var, hangileri eksik? | 🟡 Orta |
| **Soft-Delete Tutarlılığı** | `isActive`, `deletedAt` alanları gerçekten kullanılıyor mu? | 🟡 Orta |
| **Cascade Silme Riskleri** | `onDelete: Cascade` zinciri — hangi modeller birbirini siliyor, tehlikeli mi? | 🟡 Orta |
| **JSON Kolon Kullanımı** | `ratios`, `consolidatedFinancials`, `roadmapSnapshot` JSON string — sorgulanabilirlik riski | 🟢 Düşük |
| **GroupElimination Migrasyonu** | Deprecated modelin `GroupEliminationEntry`'e tam geçişi tamamlandı mı? | 🟡 Orta |

---

### 🧠 Senaryo ve Skor Motoru

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **V2 vs V3 Senaryo Motoru Durumu** | `scenarioV3` hangi noktada? API'de aktif mi, V2 hâlâ kullanımda mı? | 🔴 Yüksek |
| **Motor Tekrarlayan Aksiyonlar** | A10'nun long ufukta 3x tekrar etmesi — diversifikasyon mantığı yeterli mi? | 🟡 Orta |
| **Benchmark Verileri Güncelleme** | `benchmarks.ts` içindeki TCMB 2024 verileri güncel mi, otomatik mi? | 🟡 Orta |
| **Senaryo Motoru Test Kapsamı** | 9 unit test dosyası mevcut — kapsam (coverage) oranı yeterli mi? | 🟡 Orta |
| **Hesap Kodu Eşleme (chartOfAccounts)** | TDHP 100–692 tam eşlendi mi, eksik hesap kodu var mı? | 🟢 Düşük |

---

### 🖥️ Frontend ve Kullanıcı Arayüzü

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **Sayfa / Route Envanteri** | Tüm Next.js sayfaları (`/dashboard/**`, `/giris`, `/kayit` vb.) listesi | 🟢 Düşük |
| **Component Mimarisi** | `components/` altındaki bileşen hiyerarşisi, tekrar kullanım, büyük dosyalar | 🟡 Orta |
| **Landing Page Durumu** | `finrate_landing.html` ayrı dosya — Next.js içine entegre mi, statik mi? | 🟡 Orta |
| **Framer Motion Kullanımı** | Hangi sayfalarda animasyon var, FPS/performans etkisi var mı? | 🟢 Düşük |
| **Recharts Kullanımı** | Hangi grafikler mevcut, mobile responsive mi? | 🟢 Düşük |
| **Mobil Uyumluluk (Responsive)** | Dashboard'un mobil görünümü, breakpoint stratejisi | 🟡 Orta |
| **Erişilebilirlik (a11y)** | ARIA etiketleri, klavye navigasyonu, renk kontrastı | 🟢 Düşük |
| **i18n / Çoklu Dil** | `src/lib/i18n` klasörü mevcut — ne kadar tamamlandı? | 🟢 Düşük |

---

### 📄 PDF ve Raporlama

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **PDF Üretimi Altyapısı** | `reportPdf.ts` vs `reportPdf.next.ts` — iki versiyon neden var? | 🟡 Orta |
| **Puppeteer Core Kullanımı** | `@sparticuz/chromium` + `puppeteer-core` serverless PDF — Vercel timeout riskleri | 🔴 Yüksek |
| **pdf-lib Kullanımı** | `pdf-lib` ile `pdf-parse` birlikte mi kullanılıyor, roller nedir? | 🟢 Düşük |

---

### 🧪 Test Altyapısı

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **Mevcut Test Kapsamı** | Jest ile yazılmış 9 unit test — hangi modüller test edilmiş, hangileri eksik? | 🟡 Orta |
| **Test Ortamı Yapılandırması** | `jest.config.js`, `ts-jest` ayarları, CI entegrasyonu | 🟡 Orta |
| **Integration / E2E Test Eksikliği** | API endpointleri ve UI akışları için entegrasyon testi var mı? | 🟡 Orta |

---

### 🚀 DevOps ve Dağıtım (Deployment)

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **Vercel Yapılandırması** | `vercel.json`, ortam değişkenleri, edge bölgeleri | 🟡 Orta |
| **Docker Yapılandırması** | `docker-compose.yml` — aktif mi, local geliştirme için mi? | 🟢 Düşük |
| **CI/CD Pipeline** | `.github/` workflows — build, test, deploy otomasyonu mevcut mu? | 🟡 Orta |
| **ENV Yönetimi** | `.env.production` → Vercel secrets senkronizasyonu, gizli key'ler güvende mi? | 🔴 Yüksek |
| **Log ve Monitoring** | `logger.ts` mevcut, Vercel Analytics / Sentry gibi üretim izleme var mı? | 🟡 Orta |
| **deploy.sh Script** | Dağıtım betiği neler yapıyor, güvenli mi? | 🟢 Düşük |

---

### 📦 Bağımlılık ve Paket Sağlığı

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **Outdated Paketler** | `npm outdated` — hangi paketlerin güncel versiyonu çıkmış? | 🟡 Orta |
| **Güvenlik Açıkları (CVE)** | `npm audit` — bilinen güvenlik açıklığı var mı? | 🔴 Yüksek |
| **Bundle Boyutu** | `next build` çıktısı, ağır client component'ler | 🟡 Orta |

---

### 📐 Kod Kalitesi ve Mimari Sağlık

| Başlık | Açıklama | Öncelik |
|---|---|---|
| **ESLint Uyumu** | `ignoreDuringBuilds: true` kapatılırsa kaç lint hatası çıkar? | 🟡 Orta |
| **TypeScript Sıkılığı** | `tsconfig.json` `strict` modu açık mı, ne kadar tip güvencesi var? | 🟡 Orta |
| **Büyük Dosyalar** | 40KB+'ı geçen dosyalar (`actions.ts` ~48KB, `chartOfAccounts.ts` ~36KB) — bölünmeli mi? | 🟢 Düşük |
| **Circular Dependency** | Modüller arası döngüsel import var mı? | 🟡 Orta |
| **Konsolidasyon Motoru Ayrımı** | `src/consolidation_engine/` — ana motor ile entegrasyon durumu | 🟡 Orta |

---

## 🗺️ Önerilen Analiz Sırası

```
1. Güvenlik (JWT, CORS, Rate Limit, ignoreBuildErrors)   ← En kritik
2. API Middleware Kapsam Analizi
3. Subscription/Ödeme Tutarlılığı (iyzico vs PayTR?)
4. V2 vs V3 Senaryo Motoru Durumu
5. Puppeteer / PDF Serverless Timeout Riski
6. npm audit (güvenlik açıkları)
7. Test Kapsamı Değerlendirmesi
8. Büyük Dosyaların Bölünmesi
```
