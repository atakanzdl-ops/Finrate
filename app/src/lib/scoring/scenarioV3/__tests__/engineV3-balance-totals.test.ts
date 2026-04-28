/**
 * buildV3BalanceTotals — bilanço toplamları unit testleri (Faz 7.3.4B0)
 *
 * Kontra hesap invariantı: balances POZİTİF MUTLAK (Faz 7.3.4A invariant'ı).
 * 257/268/580/591/103/158 spesifik kontra düşürme doğrulaması.
 * Snapshot ALINMAZ. Assertion-based.
 */

import { buildV3BalanceTotals } from '../engineV3'

// ─── Senaryo 1 — DEKAM 2022 Yeni 40+ Hesap ───────────────────────────────────
// Gerçek DEKAM 2022 KV beyannamesi hesap bakiyeleri (POZİTİF MUTLAK)

describe('buildV3BalanceTotals — Senaryo 1: DEKAM 2022 gerçek 40+ hesap', () => {
  const balances: Record<string, number> = {
    100: 16032.11,  102: 4402.58,
    120: 5736333.89, 121: 6055000.00, 126: 661499.00, 128: 1457000.00,
    131: 15421786.74, 132: 209894.06, 136: 381998.94,
    151: 45798525.78, 152: 1560093.91, 159: 85239114.54,
    180: 1097681.71,
    190: 7788014.59,
    254: 3662492.67, 255: 842242.44, 257: 552171.98,
    260: 4573556.00, 268: 467855.60,
    280: 11780.46,
    300: 10405490.22, 301: 2723544.20, 302: 265969.36, 309: 19107.14,
    320: 6660187.65, 321: 37446425.00, 326: 24179.10,
    335: 134927.18, 340: 118734229.12,
    360: 271953.28, 361: 106856.04,
    400: 228986.20,
    500: 3500000.00, 580: 134645.49, 591: 357848.44,
  }

  let totals: ReturnType<typeof buildV3BalanceTotals>

  beforeAll(() => {
    totals = buildV3BalanceTotals(balances)
  })

  it('fixedAssets ≈ 8.07M — 257/268 doğru çıkarılıyor', () => {
    // 254+255+260+280 - 257 - 268
    // = 3,662,492.67 + 842,242.44 + 4,573,556.00 + 11,780.46 - 552,171.98 - 467,855.60
    // = 8,070,043.99
    expect(totals.fixedAssets).toBeCloseTo(8_070_043.99, 0)
  })

  it('totalEquity ≈ 3.01M — 580/591 doğru çıkarılıyor', () => {
    // 500 - 580 - 591 = 3,500,000 - 134,645.49 - 357,848.44 = 3,007,506.07
    expect(totals.totalEquity).toBeCloseTo(3_007_506.07, 0)
  })

  it('currentAssets ≈ 171.43M', () => {
    expect(totals.currentAssets).toBeCloseTo(171_427_377.85, 0)
  })

  it('totalAssets ≈ 179.50M', () => {
    expect(totals.totalAssets).toBeCloseTo(179_497_421.84, 0)
  })

  it('stLiabilities ≈ 176.26M — 302/371 doğru çıkarılıyor', () => {
    // shortTermFinancialDebt = 300+301+309 - 302 = 12,882,172.20
    // tradePayables = 320+321+326 = 44,130,791.75
    // otherShortTermPayables = 335 = 134,927.18
    // advancesReceived = 340 = 118,734,229.12
    // taxPayables = 360+361 = 378,809.32
    // toplam ≈ 176,260,929.57
    expect(totals.stLiabilities).toBeCloseTo(176_260_929.57, 0)
  })

  it('ltLiabilities ≈ 228,986 (sadece 400)', () => {
    expect(totals.ltLiabilities).toBeCloseTo(228_986.20, 0)
  })

  it('cashBalance = 20,434.69 (100+102, no 103)', () => {
    expect(totals.cashBalance).toBeCloseTo(20_434.69, 0)
  })

  it('inventory = 47,358,619.69 (151+152, no 158)', () => {
    // 45,798,525.78 + 1,560,093.91 = 47,358,619.69
    expect(totals.inventory).toBeCloseTo(47_358_619.69, 0)
  })

  it('totalAssets = currentAssets + fixedAssets (iç tutarlılık)', () => {
    expect(totals.totalAssets).toBeCloseTo(totals.currentAssets + totals.fixedAssets, 0)
  })

  it('totalLiabilities = stLiabilities + ltLiabilities (iç tutarlılık)', () => {
    expect(totals.totalLiabilities).toBeCloseTo(totals.stLiabilities + totals.ltLiabilities, 0)
  })
})

// ─── Senaryo 2 — DEKAM 2022 Sentetik 20 Regression ───────────────────────────

describe('buildV3BalanceTotals — Senaryo 2: DEKAM 2022 sentetik 20 regression', () => {
  const balances: Record<string, number> = {
    102: 20434.69, 120: 13909832.89, 136: 16013679.74, 153: 132597734.23,
    252: 3952563.13, 300: 12882172.20, 320: 44130791.75, 340: 118734229.12,
    500: 3500000, 580: 134645.49, 591: 357848.44,
  }

  it('totalEquity yeni doğru: 3,007,506.07 (eski yanlış: 3,992,493.93)', () => {
    const { totalEquity } = buildV3BalanceTotals(balances)
    // Eski yanlış: sumByPrefix('5') = 500 + 580 + 591 = 3,992,493.93
    // Yeni doğru: 500 - 580 - 591 = 3,007,506.07
    expect(totalEquity).toBeCloseTo(3_007_506.07, 0)
    expect(totalEquity).not.toBeCloseTo(3_992_493.93, 0)
  })

  it('580 ve 591 çıkarılıyor, artı eklenmez', () => {
    const { totalEquity } = buildV3BalanceTotals(balances)
    expect(totalEquity).toBeLessThan(3_500_000)
  })
})

