/**
 * scoreAttribution unit testleri — Faz 2
 *
 * Test matrisi: 2 entity × 5 aksiyon = 10 senaryo
 *
 * DEKAM (İnşaat):   DSO ~208, DIO ~2207, objectiveScore ~17, subjective 23
 * Synthetic Trade:  DSO ~43,  DIO ~73,  objectiveScore ~45-55, subjective 20
 *
 * Her test:
 *   1. Etkilenen kategori(ler) pozitif delta
 *   2. objectiveDelta ≥ 0 (uygulanabilirse)
 *   3. combinedDelta ≥ 0 (uygulanabilirse — ceiling/floor gerçek combineScores())
 *   4. Snapshot (regresyon koruması)
 *
 * DEKAM A05 için bilinen üretim değeri:
 *   capped = 3,477,458 TL (min(8,618,789; 3,477,458))
 *   afterAR ≈ 10,432,375 TL
 */

import { computeScoreAttribution } from '../scoreAttribution'
import {
  DEKAM_INPUT, DEKAM_SECTOR, DEKAM_SUBJECTIVE_TOTAL,
  TRADE_INPUT, TRADE_SECTOR, TRADE_SUBJECTIVE_TOTAL,
} from '../__fixtures__/syntheticEntities'

// Codex Faz 4b audit notu: Bu test pre-4b davranışını doğrular,
// flag false olmalı. CI ortamında env "true" gelirse snapshot'lar kırılır.
beforeAll(() => {
  process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES = 'false'
})

afterAll(() => {
  delete process.env.ENABLE_SECTOR_THRESHOLD_OVERRIDES
})

// Sayısal hassasiyet eşiği
const DELTA_TOLERANCE = 0.5  // puan

// ──────────────────────────────────────────────────────────────────────────────
// YARDIMCI: sonuç özetini snapshot'a hazır formata çevir
// ──────────────────────────────────────────────────────────────────────────────

