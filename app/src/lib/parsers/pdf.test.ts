/**
 * pdf.ts — detectPdfType + docType testleri (Faz 7.3.15)
 *
 * Kapsam:
 *   detectPdfType: MIZAN / BEYANNAME / UNKNOWN
 *   Kontrol sırası: mizan önce (mizan içinde beyanname kelimesi olabilir)
 *   parsePdfMizan → docType: 'MIZAN'
 *   parsePdfBuffer (beyanname) → docType: 'BEYANNAME'
 *
 * Mock stratejisi:
 *   parsePdfBuffer ve parsePdfMizan: gerçek PDF parse edilmez (binary gerektirir)
 *   detectPdfType: sadece metin string ile test edilir → mock gerekmez
 *
 * Faz 7.3.23 — Sermaye Yedekleri parse testleri (T_SY1-T_SY4):
 *   extractTdhpRawAccountsFromText: OZKAYNAKLAR '529' eşleme + ondalıksız fallback
 *
 * Faz 7.3.24 — matchBilField parseEkSection pattern fix (T_PE1-T_PE5):
 *   'sermaye yedeg' → 'sermaye yedek', 'kar yedeg' → 'kar yedek'
 */

import { detectPdfType, extractTdhpRawAccountsFromText, parseEkSection, parseTaxIdentity } from './pdf'
import dekam2024 from './__fixtures__/dekam-2024-kv.json'
import dekam2023 from './__fixtures__/dekam-2023-kv.json'
import dekam2022 from './__fixtures__/dekam-2022-kv.json'

// ─── detectPdfType ────────────────────────────────────────────────────────────

