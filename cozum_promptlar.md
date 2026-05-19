Harika bir strateji! Projeyi adım adım, her seferinde tek bir odağa odaklanarak düzeltmek en sağlıklı yazılım geliştirme yöntemidir.

Aşağıda, karşına çıkacak yapay zekaya (ya da bana) doğrudan kopyalayıp yapıştırabileceğin, kod tabanındaki ilgili dosyaları hedefleyen ve nokta atışı çözümler üretecek **adım adım prompt listesi** yer alıyor. Süreci en kritikten başlayarak 4 faza böldüm.

---

## 🛠️ Faz 1: Altyapı, CI/CD ve Güvenlik Sıkılaştırma

### Prompt 1: TypeScript Build Hatalarını Açma ve Migration Düzenlemesi

> **Hedef Dosyalar:** `app/next.config.ts`, `app/package.json`
> **Prompt:**
> "Finrate projemde production build süreçlerini güvenli hale getirmek istiyorum. `app/next.config.ts` dosyasındaki `typescript.ignoreBuildErrors` ve `eslint.ignoreDuringBuilds` ayarlarını `false` yapalım. Ardından, `app/package.json` içindeki `"build": "prisma migrate deploy && prisma generate && next build"` komutunu düzenleyerek `prisma migrate deploy` adımını build sürecinden tamamen ayıralım. Sadece lokalde veya kontrollü çalıştırabileceğim bağımsız bir `"migrate:prod"` script'i ekleyelim. Bu değişiklikleri yapıp, gerekçelerini açıklar mısın?"

### Prompt 2: CORS ve CSP Güvenlik Başlıklarının Eklenmesi

> **Hedef Dosya:** `app/next.config.ts`
> **Prompt:**
> "Finrate API uç noktalarını (endpoint) dışarıdan gelebilecek XSS ve yetkisiz kaynak çağrılarına karşı korumak istiyorum. `app/next.config.ts` dosyasındaki `headers()` konfigürasyonuna ortam değişkenine duyarlı (örneğin `process.env.ALLOWED_ORIGIN`) bir `Access-Control-Allow-Origin` CORS politikası ekle. Ayrıca eski `X-Frame-Options: DENY` başlığının yanına modern, güvenli bir `Content-Security-Policy` (CSP) header'ı tanımla. Kod örneğiyle birlikte Next.js 15 mimarisine uygun şekilde günceller misin?"

### Prompt 3: Middleware Kapsam Boşluklarının Kapatılması

> **Hedef Dosya:** `app/src/middleware.ts`
> **Prompt:**
> "Uygulamamda rate limit koruması Upstash Redis üzerinden sliding-window olarak yapılıyor ancak bazı ağır endpoint'ler middleware matcher'ı dışında kalmış. `app/src/middleware.ts` dosyasındaki `config.matcher` dizisini güncelle. Şu an eksik olan `/api/scenarios/:path*`, `/api/analyses/:path*`, `/api/raporlar` ve `/api/subscription/:path*` gibi kritik ve ağır uç noktaları da rate limit koruması kapsamına dahil edecek şekilde matcher konfigürasyonunu yeniden yazar mısın?"

---

## 🗄️ Faz 2: Veritabanı Modernizasyonu ve Temizlik

### Prompt 4: Prisma Şemasında String Kolonların JSONB Yapılması

