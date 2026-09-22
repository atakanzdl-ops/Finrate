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
  getIdleAssetPoolBalance,
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
// YENİ öncelik sırası: 256 > 250 > 252 > 255 > 254 (253 DIŞARIDA — operasyonel)
// Null dönüş BUG fix: aday yoksa null (eski davranış: 253 default)
// ═══════════════════════════════════════════════════════════════════════════

describe('selectIdleAssetAccount', () => {
  test('256 (Diğer MDV) öncelikli — amount karşılıyorsa seçilir', () => {
    const ctx = makeCtx({
      accountBalances: {
        '256': 20_000_000,   // öncelikli
        '252': 80_000_000,
        '255': 30_000_000,
      },
    })
    // amount=5M, 256 bakiyesi=20M → 20M×0.90=18M ≥ 5M → 256 seçilir
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).not.toBeNull()
    expect(result!.accountCode).toBe('256')
  })

  test('256 yetersiz, 252 seçilir (öncelikte 250 > 252 ama 250 yok)', () => {
    const ctx = makeCtx({
      accountBalances: {
        '256':  1_000_000,   // 1M×0.90=900K < 10M → yetersiz
        '252': 15_000_000,   // 15M×0.90=13.5M ≥ 10M → yeterli
        '255': 50_000_000,   // yeterli ama öncelikte 252 daha önce
      },
    })
    // 256 yetersiz, 250(yok), 252 karşılıyor → 252 seçilir
    const result = selectIdleAssetAccount(ctx, 10_000_000)
    expect(result).not.toBeNull()
    expect(result!.accountCode).toBe('252')
  })

  test('CONSTRUCTION: 250 hariç → 252 seçilir (253 zaten listede yok)', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: {
        '250': 50_000_000,   // CONSTRUCTION'da hariç
        '252': 20_000_000,   // dahil
        '253': 30_000_000,   // 253 hiçbir sektörde listede değil
      },
    })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).not.toBeNull()
    expect(result!.accountCode).toBe('252')
  })

  test('CONSTRUCTION: yalnız 250 var → null (250 hariç, başka aday yok)', () => {
    // KRİTİK BUG FIX: eskiden '253' default dönerdi
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: { '250': 50_000_000 },  // CONSTRUCTION'da hariç
    })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).toBeNull()   // 253 default dönmez artık!
  })

  test('Hiç uygun bakiye yoksa null döner (eski BUG fix)', () => {
    // KRİTİK BUG FIX: eskiden '253' default dönerdi
    const ctx = makeCtx({ accountBalances: {} })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).toBeNull()   // 253 default dönmez artık!
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
// 4. computeAmount — Sentetik Pozitif Testler (YENİ LOGİK)
//
// YENİ computeAmount: 3 Guard + 3 Eşik + min(Cap1,Cap2,Cap3)
// Pozitif test için şunlar gerekir:
//   Guard 1: reval522/mdvNet ≤ 0.30
//   Guard 2: accDep257/mdvGross ≥ 0.15  ← eskiden yoktu, kritik
//   Guard 3: isIpotekli tespiti (soft)
//   Eşik 1: likidite stresi (cari oran < 1.2 vb.)
//   Eşik 2: verimsizlik (MDV/Aktif fazlası veya düşük devir+MDV fazlası)
//   Eşik 3: pool ≥ totalAssets × 0.05
//   rawAmount = min(pool×0.30, fazlaMDV×0.25, stPressure×0.50)
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 computeAmount — sentetik MANUFACTURING testi', () => {
  test('MANUFACTURING — Guard + Eşik + Cap hesabı (deterministik)', () => {
    /**
     * Kurulum (tüm guardları geçmek için):
     *   '252': 72M (Binalar — brüt MDV)
     *   '257': 11M (Amortisman — 11/72 = 0.153 ≥ 0.15 → Guard 2 ✓)
     *   '102':  3M (Nakit — düşük → likidite stresi ✓)
     *   '300': 25M (KV Mali Borç)
     *
     * Guard 1: reval522=0 ✓
     * Guard 2: 11/72 = 0.153 ≥ 0.15 ✓
     * Guard 3: uvMaliBorc=0 → isIpotekli=false ✓
     *
     * Eşik 1: currentAssets=3M, KV=25M → cR=0.12 < 1.2 → likiditeStres ✓
     * Eşik 2: mdvNet=61M, mdvAktifOrani=61/100=0.61 > 0.50×1.20=0.60 → verimsiz ✓
     * Eşik 3: pool=72M (252 dahil) > 5M ✓
     *
     * Cap hesabı:
     *   fazlaMDV = 61M − 50M = 11M
     *   stPressure = 25M + 0 − 3M = 22M
     *   cap1 = 72M × 0.30 = 21.6M
     *   cap2 = 11M × 0.25 = 2.75M
     *   cap3 = 22M × 0.50 = 11M
     *   rawAmount = min(21.6M, 2.75M, 11M) = 2_750_000
     *   selectIdleAssetAccount → 252 (72M×0.90≥2.75M) → usableAmount=2.75M
     */
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      totalAssets:   100_000_000,
      netSales:       40_000_000,
      accountBalances: {
        '252': 72_000_000,
        '257': 11_000_000,
        '102':  3_000_000,
        '300': 25_000_000,
      },
    })
    const result = A08.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result).toBe(2_750_000)
  })

  test('MANUFACTURING — amortisman düşülünce verimsizlik koşulu sağlanmaz → null', () => {
    /**
     * Brüt = 70M, amortisman = 15M → net = 55M
     * mdvAktifOrani = 55/100 = 0.55
     * 0.55 > 0.50×1.20=0.60? No
     * 0.55 > 0.50×1.10=0.55? No (eşit, katı > gerekli)
     * assetTurnover = 40M/100M = 0.40 < 0.87×0.85=0.74 ✓, ama mdvAktifOrani 0.55 NOT > 0.55
     * → verimsiz=false → null
     */
    const ctx = makeCtx({
      accountBalances: { '252': 70_000_000, '257': 15_000_000 },
      netSales: 40_000_000,
    })
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('CONSTRUCTION — güvenli alt-küme + yeterli amortisman + KV baskısı → döner', () => {
    /**
     * CONSTRUCTION + depresyonlu bina (252) + KV baskısı:
     *   '252': 50M, '257': 10M → mdvNet=40M, mdvGross=50M (dep 10/50=0.20 ≥ 0.15 ✓)
     *   '102': 2M, '300': 20M → stPressure=20M-2M=18M, cR=2/20=0.10 < 1.2 ✓
     *
     * Eşik 2: CONSTRUCTION benchmarkRatio=0.35
     *   mdvAktifOrani=40/100=0.40; 0.40 > 0.35×1.20=0.42? No
     *   assetTurnover=15/100=0.15 < 0.32×0.85=0.272 ✓, mdvAktifOrani 0.40 > 0.35×1.10=0.385 ✓
     *   → verimsiz=true ✓
     *
     * Pool (CONSTRUCTION): codes=['256','252','255'] → 50M ≥ 5M ✓
     * Cap: fazlaMDV=max(40M-35M,0)=5M; stPressure=18M
     *   cap1=50M×0.30=15M; cap2=5M×0.25=1.25M; cap3=18M×0.50=9M
     *   rawAmount=min(15M,1.25M,9M)=1.25M ≥ 1M ✓
     * selectIdleAssetAccount → 252 → usableAmount=1.25M
     */
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      totalAssets:  100_000_000,
      netSales:      15_000_000,
      accountBalances: {
        '252': 50_000_000,
        '257': 10_000_000,
        '102':  2_000_000,
        '300': 20_000_000,
      },
    })
    const result = A08.computeAmount!(ctx)
    expect(result).not.toBeNull()
    expect(result).toBe(1_250_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. Gemini Guard Testleri
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 Guard 1 — Yeniden Değerleme Şişkinliği (522/MDV > 0.30 → null)', () => {
  test('İSRA benzeri: 522/MDV = 0.75 > 0.30 → null', () => {
    const ctx: FirmContext = {
      sector: 'CONSTRUCTION',
      accountBalances: {
        '252': 1_000_000_000,
        '257': 200_000_000,   // dep: 200/1000 = 0.20 ≥ 0.15 (Guard 2 geçer)
        '522': 600_000_000,   // yeniden değerleme = MDV'nin %75'i
        '102':   1_000_000,
        '300':  31_000_000,
      },
      totalAssets:   1_500_000_000,
      totalEquity:     700_000_000,
      totalRevenue:    200_000_000,
      netIncome:         5_000_000,
      netSales:        200_000_000,
      operatingProfit:  10_000_000,
      grossProfit:      30_000_000,
      interestExpense:   5_000_000,
      operatingCashFlow: null,
      period: 'Q4',
    }
    // mdvNet = 800M, reval522 = 600M → 600/800 = 0.75 > 0.30 → null
    expect(A08.computeAmount!(ctx)).toBeNull()
  })
})

describe('A08 Guard 2 — Yeni Yatırım (257/BrütMDV < 0.15 → null)', () => {
  test('Amortisman < %15 brüt MDV → yeni ekipman, satış yanlış → null', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: {
        '253': 50_000_000,   // büyük makine
        '257':  5_000_000,   // dep: 5/50 = 0.10 < 0.15 → yeni yatırım
        '102':    100_000,
        '300': 24_000_000,
      },
      totalAssets:   106_400_000,
      totalEquity:    38_700_000,
      totalRevenue:   17_700_000,
      netIncome:       1_000_000,
      netSales:       17_700_000,
      operatingProfit: 2_900_000,
      grossProfit:     3_900_000,
      interestExpense: 1_800_000,
      operatingCashFlow: null,
      period: 'Q1',
    }
    // 5/50 = 0.10 < 0.15 → Guard 2 fires → null
    expect(A08.computeAmount!(ctx)).toBeNull()
  })
})

