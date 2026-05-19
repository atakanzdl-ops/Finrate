# Finrate — Güvenlik Analiz Raporu

Kaynak: `app/src/middleware.ts`, `app/src/lib/auth.ts`, `app/next.config.ts`, API route'ları

---

## ✅ Doğru Yapılan Şeyler

- **HttpOnly Cookie**: `finrate_token` cookie'si `httpOnly: true` olarak set ediliyor. JavaScript'ten erişilemez, XSS koruması sağlam.
- **Secure Cookie**: Production'da `secure: true` olarak set ediliyor. Sadece HTTPS üzerinden iletilir.
- **Token Invalidation**: Şifre değiştiğinde `passwordChangedAt` alanı güncelleniyor ve `verifyTokenWithDb()` bunu kontrol ediyor. Eski tokenlar otomatik geçersiz hale geliyor.
- **Rate Limiting**: Upstash Redis ile sliding-window rate limit uygulanmış: Login (5/dk), Upload (10/dk), Senaryo (20/dk).
- **Soft-deleted Hesap Koruması**: `isActive: false` olan kullanıcılar login olamıyor.
- **E-posta Doğrulaması**: Yeni kayıtlarda e-posta doğrulaması olmadan sisteme giriş yapılamıyor.
- **Temel HTTP Güvenlik Header'ları**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` header'ları tanımlanmış.
- **Şifre Hashleme**: bcrypt ile 12 salt round uygulanıyor. Endüstri standardının üzerinde.

---

## 🔴 Kritik Bulgular

### 1. `ignoreBuildErrors: true` — Gizlenen TypeScript Hataları

**Dosya:** `app/next.config.ts` (satır 15–16)

```ts
typescript: { ignoreBuildErrors: true },
eslint:     { ignoreDuringBuilds: true },
```

**Risk:** TypeScript veya ESLint hataları build'i kesmediği için **güvenlik açığı oluşturan tip hataları bile sessizce production'a gidebilir**. Bu ayar yalnızca geçici bir geliştirme kolaylığı olarak kullanılmalıdır; production'da kesinlikle kapatılmalıdır.

**Öneri:** Her iki satırı `false` olarak güncelleyin ve ortaya çıkan hataları temizleyin.

---

### 2. CORS Politikası Tanımlı Değil

**Risk:** `next.config.ts` ve middleware'de hiçbir CORS kontrolü yapılmıyor. Next.js varsayılan olarak API'leri **aynı origin + `Access-Control-Allow-Origin: *`** ile açık bırakır. Hassas API endpointleriniz (`/api/scenarios/v3`, `/api/entities`, `/api/analyses`) herhangi bir origin'den çağrılabilir durumdadır.

**Öneri:** `next.config.ts` headers() konfigürasyonuna ortam bazlı `Access-Control-Allow-Origin` kısıtlaması ekleyin:

```ts
{ key: 'Access-Control-Allow-Origin', value: process.env.ALLOWED_ORIGIN ?? 'https://finrate.com.tr' }
```

---

### 3. CSP (Content Security Policy) Eksik

**Dosya:** `app/next.config.ts`

**Risk:** `X-Frame-Options: DENY` var, ancak modern ve kapsamlı bir CSP header'ı tanımlanmamış. CSP olmadan XSS saldırısı başarılı olursa saldırgan keyfi script çalıştırabilir.

**Mevcut durum:**
```ts
{ key: 'X-Frame-Options', value: 'DENY' },          // İyi — ama eski yöntem
// Content-Security-Policy → YOK
```

**Öneri:** `X-Frame-Options` yerine veya ek olarak modern bir CSP header'ı eklenmelidir:
```ts
{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';" }
```

---

### 4. Şifre Sıfırlama (Forgot Password) Akışı Yok

**Risk:** Kod tabanında `forgot-password` veya `reset-token` adında bir API endpoint **bulunmuyor**. `password-changed.ts` e-posta şablonunda "şifre sıfırlama isteyin" yazdığı halde bu akış implement edilmemiş. Kullanıcı şifresini unutursa sisteme erişim imkânı yok.

**Öneri:** `VerificationToken` modeli zaten mevcut ve 6 haneli kod mantığı çalışıyor. Aynı altyapı şifre sıfırlama için de kullanılabilir (`POST /api/auth/forgot-password` + `POST /api/auth/reset-password`).

