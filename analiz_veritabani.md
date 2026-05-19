# Finrate — Veritabanı Analiz Raporu

Kaynak: `app/prisma/schema.prisma`, `app/prisma/migrations/`, `app/src/lib/db.ts`

---

## 🗄️ Veritabanı Altyapısı

| Özellik | Değer |
|---|---|
| **Veritabanı** | PostgreSQL (NeonDB — serverless Postgres) |
| **ORM** | Prisma v7.6 |
| **Adaptör** | `@prisma/adapter-pg` (Pg Pool bağlantısı) |
| **Bağlantı** | `Pool` (connection pool) — serverless için doğru seçim |
| **Migration Sayısı** | 10 |
| **Model Sayısı** | 15 |

---

## ✅ Doğru Yapılan Şeyler

- **Connection Pool**: `PrismaPg(pool)` kullanımı NeonDB serverless yapısı ile uyumlu. Cold start'lar için bağlantı havuzu verimli çalışır.
- **Singleton Pattern**: `globalForPrisma` ile development ortamında tek bir Prisma instance tutulmaktadır; hot reload'da bağlantı patlaması önlenmiştir.
- **Unique Kısıtlamalar**: Kritik entity'lerde `@@unique` kısıtları var (`FinancialData: [entityId, year, period]`, `Analysis: [entityId, year, period]`).
- **Düzenli Migration Süreci**: 10 migration dosyası mevcut ve tarihli. Migration geçmişi temiz ve sıralı.
- **`updatedAt` Takibi**: Tüm kritik modellerde `@updatedAt` otomatik güncelleniyor.

---

## 🔴 Kritik Bulgular

### 1. `GroupElimination` — Deprecated Model Kaldırılmadı

**Dosya:** `app/prisma/schema.prisma` (satır 126–140)

```prisma
// GroupElimination (üstteki) soft-deprecated — Faz 7.4.1-E'de migrate edilecek
model GroupElimination {
  id                  String @id @default(cuid())
  groupId             String @unique
  // ...
}
```

**Risk:** Hem eski `GroupElimination` hem de yeni `GroupEliminationEntry` modeli aktif. `scenarios/route.ts` içinde ikisi birlikte kullanılıyor:

```ts
// Yeni tabloya öncelik, yoksa eski singleton fallback
const hasNewElim = Object.values(newElim).some(v => v > 0)
const e = hasNewElim ? newElim : (group.groupElimination ?? _zeros)
```

**Risk:** Çift kaynak tutmak veri tutarsızlığına yol açabilir. `GROUP_ELIMINATION` tablosundaki eski veriler güncel olmayabilir, ancak yeni tabloda da veri yoksa fallback olarak kullanılıyor.

**Öneri:** Faz 7.4.1-E migration'ını tamamlayın, eski `GroupElimination` modelini ve tablosunu kaldırın.

---

### 2. Migration'larda `migrate deploy` Production Riski

**Dosya:** `app/package.json`

```json
"build": "prisma migrate deploy && prisma generate && next build"
```

**Risk:** `prisma migrate deploy`, production ortamında her build tetiklendiğinde **otomatik çalıştırılıyor**. Yanlış bir migration varsa:
- Tablolar bozulabilir
- Downtime oluşabilir
- Geri alınamaz veri kaybı yaşanabilir

**Öneri:**
1. Migration deploy'unu build sürecinden **ayırın**
2. Ayrı bir `migrate:prod` script'i oluşturun ve CI/CD'de kontrollü çalıştırın
3. Her migration öncesi NeonDB'nin otomatik snapshot özelliğini aktif edin

---

### 3. JSON Kolonlar — Sorgulanamaz Veri

**Dosya:** `app/prisma/schema.prisma` (satır 318–321)

```prisma
model Analysis {
  ratios              String?  // JSON string
  consolidatedFinancials String? // JSON string
  optimizerSnapshot   String?  // JSON string (legacy)
  roadmapSnapshot     String?  // V3 roadmap JSON
}
```

**Risk:**
- Bu alanlar `String` tipi — Prisma veya PostgreSQL bunları **index'leyip filtreleyemez**
- `ratios` alanının içine `__financialScore`, `__subjectiveTotal` gibi iç veriler de yazılıyor
- `roadmapSnapshot` bazen 50–100KB'a ulaşabilen büyük bir JSON olabilir

**Mevcut Kötü Pratik:**
```ts
// scenarios/v3/route.ts
const rawRatiosJson = (analysis as any).ratios as string | null
const parsed = JSON.parse(rawRatiosJson) as Record<string, unknown>
if (typeof parsed.__subjectiveTotal === 'number') { ... }
```

**Öneri:**
- `ratios` → Prisma'nın `Json` tipiyle tanımlanmalı (PostgreSQL JSONB)
- `roadmapSnapshot` → Boyut artarsa ayrı bir `RoadmapSnapshot` tablosuna taşınabilir
- `optimizerSnapshot` → Legacy olarak işaretlenmiş, kaldırılabilir

---

## 🟡 Orta Seviye Bulgular

### 4. Cascade Silme Zinciri — Derinlik Riski

**Mevcut Cascade Zinciri:**

```
User (silinirse)
  → Subscription (Cascade)
  → Entity (Cascade)
      → FinancialData (Cascade)
          → ManualAdjustment (Cascade)
          → FinancialDataUpload (Cascade)
      → Analysis (Cascade)
          → FinancialAccount (Cascade)
          → TenzilatEntry
      → SubjectiveInput (Cascade)
  → Group (Cascade)
      → GroupEliminationEntry (Cascade)
  → TenzilatEntry
  → VerificationToken (Cascade)
  → AccountDeletionToken (Cascade)
```

