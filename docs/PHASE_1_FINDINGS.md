# Faz 1 Kritik Bulguları — Düzeltme Kuyruğu

**Tarih:** 2026-04-26
**Bağlam:** Multi-senaryo Faz 1 (commit `e8d351a`) sırasında skor kontratı netleştirilirken ortaya çıkan, sonraki fazlarda düzeltilmesi gereken yapısal sorunlar.

Bu dosya kalıcı bir TODO listesidir. Her bulgu için: ne olduğu, neden önemli olduğu, hangi fazda düzeltileceği belirtilmiştir.

---

## 1. Rating Eşik Uyumsuzluğu

**Sorun:** İki ayrı dosyada farklı rating bandları tanımlı:

- `src/lib/scoring/score.ts` → `RATING_BANDS`: AAA ≥ 93, AA ≥ 84, A ≥ 76
- `src/app/api/.../route.ts` → `scoreToRatingGrade`: AAA ≥ 95, AA ≥ 86, A ≥ 76

**Risk:** Aynı skor, çağrıldığı yere göre farklı rating üretebilir. UI ile API tutarsız sonuç gösterebilir.

**Çözüm:** Tek source of truth — `score.ts` RATING_BANDS sabiti. `route.ts` bunu import etmeli, kendi kopyasını silmeli.

**Düzeltme fazı:** Faz 6 (API endpoint)

---

## 2. `analysisRecord.finalScore` İsimlendirme Tuzağı

**Sorun:** `analysisRecord.finalScore` aslında **objektif skor** (sadece finansal rasyolardan, 0-100). "final" kelimesi yanıltıcı — bu skor subjektif değerlendirme ile birleştirilmemiş.

**Risk:** Yeni geliştirici "final = combined" sanıp subjektif katmanı atlayabilir. DEKAM örneğinde objektif 17, kombine 34.9 — fark büyük.

**Çözüm:** En azından her kullanım yerine yorum satırı, ideal olarak `objectiveScore` alias'ı eklenip aşamalı geçiş.

**Düzeltme fazı:** Faz 2 (scoreAttribution katmanı kurulurken)

---

## 3. `ScenarioV3.finalScore` İsim Çakışması

**Sorun:** İki ayrı yerde `finalScore` alanı, iki farklı anlamda:

- `DecisionTraceNode.finalScore` → optimizer skoru (0-1 arası, karar ağacı puanı)
- `analysisRecord.finalScore` → finansal objektif skor (0-100)

**Risk:** Multi-senaryo motorunda biri diğeriyle karıştırılırsa skorlama tamamen bozulur. Tip sistemi ikisini de `number` gördüğü için TypeScript yakalayamaz.

**Çözüm:** `DecisionTraceNode.finalScore` → `optimizerScore` olarak yeniden adlandır. `analysisRecord.finalScore` → `objectiveScore` (Bulgu #2 ile birlikte).

**Düzeltme fazı:** Faz 2 (scoreAttribution katmanı)

---

## 4. `subjectiveTotal` DB'de Yok

**Sorun:** Subjektif değerlendirme toplamı (0-30) sadece UI'da client-side hesaplanıyor. Veritabanında ne breakdown ne total kalıcı tutuluyor.

**Risk:** Multi-senaryo motoru "subjektif sabit" varsayar ama bu varsayımı doğrulayacak DB kaydı yok. Mali müşavir subjektifi değiştirirse senaryolar geçmiş veriyle uyumsuz olur.

**Çözüm:** Migration —
- `subjective_breakdown JSONB` kolonu (4 bileşenin detayı)
- `subjective_total` derived/generated column

**Düzeltme fazı:** Faz 6 (API + DB migration)

---

## 5. `combineScores()` Ceiling/Floor Mantığı

**Sorun:** Kombine skor basit ağırlıklı toplam DEĞİL. Ceiling (subjektif düşükse objektifi tavanla) ve floor (subjektif yüksekse objektifi tabanla) mantığı var.

**Örnek (DEKAM):**
- Objektif: 17, Subjektif: 23/30
- Ham birleşik: 17 × 0.70 + 23 = 34.9
- Ceiling/floor sonrası: ~43-52 aralığı → rating "C"

**Risk:** Multi-senaryo motorunda kategori delta'sını hesaplarken `combineScores()` SİMÜLE EDİLİRSE (örn. basit ağırlıklı toplam tahmini), DEKAM "C" yerine yanlış rating gösterir, motor yanlış senaryo önerir.

**Çözüm:** Multi-senaryo'nun her aşamasında **gerçek `combineScores()` çağrılacak**, mock/tahmin yapılmayacak. Hibrit yaklaşım reddedildi.

**Düzeltme fazı:** Faz 2-5 (motor inşası boyunca disiplin olarak)

---

## Bulgu Özeti Tablosu

| # | Bulgu | Düzeltme Fazı | Risk Seviyesi |
|---|-------|---------------|---------------|
| 1 | Rating eşik uyumsuzluğu | Faz 6 | Orta |
| 2 | `finalScore` isim tuzağı (objektif vs kombine) | Faz 2 | Yüksek |
| 3 | `ScenarioV3.finalScore` çakışması | Faz 2 | Yüksek |
| 4 | `subjectiveTotal` DB'de yok | Faz 6 | Orta |
| 5 | `combineScores()` ceiling/floor disiplini | Faz 2-5 | Yüksek |

---

## Notlar

- Bu dosya Faz 8 (production hazırlık) tamamlanana kadar canlı tutulacak.
- Her bulgu çözüldüğünde ilgili commit hash'i altına eklenecek (örn. "Çözüldü: commit `abc1234`").
- Yeni bulgu çıkarsa bu dosyaya eklenir.
