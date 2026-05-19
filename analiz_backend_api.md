# Finrate — Backend ve API Katmanı Analiz Raporu

Kaynak: `app/src/app/api/**`, `app/src/middleware.ts`, `app/src/lib/`

---

## 📑 API Endpoint Envanteri (43 Route)

| Endpoint | Method | Auth? | Açıklama |
|---|---|---|---|
| `POST /api/auth/login` | POST | ❌ Açık | Kullanıcı girişi, JWT cookie set eder |
| `POST /api/auth/register` | POST | ❌ Açık | Yeni kullanıcı kaydı + e-posta doğrulama |
| `POST /api/auth/logout` | POST | ❌ Açık | Cookie'yi temizler |
| `GET /api/auth/me` | GET | ✅ Auth | Oturum bilgisi (DB'li doğrulama) |
| `POST /api/auth/verify-email` | POST | ❌ Açık | E-posta 6 haneli kod doğrulama |
| `POST /api/auth/resend-code` | POST | ❌ Açık | Doğrulama kodu yeniden gönder |
| `GET /api/health` | GET | ❌ Açık | Sistem durum kontrolü |
| `GET /api/template/excel` | GET | ❌ Açık | Excel şablonu indirme |
| `GET/POST /api/entities` | GET, POST | ✅ Auth | Şirket listesi / oluşturma |
| `GET/PATCH/DELETE /api/entities/[id]` | — | ✅ Auth | Şirket detay / güncelleme / silme |
| `GET/POST /api/entities/[id]/financial-data` | — | ✅ Auth | Finansal veri yönetimi |
| `GET/PATCH/DELETE /api/entities/[id]/financial-data/[fdId]` | — | ✅ Auth | Finansal veri detay |
| `GET/POST/DELETE /api/entities/[id]/financial-data/[fdId]/adjustments` | — | ✅ Auth | Manuel düzeltmeler |
| `POST /api/entities/[id]/upload` | POST | ✅ Auth | Mizan / Excel yükleme |
| `GET/PATCH /api/entities/[id]/subjective` | — | ✅ Auth | Subjektif skor girişi |
| `GET/POST /api/groups` | — | ✅ Auth | Grup listesi / oluşturma |
| `GET/PATCH/DELETE /api/groups/[id]` | — | ✅ Auth | Grup detay yönetimi |
| `POST /api/groups/[id]/consolidate` | POST | ✅ Auth | Konsolidasyon hesabı |
| `GET/POST/DELETE /api/groups/[id]/elimination-entries` | — | ✅ Auth | Eliminasyon kayıtları |
| `GET/POST /api/groups/[id]/eliminations` | — | ✅ Auth | Eski eliminasyon (deprecated) |
| `GET/POST /api/groups/[id]/tenzilat` | — | ✅ Auth | Grup tenzilat girişleri |
| `GET/POST /api/analyses` | — | ✅ Auth | Analiz listesi / oluşturma |
| `GET/PATCH/DELETE /api/analyses/[id]` | — | ✅ Auth | Analiz detay yönetimi |
| `GET /api/analyses/[id]/pdf` | GET | ✅ Auth | PDF rapor üretimi (Puppeteer) |
| `GET /api/analyses/[id]/report` | GET | ✅ Auth | Rapor verisi |
| `GET /api/analyses/[id]/comparison-options` | GET | ✅ Auth | Karşılaştırma seçenekleri |
| `POST /api/analyses/recalculate` | POST | ✅ Auth | Analiz yeniden hesaplama |
| `POST /api/scenarios` | POST | ✅ Auth | V1 senaryo motoru (legacy) |
| `POST /api/scenarios/v2` | POST | ✅ Auth | V2 senaryo motoru |
| `POST /api/scenarios/v3` | POST | ✅ Auth | V3 senaryo motoru (aktif) |
| `GET /api/subjective` | GET | ✅ Auth | Subjektif skor bilgisi |
| `POST /api/subscription/cancel` | POST | ✅ Auth | Abonelik iptal / devam |
| `GET /api/raporlar` | GET | ✅ Auth | Raporlar listesi |
| `GET/PATCH /api/tenzilat` | — | ✅ Auth | Tenzilat girişleri |
| `PATCH /api/user/password` | PATCH | ✅ Auth | Şifre değiştirme |
| `GET/PATCH /api/user/profile` | — | ✅ Auth | Profil bilgisi |
| `POST /api/account/delete-request` | POST | ✅ Auth | Hesap silme talebi |
| `POST /api/account/delete-confirm` | POST | ✅ Auth | Hesap silme onayı |

---

## ✅ Doğru Yapılan Şeyler

- **Auth İzolasyonu**: Auth gerektiren tüm endpointlerde `getUserIdFromRequest(req)` kontrolü route seviyesinde yapılmaktadır.
- **Kullanıcı İzolasyonu**: Prisma sorgularında `userId` filtresi doğrudan `where` koşuluna ekleniyor. Başka kullanıcının verisine erişim mümkün değil.
- **Correlation ID**: Senaryo motoru hatalarında `crypto.randomUUID()` ile hata izleme ID'si üretiliyor. Log takibi kolaylaşıyor.
- **Fail-open Rate Limit**: Upstash erişilemezse rate limit pas geçiyor, sistem çökmüyor.
- **Graceful Degradation**: `roadmapSnapshot` kayıt hatası response'u durdurmaz; yalnızca loglanır.
- **Stack Trace Gizleme**: `process.env.NODE_ENV !== 'production'` koşuluyla stack trace sadece development'ta döndürülüyor.

---

## 🔴 Kritik Bulgular

### 1. Üç Paralel Senaryo Motoru Aynı Anda Aktif

**Endpoint'ler:** `/api/scenarios`, `/api/scenarios/v2`, `/api/scenarios/v3`

**Risk:** Hangi motor aktif kullanımda net değil. Frontend, tüm üç endpoint'e istek atıyor olabilir. V1 motoru (`/api/scenarios`) middleware matcher'da **yoktur**, yani rate limit koruması altında değildir. V2 motoru da matcher'da yok. Hangisi "resmi" motor olduğu belgesiz.

**Öneri:**
1. V3'ü resmi motor olarak belgeleyin
2. V1 ve V2 endpoint'lerini **deprecated** olarak işaretleyin veya kaldırın
3. En azından V1/V2 rate limit matcher'a eklenmelidir

---

### 2. `/api/scenarios` — Debug Çıktısı Production'da Açık

**Dosya:** `app/src/app/api/scenarios/route.ts` (satır 139–173)

```ts
const debug: Record<string, any> = {
  accountCount:      accountList.length,
  firstFiveAccounts: accountList.slice(0, 5)...
  testActions: []
}
// ...
return jsonUtf8({ scenarios, currentScore, currentGrade, sector, engine: 'account', debug })
```

**Risk:** `debug` objesi **her production response'una ekleniyor**. İlk 5 hesap kodu ve aksiyon sonuçları dış kullanıcılara görünür. Bu hem güvenlik hem de yanıt boyutu açısından sorunludur.

**Öneri:**
```ts
...(process.env.NODE_ENV !== 'production' ? { debug } : {})
```

---

### 3. Subscription API Tutarsızlığı (iyzico vs. PayTR?)

**Durum:** `prisma/schema.prisma` modelinde `iyzicoSubKey`, `iyzicoPaymentId` alanları var. Ancak uygulama içinde `iyzico` SDK veya entegrasyonu bulunmuyor. `subscription/cancel` endpoint'i yalnızca DB'deki `cancelAtPeriodEnd` flag'ini değiştiriyor. Gerçek ödeme sağlayıcı entegrasyonu yok.

**Risk:** Abonelik durumu yalnızca DB'deki bir boolean flag. Gerçek ödeme akışı (yeni abonelik başlatma, ödeme alma, webhook işleme) implement edilmemiş. Bu durum **sahte abonelik** riskini doğurur.

**Öneri:** Kullanılacak ödeme sağlayıcısı (iyzico mu, PayTR mı, Stripe mı) netleştirilmeli ve webhook entegrasyonu yapılmalıdır.

---

## 🟡 Orta Seviye Bulgular

### 4. Hata Yönetimi Tutarsız

**Durum:** Route'ların büyük çoğunluğu `try/catch` kullanıyor. Ancak bazı yerlerde catch bloğu boş veya yalnızca `console.error` içeriyor:

```ts
// scenarios/v3/route.ts — iyi örnek
catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'V3 senaryo hesaplanamadı'
  return NextResponse.json({ error: message, engine: 'v3' }, { status: 500 })
}

// Bazı route'larda — kötü örnek
catch {
  return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
}
```

**Risk:** Boş catch blokları hata detayını yuttuğundan debug zorlaşıyor. Hata türü (`ValidationError`, `DatabaseError`) client'a bildirilmiyor.

**Öneri:** Standart bir `ApiError` sınıfı oluşturun ve tüm route'larda tutarlı hata formatı kullanın.

---

### 5. `console.log` Kullanımı — 26 Adet API Route'unda

**Risk:** 26 adet `console.log` / `console.error` tespiti yapıldı. Bunlar Vercel'in function loglarına yazılıyor, ancak yapılandırılmış (structured) logging yok. Finansal veriler veya kullanıcı ID'leri log'a yazılıyor olabilir.

**Öneri:** `src/lib/logger.ts` dosyası mevcut. Tüm `console.log` çağrıları bu logger üzerinden yapılmalıdır. Log seviyesi (info/warn/error) standardize edilmelidir.

---

### 6. Ağır Endpoint'lerde Timeout Riski

**Durum:** V3 senaryo motoru 3 planı `Promise.all` ile **paralel** hesaplıyor:

```ts
const [conservative, typical, aggressive] = await Promise.all([
  selectScenarioEngineWithScenarios({ aggressiveness: 'conservative' }),
  selectScenarioEngineWithScenarios({ aggressiveness: 'typical'      }),
  selectScenarioEngineWithScenarios({ aggressiveness: 'aggressive'   }),
])
```

**Risk:** Vercel Hobby plan için fonksiyon timeout 10 saniye, Pro için 60 saniyedir. Karmaşık veri setlerinde 3 paralel motor hesabı + DB sorguları bu limiti aşabilir.

**Öneri:** Yanıt sürelerini Vercel Analytics üzerinden izleyin. Gerekirse `typical` planı önce, diğer planları lazy/arka planda hesaplamaya geçilebilir.

---

### 7. `findMany` ile `include` — N+1 Riski

**Dosya:** `/api/scenarios/route.ts` (satır 241–243)

```ts
const allAnalyses = await prisma.analysis.findMany({
  where:   { entityId: { in: entityIds } },
  include: { financialData: true },
})
```

**Risk:** Bu sorguda `entityIds` sayısı arttıkça `IN` listesi büyüyor. Ayrıca her analysis için `financialData` include ediliyor. Büyük gruplarda bu sorgu ağır olabilir.

**Öneri:** `select` ile yalnızca gerekli alanlar alınmalıdır. Alternatif olarak `entityId, year, period` üzerinde toplu sorgu yapılabilir.

---

## 📋 Backend API Özet Tablosu

| Kategori | Bulgu | Seviye |
|---|---|---|
| 3 paralel senaryo motoru aktif | V1/V2 kaldırılmalı veya deprecated edilmeli | 🔴 Kritik |
| Debug çıktısı production'da açık | `debug` objesi response'dan çıkarılmalı | 🔴 Kritik |
| Subscription ödeme entegrasyonu yok | Gerçek webhook/ödeme akışı eksik | 🔴 Kritik |
| Tutarsız hata yönetimi | Standart `ApiError` sınıfı gerekli | 🟡 Orta |
| `console.log` 26 adet | Yapılandırılmış logging gerekli | 🟡 Orta |
| Senaryo motoru timeout riski | Vercel sınırlarını izleyin | 🟡 Orta |
| `findMany` N+1 riski | `select` ile optimize edin | 🟡 Orta |
| Kullanıcı izolasyonu | ✅ Doğru uygulanmış | — |
| Auth kontrolü | ✅ Her route'da mevcut | — |
| Correlation ID | ✅ Hata takibi için uygulanmış | — |