**Risk:** Tek bir `User` silme işlemi, yukarıdaki tüm zinciri tetikler. Özellikle `Entity → Analysis → FinancialAccount` zinciri çok sayıda satır içerebilir. Bu durum:
- Uzun süren bir silme işlemi → DB lock
- Geri alınamaz veri kaybı

**Not:** `Analysis` üzerindeki `entity`→`user` Cascade ilişkisi `20260513000000_analysis_user_cascade` migration'ıyla eklenmiş.

**Öneri:**
- Kullanıcı silme işlemini soft-delete ile yapın (`isActive: false`)
- Hard delete yerine bir `deactivation` akışı oluşturun
- `AccountDeletionToken` akışı (confirm ile) mevcut — doğru tasarım, ancak gerçek silme yerine soft-delete ile sonlandırılabilir

---

### 5. `IcTransaction` ve `EliminationLog` — Atıl Tablolar

**Durum:** Bu iki model schema'da tanımlı, DB'de tablo oluşturulmuş, ancak `app/src` içinde **hiçbir kod bu tablolara yazmıyor veya okumuyor**.

**Risk:** Boş tablolar yer kaplamaz ancak karmaşıklık yaratır. Gelecekte başka bir geliştirici bu tabloları kullanmaya çalışabilir ve tutarsız veri yazabilir.

**Öneri:** Bu iki modeli schema'dan kaldırın ve tabloları drop eden bir migration yazın. `olu_kod.md` dosyasında zaten belirtilmiştir.

---

### 6. Index Stratejisi — Genel Olarak İyi, Bazı Boşluklar Var

**Mevcut Index'ler:**

```
Group:        [userId, createdAt]
GroupEliminationEntry: [groupId, year, period]
FinancialDataUpload:   [entityId, year, period], [financialDataId, createdAt]
Analysis:     [userId], [entityId], [userId, mode, reportedAt]
TenzilatEntry: [groupId, year, period, isActive], [userId, deletedAt, createdAt]
VerificationToken: [userId], [expiresAt]
AccountDeletionToken: [expiresAt]
FinancialAccount: [analysisId], [accountCode]
```

**Eksik / İyileştirilebilir:**

| Tablo | Eksik Index | Kullanım Sebebi |
|---|---|---|
| `Entity` | `[userId, isActive]` | Aktif şirket listeleme sorgularında sık kullanılıyor |
| `Analysis` | `[entityId, year, period]` | `@@unique` var ama `@@index` yok — unique key zaten index oluşturur, tamam |
| `Subscription` | `[status, currentPeriodEnd]` | Süresi dolan abonelik tarama sorgularında gerekli olabilir |
| `FinancialData` | `[entityId, year, period]` | `@@unique` var — yeterli |

---

### 7. `FinancialDataUpload` — Atıl Tablo

**Durum:** Schema'da ve migration'larda var, ancak `app/src` içinde hiçbir API bu tabloya yazma veya okuma yapmıyor. Upload sonuçlarını saklamak için tasarlanmış ancak kullanılmıyor.

**Öneri:** Kullanılacaksa upload metadata'sını buraya kaydetmek için upload API'si güncellenmeli; kullanılmayacaksa kaldırılmalıdır (`olu_kod.md`'de listelenmiştir).

---

### 8. `FinancialData` — Geniş Flat Tablo (60+ Kolon)

**Durum:** `FinancialData` modeli 60'tan fazla nullable `Float?` kolona sahiptir. Tüm mali tablo alanları tek bir tabloda düz (flat) olarak saklanmaktadır.

**Risk:**
- Tabloya yeni hesap alanı eklemek migration gerektiriyor
- PostgreSQL geniş tablolarda `TOAST` mekanizması devreye girebilir
- Sorgu planlaması verimsizleşebilir

**Öneri (Uzun Vadeli):** TDHP hesap kodu bazlı `FinancialAccount` tablosuna (zaten mevcut!) tam geçiş yapıldığında `FinancialData` tablosunun alan sayısı azaltılabilir. V3 motoru zaten `FinancialAccount` kullanıyor; `FinancialData` V2 motoru legacy'si.

---

## 📋 Veritabanı Özet Tablosu

| Model / Konu | Durum | Seviye |
|---|---|---|
| `GroupElimination` deprecated, ikili kaynak | Kaldırılmalı | 🔴 Kritik |
| `migrate deploy` otomatik build'de | CI/CD'den ayrılmalı | 🔴 Kritik |
| JSON String kolonlar | JSONB tipine geçilmeli | 🔴 Kritik |
| Cascade silme derinliği | Soft-delete önerilir | 🟡 Orta |
| `IcTransaction`, `EliminationLog` atıl | Kaldırılmalı | 🟡 Orta |
| `FinancialDataUpload` atıl | Kullan veya kaldır | 🟡 Orta |
| `Entity[userId, isActive]` index eksik | Eklenebilir | 🟡 Orta |
| `FinancialData` flat geniş tablo | Uzun vadede `FinancialAccount`'a geçiş | 🟢 Düşük |
| Connection Pool | ✅ Doğru (PrismaPg + Pool) | — |
| Singleton Pattern | ✅ Doğru | — |
| Migration Süreci | ✅ Düzenli, 10 migration | — |
| Unique Kısıtlamalar | ✅ Kritik noktalarda mevcut | — |
