# Finrate — PDF ve Raporlama Analiz Raporu

Kaynak: `app/src/lib/reporting/**`, `app/src/app/api/analyses/[id]/pdf/route.ts`

---

## 📄 PDF Üretimi Altyapısı

Finrate uygulamasında raporların PDF olarak çıktısının alınması, sistemin en kritik B2B değer tekliflerinden biridir.

- **Teknoloji:** Serverless Headless Chrome (Puppeteer + `@sparticuz/chromium`)
- **Alternatif / Yardımcı Araçlar:** `pdf-lib`, `pdf-parse`

---

## ✅ Güçlü Yanlar

1. **Pixel-Perfect Tasarım (Puppeteer):** PDF üretmek için jspdf veya benzeri canvas tabanlı kütüphaneler yerine Headless Chrome (Puppeteer) kullanılması, HTML/CSS tasarımının (grafikler, tablolar) birebir, yüksek kaliteli (pixel-perfect) PDF'e dönüşmesini sağlar.

---

## 🔴 Kritik Bulgular ve Riskler

### 1. Vercel Serverless Timeout ve Memory Riskleri
**Durum:** Next.js API route'unda (`/api/analyses/[id]/pdf`) anlık olarak bir Chromium instance'ı ayağa kaldırılıyor, sayfa render ediliyor ve PDF'e basılıyor.
**Risk:** 
- Headless Chromium oldukça ağır bir işlemdir. 
- Vercel'in Hobby planında fonksiyon başına 1024MB RAM ve 10 saniye süre limiti vardır. Pro planda süre 60 saniye olsa da, aynı anda 3-4 kullanıcı PDF talep ettiğinde Vercel limitlerine takılma, "Memory Limit Exceeded" veya "Timeout" hataları alma olasılığınız **%100'e yakındır**.
**Öneri:**
- Uzun vadede PDF üretim işini Vercel üzerinden çıkarıp, AWS Lambda, Google Cloud Run veya özel olarak PDF üretimi için optimize edilmiş bir mikroservise (örneğin Render.com üzerinde çalışan basit bir Express.js + Puppeteer sunucusuna) taşımanız sistemin sağlığı için kritiktir.

### 2. İki Farklı Raporlama Dosyası
**Dosyalar:** `reportPdf.ts` ve `reportPdf.next.ts`
**Durum:** Klasör içerisinde aynı işi yapmaya çalışan iki farklı dosya mevcut. Muhtemelen birisi eski sürüm, diğeri Next.js (App Router) güncellemeleriyle uyumlu hale getirilmeye çalışılan yeni sürüm.
**Risk:** Kod karmaşası ve bakım zorluğu. Hangi dosyanın production'da çağrıldığının karıştırılması olası hatalara yol açar.
**Öneri:** Kullanılmayan eski versiyon `.deprecated` olarak işaretlenmeli veya tamamen silinmelidir.

### 3. Dinamik Veri ve Font Yükleme Sorunları
**Risk:** Serverless ortamlarda özel fontlar (örneğin şirket kurumsal fontları) yüklenirken sıkıntılar yaşanır (font yüklenmeden PDF çekilirse Türkçe karakterler bozulur veya varsayılan fonta düşer).
**Öneri:** Puppeteer PDF almadan önce fontların tam olarak yüklendiğini bekleyen (örn: `document.fonts.ready`) bir sayfa içi tetikleyici eklendiğinden emin olunmalıdır.
