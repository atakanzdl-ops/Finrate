# Düzeltme Kuyruğu — Tüm Fazlar

**Tarih:** 2026-04-26
**Bağlam:** Multi-senaryo motoru fazları boyunca keşfedilen, ilgili fazda hemen çözülmemiş olup ileride düzeltilecek yapısal sorunların kayıt altına alındığı dosya. Her bulgu: keşfedildiği faz, düzeltme fazı, risk seviyesi ile etiketlidir.

Bu dosya kalıcı bir TODO listesidir. Her bulgu için: ne olduğu, neden önemli olduğu, hangi fazda düzeltileceği belirtilmiştir.

---

## 1. Rating Eşik Uyumsuzluğu

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**Sorun:** İki ayrı dosyada farklı rating bandları tanımlı:

- `src/lib/scoring/score.ts` → `RATING_BANDS`: AAA ≥ 93, AA ≥ 84, A ≥ 76
- `src/app/api/.../route.ts` → `scoreToRatingGrade`: AAA ≥ 95, AA ≥ 86, A ≥ 76

**Risk:** Aynı skor, çağrıldığı yere göre farklı rating üretebilir. UI ile API tutarsız sonuç gösterebilir.

**Çözüm:** Tek source of truth — `score.ts` RATING_BANDS sabiti. `route.ts` bunu import etmeli, kendi kopyasını silmeli.

**Düzeltme fazı:** Faz 6 (API endpoint)

---

## 2. `analysisRecord.finalScore` İsimlendirme Tuzağı

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**⚠️ KISMEN ÇÖZÜLDÜ:** Faz 2 (commit `12c571f`) — `analysisRecord.finalScore` üstüne JSDoc uyarı yorumu eklendi. Tam rename Faz 6'da yapılacak.

**Sorun:** `analysisRecord.finalScore` aslında **objektif skor** (sadece finansal rasyolardan, 0-100). "final" kelimesi yanıltıcı — bu skor subjektif değerlendirme ile birleştirilmemiş.

**Risk:** Yeni geliştirici "final = combined" sanıp subjektif katmanı atlayabilir. DEKAM örneğinde objektif 17, kombine 34.9 — fark büyük.

**Çözüm:** En azından her kullanım yerine yorum satırı, ideal olarak `objectiveScore` alias'ı eklenip aşamalı geçiş.

**Düzeltme fazı:** Faz 2 (yorum) + Faz 6 (tam rename)

---

## 3. `ScenarioV3.finalScore` İsim Çakışması

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**✅ ÇÖZÜLDÜ:** Faz 2 (commit `12c571f`) — `DecisionTraceNode.finalScore` → `optimizerScore` rename tamamlandı.

**Sorun:** İki ayrı yerde `finalScore` alanı, iki farklı anlamda:

- `DecisionTraceNode.finalScore` → optimizer skoru (0-1 arası, karar ağacı puanı)
- `analysisRecord.finalScore` → finansal objektif skor (0-100)

**Risk:** Multi-senaryo motorunda biri diğeriyle karıştırılırsa skorlama tamamen bozulur. Tip sistemi ikisini de `number` gördüğü için TypeScript yakalayamaz.

