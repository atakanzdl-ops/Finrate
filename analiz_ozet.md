🛡️ 1. Güvenlik ve Yetkilendirme Açıkları
TypeScript Hatalarının Gizlenmesi: next.config.ts dosyasında ignoreBuildErrors: true ayarı kullanılıyor. Bu durum, güvenlik açığı oluşturabilecek tip hatalarının bile sessizce üretime (production) gitmesine yol açabilir.
Tavsiye: Bu ayarı false olarak güncelleyin ve ortaya çıkan hataları temizleyin.
Güvenlik Politikalarının (CORS ve CSP) Eksikliği: Sistemde CORS kontrolü yapılmıyor ve modern bir Content Security Policy (CSP) header'ı tanımlanmamış. Bu durum hassas API'leri herhangi bir kaynaktan (origin) gelen çağrılara ve potansiyel XSS saldırılarına açık hale getiriyor.
Tavsiye: next.config.ts üzerinden ortama bağlı Access-Control-Allow-Origin kısıtlaması ve modern bir CSP header'ı (script-src 'self' vb.) ekleyin.
Eksik Middleware Koruması: /api/scenarios ve /api/analyses gibi ağır uç noktalar middleware kapsamı (matcher) dışında bırakılmış, bu da onları rate limit (istek sınırlandırma) korumasından mahrum bırakıyor.
Tavsiye: İlgili uç noktaları (endpoint) middleware matcher listesine ekleyerek rate limit koruması altına alın.
🗄️ 2. Veritabanı ve Dağıtım (DevOps) Riskleri
Tehlikeli Veritabanı Göçü (Migration): Build script'inizde (package.json) yer alan prisma migrate deploy komutu, Vercel her commit aldığında otomatik olarak çalışıyor. Yanlış bir migration, üretim (production) veritabanını bozabilir ve geri alınamaz veri kaybına ya da sistem kesintisine yol açabilir.
Tavsiye: Migration deploy işlemini build sürecinden ayırın ve yalnızca kontrollü bir şekilde (manuel veya CI/CD üzerinden) çalıştırılacak ayrı bir script haline getirin.
JSON String Kolon Kullanımı: Prisma şemasında ratios ve roadmapSnapshot gibi alanlar String tipiyle tutuluyor. Bu durum Prisma veya PostgreSQL'in bu alanları indeksleyememesine ve filtreleyememesine neden oluyor.
Tavsiye: Bu kolonları sorgulanabilirliği ve performansı artırmak için Prisma'nın Json (PostgreSQL JSONB) veri tipine dönüştürün.
⚙️ 3. Mimari ve İş Mantığı Borçları
Paralel Senaryo Motorları: Sistemde şu an V1, V2 ve V3 olmak üzere üç farklı senaryo motoru aynı anda aktif. Bu durum bakım maliyetini çok yükseltiyor ve gelecekteki geliştirmelerde hangi motorun güncelleneceği konusunda kafa karışıklığı yaratıyor.
Tavsiye: Eski V1 ve V2 motorlarını ölü kod (deprecated) olarak işaretleyip sistemden aşamalı olarak silin ve yalnızca güncel olan V3 (hesap kodu bazlı) motorunu resmi motor olarak destekleyin.
Açık Bırakılan Debug Çıktıları: /api/scenarios uç noktasında, hesap kodlarını ve aksiyon sonuçlarını içeren debug objesi her üretim (production) yanıtına ekleniyor. Bu, dış kullanıcılar için veri görünürlüğüne neden olur.
Tavsiye: Debug verisini sadece geliştirme (development) ortamında (process.env.NODE_ENV !== 'production') döndürecek şekilde kısıtlayın.
Yarım Kalan Temel Akışlar (Abonelik ve Şifre Sıfırlama): Abonelik durumu yalnızca veritabanında bir boolean ile takip ediliyor ve gerçek bir ödeme akışı veya webhook entegrasyonu bulunmuyor. Ayrıca, kullanıcıların şifrelerini unutmaları durumunda kullanabilecekleri bir şifre sıfırlama (forgot password) API'si de sisteme dahil edilmemiş.
Tavsiye: Kullanılacak ödeme sağlayıcısını netleştirip gerçek bir entegrasyon yapın ve mevcut doğrulama token altyapısını kullanarak şifre sıfırlama akışını kodlayın.
🚀 4. Performans ve Timeout Tehlikeleri
Serverless PDF Üretimi: Vercel üzerinde Puppeteer ile anlık PDF üretimi yapılıyor. Headless Chromium oldukça ağır bir işlem olduğundan, Vercel'in bellek (memory) veya süre (timeout) limitlerine takılma riskiniz %100'e yakındır.
Tavsiye: PDF üretim işlemini Vercel'in üzerinden alın ve AWS Lambda, Google Cloud Run veya bu iş için optimize edilmiş ayrı bir mikroservise taşıyın.
Senaryo Motoru Zaman Aşımı (Timeout): V3 motoru; asgari, dengeli ve agresif planları Promise.all ile tamamen paralel hesaplıyor. Karmaşık hesaplamalarda bu işlem süresi uzayabilir ve Vercel'in limitlerini aşarak timeout verebilir.
Tavsiye: Arka planda çalışan bir iş kuyruğu (Job Queue) kullanmayı değerlendirin veya arayüze önce ana simülasyonu verip, alternatifleri asenkron olarak daha sonra getirin.