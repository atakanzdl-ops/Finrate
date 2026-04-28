# Düzeltme Kuyruğu — Tüm Fazlar

**Tarih:** 2026-04-26
**Bağlam:** Multi-senaryo motoru fazları boyunca keşfedilen, ilgili fazda hemen çözülmemiş olup ileride düzeltilecek yapısal sorunların kayıt altına alındığı dosya. Her bulgu: keşfedildiği faz, düzeltme fazı, risk seviyesi ile etiketlidir.

Bu dosya kalıcı bir TODO listesidir. Her bulgu için: ne olduğu, neden önemli olduğu, hangi fazda düzeltileceği belirtilmiştir.

---

## 1. Rating Eşik Uyumsuzluğu (Bulgu #29 follow-up) ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 1 (commit `e8d351a`)

**Sorun:** İki ayrı dosyada farklı rating bandları tanımlı:

- `src/lib/scoring/score.ts` → `RATING_BANDS`: AAA ≥ 93, AA ≥ 84, A ≥ 76
- `src/app/api/.../route.ts` → `scoreToRatingGrade`: AAA ≥ 95, AA ≥ 86, A ≥ 76

**Risk:** Aynı skor, çağrıldığı yere göre farklı rating üretebilir. UI ile API tutarsız sonuç gösterebilir.

**Çözüm:** Tek source of truth — `score.ts` RATING_BANDS sabiti. `route.ts` bunu import etmeli, kendi kopyasını silmeli.

**Çözüldü:** Faz 6.5 (`29d900e`) — Bulgu #29 ile follow-up tamamlandı

**Düzeltme fazı:** Faz 6 (API endpoint)

**Faz 6.5 notu:** `scoreToRatingGrade` de-duplikasyon Faz 6.5 Konsolidasyon kapsamına alındı. `route.ts` kendi kopyasını kaldırıp `score.ts` RATING_BANDS'i import edildi.

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

## 19. UI Logout Butonu Eksik (Bulgu #30 follow-up) ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 5.1 sonrası (2026-04-26)

**Sorun:** Dashboard'da logout butonu yok veya çalışmıyor. Kullanıcı oturumu kapatamıyor.

**Çözüm:** UI header logout, session/cookie destroy, /login redirect.

**Çözüldü:** Faz 6.5 (`5d2397e`) — Bulgu #30 ile follow-up tamamlandı

**Düzeltme fazı:** Faz 7

**Faz 6.5 notu:** Logout butonu (`FinrateShell.tsx` logout action) Faz 6.5 Konsolidasyon kapsamına alındı. Session destroy + `/giris` redirect Faz 6.5'te tamamlandı.

**Risk seviyesi:** Yüksek

---

## 20. computeTargetGap Interface Uyumsuzluğu

**Keşfedildiği Faz:** Faz 5.1 — Adım 0 keşfi

**Sorun:** computeTargetGap çıktısında weakestCategories yok. Faz 5.1 motoru en düşük skorlu 2 kategoriyi elle hesapladı.

**Çözüm:** computeTargetGap çıktısını genişlet (weakestCategories ekle) veya identifyCategoryGaps helper yaz.

**Düzeltme fazı:** Faz 6a ✅ ÇÖZÜLDÜ (commit `62e115c`) — computeTargetGap çıktısı opsiyonel weakestCategories ile genişletildi. Mantık B (sort+slice) taşındı, Mantık A (default) scenarioGenerator fallback. Sorumluluk ayrımı: kontrat saf, default sahibi generator. targetRating: input ASCII-safe (bilinçli değişim, 'a'→'A'), output mevcut davranış. ⚠️ targetRatingToScore Faz 6b'de tam hizalanacak (geçici bilinçli hizasızlık). Geriye uyumlu, snapshot AYNEN.

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

**Düzeltme fazı:** Faz 6b ✅ ÇÖZÜLDÜ (commit `697b432`) — selectScenarioEngine wrapper ile generateScenarios API route'a bağlandı. ENABLE_MULTI_SCENARIO_V3 flag (default false). Fallback: v3 fail → v2 + log. Double fail: original v3 throw + HTTP 500. Production aktivasyonu Faz 8.

**Risk seviyesi:** Beklenen (scope defer)

---

## 26. Repo Hijyeni — Untracked Build Artefaktları ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 6a sonrası (Codex audit notu)