function summarise(r: ReturnType<typeof computeScoreAttribution>) {
  return {
    actionId:       r.actionId,
    applied:        r.applied,
    applyReason:    r.applyReason,
    beforeObjective: r.beforeObjective,
    afterObjective:  r.afterObjective,
    categoryDelta:   r.categoryDelta,
    objectiveDelta:  Math.round(r.objectiveDelta * 100) / 100,
    combinedDelta:   Math.round(r.combinedDelta * 100) / 100,
    ratingChange:    r.ratingChange,
    // AR değerleri (A05 doğrulama için)
    beforeAR: r.beforeInput.tradeReceivables,
    afterAR:  r.afterInput.tradeReceivables,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DEKAM (İNŞAAT) — 5 AKSİYON
// ══════════════════════════════════════════════════════════════════════════════

describe('DEKAM (İnşaat) × A05 — Alacak tahsilatı', () => {
  const result = computeScoreAttribution('A05', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)

  test('applied = true (DSO 208 > hedef 79 × 1.1 = 87)', () => {
    expect(result.applied).toBe(true)
  })

  test('afterAR ≈ 10.43 Mn (production realisticTarget değeri)', () => {
    // capped = min(8,618,789; 13,909,833 × 0.25 = 3,477,458) = 3,477,458
    // afterAR = 13,909,833 - 3,477,458 = 10,432,375
    expect(result.afterInput.tradeReceivables).toBeCloseTo(10_432_375, -3)
  })

  test('activity categoryDelta pozitif (DSO iyileşti)', () => {
    expect(result.categoryDelta.activity).toBeGreaterThan(0)
  })

  test('objectiveDelta ≥ 0', () => {
    expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('combinedDelta ≥ 0', () => {
    expect(result.combinedDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('DEKAM (İnşaat) × A06 — Stok devir hızı', () => {
  const result = computeScoreAttribution('A06', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)

  test('applied = true (DIO 2207 >> hedef 78)', () => {
    expect(result.applied).toBe(true)
  })

  test('inventory azaldı', () => {
    expect((result.afterInput.inventory ?? 0)).toBeLessThan(result.beforeInput.inventory ?? 0)
  })

  test('activity categoryDelta ≥ 0 (DIO 2420→1815 her iki değer badHigh=180 aşıyor → delta=0 beklenen)', () => {
    // DEKAM DIO aşırı yüksek: before 2420 gün, after 1815 gün.
    // hybridMetricScore (bad=180, good=60, lowerIsBetter) → her ikisi de badHigh aşıyor → skor=0.
    // Sıfır delta kabul: 25% cap tek seferlik iyileşme skor eşiğine ulaşamıyor.
    expect(result.categoryDelta.activity).toBeGreaterThanOrEqual(0)
  })

  test('objectiveDelta ≥ 0', () => {
    expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('DEKAM (İnşaat) × A10 — KV→UV borç dönüşümü', () => {
  const result = computeScoreAttribution('A10', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)

  test('applied = true (KV borç > 0)', () => {
    expect(result.applied).toBe(true)
  })

  test('shortTermFinancialDebt azaldı', () => {
    const before = result.beforeInput.shortTermFinancialDebt ?? 0
    const after  = result.afterInput.shortTermFinancialDebt  ?? 0
    expect(after).toBeLessThan(before)
  })

  test('totalCurrentLiabilities azaldı (cari oran iyileşir)', () => {
    const before = result.beforeInput.totalCurrentLiabilities ?? 0
    const after  = result.afterInput.totalCurrentLiabilities  ?? 0
    expect(after).toBeLessThan(before)
  })

  test('liquidity categoryDelta ≥ 0', () => {
    expect(result.categoryDelta.liquidity).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('DEKAM (İnşaat) × A12 — Sermaye artırımı', () => {
  const result = computeScoreAttribution('A12', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)

  test('applied = true (özkaynak > 0)', () => {
    expect(result.applied).toBe(true)
  })

  test('totalEquity arttı (%20)', () => {
    const before = result.beforeInput.totalEquity ?? 0
    const after  = result.afterInput.totalEquity  ?? 0
    expect(after).toBeCloseTo(before * 1.20, -3)
  })

  test('leverage categoryDelta pozitif (özkaynak arttı, borç/özkaynak düştü)', () => {
    expect(result.categoryDelta.leverage).toBeGreaterThan(0)
  })

  test('objectiveDelta ≥ 0', () => {
    expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('DEKAM (İnşaat) × A18 — Brüt marj iyileştirme', () => {
  const result = computeScoreAttribution('A18', DEKAM_INPUT, DEKAM_SUBJECTIVE_TOTAL, DEKAM_SECTOR)

  test('brüt marj durumuna göre applied kontrolü', () => {
    // DEKAM: grossMargin = 4,454,088/24,454,088 ≈ 0.182
    // Hedef: İnşaat benchmark 0.24, cap 5 puan → achievable = min(0.24, 0.182+0.05) = 0.232
    // 0.232 > 0.182 → uygulanabilir
    expect(result.applied).toBe(true)
  })

  test('grossProfit arttı', () => {
    const before = result.beforeInput.grossProfit ?? 0
    const after  = result.afterInput.grossProfit  ?? 0
    expect(after).toBeGreaterThan(before)
  })

  test('profitability categoryDelta pozitif', () => {
    expect(result.categoryDelta.profitability).toBeGreaterThan(0)
  })

  test('objectiveDelta > 0', () => {
    expect(result.objectiveDelta).toBeGreaterThan(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// SENTETİK TİCARET — 5 AKSİYON
// ══════════════════════════════════════════════════════════════════════════════

describe('Trade × A05 — Alacak tahsilatı', () => {
  const result = computeScoreAttribution('A05', TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)

  test('applied = true (DSO 43 > 37×1.1=40.7)', () => {
    expect(result.applied).toBe(true)
  })

  test('tradeReceivables azaldı', () => {
    const before = result.beforeInput.tradeReceivables ?? 0
    const after  = result.afterInput.tradeReceivables  ?? 0
    expect(after).toBeLessThan(before)
  })

  test('activity categoryDelta pozitif', () => {
    expect(result.categoryDelta.activity).toBeGreaterThan(0)
  })

  test('objectiveDelta ≥ 0', () => {
    expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('Trade × A06 — Stok devir hızı', () => {
  const result = computeScoreAttribution('A06', TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)

  test('applied = true (DIO 73 > 60×1.1=66)', () => {
    expect(result.applied).toBe(true)
  })

  test('inventory azaldı', () => {
    const before = result.beforeInput.inventory ?? 0
    const after  = result.afterInput.inventory  ?? 0
    expect(after).toBeLessThan(before)
  })

  test('activity categoryDelta pozitif', () => {
    expect(result.categoryDelta.activity).toBeGreaterThan(0)
  })

  test('objectiveDelta ≥ 0', () => {
    expect(result.objectiveDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('Trade × A10 — KV→UV borç dönüşümü', () => {
  const result = computeScoreAttribution('A10', TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)

  test('applied = true', () => {
    expect(result.applied).toBe(true)
  })

  test('liquidity delta ≥ 0 (cari oran iyileşir)', () => {
    expect(result.categoryDelta.liquidity).toBeGreaterThanOrEqual(0)
  })

  test('combinedDelta ≥ 0', () => {
    expect(result.combinedDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('Trade × A12 — Sermaye artırımı', () => {
  const result = computeScoreAttribution('A12', TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)

  test('applied = true', () => {
    expect(result.applied).toBe(true)
  })

  test('leverage categoryDelta pozitif', () => {
    expect(result.categoryDelta.leverage).toBeGreaterThan(0)
  })

  test('liquidity delta ≥ 0 (nakit artışı)', () => {
    expect(result.categoryDelta.liquidity).toBeGreaterThanOrEqual(0)
  })

  test('objectiveDelta > 0', () => {
    expect(result.objectiveDelta).toBeGreaterThan(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})

describe('Trade × A18 — Brüt marj iyileştirme', () => {
  const result = computeScoreAttribution('A18', TRADE_INPUT, TRADE_SUBJECTIVE_TOTAL, TRADE_SECTOR)

  test('applied = true (margin 0.11 < benchmark 0.14)', () => {
    expect(result.applied).toBe(true)
  })

  test('profitability categoryDelta pozitif', () => {
    expect(result.categoryDelta.profitability).toBeGreaterThan(DELTA_TOLERANCE)
  })

  test('objectiveDelta > 0', () => {
    expect(result.objectiveDelta).toBeGreaterThan(0)
  })

  test('combinedDelta ≥ 0', () => {
    expect(result.combinedDelta).toBeGreaterThanOrEqual(0)
  })

  test('snapshot', () => {
    expect(summarise(result)).toMatchSnapshot()
  })
})