---

### 5. Middleware Matcher'da Kapsam Boşlukları

**Dosya:** `app/src/middleware.ts` (satır 129–137)

```ts
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/giris',
    '/kayit',
    '/api/auth/login',
    '/api/entities/:path*/upload',
    '/api/scenarios/v3',       // ✅ var
    // '/api/scenarios'        → YOK (eski motor)
    // '/api/scenarios/v2'     → YOK
    // '/api/analyses/:path*'  → YOK
    // '/api/raporlar'         → YOK
    // '/api/subscription'     → YOK
  ],
}
```

**Risk:** Rate limit yalnızca eşleşen path'lere uygulanıyor. `/api/scenarios`, `/api/scenarios/v2`, `/api/analyses`, `/api/raporlar` gibi ağır endpoint'ler middleware'den **geçmiyor** bile. Bu endpoint'lerin auth kontrolü route.ts içinde yapılıyor (güvenli), ancak rate limit koruması **yok**.

**Öneri:** Matcher'a en azından şunlar eklenmelidir:
```ts
'/api/scenarios/:path*',
'/api/analyses/:path*',
'/api/raporlar',
'/api/subscription/:path*',
```

---

## 🟡 Orta Seviye Bulgular

### 6. JWT Token Süresi Uzun (7 Gün)

**Dosya:** `app/src/app/api/auth/login/route.ts` (satır 56) ve `app/src/lib/auth.ts` (satır 8)

```ts
maxAge: 60 * 60 * 24 * 7  // 7 gün
JWT_EXPIRES_IN = '7d'
```

**Risk:** Finansal veri içeren bir platform için 7 günlük token süresi uzundur. Token çalınırsa 7 gün boyunca kullanılabilir.

**Öneri:** Token süresini 1 güne (`1d`) indirip Refresh Token mekanizması eklenebilir. Veya minimum olarak kullanıcı son aktivitesini izleyerek 30 dakika hareketsizlikte oturumu sonlandıran bir sliding session eklenebilir.

---

### 7. `/api/health` Endpoint'i Auth'suz ve Açık

**Dosya:** `app/src/app/api/health/route.ts`

```ts
export async function GET() {
  return jsonUtf8({ status: 'ok', timestamp: Date.now() })
}
```

**Risk:** Düşük risk. Ancak bu endpoint sistem hakkında metadata sızdırıyor. Rate limit veya bot koruması yok; DDoS için kullanılabilir.

**Öneri:** Vercel'in altyapı health check'i için kullanılıyorsa mevcut haliyle kabul edilebilir. Ekstra bilgi eklenmemelidir (versiyon, ortam vb.).

---

### 8. `/api/template/excel` Auth'suz ve Açık

**Dosya:** `app/src/app/api/template/excel/route.ts`

**Risk:** Bu endpoint `getUserIdFromRequest` kullanmıyor. Herkese açık ve Excel dosyası indirtiyor. Mevcut haliyle zararsız (statik şablon). Ancak ileride dinamik veri eklenmesi durumunda açık kalırsa veri sızıntısı riski doğar.

**Öneri:** Şu an için düşük risk. Dikkat edin: bu endpoint'in içeriği hiçbir zaman kullanıcı verisine bağlanmamalıdır.

---

## 📋 Güvenlik Özet Tablosu

| Bulgu | Risk Seviyesi | Durum |
|---|---|---|
| `ignoreBuildErrors: true` | 🔴 Kritik | Açık |
| CORS politikası yok | 🔴 Kritik | Açık |
| CSP header eksik | 🔴 Kritik | Açık |
| Şifre sıfırlama yok | 🔴 Kritik | Açık |
| Middleware kapsam boşlukları | 🔴 Kritik | Açık |
| JWT süresi 7 gün | 🟡 Orta | Kabul edilebilir |
| `/api/health` açık | 🟡 Orta | Kabul edilebilir |
| `/api/template/excel` açık | 🟢 Düşük | Gözetim altında |
| HttpOnly Cookie | ✅ Doğru | — |
| bcrypt 12 round | ✅ Doğru | — |
| Token invalidation | ✅ Doğru | — |
| Rate limiting | ✅ Doğru | — |
