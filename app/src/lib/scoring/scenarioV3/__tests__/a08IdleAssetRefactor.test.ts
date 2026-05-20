/**
 * A08 Atıl Duran Varlık Satışı — Refactor 2 Test Paketi
 *
 * 1. ratioHelpers.ts yeni helper'ları (unit)
 * 2. selectIdleAssetAccount — hesap seçim mantığı
 * 3. computeAmount — 5 null firma (farklı guard'lardan dönen)
 * 4. computeAmount — sentetik MANUFACTURING (~17.5M)
 */

import { ACTION_CATALOG_V3 } from '../actionCatalogV3'
import {
  sumByCodesPrefixNet,
  getNetFixedAssets,
  getConstructionSafeFixedAssets,
  isFixedAssetHeavy,
  isLowAssetTurnover,
  isIdleAssetCandidate,
  selectIdleAssetAccount,
} from '../ratioHelpers'
import type { FirmContext } from '../contracts'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Minimal FirmContext builder — MANUFACTURING default */
function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'MANUFACTURING',
    accountBalances:   {},
    totalAssets:       100_000_000,
    totalEquity:       30_000_000,
    totalRevenue:      50_000_000,
    netSales:          50_000_000,
    grossProfit:       15_000_000,
    operatingProfit:   10_000_000,
    netIncome:          8_000_000,
    interestExpense:    1_000_000,
    operatingCashFlow: null,
    ...overrides,
  }
}

const A08 = ACTION_CATALOG_V3['A08_FIXED_ASSET_DISPOSAL']

// ═══════════════════════════════════════════════════════════════════════════
// 1. Helper Unit Testleri
// ═══════════════════════════════════════════════════════════════════════════

describe('sumByCodesPrefixNet', () => {
  test('brüt − kontra = net bakiye', () => {
    const balances = { '252': 60_000_000, '253': 10_000_000, '257': 8_000_000 }
    expect(sumByCodesPrefixNet(balances, ['252', '253'], ['257'])).toBe(62_000_000)
  })

  test('kontra yoksa brüt bakiye aynen döner', () => {
    const balances = { '252': 50_000_000 }
    expect(sumByCodesPrefixNet(balances, ['252'], ['257', '258'])).toBe(50_000_000)
  })

  test('negatife düşmez — kontra > brüt olsa bile 0 döner', () => {
    const balances = { '252': 10_000_000, '257': 15_000_000 }
    expect(sumByCodesPrefixNet(balances, ['252'], ['257'])).toBe(0)
  })

  test('alt hesap prefix dahil edilir (nokta ve tire)', () => {
    const balances = { '252.01': 20_000_000, '252-02': 10_000_000, '257': 5_000_000 }
    expect(sumByCodesPrefixNet(balances, ['252'], ['257'])).toBe(25_000_000)
  })
})

describe('getNetFixedAssets', () => {
  test('brüt 250-255 − birikmiş amortisman 257-258', () => {
    const ctx = makeCtx({ accountBalances: { '252': 60_000_000, '253': 10_000_000, '257': 8_000_000 } })
    expect(getNetFixedAssets(ctx)).toBe(62_000_000)
  })

  test('accountBalances boşsa 0 döner', () => {
    const ctx = makeCtx({ accountBalances: {} })
    expect(getNetFixedAssets(ctx)).toBe(0)
  })
})

describe('getConstructionSafeFixedAssets', () => {
  test('250/253/254 hariç; yalnız 251/252/255 dahil', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: {
        '250': 30_000_000,   // hariç — arazi/arsa
        '253': 20_000_000,   // hariç — operasyonel ekipman
        '254': 10_000_000,   // hariç — proje taşıtı
        '252': 15_000_000,   // dahil
        '255':  5_000_000,   // dahil
      },
    })
    expect(getConstructionSafeFixedAssets(ctx)).toBe(20_000_000)
  })

  test('Sadece hariç tutulan hesaplar varsa 0 döner', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: { '250': 80_000_000, '253': 40_000_000, '254': 20_000_000 },
    })
    expect(getConstructionSafeFixedAssets(ctx)).toBe(0)
  })
})