**Çözüm:** `DecisionTraceNode.finalScore` → `optimizerScore` olarak yeniden adlandır. `analysisRecord.finalScore` → `objectiveScore` (Bulgu #2 ile birlikte).

**Düzeltme fazı:** Faz 2 (scoreAttribution katmanı)

---

## 4. `subjectiveTotal` DB'de Yok

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**Sorun:** Subjektif değerlendirme toplamı (0-30) sadece UI'da client-side hesaplanıyor. Veritabanında ne breakdown ne total kalıcı tutuluyor.

**Risk:** Multi-senaryo motoru "subjektif sabit" varsayar ama bu varsayımı doğrulayacak DB kaydı yok. Mali müşavir subjektifi değiştirirse senaryolar geçmiş veriyle uyumsuz olur.

**Çözüm:** Migration —
- `subjective_breakdown JSONB` kolonu (4 bileşenin detayı)
- `subjective_total` derived/generated column

**Düzeltme fazı:** Faz 6 (API + DB migration)

---

## 5. `combineScores()` Ceiling/Floor Mantığı

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**Sorun:** Kombine skor basit ağırlıklı toplam DEĞİL. Ceiling (subjektif düşükse objektifi tavanla) ve floor (subjektif yüksekse objektifi tabanla) mantığı var.

**Örnek (DEKAM):**
- Objektif: 17, Subjektif: 23/30
- Ham birleşik: 17 × 0.70 + 23 = 34.9
- Ceiling/floor sonrası: ~43-52 aralığı → rating "C"

**Risk:** Multi-senaryo motorunda kategori delta'sını hesaplarken `combineScores()` SİMÜLE EDİLİRSE (örn. basit ağırlıklı toplam tahmini), DEKAM "C" yerine yanlış rating gösterir, motor yanlış senaryo önerir.

**Çözüm:** Multi-senaryo'nun her aşamasında **gerçek `combineScores()` çağrılacak**, mock/tahmin yapılmayacak. Hibrit yaklaşım reddedildi.

**Düzeltme fazı:** Faz 2-5 (motor inşası boyunca disiplin olarak)

---

## 6. Sektör-Aksiyon Uyumluluğu Yok

**Keşfedildiği Faz:** Faz 2 (commit `12c571f`)

**Sorun:** Bazı aksiyonlar belirli sektörler için anlamsız ama motor bunu kontrol etmiyor. Örnek: DEKAM (inşaat) için A06 (stok devir hızı iyileştirme) uygulandığında `categoryDelta.activity = 0` çıkıyor.

**Sebep:** İnşaat sektöründe DIO (gün cinsinden stok) ortalama 2420 gün (~6.6 yıl) — çünkü stok = devam eden inşaat projeleri (work-in-progress). Skor sisteminin `badHigh = 180 gün` eşiği bu sektör için absürt. A06 aksiyonu DIO'yu 1815 güne indirse bile hala badHigh'ı çok aşıyor → skor tabanı 0 → delta 0.

**Risk:** Multi-senaryo motoru DEKAM'a A06 önerip "0 puan etkisi" gösterirse, mali müşavir motorun güvenilirliğini sorgular. "Neden bu aksiyonu öneriyor ama hiç işe yaramıyor?" sorusuna cevabımız olmaz.

**Çözüm:** İki katmanlı:
1. **Sektör-aksiyon uyumluluk matrisi:** İnşaat → A06 önerilmemeli (work-in-progress mantığı). Her aksiyon için "uygulanabilir sektörler" listesi.
2. **Sektörel eşik tablosu:** `badHigh = 180 gün` evrensel değil. İnşaat için DIO eşiği TCMB sektör verisine göre yeniden hesaplanmalı (muhtemelen 1500-2500 gün aralığı).

**Düzeltme fazı:** Faz 5 (multi-scenario generator) — motor önerirken filtreleme yapacak.

---

## 7. `combineScores` Yanlış Dosyada

**Keşfedildiği Faz:** Faz 2 (commit `12c571f`)

**Sorun:** `combineScores()` fonksiyonu `src/lib/scoring/subjective.ts` içinde tanımlı. Mantıksal olarak `score.ts`'e ait — çünkü objektif + subjektif birleştirme işi yapıyor, sadece subjektif hesaplaması değil.

**Risk:** Düşük (sadece kod hijyeni), ama yeni geliştirici "combineScores nerede?" sorusuyla aramaya başlar, mantıksal yerinde bulamaz.

**Çözüm:** `combineScores` `score.ts`'e taşınmalı. `subjective.ts` sadece subjektif breakdown hesaplaması yapmalı. Import'lar güncellenmeli.

**Düzeltme fazı:** Faz 6 (API endpoint düzenlemeleri sırasında dosya organizasyonu)

---

## 8. Entity Validation Katmanı Yok

**Keşfedildiği Faz:** Faz 2 (commit `12c571f`)

**Sorun:** Aksiyonlar bazı opsiyonel alanlara bağımlı ama bu bağımlılık explicit değil. Örnek: A10 (kısa→uzun vadeli borç çevirme) `totalCurrentLiabilities` alanına ihtiyaç duyuyor. Bu alan opsiyonel; doluysa A10 likidite kategorisini etkiliyor, boşsa sadece kaldıraç etkileniyor.

**Risk:** Aynı aksiyon farklı entity'lerde farklı kategori etkisi gösterir. Tutarsız UX. Mali müşavir "neden A10 bazı şirketlerde likidite arttırıyor bazılarında arttırmıyor?" sorusuna cevap bulamaz.

**Çözüm:** Entity validation katmanı:
- Her aksiyon için "minimum gerekli alanlar" tanımı (ActionRequirements interface)
- Entity yüklenirken eksik alanlar tespit edilir
- UI'da: eksik alan varsa aksiyon "uygulanamaz" işaretiyle gösterilir, neden açıklanır
- Motor önerme aşamasında: eksik alanı olan aksiyonları otomatik filtreler

**Düzeltme fazı:** Faz 4 (sectorStrategyProfiles.ts ile birlikte — sektör-aksiyon-validation hepsi tek katman olabilir)

---

## Bulgu Özeti Tablosu (Tüm Fazlar)

| # | Bulgu | Keşfedildiği Faz | Düzeltme Fazı | Durum | Risk |
|---|-------|------------------|---------------|-------|------|
| 1 | Rating eşik uyumsuzluğu | Faz 1 | Faz 6 | ⏳ Açık | Orta |
| 2 | `finalScore` isim tuzağı | Faz 1 | Faz 2 (yorum) + Faz 6 (rename) | ⚠️ Kısmen | Yüksek |
| 3 | `ScenarioV3.finalScore` çakışması | Faz 1 | Faz 2 | ✅ Çözüldü | Yüksek |
| 4 | `subjectiveTotal` DB'de yok | Faz 1 | Faz 6 | ⏳ Açık | Orta |
| 5 | `combineScores()` ceiling/floor disiplini | Faz 1 | Faz 2-5 (canlı) | 🔄 Sürekli | Yüksek |
| 6 | Sektör-aksiyon uyumluluğu yok | Faz 2 | Faz 5 | ⏳ Açık | Yüksek |
| 7 | `combineScores` yanlış dosyada | Faz 2 | Faz 6 | ⏳ Açık | Düşük |
| 8 | Entity validation katmanı yok | Faz 2 | Faz 4 | ⏳ Açık | Orta |

---

## Notlar

- Bu dosya Faz 8 (production hazırlık) tamamlanana kadar canlı tutulacak.
- Her bulgu çözüldüğünde ilgili commit hash'i ve faz numarası bulgu başına eklenir (✅ ÇÖZÜLDÜ etiketi).
- Yeni bulgu çıkarsa numaralandırarak eklenir, özet tablosu güncellenir.
- Her faz başlangıcında bu dosya gözden geçirilir, ilgili bulgular o fazda çözülecekse plana dahil edilir.
