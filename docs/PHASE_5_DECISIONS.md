# Faz 5 Mimari Kararları

Multi-senaryo motorunun (Faz 5) implementasyonuna girmeden önce
verilen mimari kararların kayıt dosyası. Faz 5.1 implementasyonu bu
dosyaya referans verir.

---

## Karar #1 — Bulgu #9 Çözümü: Yaklaşım 3 (İki Katmanlı Profil)

**Tarih:** 2026-04-26
**Audit kaynakları:** Codex statik audit + GPT mimari audit + Claude entegrasyon
**Karar:** Yaklaşım 3 — narrative-first candidate selection + attribution rerank

### Bağlam

Faz 3'te scoreImpactProfile yazılırken keşfedildi: aksiyonun "mali
müşavir zihnindeki kategorisi" ile "skor sisteminde gerçekten en çok
etkilediği kategori" farklı (Bulgu #9). 5 pilot aksiyondan 3'ü
(A05, A06, A12) bu tutarsızlığı gösterdi.

Üç çözüm yaklaşımı tartışıldı:
- Yaklaşım 1: Skor sistemi revizyonu (production'da risk)
- Yaklaşım 2: Sadece kavramsal profil + UI açıklaması
- Yaklaşım 3: İki katmanlı profil (narrative + scoreImpact)

### Karar

Yaklaşım 3 benimsendi. Detay:

**narrativeCategory** (mali müşavir dili):
- Source of truth: src/lib/scoring/sectorStrategy/narrativeProfiles.ts
- A05 = "activity", A06 = "activity", A10 = "leverage",
  A12 = "leverage", A18 = "profitability"
- Faz 5 motorunun KARAR VERİCİ katmanı

**scoreImpactCategory / scoreAttribution** (model dili):
- Gerçek hesaplanan etki: scoreAttribution motoru
- Faz 5 motorunun ÖLÇÜM katmanı
- post-hoc reranking ve UI açıklaması için

**expectedSpillover** (read-only metadata):
- Bulgu #13 disiplini: selection mantığında ASLA kullanılmayacak
- Sadece reporting/UI için "beklenen vs ölçülen" karşılaştırması

### Faz 5 Motor Akışı (Yaklaşım 3 uygulaması)

1. **Kategori açığı tespiti:** Mali müşavir veya motor "faaliyet açığım var"
   diye girdi verir
2. **Narrative-first candidate selection:** narrativeCategory üzerinden
   aday aksiyonlar seçilir (örn. activity → [A05, A06])
3. **Sector eligibility pre-filter:** Sektör için block edilmiş aksiyonlar
   elenir (örn. A06+inşaat → discourage etiketi, ama listeden çıkmaz)
4. **scoreImpactProfile shortlist:** 0-5 yönsel etki gücüyle hızlı sıralama
5. **Gerçek attribution rerank:** Top adaylar için computeScoreAttribution
   çalıştırılır, gerçek combinedDelta'ya göre yeniden sıralanır
6. **Senaryo kombinasyonu:** En iyi adaylar 6-7 senaryoya kombine edilir
7. **UI açıklaması:** "A05 faaliyet açığı için önerildi, ölçülen en güçlü
   etki likidite tarafında" formatında çift cümle gösterilir
   (expectedSpillover bu açıklamada kullanılabilir)

### Disiplinler (Bulgu #13 türevleri)

- expectedSpillover candidate selection'a sızmayacak (sadece UI)
- Kullanıcı kategori girdisi → narrativeCategory ile eşleşir
- Kullanıcı raporu → scoreAttribution sonucu + spillover açıklaması
- score.ts ASLA değiştirilmeyecek (Yaklaşım 1 reddedildi)

### Bulgu #6 ile İlişki

DEKAM A06 örüntüsü (activity delta = 0) Yaklaşım 3'te selection/ranking
kalibrasyonu olarak ele alınır:
- A06 inşaatta narrative kategorisi "activity" kalır
- Sector eligibility "discourage" → motor önerirken uyarı gösterir
- scoreAttribution gerçek delta'yı hesaplar (DEKAM'da 0 çıkar)
- Motor 0 delta'lı aksiyonu üst sıralara yazmaz (rerank doğal filtreler)
- Score.ts revizyonu yapılmaz (Faz 6+ shadow run işi, Bulgu #10)

### Bulgu Durum Güncellemeleri

Bu kararla aşağıdaki bulguların durumu güncellendi:
- **Bulgu #9** → Faz 5.0 ✅ Karar verildi (implementasyon Faz 5.1)
- **Bulgu #13** → disiplin Faz 5.1'de uygulanacak

---