**Çözüldü:** Bulgu #26 mini-commit — `16a518e`

**Sorun:**
- `app/src/_site_home_raw.txt` — Vercel scrape artefaktı, repo'ya commit riski
- `app/src/tsconfig.tsbuildinfo` — TypeScript incremental cache, tracked tutulmamalı

**Çözüm yöntemi:** `16a518e` — `.gitignore`'a `*.tsbuildinfo` (genel repo policy) ve `app/src/_site_home_raw.txt` eklendi. `_site_home_raw.txt` fiziksel olarak silindi. `git check-ignore` ve `git status` ile doğrulandı.

**Risk seviyesi:** Düşük

---

## 27. targetRatingToScore Normalize — Faz 6a Kalan ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 6a — bilinçli hizasızlık notu

**Çözüldü:** Faz 6b (commit `697b432`)

**Sorun:** Faz 6a'da computeTargetGap normalize ederken targetRatingToScore exact-match kullanıyordu. "a" gibi küçük harf input'lar farklı davranabilirdi.

**Çözüm:** targetRatingToScore'a `trim().toUpperCase()` eklendi. Bulgu #20 tam kapandı.

**Risk seviyesi:** Düşük (Faz 6a bilinçli defer)

---

## 28. Faz 6b Shape Uyumsuzluğu + Contract Test Eksiği + Dead Code ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 6b sonrası Codex audit

**Çözüldü:** Faz 6b polish (commit `586179a`)