describe('A08 Guard 3 — İpotek Pool Filtresi', () => {
  test('UV Borç yüksek → 250+252 havuz dışı, sadece 255+256 kalır', () => {
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      accountBalances: {
        '250': 10_000_000,
        '252': 20_000_000,
        '255':  5_000_000,
        '256':  1_000_000,
      },
    })
    // isIpotekli=true olduğunda: codes=['256','255'] (250+252 hariç)
    const pool = getIdleAssetPoolBalance(ctx, { isIpotekli: true })
    expect(pool).toBe(6_000_000)  // 255 + 256 = 5M + 1M
  })

  test('CONSTRUCTION + isIpotekli → sadece 256 + 255 (250+252 hariç)', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: {
        '250': 30_000_000,   // CONSTRUCTION hariç
        '252': 20_000_000,   // isIpotekli hariç
        '255':  8_000_000,   // dahil
        '256':  2_000_000,   // dahil
      },
    })
    const pool = getIdleAssetPoolBalance(ctx, { isIpotekli: true })
    expect(pool).toBe(10_000_000)  // 255 + 256
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. Senkronizasyon Fix Testi
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 — computeAmount ↔ buildTransactions Tutar Senkron', () => {
  test('computeAmount ile buildTransactions aynı tutarı üretir', () => {
    /**
     * TRADE firma — gerçekçi atıl varlık senaryosu:
     *   '252': 72M bina (brüt), '257': 15M dep (15/72=0.208≥0.15 ✓)
     *   '102': 3M nakit, '300': 25M KV borç
     *   netSales: 15M (turnover=0.15 < TRADE=1.20×0.85=1.02 → verimsiz)
     */
    const ctx: FirmContext = {
      sector: 'TRADE',
      accountBalances: {
        '252': 72_000_000,
        '257': 15_000_000,
        '102':  3_000_000,
        '300': 25_000_000,
      },
      totalAssets:   100_000_000,
      totalEquity:    25_000_000,
      totalRevenue:   15_000_000,
      netIncome:        -500_000,
      netSales:       15_000_000,
      operatingProfit:  100_000,
      grossProfit:     1_500_000,
      interestExpense: 4_000_000,
      operatingCashFlow: null,
      period: 'Q4',
    }

    const computedAmount = A08.computeAmount!(ctx)
    expect(computedAmount).not.toBeNull()

    // buildTransactions ile aynı amount
    const txs = A08.buildTransactions({
      sector:          ctx.sector,
      amount:          computedAmount!,
      accountBalances: ctx.accountBalances,
      netSales:        ctx.netSales,
      grossProfit:     ctx.grossProfit,
    } as any)

    expect(txs.length).toBeGreaterThan(0)
    expect(txs[0].legs[0].amount).toBe(computedAmount!)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. selectIdleAssetAccount Null Fix (BUG fix teyit)
// ═══════════════════════════════════════════════════════════════════════════

describe('selectIdleAssetAccount — null fix (eskiden 253 dönerdi BUG)', () => {
  test('Yalnızca 253 var → null (253 listede yok, operasyonel)', () => {
    const ctx = makeCtx({
      sector: 'MANUFACTURING',
      accountBalances: { '253': 100_000_000 },  // 253 hiçbir sektörde listede değil
    })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).toBeNull()   // ESKİ BUG: 253 dönerdi, ŞİMDİ null
  })

  test('CONSTRUCTION + sadece 250 var → null (250 CONSTRUCTION hariç)', () => {
    const ctx = makeCtx({
      sector: 'CONSTRUCTION',
      accountBalances: { '250': 50_000_000 },
    })
    const result = selectIdleAssetAccount(ctx, 5_000_000)
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. 5 Firma Snapshot (hepsi null — Atakan vizyonu: A08 nadir öneri)
// ═══════════════════════════════════════════════════════════════════════════

describe('A08 — 5 Firma Snapshot (Hepsi null beklenir)', () => {
  test('ORGANIKA → null (Guard 2: yeni yatırım, dep < %15)', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: {
        '102':    100_000,
        '120':  8_000_000,
        '150': 24_700_000,
        '253': 35_000_000,
        '257':  3_000_000,   // dep: 3/35 = 0.086 < 0.15 → Guard 2 null
        '300': 24_000_000,
        '320':  5_000_000,
      },
      totalAssets:   106_400_000,
      totalEquity:    38_700_000,
      totalRevenue:   17_700_000,
      netIncome:       1_000_000,
      netSales:       17_700_000,
      operatingProfit: 2_900_000,
      grossProfit:     3_900_000,
      interestExpense: 1_800_000,
      operatingCashFlow: null,
      period: 'Q1',
    }
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('ENES → null (MDV küçük, havuz < %5 aktif)', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: {
        '102':    500_000,
        '120':  3_000_000,
        '150': 24_700_000,
        '253':  5_000_000,   // küçük MDV
        '257':  1_500_000,   // dep: 1.5/5 = 0.30 ≥ 0.15 (Guard 2 geçer)
        '300':  5_000_000,
      },
      totalAssets:    39_100_000,
      totalEquity:    11_000_000,
      totalRevenue:   31_500_000,
      netIncome:          50_000,
      netSales:       31_500_000,
      operatingProfit:   970_000,
      grossProfit:     1_500_000,
      interestExpense:   900_000,
      operatingCashFlow: null,
      period: 'Q4',
    }
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('iPOS → null (aktif devir yüksek → verimsizlik eşiği sağlanmaz)', () => {
    const ctx: FirmContext = {
      sector: 'MANUFACTURING',
      accountBalances: {
        '102':  22_800_000,
        '120':  30_000_000,
        '150': 169_000_000,
        '253':  80_000_000,
        '257':  15_000_000,  // dep: 15/80 = 0.1875 ≥ 0.15 (Guard 2 geçer)
        '400': 122_000_000,
      },
      totalAssets:   317_700_000,
      totalEquity:   114_000_000,
      totalRevenue:  229_700_000,
      netIncome:       2_100_000,
      netSales:      229_700_000,
      operatingProfit: 31_000_000,
      grossProfit:     97_400_000,
      interestExpense: 17_000_000,
      operatingCashFlow: null,
      period: 'Q4',
    }
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('İSRA → null (Guard 1: yeniden değerleme şişkinliği)', () => {
    const ctx: FirmContext = {
      sector: 'CONSTRUCTION',
      accountBalances: {
        '102':   25_900_000,
        '120':   50_000_000,
        '150':  583_000_000,
        '252':  800_000_000,
        '257':  200_000_000,  // dep: 200/800 = 0.25 ≥ 0.15 (Guard 2 geçer)
        '300':   31_200_000,
        '400':  143_000_000,
        '522':  800_000_000,  // büyük yeniden değerleme: 800/(800-200)=1.33 > 0.30 → null
      },
      totalAssets:   2_570_000_000,
      totalEquity:   1_100_000_000,
      totalRevenue:    381_400_000,
      netIncome:        10_800_000,
      netSales:        381_400_000,
      operatingProfit:  29_700_000,
      grossProfit:      89_900_000,
      interestExpense:  17_900_000,
      operatingCashFlow: null,
      period: 'Q4',
    }
    expect(A08.computeAmount!(ctx)).toBeNull()
  })

  test('DEKAM → null (likidite stresi yok: yüksek ciro → cari oran OK)', () => {
    const ctx: FirmContext = {
      sector: 'CONSTRUCTION',
      accountBalances: {
        '102':   5_000_000,
        '120':  60_000_000,
        '151': 262_400_000,
        '253':  30_000_000,  // 253 CONSTRUCTION: safeFixed=0
        '257':   8_000_000,
        '320':  71_900_000,
      },
      totalAssets:   361_000_000,
      totalEquity:   141_000_000,
      totalRevenue:  328_000_000,
      netIncome:      13_700_000,
      netSales:      328_000_000,
      operatingProfit: -26_000_000,
      grossProfit:    -22_500_000,
      interestExpense:  5_300_000,
      operatingCashFlow: null,
      period: 'Q4',
    }
    expect(A08.computeAmount!(ctx)).toBeNull()
  })
})