describe('isFixedAssetHeavy — MANUFACTURING (benchmark %50, eşik %60)', () => {
  test('ratio %50 → %60 eşiğinin altında → false', () => {
    // netMDV=50M, totalAssets=100M → ratio=0.50, eşik=0.60
    const ctx = makeCtx({ accountBalances: { '252': 50_000_000 } })
    expect(isFixedAssetHeavy(ctx)).toBe(false)
  })

  test('ratio tam %60 → eşiğin altında (>) → false', () => {
    const ctx = makeCtx({ accountBalances: { '252': 60_000_000 } })
    expect(isFixedAssetHeavy(ctx)).toBe(false)
  })

  test('ratio %70 → eşiğin üstünde → true', () => {
    const ctx = makeCtx({ accountBalances: { '252': 70_000_000 } })
    expect(isFixedAssetHeavy(ctx)).toBe(true)
  })

  test('MDV yok → false', () => {
    const ctx = makeCtx({ accountBalances: {} })
    expect(isFixedAssetHeavy(ctx)).toBe(false)
  })
})

describe('isLowAssetTurnover — MANUFACTURING (benchmark 0.87, eşik 0.696)', () => {
  test('turnover 0.80 → eşiğin üstünde → false', () => {
    // netSales=80M, totalAssets=100M → 0.80 > 0.696
    const ctx = makeCtx({ netSales: 80_000_000 })
    expect(isLowAssetTurnover(ctx)).toBe(false)
  })

  test('turnover 0.40 → eşiğin altında → true', () => {
    // netSales=40M, totalAssets=100M → 0.40 < 0.696
    const ctx = makeCtx({ netSales: 40_000_000 })
    expect(isLowAssetTurnover(ctx)).toBe(true)
  })
})