// ─── Senaryo 3 — Sıfır Kontra ─────────────────────────────────────────────────

describe('buildV3BalanceTotals — Senaryo 3: sıfır kontra', () => {
  it('cashBalance = 1000, totalEquity = 1000 — kontra yoksa etkilenmez', () => {
    const balances = { 100: 1000, 500: 1000 }
    const { cashBalance, totalEquity } = buildV3BalanceTotals(balances)
    expect(cashBalance).toBe(1000)
    expect(totalEquity).toBe(1000)
  })
})

// ─── Senaryo 4 — Sadece Pozitif ───────────────────────────────────────────────

describe('buildV3BalanceTotals — Senaryo 4: sadece pozitif hesaplar', () => {
  it('currentAssets = 8000, totalEquity = 8000', () => {
    const balances = { 102: 5000, 120: 3000, 500: 8000 }
    const { currentAssets, totalEquity } = buildV3BalanceTotals(balances)
    expect(currentAssets).toBe(8000)
    expect(totalEquity).toBe(8000)
  })
})

// ─── Senaryo 5 — Negatif Özkaynak ────────────────────────────────────────────

describe('buildV3BalanceTotals — Senaryo 5: negatif özkaynak (özkaynak erimesi)', () => {
  it('totalEquity = -150 (500=100, 580=200, 591=50)', () => {
    const balances = { 500: 100, 580: 200, 591: 50 }
    const { totalEquity } = buildV3BalanceTotals(balances)
    // 100 - 200 - 50 = -150
    expect(totalEquity).toBe(-150)
  })
})

// ─── Senaryo 6 — 103 Verilen Çekler Düşürme ──────────────────────────────────

describe('buildV3BalanceTotals — Senaryo 6: 103 verilen çekler düşürülür', () => {
  it('cashBalance = 12,000 (100+102 - 103)', () => {
    const balances = { 100: 5000, 102: 10000, 103: 3000 }
    const { cashBalance } = buildV3BalanceTotals(balances)
    // 5000 + 10000 - 3000 = 12000
    expect(cashBalance).toBe(12000)
  })
})

// ─── Senaryo 7 — 158 Stok Karşılığı Düşürme ─────────────────────────────────

describe('buildV3BalanceTotals — Senaryo 7: 158 stok değer düşüklüğü karşılığı düşürülür', () => {
  it('inventory = 45,000 (153 - 158)', () => {
    const balances = { 153: 50000, 158: 5000 }
    const { inventory } = buildV3BalanceTotals(balances)
    // 50000 - 5000 = 45000
    expect(inventory).toBe(45000)
  })
})

// ─── Senaryo 8 — buildProductivityInput kontra düzeltme doğrulama ─────────────
// buildProductivityInput artık:
//   cashAndEquivalents = totals.cashBalance  (103 düşülür)
//   inventory          = totals.inventory    (158 düşülür)
//   fixedAssetsNet     = signedSumByCodes(250-259, [257], b) (257 düşülür)
// Bu test buildV3BalanceTotals aracılığıyla aynı formüllerin doğru çalıştığını kanıtlar.

describe('buildV3BalanceTotals — Senaryo 8: buildProductivityInput kontra fix', () => {
  const balances: Record<string, number> = {
    100: 5000, 102: 10000, 103: 3000,     // cashBalance = 12000
    153: 50000, 158: 8000,                 // inventory   = 42000
    254: 3000000, 255: 500000, 257: 200000, // tangibleNet = 3300000
  }

  it('cashBalance (103 düşülür): 5000+10000-3000 = 12000', () => {
    const { cashBalance } = buildV3BalanceTotals(balances)
    expect(cashBalance).toBe(12000)
  })

  it('inventory (158 düşülür): 50000-8000 = 42000', () => {
    const { inventory } = buildV3BalanceTotals(balances)
    expect(inventory).toBe(42000)
  })

  it('fixedAssets (257 düşülür): 3000000+500000-200000 = 3300000', () => {
    // tangibleAssets = 254+255 - 257 = 3,300,000
    // intangibleAssets = 0, otherNonCurrentAssets = 0
    const { fixedAssets } = buildV3BalanceTotals(balances)
    expect(fixedAssets).toBe(3300000)
  })

  it('eski yanlış davranış regression: 103 artı EKLENMİYOR', () => {
    // Eski sumByCodes([100,101,102,103,108]) = 5000+10000+3000 = 18000
    // Yeni totals.cashBalance = 12000
    const { cashBalance } = buildV3BalanceTotals(balances)
    expect(cashBalance).not.toBe(18000)
    expect(cashBalance).toBe(12000)
  })

  it('eski yanlış davranış regression: 158 artı EKLENMİYOR', () => {
    // Eski sumByCodes([150,151,152,153]) = 50000 (158 eksikti ama kontra sayılıyordu)
    // Yeni totals.inventory = 50000 - 8000 = 42000
    const { inventory } = buildV3BalanceTotals(balances)
    expect(inventory).not.toBe(50000)
    expect(inventory).toBe(42000)
  })
})
