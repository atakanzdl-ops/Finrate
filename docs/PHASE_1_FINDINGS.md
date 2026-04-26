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

**Düzeltme fazı:** Faz 4b ⚠️ KISMEN ÇÖZÜLDÜ (commit `170014f`)
- Eligibility tarafı (allow/discourage/block) tam çözüldü
- Sektörel threshold tarafı kısmen — DEKAM A06 örüntüsü hâlâ açık
- DEKAM DIO 2420→1815 her ikisi de bad=700 üstünde kalıyor → activity delta 0
- Codex audit notu: Bu skor sisteminin gerçek bir hatası değil, model semantiği limiti
- Faz 5'te selection/ranking kalibrasyonu olarak ele alınacak (score.ts revizyonu değil)

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

**Düzeltme fazı:** Faz 5.0 ✅ ÇÖZÜLDÜ (commit `32e0790`) — minimum guardrail uygulandı: hard fail (sector, revenue, totalAssets) + aksiyon-spesifik skip kararları (A05/A06/A10/A12/A18). 40 test, 291 toplam test geçti.

---

## 9. Profil Kategorisi vs Gerçek Skor Etkisi Tutarsızlığı

**Keşfedildiği Faz:** Faz 3 (commit `5ff07c8`)

**Sorun:** Faz 3'te 5 pilot aksiyondan 3'ünde profil zirvesi ile gerçek skor etkisi tutarsız çıktı. Aksiyonun "mali müşavir zihnindeki kategorisi" ile "skor sisteminde gerçekten en çok etkilediği kategori" farklı.