**Sorun:**
1. YÜKSEK (production blocker): `generateScenarios` → `ScenarioV3[]`, `runEngineV3` → `EngineResult`. Flag true yolunda shape uyumsuzluğu. `decisionLayer` derin erişimler (`reasoning.bindingCeiling`, `layerSummaries.productivity`, `horizons.short.actions`) karşılanmıyor.
2. ORTA: Preflight health 301 kabul edildi (kural 200'dü).
3. DÜŞÜK: `route.ts` dead code `runEngineV3` import.

**Çözüm:**
1. `adaptScenariosV3ToEngineResult`: tam EngineResult shape + `isEngineResultLike` shape guard
2. 3 katmanlı contract test (adapter unit + shape parity + decisionLayer uyumu)
3. `selectScenarioEngine` PRIMARY + DOUBLE FAIL fallback + structured log
4. Faz 8'de strict 200 health zorunlu (kayıt)
5. Dead code temizliği

**Risk seviyesi:** Yüksek (production blocker, çözüldü)

---

## 29. scoreToRatingGrade Tutarsızlığı (Bulgu #1 follow-up) ✅ ÇÖZÜLDÜ

**İlişkili bulgu:** #1 — orijinal kayıt değişmedi, bu madde Faz 6.5 aktif çözümü

**Çözüldü:** Faz 6.5 (commit `29d900e`)

**Sorun:**
- `route.ts`'te yerel `scoreToRatingGrade` (AAA ≥95)
- `score.ts`'te `RATING_BANDS` (AAA ≥93)
- Şu an aktif tutarsızlık (Codex audit: yüksek etki)

**Çözüm:** `route.ts` yerel `scoreToRatingGrade` fonksiyonu + JSDoc silindi. Çağrı `normalizeLegacyRating(scoreToRating(baseScore))` olarak güncellendi. `score.ts` RATING_BANDS tek source-of-truth. Drift: yok (353 test, 22 snapshot — tümü yeşil).

**Düzeltme fazı:** Faz 6.5

**Risk seviyesi:** Yüksek (çözüldü)

---

## 30. UI Logout Butonu (Bulgu #19 follow-up) ✅ ÇÖZÜLDÜ

**İlişkili bulgu:** #19 — orijinal kayıt değişmedi, bu madde Faz 6.5 aktif çözümü

**Çözüldü:** Faz 6.5 (commit `5d2397e`)

**Sorun:**
- `FinrateShell`'de logout butonu YOK
- Backend `/api/auth/logout` hazır
- Kullanıcı oturum kapatamıyor

**Çözüm:** `FinrateShell.tsx` — `handleLogout` handler eklendi (fetch POST `/api/auth/logout`, `credentials: 'include'`, koşulsuz `window.location.href = '/giris'` redirect). `LogOut` ikonu (lucide-react, strokeWidth=2.5). Buton "Ayarlar" altına `nav-link` stiliyle eklendi. Testler: 353/353, drift yok.

**Düzeltme fazı:** Faz 6.5

**Risk seviyesi:** Yüksek (UX kritik, çözüldü)

---

## 31. Route HTTP Integration Test Eksik ✅ ÇÖZÜLDÜ

**Keşfedildiği Faz:** Faz 6b polish doğrulama (Codex)

**Çözüldü:** Faz 6.5 (commit `7f65640`)

**Sorun:** Polish'te `buildDecisionAnswer` `not.toThrow` ile shape uyumsuzluğu davranış seviyesinde test edildi. Gerçek HTTP layer (`POST /api/scenarios/v3` → 200/500) integration testi yok.

**Etki:**
- Codex audit notu: "flag true aktivasyonunda regresyon riski"
- Faz 8 flag açma sırasında canlıda sürpriz olasılığı

**Çözüm:** `route.test.ts` — 5 senaryo: 401 (auth fail) · 400 (body eksik) · 200 flag false (runEngineV3 çağrı assert) · 200 flag true (generateScenarios çağrı assert) · 500 DOUBLE FAIL (generateScenarios + runEngineV3 ikisi throw). Mock: `jest.doMock + resetModules + dynamic import`, `next/server` mock (testEnvironment:node), `selectScenarioEngine` MOCK EDİLMEDİ (gerçek try/catch). Tests: 13/13 suite, 358/358 test.

**Düzeltme fazı:** Faz 6.5

**Risk seviyesi:** Yüksek (çözüldü)

---

## 32. UI Rating Skalası Uyum Kontrolü

**Keşfedildiği Faz:** Faz 6.5 Bulgu #29 sırasında (Atakan)

**Sorun:**
- `score.ts` skalası (AAA ≥93) baz alındı.
- UI/web/pazarlama tarafında farklı skala gösterimi olabilir.

**Çözüm planı:**
- Faz 7'de UI, web ve pazarlama skala metinleri `score.ts` ile hizalanacak.

**Düzeltme fazı:** Faz 7

**Risk seviyesi:** Orta (UX tutarlılığı)

---

## Bulgu Özeti Tablosu (Tüm Fazlar)

| # | Bulgu | Keşfedildiği Faz | Düzeltme Fazı | Durum | Risk |
|---|-------|------------------|---------------|-------|------|
| 1 | Rating eşik uyumsuzluğu (Faz 6.5 aktif çözüm: #29) | Faz 1 | Faz 6.5 `29d900e` | ✅ Çözüldü | Yüksek |
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
| 19 | UI logout butonu eksik (Faz 6.5 aktif çözüm: #30) | Faz 5.1 sonrası | Faz 6.5 `5d2397e` | ✅ Çözüldü | Yüksek |
| 20 | computeTargetGap interface uyumsuzluğu | Faz 5.1 (Adım 0) | Faz 6a ✅ | ✅ Çözüldü | Orta |
| 21 | computeScoreAttribution Promise.all (yanlış kayıt) | Faz 5.1 | İPTAL | ❌ İptal | Yok |
| 22 | Pair AppliedAction.attribution boş obje (BLOCKER) | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Yüksek |
| 23 | targetRating geçersiz sessiz fallback | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Orta |
| 24 | 6-7 senaryo hedefi tutmuyor | Faz 5.1 (Codex) | Faz 5.2 ✅ | ✅ Çözüldü | Orta |
| 25 | Route runEngineV3'te (generateScenarios bağlı değil) | Faz 5.1 (Codex) | Faz 6b ✅ | ✅ Çözüldü | Beklenen |
| 26 | Repo hijyeni — untracked artefaktlar | Faz 6a sonrası (Codex) | Bulgu #26 ✅ | ✅ Çözüldü | Düşük |
| 27 | targetRatingToScore normalize — Faz 6a kalan | Faz 6a (bilinçli defer) | Faz 6b ✅ | ✅ Çözüldü | Düşük |
| 28 | Faz 6b shape uyumsuzluğu + contract test + dead code | Faz 6b sonrası (Codex) | Faz 6b polish ✅ | ✅ Çözüldü | Yüksek |
| 29 | scoreToRatingGrade tutarsızlığı (#1 follow-up) | Faz 1 → Faz 6.5 | Faz 6.5 (`29d900e`) | ✅ Çözüldü | Yüksek |
| 30 | UI logout butonu (#19 follow-up) | Faz 5.1 sonrası | Faz 6.5 (`5d2397e`) | ✅ Çözüldü | Yüksek |
| 31 | Route HTTP integration test eksik | Faz 6b polish doğrulama | Faz 6.5 (`7f65640`) | ✅ Çözüldü | Yüksek |
| 32 | UI rating skalası uyum kontrolü | Faz 6.5 Bulgu #29 sırasında | Faz 7 | ⏳ Açık | Orta |

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

## Faz Kronolojisi

### ✅ Faz 7.3.4A — pdf.ts TDHP rawAccounts Üretimi
**Commit:** `2691883`
**Tarih:** 2026-04-28
**Codex audit:** GO

**Amaç:**
pdf.ts parser'ını KV beyannamesi ayrıntılı bilanço/gelir tablosu
satırlarını TDHP rawAccounts olarak (POZİTİF MUTLAK) okuyacak
şekilde genişletmek.

**Çıktı:**
- `extractTdhpRawAccountsFromText(rawText)` public helper export
- State machine ana + alt bölüm takibi
- 70+ TDHP eşleştirme kuralı
- 3 fixture (DEKAM 2022/2023/2024 KV) — gerçek PDF veriden
- 57 yeni unit test (toplam 370 → 427)
- Snapshot drift YOK (22 → 22)

**Faz boyunca bulunan ve düzeltilen 4 bug:**
1. `firstTdhpNum` bug — parser cari dönem yerine önceki dönemi alıyordu. `cariDonemNum` (ikinci sayı) ile düzeltildi.
2. 590/591 mutual exclusion eksikti — 692 SKIP vardı ama 590/591 arası yoktu. Mutual exclusion eklendi.
3. SATIS_MALIYETI regex çok dar — KVB PDF'inde "D. Satışların Maliyeti" yazıyor, regex sadece "C." beklerken kaçıyordu. `[cd]` olarak genişletildi.
4. 302 (Ertelenmiş Finansal Kiralama) pattern çok uzun string match'iyordu, kısa eşleşmeye çevrildi.

**Audit zinciri:**
- 5 tur Codex audit (revize 1, 2, 3, 4 + ek düzeltme)
- 16 blocker bulundu, hepsi düzeltildi
- Claude Code uygulamada 4 ek bug yakaladı

**DEKAM doğrulama:**
- 2022: 42 hesap, 591 = 357,848.44 (zarar yılı)
- 2023: 41 hesap, 591 = 352,542.83 (zarar yılı)
- 2024: 42 hesap, 590 = 22,097,244.29 (kâr yılı)
- 350/358 ayrı sınıflandırılıyor
- 257 = 552,171.98 (POZİTİF mutlak doğrulandı)

**Disiplin:**
- `score.ts` dokunulmadı
- V1/V2/V3 motorları dokunulmadı
- `excel.ts`, `accountMapper.ts` dokunulmadı
- DB migration YOK
- Rating yeniden hesaplama YOK
- `financial_data` Prisma şeması dokunulmadı

**Çözülen önceki sorun:**
- Sentetik 20 hesap problemi → 40+ gerçek TDHP hesap (yeni PDF upload'larında)

---

### ✅ Faz 7.3.4B0 — V3 Engine Kontra Hesap Düzeltme
**Commits:** `6545040` + `a330807`
**Tarih:** 2026-04-28
**Codex audit:** GO (3 audit turu, 7 blocker hepsi düzeltildi)

**Sorun:**
engineV3 `sumByPrefix`/`sumByCodes` `Math.abs` kullanıyor, kontra
hesaplar (103, 257, 268, 580, 591, 158) yanlış pozitif
varlık/özkaynak lehine ekleniyordu. Mevcut DEKAM 2022
sentetik 20'de bile özkaynak yaklaşık 985 bin TL şişikti.

**Çıktı:**
- `signedSumByCodes` helper (Math.abs YOK)
- `buildV3BalanceTotals` public export
- `accountMapper.ts` TEK KAYNAK (17 toplam birebir kopyalanmış)
- `computeSectorMetrics` düzeltildi
- `buildProductivityInput` düzeltildi (`cashAndEquivalents`, `inventory`, `fixedAssetsNet`)
- 7 senaryo + Senaryo 8 unit test
- 427 → 449 test (+22), snapshot drift YOK

**Sayısal doğrulama (DEKAM 2022 sentetik):**
- Eski yanlış totalEquity: 3,992,493.93
- Yeni doğru totalEquity: 3,007,506.07
- Düzeltme: −984,987.86 TL

**Disiplin:**
- `score.ts` dokunulmadı
- V1/V2 motorları dokunulmadı
- `pdf.ts` dokunulmadı (Faz 7.3.4A korundu)
- `accountMapper.ts` dokunulmadı (TEK KAYNAK olarak okundu)
- DB migration YOK
- Rating güncelleme YOK

---

### ✅ Faz 7.3.4B0.1 — accountMapper + engineV3: 350/358 KV Yükümlülük
**Commit:** `c315244`
**Tarih:** 2026-04-28
**Codex audit:** GO (3 audit turu, 7 blocker hepsi düzeltildi)

**Sorun:**
350 (Yıllara Yaygın İnşaat Hakedişleri) ve 358 (Enflasyon Düzeltme) hesapları:
- `pdf.ts` parser üretiyor (Faz 7.3.4A) ✓
- `accountMapper.ts` `rebuildAggregateFromAccounts` İÇİNDE YOKTU ✗
- `accountMapper.ts` `checkBalance()` İÇİNDE YOKTU ✗
- `engineV3` `buildV3BalanceTotals` `stLiabilities` İÇİNDE YOKTU ✗

DEKAM 2024'te 350 + 358 = 46,896,296.36 TL — KV yükümlülük
olarak görünmüyordu, Borç/Özkaynak yanlış düşük çıkıyordu.

**Çıktı:**
- `constructionProgressBillings` alt bileşen helper
  (DRY: `accountMapper.ts` içinde tek helper, iki yerde kullanım)
- `rebuildAggregateFromAccounts` `totalCurrentLiabilities` güncellendi
- `checkBalance()` güncellendi
- `engineV3` `buildV3BalanceTotals` `stLiabilities` listesine 350/358 eklendi
- Senaryo 9 + `accountMapper.test.ts` yeni dosya (7 test)
- 449 → 459 test (+10), snapshot drift YOK

**Sayısal doğrulama (Senaryo 9):**
- 350=30M + 358=16.9M dahil stLiabilities = 53,396,296.36

**Disiplin notu:**
`accountMapper.ts` bu fazda zorunlu olarak değişti.
Önceki "accountMapper dokunulmaz" kuralı parser/V3 motor
düzeltmeleri için geçerliydi. Bu faz `accountMapper.ts`'in KENDİSİNDE
eksik olan 350/358 hesaplarını eklemek için tasarlandı.

---

### ⏳ 7.3.4B Ön Koşul — ✅ TAMAMLANDI (Faz 7.3.4B0 + B0.1)

**Ön koşul notu:** 7.3.4B ön koşulu: ✅ TAMAMLANDI (Faz 7.3.4B0 + B0.1)

V3 engine kontra hesap düzeltmesi Faz 7.3.4B0'da tamamlandı.
350/358 KV yükümlülük eksikliği Faz 7.3.4B0.1'de tamamlandı.

**Codex audit raporundan — Faz 7.3.4B prompt'u şu şartlarla yazılmalı:**
- PDF/fixture kaynağı net
- `calculateRatiosFromAccounts(current, previous)` + `calculateScore`
- `finalScore` + `finalRating` + `ratios` + kategori skorları
  (`liquidity`, `profitability`, `leverage`, `activity`) + `optimizerSnapshot`
- Migration öncesi rollback snapshot

---

## Notlar

- Bu dosya Faz 8 (production hazırlık) tamamlanana kadar canlı tutulacak.
- Her bulgu çözüldüğünde ilgili commit hash'i ve faz numarası bulgu başına eklenir (✅ ÇÖZÜLDÜ etiketi).
- Yeni bulgu çıkarsa numaralandırarak eklenir, özet tablosu güncellenir.
- Her faz başlangıcında bu dosya gözden geçirilir, ilgili bulgular o fazda çözülecekse plana dahil edilir.