describe('detectPdfType', () => {

  // ── MIZAN ──────────────────────────────────────────────────────────────────

  test('Mizan: "mizan" + "hesap kodu" → MIZAN', () => {
    const text = 'MİZAN TABLOSU\nHesap Kodu Açıklama Borç Alacak\n100 KASA 50000 0'
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  test('Mizan: "mizan" + "açıklama borç alacak" pattern → MIZAN', () => {
    const text = 'GENEL MİZAN\naçıklama borç alacak\n100 Kasa 100000 0'
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  test('Mizan + beyanname kelimesi birlikte → MIZAN (mizan öncelikli)', () => {
    // Mizan PDF'leri "Beyanname" header'ı içerebilir — mizan önce kontrol edilmeli
    const text = [
      'Kurumlar Vergisi Beyannamesi',
      'MİZAN TABLOSU',
      'Hesap Kodu Hesap Adı Borç Alacak',
      '100 Kasa 50000 0',
    ].join('\n')
    expect(detectPdfType(text)).toBe('MIZAN')
  })

  // ── BEYANNAME ──────────────────────────────────────────────────────────────

  test('Kurumlar Vergisi Beyannamesi → BEYANNAME', () => {
    const text = 'KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024\n'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Yıllık Gelir Vergisi Beyannamesi → BEYANNAME', () => {
    const text = 'YILLIK GELİR VERGİSİ BEYANNAMESİ\nYılı 2024\n'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Geçici Vergi Beyannamesi (kurumlar) → BEYANNAME', () => {
    const text = 'Geçici Vergi Beyannamesi\nKurumlar Vergisi Mükellefleri\n3. Dönem 2024'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  test('Geçici Vergi Beyannamesi (gelir) → BEYANNAME', () => {
    const text = 'Geçici Vergi Beyannamesi\nGelir Vergisi Mükellefleri\n2. Dönem 2024'
    expect(detectPdfType(text)).toBe('BEYANNAME')
  })

  // ── UNKNOWN ────────────────────────────────────────────────────────────────

  test('Rastgele metin → UNKNOWN', () => {
    expect(detectPdfType('Bu bir PDF metnidir. Hiçbir şey yok.')).toBe('UNKNOWN')
  })

  test('Boş metin → UNKNOWN', () => {
    expect(detectPdfType('')).toBe('UNKNOWN')
  })

  test('"Mizan" kelimesi var ama hesap kodu yok → UNKNOWN (mizan pattern eşleşmez)', () => {
    // detectPdfMizan: mizan + (hesap kodu VEYA açıklama borç alacak) şart
    // Sadece "mizan" kelimesi yeterli değil
    const text = 'Bu raporun mizan bölümü henüz hazırlanmamıştır.'
    expect(detectPdfType(text)).toBe('UNKNOWN')
  })
})

// ─── Faz 7.3.23 — Sermaye Yedekleri (529) parse testleri ─────────────────────
//
// Köklü sorun:
//   A) 'sermaye' pattern'i (500) "B. Sermaye Yedekleri" satırını çalıyordu → '529' öne alındı
//   B) cariDonemNum fallback: ondalıksız "51.184.000" TR_NUM'da null dönerdi → ANY_NUM fallback eklendi
//
// Sentetik metin yapısı:
//   "V. Özkaynaklar" → OZKAYNAKLAR context tetiklenir
//   Veri satırları → labelNorm eşleme

describe('extractTdhpRawAccountsFromText — Faz 7.3.23 Sermaye Yedekleri', () => {

  // Yardımcı: OZKAYNAKLAR context içindeki ham metni üreten helper
  function makeOzkaynakText(lines: string[]): string {
    return ['V. Özkaynaklar', ...lines].join('\n')
  }

  // T_SY1: "B. Sermaye Yedekleri  51.184.000" ondalıksız format → '529' = 51184000
  test('T_SY1 — ondalıksız "51.184.000" cariDonemNum fallback ile okunur, code=529', () => {
    const text = makeOzkaynakText([
      'B. Sermaye Yedekleri  51.184.000',
    ])
    const result = extractTdhpRawAccountsFromText(text)
    const acc529 = result.find(r => r.code === '529')
    expect(acc529).toBeDefined()
    expect(acc529!.amount).toBeCloseTo(51_184_000, 0)
  })

  // T_SY2: "B. Sermaye Yedekleri  51.184.000,00" ondalıklı format → '529' = 51184000
  // (mevcut TR_NUM path'i de çalışıyor — regresyon guard)
  test('T_SY2 — ondalıklı "51.184.000,00" standart TR_NUM path de çalışır, code=529', () => {
    const text = makeOzkaynakText([
      'B. Sermaye Yedekleri  51.184.000,00',
    ])
    const result = extractTdhpRawAccountsFromText(text)
    const acc529 = result.find(r => r.code === '529')
    expect(acc529).toBeDefined()
    expect(acc529!.amount).toBeCloseTo(51_184_000, 0)
  })

  // T_SY3: Regresyon — "A. Ödenmiş Sermaye" hâlâ '500'a eşleniyor (pattern sıralama bozulmadı)
  test('T_SY3 — "A. Ödenmiş Sermaye" hâlâ code=500 olarak eşlenir (regresyon)', () => {
    const text = makeOzkaynakText([
      'A. Ödenmiş Sermaye  5.000.000,00',
    ])
    const result = extractTdhpRawAccountsFromText(text)
    const acc500 = result.find(r => r.code === '500')
    expect(acc500).toBeDefined()
    expect(acc500!.amount).toBeCloseTo(5_000_000, 0)
    // '529' YOK (Sermaye Yedekleri satırı yok)
    expect(result.find(r => r.code === '529')).toBeUndefined()
  })

  // T_SY4: Birleşik — hem 500 hem 529 doğru eşlenir, dedup (kod tekrar etmez)
  test('T_SY4 — 500 + 529 birlikte: kod deduplication temiz, her ikisi doğru tutar', () => {
    const text = makeOzkaynakText([
      'A. Ödenmiş Sermaye  5.000.000,00',
      'B. Sermaye Yedekleri  51.184.000',   // ondalıksız — Fix B devreye girer
    ])
    const result = extractTdhpRawAccountsFromText(text)
    const acc500 = result.find(r => r.code === '500')
    const acc529 = result.find(r => r.code === '529')
    expect(acc500).toBeDefined()
    expect(acc500!.amount).toBeCloseTo(5_000_000, 0)
    expect(acc529).toBeDefined()
    expect(acc529!.amount).toBeCloseTo(51_184_000, 0)
    // Deduplication: '500' ve '529' yalnızca birer kez
    const codes = result.map(r => r.code)
    expect(codes.filter(c => c === '500').length).toBe(1)
    expect(codes.filter(c => c === '529').length).toBe(1)
  })
})

// ─── Faz 7.3.24 — parseEkSection matchBilField pattern fix ───────────────────
//
// Düzeltilen bug: matchBilField 'sermaye yedeg' / 'kar yedeg' pattern'leri
// "Yedekleri" (çoğul, 'k') ile eşleşmiyordu. 'yedek' → doğru substring.
//
// parseEkSection: "V. Özkaynaklar" → sec='oz'
// Tüm satırlar "section" string içinde gelir (parsePdfBuffer slice eder).
// Satır formatı: ". B. Sermaye Yedekleri 0,00 51.184.000,00"
//   - label: ". B. Sermaye Yedekleri"  (TR_NUM sil → trim)
//   - n: "b. sermaye yedekleri"         (norm → leading dots stripped)
//   - matchBilField → 'capitalReserves' ✓

describe('parseEkSection — Faz 7.3.24 matchBilField pattern fix', () => {

  // Yardımcı: Özkaynaklar bölümü sentetik metin üretir
  // "V. Özkaynaklar" → detectEkSection → sec='oz'
  function makeOzSection(lines: string[]): string {
    return ['V. Özkaynaklar', ...lines].join('\n')
  }

  // T_PE1: "B. Sermaye Yedekleri 0,00 51.184.000,00" → capitalReserves = 51184000
  test('T_PE1 — ". B. Sermaye Yedekleri" cari dönem capitalReserves olarak parse edilir', () => {
    const text = makeOzSection([
      '. B. Sermaye Yedekleri 0,00 51.184.000,00',
    ])
    const { cari } = parseEkSection(text)
    expect(cari.capitalReserves).toBeCloseTo(51_184_000, 0)
  })

  // T_PE2: 2 dönem — cari dönem = son sayı (51184000), önceki = ilk sayı (0)
  test('T_PE2 — 2 dönem satırında cari=son sayı, önceki=ilk sayı', () => {
    const text = makeOzSection([
      '. B. Sermaye Yedekleri 0,00 51.184.000,00',
    ])
    const { cari, onceki } = parseEkSection(text)
    expect(cari.capitalReserves).toBeCloseTo(51_184_000, 0)
    expect(onceki.capitalReserves).toBeCloseTo(0, 0)
  })

  // T_PE3: Regresyon — "A. Ödenmiş Sermaye" → paidInCapital (etkilenmedi)
  test('T_PE3 — "A. Ödenmiş Sermaye" → paidInCapital regresyon temiz', () => {
    const text = makeOzSection([
      '. A. Ödenmiş Sermaye 5.000.000,00 5.000.000,00',
    ])
    const { cari } = parseEkSection(text)
    expect(cari.paidInCapital).toBeCloseTo(5_000_000, 0)
    expect(cari.capitalReserves).toBeUndefined()
  })

  // T_PE4: "C. Kâr Yedekleri" → profitReserves ('kar yedeg' → 'kar yedek' fix)
  test('T_PE4 — "C. Kâr Yedekleri" → profitReserves doğru parse edilir', () => {
    const text = makeOzSection([
      '. C. Kâr Yedekleri 2.000.000,00 3.000.000,00',
    ])
    const { cari } = parseEkSection(text)
    expect(cari.profitReserves).toBeCloseTo(3_000_000, 0)
  })

  // T_PE5: Birleşik — paidInCapital + capitalReserves + profitReserves hepsi doğru
  test('T_PE5 — paidInCapital + capitalReserves + profitReserves birlikte parse edilir', () => {
    const text = makeOzSection([
      '. A. Ödenmiş Sermaye 5.000.000,00 5.000.000,00',
      '. B. Sermaye Yedekleri 0,00 51.184.000,00',
      '. C. Kâr Yedekleri 1.000.000,00 2.000.000,00',
    ])
    const { cari } = parseEkSection(text)
    expect(cari.paidInCapital).toBeCloseTo(5_000_000, 0)
    expect(cari.capitalReserves).toBeCloseTo(51_184_000, 0)
    expect(cari.profitReserves).toBeCloseTo(2_000_000, 0)
  })
})

// ── Faz 7.3.49 B: Hassas console.log gating (T4-T5) ──────────────────────────

describe('pdf.ts hassas console.log gating (Faz 7.3.49 B)', () => {

  test('T4 — NODE_ENV=production: [ek] logları yazılmaz', () => {
    const spy  = jest.spyOn(console, 'log').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = 'production'

    // parseEkSection içindeki L334/L346/L349 gate edilmeli
    parseEkSection('Dönen Varlıklar 1.000,00\nKısa Vadeli Yükümlülükler 500,00')

    const ekLogs = spy.mock.calls.filter(c => typeof c[0] === 'string' && (c[0] as string).startsWith('[ek]'))
    expect(ekLogs).toHaveLength(0)

    spy.mockRestore()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = prev
  })

  test('T5 — NODE_ENV!=production: gate açık, [ek] log çağrılabilir', () => {
    const spy  = jest.spyOn(console, 'log').mockImplementation(() => {})
    const prev = process.env.NODE_ENV
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = 'development'

    parseEkSection('Dönen Varlıklar 1.000,00\nKısa Vadeli Yükümlülükler 500,00')

    // Gate koşulu doğrulama: development !== production → gate geçer → log yazılabilir
    expect(process.env.NODE_ENV !== 'production').toBe(true)
    // Input section + field eşleştiğinden log çağrılmış olmalı
    const ekLogs = spy.mock.calls.filter(c => typeof c[0] === 'string' && (c[0] as string).startsWith('[ek]'))
    expect(ekLogs.length).toBeGreaterThan(0)

    spy.mockRestore()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(process.env as any).NODE_ENV = prev
  })

})

// ─── parseTaxIdentity (Faz 7.3.50A.3) ────────────────────────────────────────

/**
 * T1-T3: parseTaxIdentity — metin string üzerinde çalışır, binary PDF gerektirmez.
 * norm() kalıbı: Türkçe → ASCII küçük harf dönüşümü.
 */

describe('parseTaxIdentity (Faz 7.3.50A.3)', () => {

  // T1: VKN tespit
  test('T1 — "Vergi Kimlik No: 1234567890" → taxNumber tespit edilir, sourceConfidence=HIGH', () => {
    const text = 'GELİR İDARESİ BAŞKANLIĞI\nVergi Kimlik No: 1234567890\nMükellef Adı: Test Firması'
    const result = parseTaxIdentity(text)
    expect(result.taxNumber).toBe('1234567890')
    expect(result.sourceConfidence).toBe('HIGH')
  })

  // T2: TC kimlik no tespit
  test('T2 — "T.C. Kimlik No: 12345678901" → tcKimlik tespit edilir, taxNumber yok', () => {
    const text = 'Vergi Dairesi: İstanbul\nT.C. Kimlik No: 12345678901\nAd Soyad: Ahmet Yılmaz'
    const result = parseTaxIdentity(text)
    expect(result.tcKimlik).toBe('12345678901')
    expect(result.taxNumber).toBeFalsy()
    expect(result.sourceConfidence).toBe('HIGH')
  })

  // T3: Hiç metadata yok → sourceConfidence=LOW
  test('T3 — Metadata olmayan metin → sourceConfidence=LOW', () => {
    const text = 'Bu belge herhangi bir vergi veya kimlik bilgisi içermemektedir.'
    const result = parseTaxIdentity(text)
    expect(result.taxNumber).toBeFalsy()
    expect(result.tcKimlik).toBeFalsy()
    expect(result.sourceConfidence).toBe('LOW')
  })

  // T4: Unvan tespit
  test('T4 — "Mükellef Adı Unvanı: Test Firması A.Ş." → title tespit edilir', () => {
    const text = 'GVK Beyannamesi\nMükellef Adı Unvanı: Test Firması A.Ş.\nVergi Dairesi: Kadıköy'
    const result = parseTaxIdentity(text)
    expect(result.title).toBeTruthy()
    expect(result.title).toContain('Test')
  })

})

// ─── parseTaxIdentity — Faz 7.3.50A.3.1 Hotfix (DEKAM + Reject + VKN) ───────
//
// T_FIX1–T_FIX5 : DEKAM gerçek fixture regresyon testleri
// T_FIX6–T_FIX10: Reject pattern black-box testleri
// T_FIX11–T_FIX13: VKN multi-line / bitişik / label-öncesi
// T_FIX14        : 11-haneli sayı VKN olarak yakalanmaz (digit boundary)
// T_FIX15        : SMMM bloğu izolasyonu (mükellef VKN alınır, SMMM ignore)

describe('parseTaxIdentity — Faz 7.3.50A.3.1 Hotfix', () => {

  // ── T_FIX1–T_FIX5: DEKAM fixture regresyon ──────────────────────────────────

  test('T_FIX1 — DEKAM 2024: VKN "2731120400" tespit edilir (label-öncesi yapı)', () => {
    const result = parseTaxIdentity(dekam2024.rawText)
    expect(result.taxNumber).toBe('2731120400')
  })

  test('T_FIX2 — DEKAM 2024: title "DEKAM YAPI" içerir', () => {
    const result = parseTaxIdentity(dekam2024.rawText)
    expect(result.title).toBeTruthy()
    expect(result.title).toContain('DEKAM')
  })

  test('T_FIX3 — DEKAM 2023: VKN "2731120400" tespit edilir', () => {
    const result = parseTaxIdentity(dekam2023.rawText)
    expect(result.taxNumber).toBe('2731120400')
  })

  test('T_FIX4 — DEKAM 2022: VKN "2731120400" tespit edilir (Düzeltme Nedeni satırı içeren)', () => {
    const result = parseTaxIdentity(dekam2022.rawText)
    expect(result.taxNumber).toBe('2731120400')
  })

  test('T_FIX5 — DEKAM 2024: "Adı (Unvanın Devamı)" form etiketi title olarak alınmaz', () => {
    const result = parseTaxIdentity(dekam2024.rawText)
    // Title form etiketini içermemeli
    expect(result.title).not.toContain('Devamı')
    expect(result.title).not.toContain('Unvanın')
    // Title geçerli şirket adı içermeli
    expect(result.title).toContain('DEKAM')
  })

  // ── T_FIX6–T_FIX10: Reject pattern black-box ────────────────────────────────

  test('T_FIX6 — Sonraki satırlar yalnızca form etiketlerinden oluşuyorsa title yakalanmaz', () => {
    const text = [
      'Mükellef Adı',
      'Adı (Unvanın Devamı)',    // form etiketi → reject
      'Vergi Kimlik Numarası',   // metadata → reject
      '',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeNull()
  })

  test('T_FIX7 — Sonraki satır e-posta adresi ise title olarak alınmaz', () => {
    const text = [
      'Mükellef Unvanı',
      'info@testfirma.com.tr',   // e-posta → reject
      'Vergi Dairesi: İstanbul',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeNull()
  })

  test('T_FIX8 — Sonraki satır TR formatlı sayı ("1.234.567,89") ise title olarak alınmaz', () => {
    const text = [
      'Mükellef Unvanı',
      '1.234.567,89',            // TR formatlı sayı → reject
      '',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeNull()
  })

  test('T_FIX9 — 10 haneli sayı aday olarak reddedilir, title yakalanmaz', () => {
    const text = [
      'Mükellef Adı',
      '1234567890',              // 10 haneli sayı → /^\d+$/ → reject
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeNull()
    // VKN de yakalanmaz (lookahead boş — "vergi kimlik" sonraki satırlarda yok)
    expect(result.taxNumber).toBeNull()
  })

  test('T_FIX10 — COMPANY_SUFFIX_RE: suffix ilk sıradaysa sıralama düzeltilir', () => {
    const text = [
      'Mükellef Adı',
      'ANONİM ŞİRKETİ',         // suffix → index 0
      'TEST FİRMASI',            // ad parçası → index 1
      '0,00',                    // sayı → reject
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeTruthy()
    // İsim önce, suffix sonra
    expect(result.title).toContain('TEST')
    expect(result.title).toContain('ANONİM')
    // Sıralama: "TEST FİRMASI ANONİM ŞİRKETİ"
    expect(result.title!.indexOf('TEST')).toBeLessThan(result.title!.indexOf('ANONİM'))
  })

  // ── T_FIX11–T_FIX13: VKN pattern varyantları ────────────────────────────────

  test('T_FIX11 — Çok satırlı VKN: "Vergi Kimlik No:\\n1234567890" → taxNumber', () => {
    const text = 'Başlık\nVergi Kimlik No:\n1234567890\nMükellef'
    const result = parseTaxIdentity(text)
    expect(result.taxNumber).toBe('1234567890')
  })

  test('T_FIX12 — Bitişik VKN: "Vergi Kimlik No1234567890" → taxNumber', () => {
    const text = 'Başlık\nVergi Kimlik No1234567890\n'
    const result = parseTaxIdentity(text)
    expect(result.taxNumber).toBe('1234567890')
  })

  test('T_FIX13 — Label-öncesi VKN (DEKAM yapısı): değer önce, etiket sonra → taxNumber', () => {
    const text = [
      'Form başlığı',
      '9876543210',              // VKN değeri (etiket ÖNCE)
      'Ara metin satır 1',
      'Ara metin satır 2',
      'Vergi Kimlik Numarası',   // etiket (değerden SONRA)
      'Başka içerik',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.taxNumber).toBe('9876543210')
  })

  // ── T_FIX14: Digit boundary ─────────────────────────────────────────────────

  test('T_FIX14 — 11 haneli sayı VKN olmaz; "Vergi Kimlik Numarası" TC lookahead tetiklemez', () => {
    const text = [
      '12345678901',             // 11 hane — VKN değil
      'Vergi Kimlik Numarası',   // VKN etiketi — TC lookahead /tc kimlik|kimlik no/ eşleşmez
      '',
    ].join('\n')
    const result = parseTaxIdentity(text)
    // 11 haneli sayı label-öncesi (/^\d{10}$/ → FAIL) ve classic (?!\d) koruması
    expect(result.taxNumber).toBeNull()
    // "Vergi Kimlik Numarası" norm'u "tc kimlik" veya "kimlik no" içermiyor → TC de yakalanmaz
    expect(result.tcKimlik).toBeNull()
  })

  // ── T_FIX15: SMMM bloğu izolasyonu ─────────────────────────────────────────

  test('T_FIX15 — DEKAM 2024: mükellef VKN yakalanır, SMMM VKN (11514125066) alınmaz', () => {
    const result = parseTaxIdentity(dekam2024.rawText)
    // Mükellef VKN
    expect(result.taxNumber).toBe('2731120400')
    // SMMM VKN'si (11514125066) TC kimlik olarak da alınmamalı
    expect(result.tcKimlik).toBeNull()
  })

})

// ─── parseTaxIdentity — Faz 7.3.50A.3.2 Hotfix (1001A GVB + Şahıs) ──────────
//
// T_FIX16–T_FIX18: ENES 1001A inline fixture (TC label-öncesi + şahıs title)
// T_FIX19–T_FIX21: Title birleştirme edge-case'leri
// T_FIX22–T_FIX23: TC label-öncesi çeşitli label formatları
// T_FIX24        : DEKAM regresyon — tcKimlik = null korunur
// T_FIX25        : Eski TC format (TC_PATS classic) koruma

describe('parseTaxIdentity — Faz 7.3.50A.3.2 Hotfix', () => {

  // ── ENES 1001A sentetik fixture (K3 ile doğrulanmış yapı) ───────────────────
  const ENES_1001A = [
    'YILLIK GELİR VERGİSİ BEYANNAMESİ',
    '1001A',
    ' Soyadı (Unvanı)',
    ' Adı (Unvanın Devamı)',
    ' Ticaret Sicil No İrtibat Tel No',
    ' E-Posta Adresi',
    '35356829180',              // TC kimlik (etiket ÖNCE gelir — label-öncesi yapı)
    'ATLI',                     // Soyadı
    'ENES',                     // Adı
    '772343-0 216 4718228',
    'enes.atli877@gmail.com',
    'Vergi Kimlik Numarası (TC Kimlik No)',  // bileşik etiket — "tc kimlik" içerir
  ].join('\n')

  // ── T_FIX16–T_FIX18: ENES 1001A ────────────────────────────────────────────

  test('T_FIX16 — ENES 1001A: TC kimlik "35356829180" tespit edilir (label-öncesi yapı)', () => {
    const result = parseTaxIdentity(ENES_1001A)
    expect(result.tcKimlik).toBe('35356829180')
  })

  test('T_FIX17 — ENES 1001A: title "ATLI" ve "ENES" içerir (şahıs birleştirme)', () => {
    const result = parseTaxIdentity(ENES_1001A)
    expect(result.title).toBeTruthy()
    expect(result.title).toContain('ATLI')
    expect(result.title).toContain('ENES')
  })

  test('T_FIX18 — ENES 1001A: sourceConfidence = HIGH (tcKimlik set)', () => {
    const result = parseTaxIdentity(ENES_1001A)
    expect(result.sourceConfidence).toBe('HIGH')
  })

  // ── T_FIX19–T_FIX21: Title birleştirme edge-case'leri ──────────────────────

  test('T_FIX19 — Şahıs: personal context + 2 name candidate → title birleştirme yapılır', () => {
    const text = [
      ' Soyadı (Unvanı)',    // personal context trigger
      'YILMAZ',
      'MEHMET',
      '35356829180',
      'Vergi Kimlik Numarası (TC Kimlik No)',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.title).toBeTruthy()
    expect(result.title).toContain('YILMAZ')
    expect(result.title).toContain('MEHMET')
  })

  test('T_FIX20 — Non-personal context (mukellef adi) + 2 name-like candidate → birleştirme yok', () => {
    const text = [
      'Mükellef Adı',         // NOT personal context (/soyadi unvani/ eşleşmez)
      'YILMAZ',
      'MEHMET',
    ].join('\n')
    const result = parseTaxIdentity(text)
    // title sadece ilk aday olmalı (birleştirme yapılmaz)
    expect(result.title).toBe('YILMAZ')
  })

  test('T_FIX21 — Personal context ama digit içeren aday: looksLikeName false → birleştirme yok', () => {
    const text = [
      ' Soyadı (Unvanı)',     // personal context
      'YILMAZ3',              // rakam içeriyor → looksLikeName = false
      'MEHMET',
    ].join('\n')
    const result = parseTaxIdentity(text)
    // looksLikeName false olduğu için birleştirilmez — ilk aday
    expect(result.title).toBe('YILMAZ3')
  })

  // ── T_FIX22–T_FIX23: TC label-öncesi çeşitli label formatları ──────────────

  test('T_FIX22 — TC label-öncesi: bileşik "Vergi Kimlik Numarası (TC Kimlik No)" → tcKimlik', () => {
    const text = [
      'Form başlığı',
      '11111111111',                          // 11-digit TC değeri
      'Ara metin',
      'Vergi Kimlik Numarası (TC Kimlik No)', // "tc kimlik" içerir
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.tcKimlik).toBe('11111111111')
  })

  test('T_FIX23 — TC label-öncesi: "Kimlik No" etiketi → tcKimlik', () => {
    const text = [
      'Form başlığı',
      '22222222222',   // 11-digit TC değeri
      'Ara metin',
      'Kimlik No',     // "kimlik no" içerir
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.tcKimlik).toBe('22222222222')
  })

  // ── T_FIX24: DEKAM regresyon ─────────────────────────────────────────────────

  test('T_FIX24 — DEKAM 2024 regresyon: mükellef bloğunda 11 hane yok → tcKimlik = null', () => {
    const result = parseTaxIdentity(dekam2024.rawText)
    expect(result.tcKimlik).toBeNull()
    // VKN korunur
    expect(result.taxNumber).toBe('2731120400')
  })

  // ── T_FIX25: Eski TC format (TC_PATS classic) koruma ────────────────────────

  test('T_FIX25 — Eski TC format: "Kimlik No: 12345678901" classic TC_PATS ile yakalanır', () => {
    const text = [
      'Vergi Dairesi: Mersin',
      'Kimlik No: 12345678901',  // TC_PATS[1]: /kimlik\s+no[su]?[\s:]*/
      'Mükellef',
    ].join('\n')
    const result = parseTaxIdentity(text)
    expect(result.tcKimlik).toBe('12345678901')
    expect(result.sourceConfidence).toBe('HIGH')
  })

})