**Somut veriler (Faz 2 snapshot'larından):**

| Aksiyon | Mali müşavir kategorisi | Skor zirvesi (DEKAM) | Skor zirvesi (Trade) |
|---------|------------------------|----------------------|----------------------|
| A05 (alacak tahsilatı) | Faaliyet | likidite (+1.70) | likidite (+2.30) |
| A06 (stok devir) | Faaliyet | likidite (+15.77) | likidite (+7.33) |
| A12 (sermaye artırımı) | Kaldıraç | likidite (+6.33) | likidite (+9.99) |

**Sebep:** Bir aksiyon rasyoyu değiştirince (örn. AR azalır) Cari Oran payı doğrudan etkileniyor → likidite skoru zirveye çıkıyor. DSO/DIO iyileşmesi faaliyeti etkiliyor ama eşik mantığı (Bulgu #5 akrabası) tam puana çevirmiyor.

**Risk:** Faz 5 motoru `rankActionsForCategoryGap("activity")` çağırdığında mali müşavirin "faaliyet açığım var" sorusuna A05/A06 önerecek. Mali müşavir uygulayıp "faaliyet az arttı, likidite çok arttı, neden?" sorduğunda cevap belirsiz.

**Mevcut durum:** Faz 3'te ampirik yaklaşım benimsendi — profil gerçek skor zirvesine göre yazıldı. Bu Faz 5 başlangıcında yeniden değerlendirilecek.

**Düzeltme fazı:** Faz 5.0 ✅ KARAR VERİLDİ — Yaklaşım 3 (İki katmanlı profil) — narrative-first candidate selection + attribution rerank. Detay: docs/PHASE_5_DECISIONS.md (Karar #1). İmplementasyon Faz 5.1.

**Risk seviyesi:** Yüksek

---

## 10. CCC Likidite Kategorisinde, DSO/DIO Etkisi Otomatik Likiditeye Sızıyor

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit (commit `5ff07c8` üzerine değerlendirme)

**Sorun:** Cash Conversion Cycle (CCC) skor sisteminde **likidite kategorisinde** tanımlı (`src/lib/scoring/score.ts:285`). DSO ve DIO bu döngünün parçası olduğu için, faaliyet rasyolarındaki iyileşme otomatik olarak likidite skorunu da etkiliyor.

**Sonuç:** A05 (DSO iyileştirme) ve A06 (DIO iyileştirme) gibi "faaliyet aksiyonları" likidite kategorisinde de güçlü puan üretiyor. Bu bilinçli bir mimari karar mı yoksa eski bir tasarım kalıntısı mı belirsiz.

**Risk:** Bulgu #9'un (profil tutarsızlığı) doğrudan kök nedenlerinden biri. CCC bağlantısı kalırken Yaklaşım 3 (iki katmanlı profil) ile semptom yönetilebilir, ama yapısal çözüm CCC'nin kategori atamasının yeniden değerlendirilmesini gerektirir.

**Çözüm seçenekleri:**
1. CCC'yi sadece faaliyet kategorisinde tut (likidite skorundan çıkar)
2. CCC'yi her iki kategoriye dağıt (weighted attribution)
3. Mevcut tasarımı koru, Yaklaşım 3 ile UI katmanında açıkla

**Düzeltme fazı:** Faz 6+ (skor sistemi revizyonu, shadow run gerekli)

**Risk seviyesi:** Yüksek

---

## 11. DIO/DSO Eşikleri Global, Sektörel Değil

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** DIO ve DSO için "kötü eşik" değerleri global tanımlı (`src/lib/scoring/score.ts:420` ve `:426`) — DIO badHigh=180, DSO badHigh=120. Sektörel eşik sistemi sadece DPO ve OPEX tarafında mevcut (`src/lib/scoring/benchmarks.ts:540`).

**Sonuç:** İnşaat sektöründe DIO ortalama 2400+ gün (work-in-progress mantığı), bu eşiğin çok üstünde. Sonuç: DEKAM gibi inşaat firmalarında stok aksiyonları (A06) skor üretemiyor (skor tabanı 0).

**Risk:** Bulgu #6 (sektör-aksiyon uyumluluğu) ile aynı kök nedenden besleniyor. Multi-senaryo motoru sektörel anlamda kör çalışıyor.

**Çözüm:** `sectorThresholdOverrides` katmanı (Codex önerisi). Her sektör için DIO/DSO bad/good eşikleri TCMB benchmark verisinden türetilmeli.

**Düzeltme fazı:** Faz 4b (Bulgu #6 ile birleşik)

**Risk seviyesi:** Yüksek

---

## 12. `adjustedCashConversionCycle` İnşaat İçin Hesaplanıyor Ama Skora Bağlanmamış

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** `src/lib/scoring/ratios.ts:263` içinde inşaat sektörüne özel `adjustedCashConversionCycle` hesabı var. Bu hesap CCC'yi inşaatın WIP doğasına göre düzeltiyor. Ancak bu adjusted değer skor hesaplamasına bağlanmamış — calculateScore hâlâ standart CCC kullanıyor.

**Sonuç:** Kod inşaatın farklı olduğunu biliyor, hesaplıyor, ama kullanmıyor. Eksik bağlantı veya iptal edilmiş bir özellik.

**Risk:** Düşük (mevcut işlevsellik bozuk değil), ama tasarım borç işareti. Bulgu #11 ile birlikte düşünülmeli — sektörel eşik sistemi gelirse adjustedCashConversionCycle ya bağlanır ya silinir.

**Çözüm seçenekleri:**
1. Faz 4 sectorThresholdOverrides ile birlikte adjustedCashConversionCycle'ı skora bağla
2. Bağlamayacaksak ölü kod olarak sil
3. Yorumla işaretle, Faz 6'ya bırak

**Düzeltme fazı:** Faz 4b (Bulgu #11 ile birlikte değerlendir)

**Risk seviyesi:** Düşük

---

## 13. `expectedSpillover`'ın Karar Verici Olarak Yanlış Kullanılma Riski

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** Faz 4b'de eklenecek `expectedSpillover` sadece açıklayıcı katman olmalı. Candidate selection'ı override etmemeli — ancak yanlışlıkla Faz 5 selection mantığına girerse motor yanlış aksiyon önerebilir.

**Çözüm:** `expectedSpillover` read-only metadata olarak tasarlanmalı. Faz 5 selection mantığında bu alana asla bakılmamalı; sadece UI ve açıklama katmanı kullanabilir.

**Düzeltme fazı:** Faz 4b (önleyici tasarım), Faz 5 (selection disiplini), Faz 7 (UI uyumu)

**Risk seviyesi:** Orta

---

## 14. Faz 4b Feature Flag Disiplini

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** Faz 4b `sectorThresholdOverrides` `calculateScore` davranışını değiştirecek. Ani prod davranış değişimi geriye dönük rating tutarsızlığı yaratır — aynı firma için farklı zaman dilimlerinde farklı skor çıkabilir.

**Çözüm:** `ENABLE_SECTOR_THRESHOLD_OVERRIDES` feature flag. Pattern referansı: `ENABLE_RATIO_BASED_AMOUNTS` (A05 pilot). Flag kapalıyken mevcut global eşik davranışı korunur.

**Düzeltme fazı:** Faz 4b (uygulama sırasında)

**Risk seviyesi:** Yüksek

---

## 15. `strategyVersion` Damgası Konfigürasyonlara Eklenecek

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** Sektörel strateji konfigürasyonları zaman içinde değişecek. Hangi snapshot hangi version'da yazıldı, debug için kritik — ancak versiyon bilgisi şu anda hiçbir yerde saklanmıyor.

**Çözüm:** `strategyVersion` alanı (örn. `"4a-2026-04-26"`). Snapshot ve `scoreAttribution` çıktılarına damga olarak eklenmeli.

**Düzeltme fazı:** Faz 4a (kontrat tanımlanırken)

**Risk seviyesi:** Düşük

---

## 16. `expectedSpillover` Üç Katmanlı Modelleme

**Keşfedildiği Faz:** Faz 3 sonrası Codex audit

**Sorun:** Tek alan dominant kategori (örn. `"liquidity"`) gerçek finansal etkiyi yansıtmıyor. A12 ve A18 gibi aksiyonlar çift yönlü etki üretiyor — birincil kategori iyileşirken başka kategoriler negatif etkilenebilir.

**Çözüm:**
```ts
expectedSpillover: {
  primary:          ScoreCategory
  secondary?:       ScoreCategory
  possibleNegative?: ScoreCategory
}
```

**Düzeltme fazı:** Faz 4b (uygulama sırasında bu yapı kullanılacak)

**Risk seviyesi:** Orta

---

## 17. distanceToTarget Metric (Faz 5.1 Reranking)

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — GPT audit

**Sorun:** Kural 13 reranking targetReached binary. Edge case: +0.2 hedef üstü senaryosu, +8 hedef altı senaryosunun önüne geçiyor. Continuous distance metric daha adil sıralama verir.

**Çözüm:** distanceToTarget = targetCombinedScore - afterState.combined.total (negatif = hedefe ulaşıldı).

**Düzeltme fazı:** Faz 5.3 / 6

**Risk seviyesi:** Düşük

---

## 18. attributionCache Scope Guard ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — GPT + Codex audit

**Çözüldü:** Faz 5.2

**Sorun:** entity.ratios varsayımı (FinancialInput flat'te alan yok). Function/Date/BigInt JSON.stringify'da hatalı. Circular referans risk.

**Çözüm:** SCORING_RELEVANT_FIELDS whitelist (FinancialInput hizalı) + JSON-safe normalize (bigint/Date/function/symbol) + WeakSet circular guard + sentinel entropi. Shared-ref __circular__ trade-off dokümante edildi.

**Risk seviyesi:** Düşük

---

## 19. UI Logout Butonu Eksik

**Keşfedildiği Faz:** Faz 5.1 sonrası (2026-04-26)

**Sorun:** Dashboard'da logout butonu yok veya çalışmıyor. Kullanıcı oturumu kapatamıyor.

**Çözüm:** UI header logout, session/cookie destroy, /login redirect.

**Düzeltme fazı:** Faz 7

**Risk seviyesi:** Yüksek

---

## 20. computeTargetGap Interface Uyumsuzluğu

**Keşfedildiği Faz:** Faz 5.1 — Adım 0 keşfi

**Sorun:** computeTargetGap çıktısında weakestCategories yok. Faz 5.1 motoru en düşük skorlu 2 kategoriyi elle hesapladı.

**Çözüm:** computeTargetGap çıktısını genişlet (weakestCategories ekle) veya identifyCategoryGaps helper yaz.

**Düzeltme fazı:** Faz 6a

**Risk seviyesi:** Orta

---

## 21. computeScoreAttribution Promise.all (Yanlış Kayıt)

**Keşfedildiği Faz:** Faz 5.1 — Codex audit

**Status:** ❌ İPTAL — computeScoreAttribution zaten senkron. Promise.all davranışı Promise.all([sync]) ile doğru çalışır. Gerçek sorun yok.

**Risk seviyesi:** Yok

---

## 22. Pair AppliedAction.attribution Boş Obje (BLOCKER) ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — Codex BLOCKER

**Çözüldü:** Faz 5.2

**Sorun:** Pair senaryolarda attribution `{} as any` ile dolduruluyordu. UI/raporlama'da runtime crash riski.

**Çözüm:** buildAppliedAction helper + undefined guard (throw) + sectorId undefined için tip-güvenli ternary fallback. singleAttributionMap: Map<ActionId, ScoreAttribution>. Pair-level skor hâlâ applyMultipleActions (Kural 11 korundu).

**Risk seviyesi:** Yüksek (Faz 5.2'de çözüldü)

---

## 23. targetRating Geçersiz Sessiz Fallback ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — Codex audit

**Çözüldü:** Faz 5.2

**Sorun:** Geçersiz targetRating sessizce ignore ediliyordu. Debug imkânsız.

**Çözüm:** Geçersiz rating → ScenarioV3.warnings array'e mesaj (console.warn yok). ScenarioV3.warnings spread kopya (shared-reference değil, immutable).

**Risk seviyesi:** Orta

---

## 24. 6-7 Senaryo Hedefi Tutmuyor ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — Codex audit

**Çözüldü:** Faz 5.2

**Sorun:** Dar targetCategoryGap → 1-2 candidate → 3 senaryo. Hedef 6-7.

**Çözüm:** ensureMinimumCandidates (senkron, { candidates, expanded }). Block + skipActions korunur, discourage geçer. __testOnly__ ile unit test (5 case) + E2E.

**Risk seviyesi:** Orta

---

## 25. Route runEngineV3'te (generateScenarios Bağlı Değil)

**Keşfedildiği Faz:** Faz 5.1 (commit d494802) — Codex audit

**Sorun:** generateScenarios API route'a bağlı değil. Motor çalışıyor ama endpoint'e ulaşılmıyor.

**Çözüm:** Faz 6a computeTargetGap interface + Faz 6b route + ENABLE_MULTI_SCENARIO_V3 flag + rollback plan.

**Düzeltme fazı:** Faz 6b

**Risk seviyesi:** Beklenen (scope defer)

---

## Bulgu Özeti Tablosu (Tüm Fazlar)

| # | Bulgu | Keşfedildiği Faz | Düzeltme Fazı | Durum | Risk |
|---|-------|------------------|---------------|-------|------|
| 1 | Rating eşik uyumsuzluğu | Faz 1 | Faz 6 | ⏳ Açık | Orta |
| 2 | `finalScore` isim tuzağı | Faz 1 | Faz 2 (yorum) + Faz 6 (rename) | ⚠️ Kısmen | Yüksek |
| 3 | `ScenarioV3.finalScore` çakışması | Faz 1 | Faz 2 | ✅ Çözüldü | Yüksek |
| 4 | `subjectiveTotal` DB'de yok | Faz 1 | Faz 6 | ⏳ Açık | Orta |
| 5 | `combineScores()` ceiling/floor disiplini | Faz 1 | Faz 2-5 (canlı) | 🔄 Sürekli | Yüksek |
| 6 | Sektör-aksiyon uyumluluğu yok | Faz 2 | Faz 4b + 5 | ⚠️ Kısmen | Yüksek |
| 7 | `combineScores` yanlış dosyada | Faz 2 | Faz 6 | ⏳ Açık | Düşük |
| 8 | Entity validation katmanı yok | Faz 2 | Faz 5.0 ✅ | ✅ Çözüldü | Orta |
| 9 | Profil kategorisi vs gerçek skor etkisi tutarsızlığı | Faz 3 | Faz 5.0 ✅ + 5.1 | ✅ Karar verildi | Yüksek |
| 10 | CCC likidite kategorisinde (DSO/DIO sızıntısı) | Faz 3 (Codex audit) | Faz 6+ (shadow run) | ⏳ Açık | Yüksek |
| 11 | DIO/DSO eşikleri global, sektörel değil | Faz 3 (Codex audit) | Faz 4b | ⏳ Açık | Yüksek |
| 12 | adjustedCashConversionCycle skora bağlanmamış | Faz 3 (Codex audit) | Faz 4b (#11 ile) | ⏳ Açık | Düşük |
| 13 | expectedSpillover yanlış selection riski | Faz 3 (Codex audit) | Faz 4b + 5 + 7 | ⏳ Açık | Orta |
| 14 | Faz 4b feature flag disiplini | Faz 3 (Codex audit) | Faz 4b | ⏳ Açık | Yüksek |
| 15 | strategyVersion damgası eksik | Faz 3 (Codex audit) | Faz 4a | ⏳ Açık | Düşük |
| 16 | expectedSpillover üç katmanlı modelleme | Faz 3 (Codex audit) | Faz 4b | ⏳ Açık | Orta |
| 17 | distanceToTarget metric | Faz 5.1 (GPT) | Faz 5.3/6 | ⏳ Açık | Düşük |
| 18 | attributionCache scope guard | Faz 5.1 (GPT+Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Düşük |
| 19 | UI logout butonu eksik | Faz 5.1 sonrası | Faz 7 | ⏳ Açık | Yüksek |
| 20 | computeTargetGap interface uyumsuzluğu | Faz 5.1 (Adım 0) | Faz 6a | ⏳ Açık | Orta |
| 21 | computeScoreAttribution Promise.all (yanlış kayıt) | Faz 5.1 | İPTAL | ❌ İptal | Yok |
| 22 | Pair AppliedAction.attribution boş obje (BLOCKER) | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Yüksek |
| 23 | targetRating geçersiz sessiz fallback | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Orta |
| 24 | 6-7 senaryo hedefi tutmuyor | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Orta |
| 25 | Route runEngineV3'te (generateScenarios bağlı değil) | Faz 5.1 (Codex) | Faz 6b | ⏳ Açık | Beklenen |

---

## Faz 3 Çıkışı — Kritik Mimari Soru

Faz 3 tamamlandığında Bulgu #9 ortaya çıktı: faaliyet aksiyonlarının likidite kategorisinde baskın skor üretmesi. Bu sorunun kök nedeni araştırıldı.

### Codex Audit Sonrası Ek Keşifler

Faz 3 mimari sorusu Codex'e soruldu. Audit sonucunda 7 yeni bulgu ortaya çıktı (#10-#16). İki gruba ayrılır:

**Kök neden bulguları (#10, #11, #12):** Bulgu #9 ve #6'nın yapısal kök nedenleri. CCC kategori ataması, global eşikler, ölü adjusted CCC kodu.

**Mimari disiplin bulguları (#13, #14, #15, #16):** Faz 4 uygulanırken takip edilecek tasarım kuralları.

- **#10 (CCC sızıntısı)** → Bulgu #9'un kök nedeni; faaliyet aksiyonlarının likiditeye sızması bilinçli/tesadüfi tasarım sonucu
- **#11 (Global eşik)** → Bulgu #6'nın kök nedeni; sektörel eşik eksikliği inşaat sektöründe sıfır skor üretimine yol açıyor
- **#12 (Ölü adjusted CCC)** → Yarım kalmış sektörel düzeltme girişimi
- **#13 (expectedSpillover override yasak)** → Açıklayıcı metadata, selection mantığına girmemeli
- **#14 (Feature flag)** → sectorThresholdOverrides prod'a flag ile açılmalı
- **#15 (strategyVersion)** → Konfigürasyon versiyonu snapshot'a damgalanmalı
- **#16 (Üç katmanlı spillover)** → primary / secondary / possibleNegative ayrımı

**Faz 4 yapısı (üç audit hizalandı):**
- Faz 4a = narrativeCategoryByAction + sectorEligibility (orchestration metadata, düşük risk)
- Faz 4b = sectorThresholdOverrides + expectedSpillover (score semantics, yüksek risk, feature flag ile)
- Mantıksal olarak tek "Sector Strategy Layer", fiziksel olarak 4 dosya, commit olarak 2 atomik adım

Codex önerisi: GPT'ye danışıldıktan sonra Faz 4 scope'u kararlaştırılacak.

---

## Notlar

- Bu dosya Faz 8 (production hazırlık) tamamlanana kadar canlı tutulacak.
- Her bulgu çözüldüğünde ilgili commit hash'i ve faz numarası bulgu başına eklenir (✅ ÇÖZÜLDÜ etiketi).
- Yeni bulgu çıkarsa numaralandırarak eklenir, özet tablosu güncellenir.
- Her faz başlangıcında bu dosya gözden geçirilir, ilgili bulgular o fazda çözülecekse plana dahil edilir.
