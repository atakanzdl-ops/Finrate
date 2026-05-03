/**
 * excel.ts MIZAN_MAP genişleme testleri (Faz 7.3.15)
 *
 * Kapsam:
 *   43x — UV Diğer Borçlar + 437 kontra
 *   42x — UV Ticari Borçlar + 422 kontra
 *   19x — Diğer Dönen Varlıklar alt kodlar
 *   52x — Sermaye Yedekleri alt kodlar
 *   54x — Kâr Yedekleri
 *   parseMizanRows → docType: 'MIZAN'
 *
 * Mock: @/lib/scoring/reversalMap → pass-through (test odağı dışı)
 */

jest.mock('@/lib/scoring/reversalMap', () => ({
  reclassifyAccounts: jest.fn((accounts: Array<{ code: string; amount: number }>) => ({
    accounts,
    reversals: [],
  })),
}))

import { parseMizanRows } from './excel'

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Standart mizan formatında header + veri satırları üretir.
 * Header: "Hesap Kodu" | "Hesap Adı" | "Bakiye Borç" | "Bakiye Alacak"
 *
 * parseMizanRows → Object.keys(fields).length < 3 ise [] döner.
 * Bu yüzden her test için 3 nötr baz satır eklenir (121, 136, 153 — 10x/15x/5x gruplarıyla
 * çakışmaz, dolayısıyla 103 contra ve 2 haneli kod testleri güvenlidir).
 * Testler yalnızca ilgili alanı kontrol eder, baz satırlar sonucu etkilemez.
 */
function makeMizanRows(
  entries: Array<{ code: string; bakBorc?: number; bakAlacak?: number }>
): unknown[][] {
  const header = ['Hesap Kodu', 'Hesap Adı', 'Bakiye Borç', 'Bakiye Alacak']
  const baseRows: unknown[][] = [
    ['121', 'Alıcılar',        1, 0],   // tradeReceivables (12x grubunu işaretler)
    ['136', 'Diğer Alacaklar', 1, 0],   // otherReceivables (13x grubunu işaretler)
    ['153', 'Ticari Mal',      1, 0],   // inventory        (15x grubunu işaretler)
  ]
  const dataRows: unknown[][] = entries.map(e =>
    [e.code, `Hesap ${e.code}`, e.bakBorc ?? 0, e.bakAlacak ?? 0]
  )
  return [header, ...baseRows, ...dataRows]
}

// ─── SUITE ───────────────────────────────────────────────────────────────────

