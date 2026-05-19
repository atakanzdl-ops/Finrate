# Finrate - Frontend ve İstemci (Client) Mimari Değerlendirmesi

Bu rapor, kod tabanındaki (özellikle `package.json` ve `app/src/lib/auth.ts` dosyalarındaki) bağımlılıkların ve kod kullanım pratiklerinin analiz edilerek; state management, yerel depolama (local storage) ve kimlik doğrulama (authentication) yaklaşımlarının değerlendirmesini içerir.

## 1. State Management (Durum Yönetimi)

**Mevcut Durum:**
Projede Redux, Zustand, MobX, Jotai veya Recoil gibi hiçbir harici state management paketi bulunmamaktadır. React'ın kendi global state çözümü olan `Context API` dahi global ölçekte kullanılmamıştır.

**Kullanılan Yöntem:**
Proje tamamen **Next.js 15 App Router (Server Components)** mimarisine dayanmaktadır. Veri sunucuda (server-side) çekilmekte ve alt bileşenlere (Client Components) "prop" olarak aktarılmaktadır. Sayfa içi etkileşimler basit `useState` hook'u ile, kalıcı durumlar ise "URL Query Parametreleri" ile yönetilmektedir.

**Uygunluk Değerlendirmesi: 🟢 Çok Uygun ve Modern**
Next.js App Router mimarisinde en iyi pratik tam olarak budur. Frontend tarafında devasa bir Redux store tutmak yerine, veriyi server'da yönetip sadece etkileşim gerektiğinde client'a yollamak uygulamanın oldukça hızlı çalışmasını sağlar, JavaScript bundle (paket) boyutunu küçültür ve veri akışı karmaşıklığını önemli ölçüde azaltır.

## 2. Local Storage / Tarayıcı Depolama

**Mevcut Durum:**
Kod tabanında hiçbir şekilde `localStorage`, `sessionStorage` veya `IndexedDB` kullanılmamaktadır.

**Kullanılan Yöntem:**
Durum (state) yönetimi sunucu tarafında veya URL parametreleri ile sağlanırken, kimlik doğrulama token'ları gibi güvenli bilgiler sadece tarayıcı çerezlerinde (Cookies) saklanmaktadır.

**Uygunluk Değerlendirmesi: 🟢 Güvenlik Açısından Çok İyi**
Kritik veya kalıcı verilerin `localStorage` üzerinde tutulmaması, XSS (Cross-Site Scripting) saldırılarından kaynaklı veri sızıntılarını önler. Finansal veriler ve kredi notları barındıran Finrate gibi banka kalitesinde bir platformda verilerin `localStorage` yerine güvenli bir biçimde yönetilmesi (cookies/server state) mimari açıdan son derece doğru bir karardır.

## 3. Authentication (Kimlik Doğrulama)

**Mevcut Durum:**
`next-auth` (Auth.js) veya `Clerk` gibi popüler kimlik doğrulama kütüphaneleri kullanılmamıştır. Kimlik doğrulama, JWT tabanlı **özel yazılmış (Custom)** bir altyapıya (`src/lib/auth.ts`) sahiptir.

**Kullanılan Paketler ve Yöntem:**
- **`jsonwebtoken`**: JWT (JSON Web Token) üretmek ve doğrulamak için kullanılmaktadır.
- **`bcryptjs`**: Kullanıcı şifreleri veritabanına 12 tur (salt rounds) hashlenerek güvenli bir şekilde kaydedilmektedir.
- Sistem başarılı girişte `finrate_token` adında bir Cookie oluşturur ve API istekleri bu token veya `Authorization: Bearer` header'ı üzerinden doğrulanır. Ayrıca şifre değişimi sonrasında (`passwordChangedAt`) eski token'ları anında geçersiz kılan güvenlik kontrolleri mevcuttur.

**Uygunluk Değerlendirmesi: 🟡 Yeterli Ancak Geliştirilebilir**
Mevcut sistem e-posta/şifre girişi için oldukça güvenli ve doğru kurgulanmıştır (şifre hashleme ve token invalidation mantıkları sağlamdır). Şu anki B2B iş modeli için yeterlidir. Ancak ileride projeye "Google/Microsoft ile Giriş", "Çift Aşamalı Doğrulama (2FA)" veya "Güvenli Oturum Yenileme (Refresh Token Rotation)" gibi daha ileri seviye özellikler eklemek isterseniz custom auth yapısını yönetmek ve bakımını yapmak zorlaşabilir. Bu tarz ihtiyaçlar doğduğunda, endüstri standardı olan **Auth.js** (eski adıyla NextAuth) gibi hazır çözümlere geçiş değerlendirilebilir.
