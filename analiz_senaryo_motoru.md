# Finrate — Senaryo ve Skor Motoru Analiz Raporu

Kaynak: `app/src/lib/scoring/**`, `app/src/app/api/scenarios/**`

---

## 🚀 Mevcut Durum ve Özellikler

Finrate uygulamasının kalbini oluşturan Senaryo (Scenario) ve Skorlama (Scoring) motoru oldukça kapsamlı ve sofistike bir yapıda. Özellikle V3 sürümüyle birlikte büyük bir evrim geçirmiş.

| Özellik | Açıklama |
|---|---|
| **Motor Versiyonları** | V1 (Legacy), V2 (Aggregate bazlı), V3 (Mizan/Hesap bazlı - En güncel) |
| **Puanlama Kriterleri** | Objektif Finansal Rasyolar + Subjektif Girdiler |
| **Senaryo Seçenekleri (V3)** | Asgari Müdahale (Conservative), Dengeli (Typical), Hızlı Dönüşüm (Aggressive) |
| **Sektör Desteği** | İmalat, İnşaat, Ticaret, Perakende, Bilişim, Hizmet |
| **Girdi Tipi** | TDHP Hesap Kodları (V3) veya Toplu Bilanço Verisi (V1/V2) |

---

## ✅ Güçlü Yanlar (Doğru Yapılanlar)

1. **Geriye Uyumluluk (Backward Compatibility):** V3 motoru sisteme eklenirken `engineV3.ts` ve `scenarioV3` alt klasörüne izole edilmiş, böylece önceki motorlar (`scenarioEngine.ts`) bozulmadan bırakılmıştır.
2. **Saf Fonksiyonlar (Pure Functions):** Hesaplama mantıkları (örn. `ratios.ts`, `score.ts`) veritabanı veya I/O işlemlerinden izole edilmiş saf (pure) TypeScript fonksiyonları olarak tasarlanmış. Bu sayede test edilebilirlikleri çok yüksek.
3. **Paralel Plan Hesaplama:** V3 motoru; kullanıcıya 3 farklı aggressiveness seviyesinde alternatif sunabilmek için (Asgari, Dengeli, Hızlı) aynı anda 3 farklı simülasyonu çalıştırıp en uygun olanı seçebilme yeteneğine sahip.
4. **Mizan Bazlı Hesaplama (V3):** Eskiden manuel girilen üst düzey bilanço kalemleri (V2) yerine, direkt olarak muhasebe mizanı (TDHP 100-692 hesap kodları) üzerinden hesaplama yapacak şekilde mimari güncellenmiş. Bu hata payını büyük ölçüde düşürür.

---

## 🔴 Kritik Bulgular ve Riskler

### 1. Üç Farklı Motorun Aynı Anda Yaşaması (V1, V2, V3)
**Risk:** Kod tabanında `scenarioEngine.ts`, `selectScenarioEngine.ts` ve `scenarioV3` gibi dosyalar arasında ciddi bir mantık tekrarı var. API tarafında da `/api/scenarios`, `/api/scenarios/v2` ve `/api/scenarios/v3` aktif durumda. Bu durum bakım maliyetini çok yükseltir ve gelecekteki geliştirmelerde "hangi motoru güncelleyeceğiz?" kafa karışıklığına yol açar.
**Öneri:** V1 ve V2 motorları tamamen deprecated edilip (ölü kod olarak işaretlenip) sistemden aşamalı olarak silinmelidir. Yalnızca V3 (Hesap Kodu bazlı) motor desteklenmelidir.

### 2. V3 Motorunda Timeout (Zaman Aşımı) Riski
**Dosya:** `app/src/app/api/scenarios/v3/route.ts`
**Durum:** `conservative`, `typical` ve `aggressive` planları `Promise.all` ile aynı anda simüle ediliyor.
**Risk:** Senaryo arama (search) algoritması derinleştikçe (özellikle büyük mizanlarda ve uzak hedeflerde) işlem süresi uzar. Vercel'in standart timeout süreleri (Hobby: 10s, Pro: 60s) içinde bu işlemlerin üçü birden yetişemezse API `504 Gateway Timeout` hatası verir.
**Öneri:**
- Hesaplama işlemi için arka planda çalışan bir Job Queue (Örn: Inngest veya Upstash Qstash) kullanılabilir.
- Veya sadece `typical` olan canlıda hesaplanıp, diğerleri asenkron olarak sonradan arayüze push edilebilir.

### 3. Tekrarlayan Aksiyonların Mantık Sınırları
**Risk:** Optimizasyon motoru, istenilen skora ulaşmak için aynı finansal aksiyonu (örneğin A10 - Sermaye Artırımı) arka arkaya defalarca uygulayabilir. Çeşitlendirme (diversification) kuralları teorik olarak olsa da pratikte bazen motor kolaya kaçıp tek bir hesabı şişirebilmektedir.
**Öneri:** Motorun bir aksiyonu maksimum kaç kez (veya portföyün maksimum yüzde kaçı kadar) uygulayabileceğine dair "Aksiyon Limitörleri (Action Caps)" sıkılaştırılmalıdır.

### 4. Bilanço (Gelir Tablosu) `Math.abs` Karmaşası
**Dosya:** `app/src/app/api/scenarios/v3/route.ts` -> `buildIncomeStatement`
**Durum:** TDHP 6xx hesaplarının (Gelir Tablosu) bazıları doğal olarak borç bakiyesi (gider), bazıları alacak bakiyesi (gelir) verir. Kod içinde "Math.abs KULLANILMAZ" notu düşülmüş ancak bazı yerlerde manuel çıkarımlar yapılmış.
**Risk:** Gider hesaplarının mizanda pozitif (borç) gelmesi durumunda, formülün bunu gelir gibi toplayıp karı şişirmesi riski mevcuttur. Mizan okuma standardı katı bir teste tabi tutulmalıdır.

---

## 🟡 İyileştirme Fırsatları

- **Benchmark Verileri:** `benchmarks.ts` içindeki sektör rasyosu ortalamaları (TCMB) muhtemelen statik olarak hardcode edilmiştir. Bu verilerin DB'den veya harici bir API'den periyodik güncellenecek yapıya geçirilmesi raporların hep güncel kalmasını sağlar.
- **Konsolidasyon Motoru Entegrasyonu:** Grup şirketleri için konsolidasyon (Eliminasyon) işlemleri `/api/groups/[id]/consolidate` altında V2 motoruna (aggregate) benzer bir yapıda çalışıyor. V3 (hesap bazlı) konsolidasyon tam entegre edilmemiş olabilir.
