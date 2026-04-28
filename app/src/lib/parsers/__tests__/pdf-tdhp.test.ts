/**
 * TDHP ayrıntılı bilanço/gelir tablosu parser testleri
 * Fixture'lar gerçek DEKAM PDF'lerinden (2022/2023/2024) extract edilmiştir.
 */

import { extractTdhpRawAccountsFromText } from '../pdf'
import dekam2022 from '../__fixtures__/dekam-2022-kv.json'
import dekam2023 from '../__fixtures__/dekam-2023-kv.json'
import dekam2024 from '../__fixtures__/dekam-2024-kv.json'

type Fixture = {
  rawText: string
  expectedAccounts: Array<{ code: string; amount: number }>
}

function asFixture(f: unknown): Fixture {
  return f as Fixture
}

describe('extractTdhpRawAccountsFromText', () => {

  // ─── DEKAM 2022 ────────────────────────────────────────────────────────────
  // 2022: Zarar yılı — 591=357848.44, 580=134645.49, 590 YOK

  describe('dekam 2022 — temel bilanço + gelir tablosu', () => {
    const fx = asFixture(dekam2022)
    let result: Array<{ code: string; amount: number }>

    beforeAll(() => {
      result = extractTdhpRawAccountsFromText(fx.rawText)
    })

    it('beklenen tüm hesap kodlarını üretir', () => {
      const resultMap = new Map(result.map(r => [r.code, r.amount]))
      for (const exp of fx.expectedAccounts) {
        expect(resultMap.has(exp.code)).toBe(true)
        expect(resultMap.get(exp.code)).toBeCloseTo(exp.amount, -1)
      }
    })

    it('tüm amount değerleri > 0 (pozitif mutlak)', () => {
      for (const acc of result) {
        expect(acc.amount).toBeGreaterThan(0)
      }
    })

    it('2022 zararla kapandı: 591 üretilir, 590 üretilmez', () => {
      expect(result.find(r => r.code === '591')).toBeDefined()
      expect(result.find(r => r.code === '590')).toBeUndefined()
    })

    it('591 (dönem net zararı) pozitif mutlak', () => {
      const acc = result.find(r => r.code === '591')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('580 (geçmiş yıllar zararları) pozitif mutlak', () => {
      const acc = result.find(r => r.code === '580')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('257 (birikmiş amortisman MDV) pozitif', () => {
      const acc = result.find(r => r.code === '257')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('620 (satılan mamuller maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '620')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('621 (satılan ticari mallar maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '621')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('622 (satılan hizmet maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '622')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('632 (genel yönetim giderleri) pozitif', () => {
      const acc = result.find(r => r.code === '632')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('660 (kısa vadeli borçlanma giderleri) pozitif', () => {
      const acc = result.find(r => r.code === '660')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('126 (verilen depozito, dönen) doğru üretilir', () => {
      const acc = result.find(r => r.code === '126')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('190 (devreden KDV) üretilir', () => {
      const acc = result.find(r => r.code === '190')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('360 (ödenecek vergi ve fonlar) üretilir', () => {
      const acc = result.find(r => r.code === '360')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('361 (ödenecek sosyal güvenlik) üretilir', () => {
      const acc = result.find(r => r.code === '361')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('158 üretilmedi (2022 stok değer düşüklüğü yok)', () => {
      expect(result.find(r => r.code === '158')).toBeUndefined()
    })

    it('692 üretilmez (SKIP)', () => {
      expect(result.find(r => r.code === '692')).toBeUndefined()
    })

    it('code deduplication — aynı kod en fazla 1 kez', () => {
      const codes = result.map(r => r.code)
      const unique = new Set(codes)
      expect(codes.length).toBe(unique.size)
    })
  })

  // ─── DEKAM 2023 ────────────────────────────────────────────────────────────
  // 2023: Zarar yılı — 591=352542.83, 580=492493.93, 590 YOK
  // Devreden KDV: 190 (191 değil)

  describe('dekam 2023 — devreden KDV, 580/591, SATIS_MALIYETI', () => {
    const fx = asFixture(dekam2023)
    let result: Array<{ code: string; amount: number }>

    beforeAll(() => {
      result = extractTdhpRawAccountsFromText(fx.rawText)
    })

    it('beklenen tüm hesap kodlarını üretir', () => {
      const resultMap = new Map(result.map(r => [r.code, r.amount]))
      for (const exp of fx.expectedAccounts) {
        expect(resultMap.has(exp.code)).toBe(true)
        expect(resultMap.get(exp.code)).toBeCloseTo(exp.amount, -1)
      }
    })

    it('tüm amount değerleri > 0 (pozitif mutlak)', () => {
      for (const acc of result) {
        expect(acc.amount).toBeGreaterThan(0)
      }
    })

    it('190 (devreden KDV) üretilir', () => {
      const acc = result.find(r => r.code === '190')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('580 (geçmiş yıllar zararları) pozitif mutlak', () => {
      const acc = result.find(r => r.code === '580')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('591 (dönem net zararı) pozitif mutlak', () => {
      const acc = result.find(r => r.code === '591')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('2023 zararla kapandı: 590 üretilmez', () => {
      expect(result.find(r => r.code === '590')).toBeUndefined()
    })

    it('590/591 karşılıklı dışlama — ikisi aynı anda üretilmez', () => {
      const has590 = !!result.find(r => r.code === '590')
      const has591 = !!result.find(r => r.code === '591')
      expect(has590 && has591).toBe(false)
    })

    it('621 (satılan ticari mallar maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '621')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('622 (satılan hizmet maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '622')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('632 (genel yönetim giderleri) pozitif', () => {
      const acc = result.find(r => r.code === '632')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('660 (kısa vadeli borçlanma giderleri) pozitif', () => {
      const acc = result.find(r => r.code === '660')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('400 (UV banka kredileri) üretilir', () => {
      const acc = result.find(r => r.code === '400')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('360 (ödenecek vergi ve fonlar) üretilir', () => {
      const acc = result.find(r => r.code === '360')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('361 (ödenecek sosyal güvenlik) üretilir', () => {
      const acc = result.find(r => r.code === '361')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('692 üretilmez (SKIP)', () => {
      expect(result.find(r => r.code === '692')).toBeUndefined()
    })

    it('code deduplication — aynı kod en fazla 1 kez', () => {
      const codes = result.map(r => r.code)
      const unique = new Set(codes)
      expect(codes.length).toBe(unique.size)
    })
  })

  // ─── DEKAM 2024 ────────────────────────────────────────────────────────────
  // 2024: Kâr yılı — 590=22097244.29, 591 YOK
  // 350 ve 358 her ikisi de 46896296.36 (gerçek PDF verisi — aynı tutar mümkün)

  describe('dekam 2024 — 350/358 ayrımı, enflasyon düzeltmesi, 590 kâr', () => {
    const fx = asFixture(dekam2024)
    let result: Array<{ code: string; amount: number }>

    beforeAll(() => {
      result = extractTdhpRawAccountsFromText(fx.rawText)
    })

    it('beklenen tüm hesap kodlarını üretir', () => {
      const resultMap = new Map(result.map(r => [r.code, r.amount]))
      for (const exp of fx.expectedAccounts) {
        expect(resultMap.has(exp.code)).toBe(true)
        expect(resultMap.get(exp.code)).toBeCloseTo(exp.amount, -1)
      }
    })

    it('tüm amount değerleri > 0 (pozitif mutlak)', () => {
      for (const acc of result) {
        expect(acc.amount).toBeGreaterThan(0)
      }
    })

    it('350 (hakedişler) ve 358 (enflasyon düzeltme) ayrı ayrı üretilir', () => {
      const acc350 = result.find(r => r.code === '350')
      const acc358 = result.find(r => r.code === '358')
      expect(acc350).toBeDefined()
      expect(acc358).toBeDefined()
      expect(acc350!.amount).toBeGreaterThan(0)
      expect(acc358!.amount).toBeGreaterThan(0)
    })

    it('2024 kârla kapandı: 590 üretilir, 591 üretilmez', () => {
      expect(result.find(r => r.code === '590')).toBeDefined()
      expect(result.find(r => r.code === '591')).toBeUndefined()
    })

    it('590 (dönem net karı) pozitif', () => {
      const acc = result.find(r => r.code === '590')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('590/591 karşılıklı dışlama — ikisi aynı anda üretilmez', () => {
      const has590 = !!result.find(r => r.code === '590')
      const has591 = !!result.find(r => r.code === '591')
      expect(has590 && has591).toBe(false)
    })

    it('502 (sermaye düzeltmesi olumlu farkları) üretilir', () => {
      const acc = result.find(r => r.code === '502')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('257 (birikmiş amortisman MDV) pozitif', () => {
      const acc = result.find(r => r.code === '257')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('268 (birikmiş amortisman MODV) pozitif', () => {
      const acc = result.find(r => r.code === '268')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('621 (satılan ticari mallar maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '621')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('622 (satılan hizmet maliyeti) pozitif', () => {
      const acc = result.find(r => r.code === '622')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('632 (genel yönetim giderleri) pozitif', () => {
      const acc = result.find(r => r.code === '632')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('660 (kısa vadeli borçlanma) pozitif', () => {
      const acc = result.find(r => r.code === '660')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('360 (ödenecek vergi ve fonlar) üretilir', () => {
      const acc = result.find(r => r.code === '360')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('361 (ödenecek sosyal güvenlik) üretilir', () => {
      const acc = result.find(r => r.code === '361')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('331 (ortaklara borçlar KV) üretilir', () => {
      const acc = result.find(r => r.code === '331')
      expect(acc).toBeDefined()
      expect(acc!.amount).toBeGreaterThan(0)
    })

    it('692 üretilmez (SKIP)', () => {
      expect(result.find(r => r.code === '692')).toBeUndefined()
    })

    it('code deduplication — aynı kod en fazla 1 kez', () => {
      const codes = result.map(r => r.code)
      const unique = new Set(codes)
      expect(codes.length).toBe(unique.size)
    })
  })

  // ─── Genel / Edge Case Testler ────────────────────────────────────────────

  describe('edge case — boş metin', () => {
    it('boş string için boş dizi döner', () => {
      expect(extractTdhpRawAccountsFromText('')).toEqual([])
    })

    it('sadece başlık içeren metin için boş dizi döner', () => {
      expect(extractTdhpRawAccountsFromText('KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024')).toEqual([])
    })
  })

  describe('edge case — negatif/parantezli tutarlar pozitife dönüştürülür', () => {
    it('parantezli tutar pozitif döner', () => {
      const text = `KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024\nAYRINTILI BİLANÇO\nI- DÖNEN VARLIKLAR\nA- Hazır Değerler\nKasa (125.000,00)\n`
      const result = extractTdhpRawAccountsFromText(text)
      const kasa = result.find(r => r.code === '100')
      expect(kasa).toBeDefined()
      expect(kasa!.amount).toBe(125000)
    })

    it('negatif işaretli tutar pozitif döner', () => {
      const text = `KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024\nAYRINTILI BİLANÇO\nI- DÖNEN VARLIKLAR\nA- Hazır Değerler\nKasa -250.000,00\n`
      const result = extractTdhpRawAccountsFromText(text)
      const kasa = result.find(r => r.code === '100')
      expect(kasa).toBeDefined()
      expect(kasa!.amount).toBe(250000)
    })
  })

  describe('edge case — 0 tutarlar yazılmaz', () => {
    it('0,00 tutarı olan satır atlanır', () => {
      const text = `KURUMLAR VERGİSİ BEYANNAMESİ\nYılı 2024\nAYRINTILI BİLANÇO\nI- DÖNEN VARLIKLAR\nA- Hazır Değerler\nKasa 0,00\nBankalar 1.000.000,00\n`
      const result = extractTdhpRawAccountsFromText(text)
      expect(result.find(r => r.code === '100')).toBeUndefined()
      expect(result.find(r => r.code === '102')).toBeDefined()
    })
  })
})
