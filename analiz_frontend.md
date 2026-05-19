# Finrate — Frontend (Kullanıcı Arayüzü) Analiz Raporu

Kaynak: `app/src/components/**`, `app/src/app/(dashboard)/**`, `app/src/app/globals.css`

---

## 🎨 Mimari ve Teknoloji Yığını

- **Framework:** Next.js 15 (App Router)
- **Stil Yönetimi:** Tailwind CSS
- **Bileşen Kütüphanesi:** Özel geliştirilmiş (Radix UI veya shadcn/ui altyapısı izleri olabilir)
- **Durum Yönetimi (State):** Server Components ağırlıklı, yerel durumlar (Client Components) için React `useState` ve URL parametreleri (Query Params). Harici kütüphane (Redux, Zustand) yok.
- **Grafik & Veri Görselleştirme:** Recharts
- **Animasyon:** Framer Motion

---

## ✅ Güçlü Yanlar (Doğru Yapılanlar)

1. **Modern Server-Side Rendering (SSR):** Uygulama Next.js'in en güncel yapısı olan "App Router" üzerine inşa edilmiş. Veri getirme (data fetching) işlemleri sunucuda yapılıp, istemciye sadece hazır HTML gönderiliyor. Bu SEO ve performans için çok değerli.
2. **State Management Kararı:** Global state aracı (Redux vb.) kullanılmaması, projenin kompleksitesini çok düşürmüş. "Server State is the Single Source of Truth" yaklaşımı başarıyla uygulanmış.
3. **Güvenli Local Storage Kullanımı:** `frontend_degerlendirmesi.md` dosyasında da belirtildiği gibi JWT tokenlar Local Storage yerine HTTP-Only Cookie'lerde tutuluyor. XSS saldırılarına karşı çok güvenli.
4. **Modüler Bileşen Yapısı:** `components/analysis` altında analiz sayfasına ait (örn: `AccountImpactTable.tsx`, `OptimizationPanel.tsx`) parçalar mantıklı şekillerde küçük componentlere ayrılmış.

---

## 🔴 Kritik Bulgular ve Riskler

### 1. Landing Page Ayrıklığı
**Dosyalar:** `finrate_landing.html` ve `finrate-landing.css`
**Durum:** Proje Next.js ve React ile yazılmışken, Landing Page (açılış sayfası) klasik HTML ve devasa bir (19KB) CSS dosyası olarak proje kökünde/public klasöründe duruyor veya manuel entegre edilmeye çalışılmış.
**Risk:** Tasarım bütünlüğü, component tekrar kullanımı (örneğin butonlar, navbar) ve yönlendirmeler (routing) React ekosisteminden kopuk olduğu için spagetti koda dönüşebilir. Landing sayfasının da Next.js sayfalarına (`app/page.tsx`) Tailwind ile entegre edilmesi gerekir.

### 2. Aşırı Büyük Client Component'ler
**Risk:** `app/src/components/analysis/ScenarioPanelV3.tsx` gibi V3 senaryo sonuçlarını gösteren bileşenler, çok fazla state barındıran devasa Client Component'lere dönüşme eğilimindedir. Eğer bir component çok fazla `use client` state'ine (aktif sekme, açık akordiyon, modal durumu) sahipse, render performansı düşer.
**Öneri:** State'in bir kısmını URL Query parametrelerine taşıyın (örn: `?plan=aggressive`). Bu sayede sayfalar arası paylaşılabilir (shareable) linkler elde edersiniz ve component hafifler.

### 3. Çoklu Dil (i18n) Eksikliği
**Durum:** Projede `src/lib/i18n` gibi yapılar olsa da, metinlerin büyük çoğunluğu (hata mesajları, buton textleri) hard-coded (doğrudan koda yazılmış) Türkçe olarak duruyor.
**Risk:** B2B finansal bir platformun yurt dışına (veya çok uluslu şirketlere) açılması gerektiğinde, binlerce dosyada hard-coded metin aramak aylar sürebilir.
**Öneri:** `next-intl` gibi modern bir Next.js i18n kütüphanesi kurularak yeni geliştirilen sayfalarda doğrudan çeviri anahtarları (translation keys) kullanılmalıdır.

---

## 🟡 İyileştirme Fırsatları

- **Erişilebilirlik (a11y):** Form elemanlarında, özellikle "Yükle", "Analiz Et" gibi butonlarda klavye navigasyonu (Tab index) ve ekran okuyucular için `aria-label` etiketleri eksik olabilir. Finansal B2B ürünlerde erişilebilirlik standartlarına uymak kurumsal müşteriler için bir zorunluluk olabilir.
- **Framer Motion Performansı:** Animasyonlar için kullanılan Framer Motion güçlüdür ancak JavaScript bundle'ını büyütür. Animasyonların sadece gerekli yerlerde (modal açılışı, sayfa geçişi) kullanıldığından emin olun, her liste elemanında animasyon kullanmak listeyi yavaşlatır.
