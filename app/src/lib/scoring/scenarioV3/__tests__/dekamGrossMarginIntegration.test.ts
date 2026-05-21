/**
 * R4 — DEKAM Brüt Marj Entegrasyon Testleri (Gerçek Veri).
 *
 * DEKAM senaryo: CONSTRUCTION sektörü, netSales=328M, grossProfit=-22.5M (-%6.86)
 * Canlı bilanço (Atakan onayı) — Codex audit düzeltmesi.
 *
 * Tam yansıtılan R4 değişiklikler:
 *   - brüt zarar guard kaldırıldı (A12 + A20)
 *   - CONSTRUCTION benchmark = 0.18 (R4, KOBİ İnşaat)
 *   - half-gap formülü: (targetMargin - currentMargin) × netSales × 0.5
 *   - A20 cap: cogs × 0.30
 *   - A20 buildTransactions: 2 tx (102/621 + 690/590)
 *   - A18 customCheck: brüt zarar → elenir
 *
 * Hesaplama (gerçek DEKAM):
 *   currentMargin = -22_500_000 / 328_000_000 = -0.0686
 *   gap           = 0.18 + 0.0686 = 0.2486
 *   baseReduction = 0.2486 × 328_000_000 × 0.5 ≈ 40_770_000
 *   cogs          = 328_000_000 + 22_500_000 = 350_500_000
 *   A20 cap       = 350_500_000 × 0.30 = 105_150_000  (devreye girmez)
 *   A12 cap       = min(71_900_000×0.30=21.57M, 350.5M×0.20=70.1M) → 21.57M kısıtlayıcı
 *
 * Atakan reçetesi: ~39-41M A20 önerisi → uyumlu.
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import type { FirmContext, ActionBuildContext } from '../contracts'

const a12 = ACTION_CATALOG_V3['A12_GROSS_MARGIN_IMPROVEMENT']
const a18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
const a20 = ACTION_CATALOG_V3['A20_GROSS_MARGIN_REFORM']

// ─── Gerçek DEKAM firma profili (Canlı bilanço — Atakan onayı) ───────────────

const DEKAM_NET_SALES    = 328_000_000
const DEKAM_GROSS_PROFIT = -22_500_000         // -%6.86 (328M × 0.0686 ≈ 22.5M)
const DEKAM_COGS         = DEKAM_NET_SALES - DEKAM_GROSS_PROFIT   // 350_500_000

/** computeAmount için FirmContext */
function makeDekamCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'CONSTRUCTION',   // İnşaat (R4 benchmark = 0.18)
    accountBalances:   {
      '102': 93_000,              // Bankalar (çok düşük — gerçek)
      '320': 71_900_000,          // KV Ticari Borç (A12 tedarikçi cap için)
      '621': DEKAM_COGS,          // Satılan Mal Maliyeti
    },
    totalAssets:       361_000_000,
    totalEquity:        80_000_000,
    totalRevenue:      DEKAM_NET_SALES,
    netIncome:          -5_000_000,
    netSales:          DEKAM_NET_SALES,
    operatingProfit:    -3_000_000,
    grossProfit:       DEKAM_GROSS_PROFIT,
    costOfGoodsSold:   DEKAM_COGS,
    interestExpense:    10_000_000,
    operatingCashFlow: null,
    ...overrides,
  }
}

/** buildTransactions için ActionBuildContext */
function makeDekamBuildCtx(overrides: Partial<ActionBuildContext> = {}): ActionBuildContext {
  return {
    amount:          40_770_000,   // A20 gerçek DEKAM tutarı (~40.77M)
    sector:          'CONSTRUCTION',
    horizon:         'medium',
    analysis:        {},
    previousActions: [],
    ...overrides,
  }
}

// ─── Testler ─────────────────────────────────────────────────────────────────