describe('parseMizanRows — 43x UV Diğer Borçlar', () => {

  test('431 bakAlacak → otherNonCurrentLiabilities', async () => {
    const rows = makeMizanRows([{ code: '431', bakAlacak: 5_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(5_000_000)
  })

  test('432 bakAlacak → otherNonCurrentLiabilities', async () => {
    const rows = makeMizanRows([{ code: '432', bakAlacak: 3_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(3_000_000)
  })

  test('433 bakAlacak → otherNonCurrentLiabilities', async () => {
    const rows = makeMizanRows([{ code: '433', bakAlacak: 1_200_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(1_200_000)
  })

  test('436 bakAlacak → otherNonCurrentLiabilities', async () => {
    const rows = makeMizanRows([{ code: '436', bakAlacak: 2_800_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(2_800_000)
  })

  test('431 + 437 kontra → otherNonCurrentLiabilities net', async () => {
    // 437: Borç Senetleri Reeskontu — bakBorç ile azaltır (_CB)
    const rows = makeMizanRows([
      { code: '431', bakAlacak: 5_000_000 },
      { code: '437', bakBorc:   500_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(4_500_000)
  })

  test('431 + 432 → otherNonCurrentLiabilities birikir', async () => {
    const rows = makeMizanRows([
      { code: '431', bakAlacak: 3_000_000 },
      { code: '432', bakAlacak: 2_000_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(5_000_000)
  })
})

describe('parseMizanRows — 42x UV Ticari Borçlar', () => {

  test('420 bakAlacak → longTermTradePayables', async () => {
    const rows = makeMizanRows([{ code: '420', bakAlacak: 4_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(4_000_000)
  })

  test('421 bakAlacak → longTermTradePayables', async () => {
    const rows = makeMizanRows([{ code: '421', bakAlacak: 1_500_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(1_500_000)
  })

  test('426 bakAlacak → longTermTradePayables', async () => {
    const rows = makeMizanRows([{ code: '426', bakAlacak: 2_500_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(2_500_000)
  })

  test('429 bakAlacak → longTermTradePayables', async () => {
    const rows = makeMizanRows([{ code: '429', bakAlacak: 800_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(800_000)
  })

  test('420 + 422 kontra → longTermTradePayables net', async () => {
    // 422: Alacak Senetleri Reeskontu — bakBorç ile azaltır (_CB)
    const rows = makeMizanRows([
      { code: '420', bakAlacak: 4_000_000 },
      { code: '422', bakBorc:   400_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(3_600_000)
  })
})

describe('parseMizanRows — 19x Diğer Dönen Varlıklar alt kodlar', () => {

  test('191 bakBorç → otherCurrentAssets', async () => {
    const rows = makeMizanRows([{ code: '191', bakBorc: 200_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherCurrentAssets).toBe(200_000)
  })

  test('195 bakBorç → otherCurrentAssets', async () => {
    const rows = makeMizanRows([{ code: '195', bakBorc: 150_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherCurrentAssets).toBe(150_000)
  })

  test('196, 197, 198 → otherCurrentAssets birikir', async () => {
    const rows = makeMizanRows([
      { code: '196', bakBorc: 100_000 },
      { code: '197', bakBorc: 200_000 },
      { code: '198', bakBorc: 300_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherCurrentAssets).toBe(600_000)
  })

  test('190 + 191 birikir', async () => {
    // 190 zaten mevcut, 191 yeni — ikisi toplanmalı
    const rows = makeMizanRows([
      { code: '190', bakBorc: 500_000 },
      { code: '191', bakBorc: 250_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherCurrentAssets).toBe(750_000)
  })
})

describe('parseMizanRows — 52x Sermaye Yedekleri alt kodlar', () => {

  test('520 bakAlacak → capitalReserves', async () => {
    const rows = makeMizanRows([{ code: '520', bakAlacak: 1_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.capitalReserves).toBe(1_000_000)
  })

  test('521, 522, 523, 524 → capitalReserves birikir', async () => {
    const rows = makeMizanRows([
      { code: '521', bakAlacak: 100_000 },
      { code: '522', bakAlacak: 200_000 },
      { code: '523', bakAlacak: 300_000 },
      { code: '524', bakAlacak: 400_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.capitalReserves).toBe(1_000_000)
  })

  test('520 + 529 birikir (529 zaten mevcuttu)', async () => {
    const rows = makeMizanRows([
      { code: '520', bakAlacak: 600_000 },
      { code: '529', bakAlacak: 400_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.capitalReserves).toBe(1_000_000)
  })
})

describe('parseMizanRows — 54x Kâr Yedekleri', () => {

  test('540 bakAlacak → profitReserves', async () => {
    const rows = makeMizanRows([{ code: '540', bakAlacak: 2_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.profitReserves).toBe(2_000_000)
  })

  test('541, 542, 548, 549 → profitReserves birikir', async () => {
    const rows = makeMizanRows([
      { code: '541', bakAlacak: 250_000 },
      { code: '542', bakAlacak: 250_000 },
      { code: '548', bakAlacak: 500_000 },
      { code: '549', bakAlacak: 1_000_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.profitReserves).toBe(2_000_000)
  })
})

describe('parseMizanRows — docType', () => {

  test('dönen sonuç docType: MIZAN içerir', async () => {
    const rows = makeMizanRows([
      { code: '100', bakBorc: 500_000 },
      { code: '150', bakBorc: 300_000 },
      { code: '500', bakAlacak: 1_000_000 },
    ])
    const result = await parseMizanRows(rows)
    expect(result.length).toBeGreaterThan(0)
    expect(result[0]?.docType).toBe('MIZAN')
  })
})

// ─── Faz 7.3.16 — BUG 1: 103 Verilen Çekler contra ──────────────────────────

describe('parseMizanRows — 103 Verilen Çekler (cash contra)', () => {

  test('103 bakAlacak → cash azaltır (cash_CA)', async () => {
    const rows = makeMizanRows([
      { code: '100', bakBorc: 5_000_000 },
      { code: '103', bakAlacak: 500_000 },  // contra: 5M - 0.5M = 4.5M
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.cash).toBe(4_500_000)
  })

  test('103 bakBorç → cash etkilemez (contra sadece bakAlacak ile çalışır)', async () => {
    const rows = makeMizanRows([
      { code: '100', bakBorc: 3_000_000 },
      { code: '103', bakBorc: 300_000 },  // bakBorç — _CA suffix'de add(-ba) → ba=0 → etki yok
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.cash).toBe(3_000_000)
  })
})

// ─── Faz 7.3.16 — BUG 2: 2 haneli ana hesap kodu (ENES senaryosu) ────────────

describe('parseMizanRows — 2 haneli ana hesap kodu (MAIN_ACCOUNT_CANONICAL)', () => {

  test('"43" 2 haneli kod → otherNonCurrentLiabilities (436 kanonik)', async () => {
    // ENES senaryosu: mizan dosyasında "43" kodu var, 43x alt kodu yok
    const rows = makeMizanRows([{ code: '43', bakAlacak: 8_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(8_000_000)
  })

  test('"42" 2 haneli kod → longTermTradePayables (429 kanonik)', async () => {
    const rows = makeMizanRows([{ code: '42', bakAlacak: 3_500_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.longTermTradePayables).toBe(3_500_000)
  })

  test('"10" 2 haneli kod → cash (100 kanonik)', async () => {
    const rows = makeMizanRows([{ code: '10', bakBorc: 2_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.cash).toBe(2_000_000)
  })

  test('"43" 2 haneli + "431" alt kod → 2 haneli atlanır, 431 işlenir', async () => {
    // Geçiş 1 "431" görür → groupHasSubcode "43" ekler → "43" satırı atlanır
    const rows = makeMizanRows([
      { code: '43',  bakAlacak: 99_999_000 }, // atlanmalı (alt kod var)
      { code: '431', bakAlacak:  5_000_000 }, // işlenmeli
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(5_000_000)
  })

  test('"50" 2 haneli kod → paidInCapital (500 kanonik)', async () => {
    const rows = makeMizanRows([{ code: '50', bakAlacak: 10_000_000 }])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.paidInCapital).toBe(10_000_000)
  })

  test('ENES sentez: 43+431+437 karışık → net otherNonCurrentLiabilities', async () => {
    // Gerçek senaryo: "43" (8M bakAlacak) var ama "431" de var → "43" atlanır
    // Ek olarak "437" kontra (500K bakBorç) → net 5M - 500K = 4.5M
    const rows = makeMizanRows([
      { code: '43',  bakAlacak: 99_000_000 }, // atlanmalı
      { code: '431', bakAlacak:  5_000_000 }, // işlenmeli
      { code: '437', bakBorc:      500_000 }, // kontra _CB
    ])
    const result = await parseMizanRows(rows)
    expect(result[0]?.fields?.otherNonCurrentLiabilities).toBe(4_500_000)
  })
})