> **Hedef Dosyalar:** `app/prisma/schema.prisma`, `app/src/app/api/scenarios/v3/route.ts` (veya ilgili API route'ları)
> **Prompt:**
> "Prisma şemamda (`schema.prisma`) `Analysis` modelinde yer alan `ratios`, `consolidatedFinancials` ve `roadmapSnapshot` alanları şu an `String?` olarak tanımlı ve içlerine JSON string olarak veri basılıyor. Bu durum veritabanında indeksleme ve filtreleme yapmayı engelliyor. Bu alanları Prisma'nın native `Json?` (PostgreSQL JSONB) tipine dönüştürecek şema değişikliğini yaz. Ek olarak, kod tarafında (örneğin `scenarios/v3/route.ts` içinde) bu alanları okurken yapılan gereksiz `JSON.parse` işlemlerini ortadan kaldıracak refactoring adımlarını göster."

### Prompt 5: Deprecated (Eski) Modellerin Şemadan Temizlenmesi

> **Hedef Dosyalar:** `app/prisma/schema.prisma`
> **Prompt:**
> "Veritabanımda çift kaynak ve veri tutarsızlığı riski yaratan eski yapılar var. `schema.prisma` dosyasından soft-deprecated durumdaki `GroupElimination` modelini tamamen kaldır (yerine `GroupEliminationEntry` kullanılacak). Ayrıca projede hiç kullanılmayan atıl durumdaki `IcTransaction`, `EliminationLog` ve `FinancialDataUpload` modellerini de şemadan temizle. Bu modelleri sildikten sonra DB'de temiz bir geçiş sağlamak için izlemem gereken migration adımlarını açıklar mısın?"

---

## 🧠 Faz 3: İş Mantığı ve Eksik Akışların Tamamlanması

### Prompt 6: Debug Çıktılarının Kapatılması ve Eski Motorların İşaretlenmesi

> **Hedef Dosyalar:** `app/src/app/api/scenarios/route.ts`, `app/src/app/api/scenarios/v2/route.ts`
> **Prompt:**
> "Üretim (production) ortamında güvenlik zafiyeti ve performans yükü oluşturmaması için `/api/scenarios` (V1 motoru) response'undaki `debug` objesinin dışarı sızmasını engellemek istiyorum. İlgili route.ts dosyasındaki `debug` objesini yalnızca `process.env.NODE_ENV !== 'production'` koşulunda response'a ekleyecek şekilde güncelle. Ayrıca artık resmi motorumuz V3 olduğu için, V1 ve V2 senaryo endpoint'lerine (`/api/scenarios` ve `/api/scenarios/v2`) gelen isteklere response header'da `Warning: 299 - Deprecated` ekleyecek veya bunları güvenli bir şekilde devredışı bırakacak kodu yazar mısın?"

### Prompt 7: Şifre Sıfırlama (Forgot Password) Akışının Kurulması

> **Hedef Dosyalar:** `app/src/app/api/auth/**` (Yeni endpoint'ler), `schema.prisma`
> **Prompt:**
> "Finrate platformunda şifre sıfırlama (forgot password) akışı eksik. Veritabanımda halihazırda 6 haneli kod mantığıyla çalışan `VerificationToken` modeli mevcut. Bu altyapıyı kullanarak `POST /api/auth/forgot-password` (kullanıcıya e-posta ile 6 haneli sıfırlama kodu gönderen) ve `POST /api/auth/reset-password` (kodu ve yeni şifreyi doğrulayıp şifreyi bcrypt ile güncelleyen) API uç noktalarını Next.js App Router standartlarına uygun olarak kodlar mısın?"

---

## 🚀 Faz 4: Performans ve Darboğaz (Timeout) Çözümleri

### Prompt 8: V3 Senaryo Motoru Paralel Hesaplama Optimizasyonu

> **Hedef Dosya:** `app/src/app/api/scenarios/v3/route.ts`
> **Prompt:**
> "V3 senaryo motorum `conservative`, `typical` ve `aggressive` olmak üzere 3 farklı planı `Promise.all` ile aynı anda hesaplıyor. Büyük mizanlarda bu durum Vercel serverless fonksiyonlarında `504 Gateway Timeout` hatasına yol açma riski taşıyor. Bu API route'unu optimize edelim: İlk istekte sadece ana plan olan `typical` hesaplanıp dönsün; diğer iki alternatif plan ise client-side'dan gelecek asenkron lazy-load istekleriyle (`/api/scenarios/v3?type=conservative` gibi) ayrı ayrı hesaplansın. Bu mimari dönüşümü sağlayacak API refactoring kodunu hazırlar mısın?"

### Prompt 9: Puppeteer PDF Üretimi Bellek ve Süre Optimizasyonu

> **Hedef Dosya:** `app/src/app/api/analyses/[id]/pdf/route.ts`
> **Prompt:**
> "Vercel serverless ortamında Puppeteer ve `@sparticuz/chromium` kullanarak PDF üretiyorum. Fonksiyonların timeout ve memory limitlerine (1024MB RAM) takılmaması için bu endpoint'i maksimum düzeyde optimize etmem gerekiyor. Chromium instance'ının işi bittiğinde hafızada kalmamasını (`browser.close()`), Türkçe karakterlerin bozulmaması için fontların tam yüklendiğinden emin olunmasını (`document.fonts.ready`) sağlayan ve gereksiz kaynak tüketimini engelleyen (args kısıtlamaları vb.) en optimize Next.js App Router PDF endpoint kodunu yazar mısın?"

---

Hangi fazdan veya hangi numaralı prompt'tan başlamak istersin? İlk adımı hemen burada birlikte atabiliriz!