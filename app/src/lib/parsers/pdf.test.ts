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

import { detectPdfType, extractTdhpRawAccountsFromText, parseEkSection } from './pdf'

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
