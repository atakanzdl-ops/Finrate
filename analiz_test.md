# Finrate — Test Altyapısı Analiz Raporu

Kaynak: `app/src/lib/scoring/__tests__`, `jest.config.js` vb.

---

## 🧪 Mevcut Durum

Uygulamada otomatik test (Automated Testing) altyapısı bulunuyor. Özellikle uygulamanın en riskli yeri olan "Skorlama (Scoring) ve Senaryo (Scenario)" klasörü altında Jest ile yazılmış testler mevcut.

| Metrik | Durum |
|---|---|
| **Test Çerçevesi** | Jest |
| **Unit Test Sayısı** | ~9 adet test dosyası (`accountMapper.test.ts`, `targetGap.test.ts` vb.) |
| **E2E / Integration** | Yok (Cypress, Playwright kullanılmamış) |

---

## ✅ Güçlü Yanlar

1. **Doğru Odak (Business Logic):** Test yazmaya uygulamanın en kritik iş kuralı (business logic) olan puanlama ve mizan mapping (hesap eşleme) fonksiyonlarından başlanmış olması harika bir mühendislik kararıdır. UI testlerinden ziyade matematiğin doğru çalıştığını test etmek Finrate için hayati önem taşır.

---

## 🔴 Kritik Bulgular ve Riskler

### 1. Kapsam (Coverage) Belirsizliği
**Durum:** Hangi dosyaların %100 test edildiği, hangilerinin hiç test edilmediği belli değil.
**Risk:** Senaryo motoru V3'e geçirilirken eklenen yeni fonksiyonlar muhtemelen testsiz bırakıldı. Finansal hesaplamalarda ufacık bir formül hatası yanlış şirket analizine yol açabilir.
**Öneri:** `jest --coverage` komutu package.json'a eklenerek test kapsam (coverage) raporu çıkarılmalı. `lib/scoring` altındaki tüm saf fonksiyonlar için minimum %80 test kapsamı (coverage) hedeflenmelidir.

### 2. Integration / E2E Test Eksikliği
**Durum:** Sadece izole fonksiyonlar test ediliyor (Unit Test). Ancak "Bir kullanıcı sisteme kayıt olur -> Excel yükler -> Analiz çalıştırır -> Rapor PDF alır" şeklindeki tam akışı (End-to-End) test eden hiçbir mekanizma yok.
**Risk:** Bir Next.js güncellemesi veya veritabanı migration'ı sonrasında uygulamanın bir sayfasının tamamen çökmesi, ancak Unit testlerin yeşil (başarılı) geçmesi olasıdır.
**Öneri:** Sisteme acilen **Playwright** kurularak en azından 1-2 adet ana senaryoyu test eden (Happy Path) E2E testleri yazılmalıdır.

---

## 🟡 İyileştirme Fırsatları

- **Test Veri Seti (Mock Data):** Testler içindeki mock mizan (dummy excel verileri) verileri çok basit olabilir. Gerçek dünyadan, kenar durumları (edge cases) barındıran anonimleştirilmiş 2-3 büyük mizanı `__fixtures__` klasöründe JSON olarak tutup testlere bu verileri beslemek, motorun stres altında doğru çalışıp çalışmadığını gösterir.