describe('R4 — DEKAM -%6.86 Brüt Marj Entegrasyon Testleri (328M / CONSTRUCTION)', () => {

  // T1: A20 DEKAM → tutar döner (brüt zarar desteği R4)
  test('T1 — DEKAM A20 computeAmount: tutar döner (brüt zarar guard kaldırıldı)', () => {
    const result = a20.computeAmount!(makeDekamCtx())
    expect(result).not.toBeNull()
    expect(result).toBeGreaterThan(0)
  })

  // T2: A20 DEKAM → tam tutar hesabı
  test('T2 — DEKAM A20 computeAmount: ~40.77M (half-gap formülü, CONSTRUCTION %18)', () => {
    // currentMargin = -22.5M / 328M = -0.0686
    // gap = 0.18 + 0.0686 = 0.2486
    // baseReduction = 0.2486 × 328M × 0.5 ≈ 40_770_000
    // cogs = 350.5M; cap = 350.5M × 0.30 = 105.15M → cap devreye girmez
    // result ≈ 40.77M
    const result = a20.computeAmount!(makeDekamCtx())
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(38_000_000)
    expect(result!).toBeLessThan(43_000_000)
  })

  // T3: A20 DEKAM buildTransactions → 2 tx
  test('T3 — DEKAM A20 buildTransactions: 2 transaction döner (R4)', () => {
    const txs = a20.buildTransactions(makeDekamBuildCtx())
    expect(txs).toHaveLength(2)
  })

  // T4: A20 DEKAM tx[0] denklik — 102/621
  test('T4 — DEKAM A20 tx[0] denklik: 102 DEBIT = 621 CREDIT', () => {
    const txs = a20.buildTransactions(makeDekamBuildCtx())
    const tx0 = txs[0]
    expect(tx0.legs[0]).toMatchObject({ accountCode: '102', side: 'DEBIT'  })
    expect(tx0.legs[1]).toMatchObject({ accountCode: '621', side: 'CREDIT' })
    // Denklik
    const debit  = tx0.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx0.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T5: A20 DEKAM tx[1] denklik — 690/590
  test('T5 — DEKAM A20 tx[1] denklik: 690 DEBIT = 590 CREDIT', () => {
    const txs = a20.buildTransactions(makeDekamBuildCtx())
    const tx1 = txs[1]
    expect(tx1.legs[0]).toMatchObject({ accountCode: '690', side: 'DEBIT'  })
    expect(tx1.legs[1]).toMatchObject({ accountCode: '590', side: 'CREDIT' })
    // Denklik
    const debit  = tx1.legs.filter(l => l.side === 'DEBIT').reduce((s, l)  => s + l.amount, 0)
    const credit = tx1.legs.filter(l => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0)
    expect(debit).toBe(credit)
  })

  // T6: A12 DEKAM → tutar döner (brüt zarar desteği R4)
  test('T6 — DEKAM A12 computeAmount: tutar döner (320=71.9M)', () => {
    const result = a12.computeAmount!(makeDekamCtx())
    expect(result).not.toBeNull()
    expect(result).toBeGreaterThan(0)
  })

  // T7: A12 DEKAM → ~21.57M (supplier cap kısıtlayıcı)
  test('T7 — DEKAM A12 computeAmount: ~21.57M (320 supplier cap kısıtlayıcı)', () => {
    // maxFromSupplier = 71_900_000 × 0.30 = 21_570_000 ← kısıtlayıcı
    // maxFromCogs     = 350_500_000 × 0.20 = 70_100_000 → not constraining
    // baseReduction ≈ 40.77M → not constraining
    // result = 21_570_000
    const result = a12.computeAmount!(makeDekamCtx())
    expect(result!).toBeGreaterThan(20_000_000)
    expect(result!).toBeLessThan(23_000_000)
  })

  // T8: A18 DEKAM customCheck → pass: false (brüt zarar)
  test('T8 — DEKAM A18 customCheck: brüt zarar → pass: false', () => {
    const checkResult = a18.preconditions.customCheck!({
      sector:      'CONSTRUCTION',
      netSales:    DEKAM_NET_SALES,
      grossProfit: DEKAM_GROSS_PROFIT,   // -22.5M — brüt zarar
    })
    expect(checkResult.pass).toBe(false)
    // Ya brüt zarar guard ya da sektör altı marj nedeniyle eleniyor
    expect(typeof checkResult.reason).toBe('string')
    expect(checkResult.reason!.length).toBeGreaterThan(0)
  })

})