describe('isIdleAssetCandidate — her iki koşul zorunlu', () => {
  test('MDV ağırlıklı VE düşük devir → true', () => {
    const ctx = makeCtx({
      accountBalances: { '252': 70_000_000 },   // ratio=0.70>0.60 ✓
      netSales: 40_000_000,                       // turnover=0.40<0.696 ✓
    })
    expect(isIdleAssetCandidate(ctx)).toBe(true)
  })

  test('MDV ağırlıklı AMA yüksek devir → false', () => {
    const ctx = makeCtx({
      accountBalances: { '252': 70_000_000 },   // heavy ✓
      netSales: 100_000_000,                     // turnover=1.00>0.696 → NOT low
    })
    expect(isIdleAssetCandidate(ctx)).toBe(false)
  })

  test('Düşük devir AMA MDV ağırlıklı değil → false', () => {
    const ctx = makeCtx({
      accountBalances: { '252': 45_000_000 },   // ratio=0.45<0.60 → NOT heavy
      netSales: 40_000_000,                       // low turnover ✓
    })
    expect(isIdleAssetCandidate(ctx)).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. selectIdleAssetAccount Testleri
// ═══════════════════════════════════════════════════════════════════════════

describe('selectIdleAssetAccount', () => {
  test('255 öncelikli — amount karşılayabiliyorsa seçilir', () => {
    const ctx = makeCtx({
      accountBalances: {
        '255': 20_000_000,
        '253': 50_000_000,
        '252': 80_000_000,
      },
    })
    // amount=5M, 255 bakiyesi=20M → 20M×0.90=18M ≥ 5M → 255 seçilir
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result.accountCode).toBe('255')
  })

  test('255 yetmezse 253 seçilir (en küçük yeterli bakiye)', () => {
    const ctx = makeCtx({
      accountBalances: {
        '255':  1_000_000,   // 1M×0.90=900K < 10M → yetersiz
        '253': 15_000_000,   // 15M×0.90=13.5M ≥ 10M → yeterli
        '252': 50_000_000,   // 50M×0.90=45M ≥ 10M → yeterli ama büyük
      },
    })
    // amount=10M, 255 yetersiz, 253 ve 252 yeterli → en küçük yeterli seçilir
    const result = selectIdleAssetAccount(ctx, 10_000_000)
    expect(result.accountCode).toBe('253')
  })

  test('CONSTRUCTION: 253 hariç → 252 seçilir', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: {
        '253': 50_000_000,   // CONSTRUCTION'da hariç
        '252': 20_000_000,   // dahil
      },
    })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result.accountCode).toBe('252')
  })

  test('CONSTRUCTION: 250/253/254 hepsi hariç, bakiye yoksa "253" default', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: { '250': 50_000_000, '253': 30_000_000, '254': 10_000_000 },
    })
    // Tüm bakiyeli hesaplar hariç → default fallback
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result.accountCode).toBe('253')
    expect(result.balance).toBe(0)
  })

  test('Hiç bakiye yoksa "253" default döner', () => {
    const ctx = makeCtx({ accountBalances: {} })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result.accountCode).toBe('253')
    expect(result.balance).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. computeAmount — 5 Null Firma
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 computeAmount — 5 null firma', () => {
  test('Firma 1 — MDV hesabı yok → safeBalance=0 → null (guard 1: bakiye<1M)', () => {
    const ctx = makeCtx({
      accountBalances: {},
      netSales: 40_000_000,
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('Firma 2 — CONSTRUCTION yalnız 250/253/254 → safeBalance=0 → null', () => {
    // getConstructionSafeFixedAssets = 0 (sadece hariç hesaplar var)
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      totalAssets: 150_000_000,
      netSales: 30_000_000,
      accountBalances: { '250': 80_000_000, '253': 40_000_000, '254': 20_000_000 },
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('Firma 3 — MDV var ama ağırlıklı değil (ratio 0.45 < eşik 0.60) → isFixedAssetHeavy=false → null', () => {
    // netMDV=45M, totalAssets=100M → ratio=0.45 < 0.60 → NOT heavy
    const ctx = makeCtx({
      accountBalances: { '252': 45_000_000 },
      netSales: 40_000_000,   // low turnover (irrelevant — first check fails)
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('Firma 4 — MDV ağırlıklı ama aktif devir yüksek → isLowAssetTurnover=false → null', () => {
    // ratio=0.70>0.60 → heavy ✓, turnover=1.00>0.696 → NOT low
    const ctx = makeCtx({
      accountBalances: { '252': 70_000_000 },
      netSales: 100_000_000,
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('Firma 5 — cap sonrası tutar 1M altı → null (guard 4: capped<1M)', () => {
    // totalAssets=2M, MDV=1.3M (ratio=0.65>0.60 heavy ✓)
    // netSales=200K → turnover=0.10<0.696 low ✓
    // targetMDV=2M×0.50=1M
    // desiredMovement=1.3M-1M=300K, maxMovement=1.3M×0.25=325K → capped=300K<1M
    const ctx = makeCtx({
      totalAssets:   2_000_000,
      netSales:        200_000,
      accountBalances: { '252': 1_300_000 },
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. computeAmount — Sentetik MANUFACTURING ~17.5M
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 computeAmount — sentetik MANUFACTURING testi', () => {
  test('MANUFACTURING — ağırlıklı MDV (%70) + düşük aktif devir → cap = 17_500_000', () => {
    /**
     * Kurulum:
     *   totalAssets = 100M
     *   accountBalances: { '252': 70M } → getNetFixedAssets = 70M
     *   ratio = 70/100 = 0.70 > 0.60 (benchmark×1.2) → isFixedAssetHeavy ✓
     *   netSales = 50M → turnover = 0.50 < 0.696 (0.87×0.8) → isLowAssetTurnover ✓
     *
     * Hesaplama:
     *   safeBalance = 70M
     *   targetMDV   = 100M × 0.50 = 50M
     *   desiredMovement = max(70M − 50M, 0) = 20M
     *   maxMovement     = 70M × 0.25 = 17_500_000
     *   capped = min(20M, 17.5M) = 17_500_000 ≥ 1M → döner
     */
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      totalAssets:  100_000_000,
      netSales:      50_000_000,
      accountBalances: { '252': 70_000_000 },
    })
    const result = A08.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result).toBe(17_500_000)
  })

  test('MANUFACTURING — amortisman düşülünce düşük net MDV → isFixedAssetHeavy=false → null', () => {
    /**
     * Brüt = 70M ama birikmiş amortisman = 15M → net = 55M
     * ratio = 55/100 = 0.55 < 0.60 → NOT heavy → null
     */
    const ctx = makeCtx({
      accountBalances: { '252': 70_000_000, '257': 15_000_000 },
      netSales: 40_000_000,
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('CONSTRUCTION — güvenli alt-küme (251/252/255) ağırlıklıysa döner', () => {
    /**
     * totalAssets = 100M
     * '252' = 50M (dahil), '253' = 30M (hariç), '250' = 20M (hariç)
     * getConstructionSafeFixedAssets = 50M → ratio = 50/100 = 0.50 > benchmark(0.35)×1.20=0.42 ✓
     * netSales = 20M → turnover = 0.20 < 0.32×0.80=0.256 ✓ (inşaat benchmarkı)
     *
     * targetMDV = 100M × 0.35 = 35M
     * desiredMovement = 50M − 35M = 15M
     * maxMovement = 50M × 0.25 = 12.5M → capped = 12.5M ≥ 1M → döner
     */
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      totalAssets:  100_000_000,
      netSales:      20_000_000,
      accountBalances: {
        '252': 50_000_000,   // dahil
        '253': 30_000_000,   // hariç (CONSTRUCTION)
        '250': 20_000_000,   // hariç (CONSTRUCTION)
      },
    })
    const result = A08.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result).toBe(12_500_000)
  })
})
