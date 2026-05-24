/**
 * R7B — Audit Düzeltmeleri Entegrasyon Testleri
 *
 * 5 BLOCKER (Atakan + Codex + Sonnet audit):
 *   1. A11 ÖZKAYNAK YANILGISI — 590→570 özkaynak içi transfer, rating etkisi sıfır
 *   2. A18 KAR ŞIŞME — useRatioBasedAmount yoktu, COGS otomatik artmıyordu
 *   3. A19 STOK/MALİYET FALLBACK — useRatioBasedAmount yoktu
 *   4. A21 COMPUTE-SEMANTIC UYUMSUZLUĞU — getOperatingExpenses 633 içeriyordu
 *   5. CRITICALISSUES — mandatori aksiyon katmanı eksikti
 *
 * Codex K-serisi kural uygulaması:
 *   - transaction.legs[].accountCode (t.code DEĞIL)
 *   - ACTION_CATALOG_V3['id'] (named export yok)
 *   - getBenchmarkValue: ratioHelpers.ts kaynağı (benchmarks.ts değil)
 *   - SelectedAction tipi (ScoredAction değil)
 */

import { ACTION_CATALOG_V3 }            from '../actionCatalogV3'
import { getOperatingExpenses, getOperatingExpensesDetail } from '../ratioHelpers'
import { getMandatoryActionsForFirm }   from '../criticalIssues'
import { runEngineV3 }                  from '../engineV3'
import type { EngineInput }             from '../engineV3'

const A11 = ACTION_CATALOG_V3['A11_RETAIN_EARNINGS']
const A18 = ACTION_CATALOG_V3['A18_NET_SALES_GROWTH']
const A19 = ACTION_CATALOG_V3['A19_ADVANCE_TO_REVENUE']
const A21 = ACTION_CATALOG_V3['A21_OPERATING_PROFIT_REFORM']

// ─── ADIM 0: Catalog erişim guard ────────────────────────────────────────────

describe('R7B — Catalog erişim (toBeDefined)', () => {

  test('A11 catalog\'da tanımlı', () => {
    expect(A11).toBeDefined()
    expect(A11.buildTransactions).toBeDefined()
  })

  test('A18 catalog\'da tanımlı', () => {
    expect(A18).toBeDefined()
    expect(A18.computeAmount).toBeDefined()
    expect(A18.buildTransactions).toBeDefined()
  })

  test('A19 catalog\'da tanımlı', () => {
    expect(A19).toBeDefined()
    expect(A19.computeAmount).toBeDefined()
    expect(A19.buildTransactions).toBeDefined()
  })

  test('A21 catalog\'da tanımlı', () => {
    expect(A21).toBeDefined()
    expect(A21.buildTransactions).toBeDefined()
  })

})

// ─── ADIM 1: A11 disable ─────────────────────────────────────────────────────

describe('R7B — A11 disable (özkaynak yanılgısı)', () => {

  test('A11 customCheck pass:false döner', () => {
    expect(A11.preconditions?.customCheck).toBeDefined()
    const check = A11.preconditions!.customCheck!({} as any)
    expect(check.pass).toBe(false)
  })

  test('A11 customCheck reason özkaynakla ilgili (mali müşavir dili)', () => {
    const check = A11.preconditions!.customCheck!({} as any)
    expect(check.reason).toContain('özkaynak')
  })

  test('A11 buildTransactions boş array döner', () => {
    const txs = A11.buildTransactions({
      amount: 5_000_000,
      sector: 'MANUFACTURING',
      accountBalances: { '590': 5_000_000 },
    } as any)
    expect(txs).toHaveLength(0)
  })

  test('Engine A11\'i portfolyo\'ya almaz (disable)', () => {
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BBB',
      accountBalances: {
        '590': 5_000_000,
        '300': 10_000_000,
      },
      incomeStatement: {
        netSales:        50_000_000,
        costOfGoodsSold: 35_000_000,
        grossProfit:     15_000_000,
        operatingProfit:  8_000_000,
        netIncome:        5_000_000,
        interestExpense:  1_000_000,
      },
      options: { allowedActionIds: ['A11_RETAIN_EARNINGS'] },
    })
    const a11 = result.portfolio.find(a => a.actionId === 'A11_RETAIN_EARNINGS')
    expect(a11).toBeUndefined()
  })

})

// ─── ADIM 2+3: A18 computeAmount + COGS ──────────────────────────────────────

describe('R7B — A18 computeAmount (rasyo bazlı)', () => {

  test('A18 useRatioBasedAmount: true (R5 kararı)', () => {
    expect((A18 as any).useRatioBasedAmount).toBe(true)
  })

  test('A18 computeAmount hedef altında → tutar döner', () => {
    // MANUFACTURING assetTurnover benchmark ~1.2
    // baselineRevenue=50M, baselineAssets=200M → currentTurnover=0.25 << 1.2
    const result = A18.computeAmount!({
      sector:        'MANUFACTURING',
      totalAssets:   200_000_000,
      netSales:       50_000_000,
      grossProfit:    10_000_000,
      baselineNetSales:    50_000_000,
      baselineGrossProfit: 10_000_000,
    } as any)
    // Hedef: 1.2 × 200M = 240M; gap = 190M; cap = 50M × 0.5 = 25M
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(1_000_000)
  })

  test('A18 computeAmount hedef üstünde → null', () => {
    // currentTurnover = 200M / 50M = 4.0 >> benchmark
    const result = A18.computeAmount!({
      sector:      'MANUFACTURING',
      totalAssets:  50_000_000,
      netSales:    200_000_000,
      grossProfit:  40_000_000,
      baselineNetSales:    200_000_000,
      baselineGrossProfit:  40_000_000,
    } as any)
    expect(result).toBeNull()
  })

  test('A18 stok varsa → COGS gerçekçi (621 + dominantStock)', () => {
    // grossMargin = 10/50 = 0.20 → costAmount = amount × 0.80
    const txs = A18.buildTransactions({
      amount: 10_000_000,
      sector: 'MANUFACTURING',
      netSales:    50_000_000,
      grossProfit: 10_000_000,
      baselineNetSales:    50_000_000,
      baselineGrossProfit: 10_000_000,
      accountBalances: { '150': 8_000_000 },  // stok mevcut
    } as any)
    const legs = txs.flatMap(tx => tx.legs)
    // 600 CREDIT: tam satış tutarı
    const sales = legs.find(l => l.accountCode === '600' && l.side === 'CREDIT')
    expect(sales?.amount).toBe(10_000_000)
    // 621 DEBIT: COGS ~8M (0.80 × 10M)
    const cogs = legs.find(l => l.accountCode === '621' && l.side === 'DEBIT')
    expect(cogs).toBeDefined()
    expect(cogs!.amount).toBeCloseTo(8_000_000, -3)
    // 150 CREDIT: stok düşüşü
    const stockCredit = legs.find(l => l.accountCode === '150' && l.side === 'CREDIT')
    expect(stockCredit).toBeDefined()
  })

  test('A18 ticaret 153 stok hesabı: 153 CREDIT kullanılır', () => {
    const txs = A18.buildTransactions({
      amount: 5_000_000,
      sector: 'TRADE',
      netSales:    30_000_000,
      grossProfit:  7_500_000,
      baselineNetSales:    30_000_000,
      baselineGrossProfit:  7_500_000,
      accountBalances: { '153': 10_000_000 },
    } as any)
    const legs = txs.flatMap(tx => tx.legs)
    const stockCredit = legs.find(l => l.accountCode === '153' && l.side === 'CREDIT')
    expect(stockCredit).toBeDefined()
  })

  test('A18 stok yok, imalat sektörü → 770 fallback COGS (tam kâr değil)', () => {
    // grossMargin = 10/50 = 0.20 → profitAmount = 10M × 0.20 = 2M (tam 10M değil)
    const txs = A18.buildTransactions({
      amount: 10_000_000,
      sector: 'MANUFACTURING',
      netSales:    50_000_000,
      grossProfit: 10_000_000,
      baselineNetSales:    50_000_000,
      baselineGrossProfit: 10_000_000,
      accountBalances: {},  // stok yok
    } as any)
    const legs = txs.flatMap(tx => tx.legs)
    // 590 profit: grossProfit katkısı (kâr şişmemiş)
    const profit = legs.find(l => l.accountCode === '590' && l.side === 'CREDIT')
    expect(profit).toBeDefined()
    expect(profit!.amount).toBeLessThan(10_000_000)  // Tam tutar değil
    expect(profit!.amount).toBeCloseTo(2_000_000, -3)
    // 770 CREDIT maliyet karşılığı (COGS simülasyon)
    const costFallback = legs.find(l => l.accountCode === '770' && l.side === 'CREDIT')
    expect(costFallback).toBeDefined()
  })

})

// ─── ADIM 4: A19 computeAmount ────────────────────────────────────────────────

describe('R7B — A19 computeAmount (avans bazlı)', () => {

  test('A19 useRatioBasedAmount: true (R5 kararı)', () => {
    expect((A19 as any).useRatioBasedAmount).toBe(true)
  })

  test('A19 computeAmount: 340 bakiyesi varsa → tutar döner', () => {
    const result = A19.computeAmount!({
      sector:      'CONSTRUCTION',
      totalAssets: 100_000_000,
      netSales:     30_000_000,
      grossProfit:   4_500_000,
      baselineNetSales:    30_000_000,
      baselineGrossProfit:  4_500_000,
      accountBalances: { '340': 20_000_000 },
    } as any)
    expect(result).not.toBeNull()
    // advanceConversionCap = 20M × 0.30 = 6M
    expect(result!).toBeGreaterThan(1_000_000)
    expect(result!).toBeLessThanOrEqual(20_000_000 * 0.30)
  })

  test('A19 computeAmount: 340 yok → null', () => {
    const result = A19.computeAmount!({
      sector:      'CONSTRUCTION',
      totalAssets: 100_000_000,
      netSales:     30_000_000,
      grossProfit:   4_500_000,
      baselineGrossProfit: 4_500_000,
      accountBalances: {},
    } as any)
    expect(result).toBeNull()
  })

  test('A19 computeAmount: brüt zarar varsa → null (baseline guard)', () => {
    const result = A19.computeAmount!({
      sector:      'CONSTRUCTION',
      totalAssets: 100_000_000,
      netSales:     30_000_000,
      grossProfit: -5_000_000,
      baselineGrossProfit: -5_000_000,
      accountBalances: { '340': 15_000_000 },
    } as any)
    expect(result).toBeNull()
  })

})

// ─── ADIM 5: A21 dinamik hesap + ratioHelpers ─────────────────────────────────

describe('R7B — A21 dinamik hesap', () => {

  test('A21 buildTransactions: en yüklü gider hesabı seçilir (631)', () => {
    const txs = A21.buildTransactions({
      amount: 1_000_000,
      accountBalances: {
        '630': 100_000,
        '631': 500_000,  // en büyük
        '632': 200_000,
      },
    } as any)
    const legs = txs.flatMap(tx => tx.legs)
    const credit = legs.find(l =>
      ['630', '631', '632'].includes(l.accountCode) && l.side === 'CREDIT'
    )
    expect(credit?.accountCode).toBe('631')
  })

  test('A21 buildTransactions: tümü 0 → 632 KOBİ fallback', () => {
    const txs = A21.buildTransactions({
      amount: 1_000_000,
      accountBalances: {},
    } as any)
    const legs = txs.flatMap(tx => tx.legs)
    const credit = legs.find(l => l.side === 'CREDIT' && l.accountCode !== '590')
    expect(credit?.accountCode).toBe('632')
  })

  test('getOperatingExpenses 633 KULLANMIYOR (API korunur: number|null)', () => {
    const ctx = {
      accountBalances: { '633': 5_000_000 },
      grossProfit:     0,
      operatingProfit: 0,
    }
    const result = getOperatingExpenses(ctx as any)
    // 633 sayılmamalı, fallback da null (grossProfit - operatingProfit = 0)
    expect(result).toBeNull()
  })

  test('getOperatingExpenses 630+631+632 toplar (633 dahil değil)', () => {
    const ctx = {
      accountBalances: {
        '630': 100_000,
        '631': 200_000,
        '632': 300_000,
        '633': 5_000_000,  // dahil edilmemeli
      },
    }
    const result = getOperatingExpenses(ctx as any)
    expect(result).toBe(600_000)  // 100+200+300
  })

  test('getOperatingExpensesDetail yeni helper: isEstimated bilgisi', () => {
    const ctx = {
      accountBalances: { '632': 500_000 },
    }
    const result = getOperatingExpensesDetail(ctx as any)
    expect(result?.amount).toBe(500_000)
    expect(result?.isEstimated).toBe(false)
  })

  test('getOperatingExpensesDetail KOBİ fallback: isEstimated:true', () => {
    const ctx = {
      accountBalances: {},
      grossProfit:     10_000_000,
      operatingProfit:  7_000_000,
    }
    const result = getOperatingExpensesDetail(ctx as any)
    expect(result?.amount).toBe(3_000_000)
    expect(result?.isEstimated).toBe(true)
  })

})

// ─── ADIM 6: criticalIssues mandatori ────────────────────────────────────────

describe('R7B — criticalIssues mandatori katmanı', () => {

  test('ORGANIKA finansman %32 → A14 mandatori', () => {
    const ctx = {
      sector:      'MANUFACTURING' as const,
      netSales:     17_700_000,
      grossProfit:   3_870_000,
      accountBalances: { '300': 22_800_000 },  // 780 yok → KOBİ fallback: 22.8M × 0.25 = 5.7M
    }
    const mandatory = getMandatoryActionsForFirm(ctx)
    // finExpense = 5.7M; ratio = 5.7/17.7 = 32% > 20%
    expect(mandatory).toContain('A14_FINANCE_COST_REDUCTION')
  })

  test('DEKAM brüt zarar → A20 mandatori', () => {
    const ctx = {
      sector:      'CONSTRUCTION' as const,
      netSales:     328_000_000,
      grossProfit:  -22_500_000,
      accountBalances: {},
    }
    const mandatory = getMandatoryActionsForFirm(ctx)
    expect(mandatory).toContain('A20_GROSS_MARGIN_REFORM')
  })

  test('Sağlıklı firma → mandatory yok', () => {
    const ctx = {
      sector:      'MANUFACTURING' as const,
      netSales:     100_000_000,
      grossProfit:   25_000_000,
      accountBalances: { '780': 1_000_000 },  // 780/sales = 1% < 20%
    }
    const mandatory = getMandatoryActionsForFirm(ctx)
    expect(mandatory).toHaveLength(0)
  })

  test('780 gerçek hesap yüksek → A14 mandatori', () => {
    const ctx = {
      sector:      'TRADE' as const,
      netSales:     30_000_000,
      grossProfit:   7_500_000,
      accountBalances: { '780': 9_000_000 },  // ratio = 30% > 20%
    }
    const mandatory = getMandatoryActionsForFirm(ctx)
    expect(mandatory).toContain('A14_FINANCE_COST_REDUCTION')
  })

  test('Hem brüt zarar hem yüksek finansman → ikisi de mandatori', () => {
    const ctx = {
      sector:      'CONSTRUCTION' as const,
      netSales:     50_000_000,
      grossProfit:  -5_000_000,
      accountBalances: { '780': 12_000_000 },  // 12/50 = 24% > 20%
    }
    const mandatory = getMandatoryActionsForFirm(ctx)
    expect(mandatory).toContain('A14_FINANCE_COST_REDUCTION')
    expect(mandatory).toContain('A20_GROSS_MARGIN_REFORM')
  })

})

// ─── R7B mini — A19 stoksuz 622+770 COGS fallback (CODEX audit) ──────────────

describe('R7B mini — A19 stoksuz COGS fallback (Codex audit)', () => {

  test('A19 inşaat stoksuz: 622 DEBIT + 770 CREDIT (sektör marj fallback)', () => {
    // R7B mini: CONSTRUCTION non-service + stoksuz → 622 (Hizmet Üretim Maliyeti) + 770 simülasyon
    // grossMargin = 15M/100M = 0.15; costAmount = 10M × 0.85 = 8.5M; profitAmount = 1.5M
    const txs = A19.buildTransactions({
      amount: 10_000_000,
      sector: 'CONSTRUCTION',
      netSales:        100_000_000,
      grossProfit:      15_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  15_000_000,
      accountBalances: { '340': 20_000_000 },  // stok YOK
    } as any)

    const legs = txs[0]?.legs ?? []
    const tx2  = txs[1]

    // 340 avans çözülmesi
    expect(legs.find(l => l.accountCode === '340' && l.side === 'DEBIT')?.amount).toBe(10_000_000)
    // 600 hasılat
    expect(legs.find(l => l.accountCode === '600' && l.side === 'CREDIT')?.amount).toBe(10_000_000)
    // 622 inşaat COGS (Hizmet Üretim Maliyeti — Tek Düzen resmi ad)
    const costLeg = legs.find(l => l.accountCode === '622' && l.side === 'DEBIT')
    expect(costLeg).toBeDefined()
    expect(costLeg!.amount).toBeGreaterThan(0)
    // 770 karşılık simülasyon
    expect(legs.find(l => l.accountCode === '770' && l.side === 'CREDIT')).toBeDefined()
    // profitAmount < amount (COGS kesildi)
    expect(tx2.legs[0].amount).toBeLessThan(10_000_000)
  })

  test('A19 320 KESİNLİKLE KULLANILMAZ (mali müşavir disiplini)', () => {
    // 320 (Satıcılar) A19'da YASAK — avans teslimatında tedarikçi borcu ilgisiz
    const txs = A19.buildTransactions({
      amount: 10_000_000,
      sector: 'CONSTRUCTION',
      netSales:        100_000_000,
      grossProfit:      15_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  15_000_000,
      accountBalances: { '340': 20_000_000 },
    } as any)

    const allLegs = txs.flatMap(tx => tx.legs)
    expect(allLegs.find(l => l.accountCode === '320')).toBeUndefined()
  })

  test('A19 imalat stoksuz: 621 DEBIT + 770 CREDIT (non-inşaat sektör)', () => {
    // MANUFACTURING non-service + stoksuz → 621 (Satılan Mal Maliyeti) + 770
    const txs = A19.buildTransactions({
      amount: 10_000_000,
      sector: 'MANUFACTURING',
      netSales:        100_000_000,
      grossProfit:      20_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  20_000_000,
      accountBalances: { '340': 20_000_000 },
    } as any)

    const legs = txs[0]?.legs ?? []
    expect(legs.find(l => l.accountCode === '621' && l.side === 'DEBIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '770' && l.side === 'CREDIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '622')).toBeUndefined()  // inşaat kodu YOK
  })

  test('A19 stoklu imalat: 621 + dominant stok (COGS fallback yok)', () => {
    // Stok varsa → mevcut dominant stok mantığı korunur (621 + 150)
    const txs = A19.buildTransactions({
      amount: 10_000_000,
      sector: 'MANUFACTURING',
      netSales:        100_000_000,
      grossProfit:      20_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  20_000_000,
      accountBalances: { '340': 20_000_000, '150': 5_000_000 },
    } as any)

    const legs = txs[0]?.legs ?? []
    expect(legs.find(l => l.accountCode === '621' && l.side === 'DEBIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '150' && l.side === 'CREDIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '770')).toBeUndefined()  // 770 YOK (stok var)
  })

  test('A21 isEstimated: 630/631/632 yoksa KOBİ fallback, description "KOBİ tahmin" içerir', () => {
    // R7B mini: getOperatingExpensesDetail — isEstimated:true → description güncellenir
    const txs = A21.buildTransactions({
      amount:          1_000_000,
      grossProfit:    10_000_000,
      operatingProfit: 3_000_000,
      accountBalances: {},  // 630/631/632 yok → KOBİ fallback
    } as any)

    const legs = txs.flatMap(tx => tx.legs)
    const opexLeg = legs.find(l =>
      ['630', '631', '632'].includes(l.accountCode) && l.side === 'CREDIT'
    )
    expect(opexLeg?.description).toContain('KOBİ')
  })

})

// ─── R8.1 — A19 inşaat stoklu 622 (mali müşavir disiplini) ───────────────────

describe('R8.1 — A19 inşaat stoklu 622 (mali müşavir)', () => {

  // T1: İnşaat stoklu → 622 Hizmet Üretim Maliyeti (R8.1 YENİ)
  test('A19 inşaat stoklu: 622 DEBIT + 150 CREDIT (R8.1)', () => {
    // İSRA benzeri stoklu inşaat senaryo (150 İlk Madde 307M, avans 937M)
    // grossMargin = 75M/500M = 0.15; costAmount = 200M × 0.85 = 170M
    const txs = A19.buildTransactions({
      amount:              200_000_000,
      sector:              'CONSTRUCTION',
      netSales:            500_000_000,
      grossProfit:          75_000_000,
      baselineNetSales:    500_000_000,
      baselineGrossProfit:  75_000_000,
      accountBalances: {
        '340': 900_000_000,   // büyük avans bakiyesi
        '150': 300_000_000,   // stok zengin
      },
    } as any)

    const legs = txs[0]?.legs ?? []

    // 340 avans çözülmesi
    expect(legs.find(l => l.accountCode === '340' && l.side === 'DEBIT')).toBeDefined()
    // 600 hasılat
    expect(legs.find(l => l.accountCode === '600' && l.side === 'CREDIT')).toBeDefined()

    // R8.1 KRİTİK: 622 (Hizmet Üretim Maliyeti) — inşaat için (Tek Düzen resmi adı)
    const cost622 = legs.find(l => l.accountCode === '622' && l.side === 'DEBIT')
    expect(cost622).toBeDefined()
    expect(cost622!.amount).toBeGreaterThan(0)

    // 621 OLMAMALI (imalat mantığı inşaata uygulanmaz)
    const wrong621 = legs.find(l => l.accountCode === '621' && l.side === 'DEBIT')
    expect(wrong621).toBeUndefined()

    // Stok 150 azalır (maliyet karşılığı)
    const stock150 = legs.find(l => l.accountCode === '150' && l.side === 'CREDIT')
    expect(stock150).toBeDefined()
    expect(stock150!.amount).toBeCloseTo(cost622!.amount, 0)

    // 320 YASAK (R7B mini koruma)
    expect(legs.find(l => l.accountCode === '320')).toBeUndefined()
  })

  // T2: İmalat stoklu → 621 + 150 KORUNUR (regression — R7B davranış)
  test('A19 imalat stoklu: 621 + 150 KORUNUR (regression)', () => {
    const txs = A19.buildTransactions({
      amount:              10_000_000,
      sector:              'MANUFACTURING',
      netSales:            100_000_000,
      grossProfit:          20_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  20_000_000,
      accountBalances: {
        '340': 20_000_000,
        '150':  5_000_000,
      },
    } as any)

    const legs = txs[0]?.legs ?? []

    // İmalat için 621 SMM KORUNMALI
    expect(legs.find(l => l.accountCode === '621' && l.side === 'DEBIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '150' && l.side === 'CREDIT')).toBeDefined()

    // 622 OLMAMALI (sadece inşaatta)
    expect(legs.find(l => l.accountCode === '622' && l.side === 'DEBIT')).toBeUndefined()
  })

  // T3: İnşaat stoksuz → 622 + 770 KORUNUR (R7B mini regression)
  test('A19 inşaat stoksuz: 622 + 770 KORUNUR (R7B mini regression)', () => {
    const txs = A19.buildTransactions({
      amount:              10_000_000,
      sector:              'CONSTRUCTION',
      netSales:            100_000_000,
      grossProfit:          15_000_000,
      baselineNetSales:    100_000_000,
      baselineGrossProfit:  15_000_000,
      accountBalances: {
        '340': 20_000_000,
        // 150 YOK (stoksuz dal)
      },
    } as any)

    const legs = txs[0]?.legs ?? []

    // R7B mini: stoksuz inşaat 622 + 770
    expect(legs.find(l => l.accountCode === '622' && l.side === 'DEBIT')).toBeDefined()
    expect(legs.find(l => l.accountCode === '770' && l.side === 'CREDIT')).toBeDefined()
    // 150 YOK (stoksuz → 770 simülasyon)
    expect(legs.find(l => l.accountCode === '150')).toBeUndefined()
  })

})

// ─── Engine Entegrasyon: A18 rasyo bazlı portfolyo ────────────────────────────

describe('R7B — Engine A18 rasyo bazlı portfolyo (entegrasyon)', () => {

  test('Düşük asset turnover (sabit varlık ağır) → A18 portfolyo\'ya girer', () => {
    // totalAssets = 15M (alacak) + 8M (stok) + 80M (bina) = 103M
    // currentTurnover = 38M / 103M = 0.37 << MANUFACTURING benchmark 0.87 → gap var
    const result = runEngineV3({
      sector:        'MANUFACTURING',
      currentRating: 'B',
      targetRating:  'BB',
      accountBalances: {
        '300': 22_800_000,
        '120': 15_000_000,
        '150':  8_000_000,
        '252': 80_000_000,  // Binalar — sabit varlık, totalAssets = 103M
      },
      incomeStatement: {
        netSales:        38_000_000,
        costOfGoodsSold: 28_000_000,
        grossProfit:     10_000_000,
        operatingProfit:  5_000_000,
        netIncome:        2_000_000,
        interestExpense:  2_000_000,
      },
      options: { allowedActionIds: ['A18_NET_SALES_GROWTH'] },
    })
    const a18 = result.portfolio.find(a => a.actionId === 'A18_NET_SALES_GROWTH')
    expect(a18).toBeDefined()
    expect(a18!.amountTRY).toBeGreaterThan(1_000_000)
  })

})

// ─── R8.3 — A10/A10B Rasyo Bazlı (engine integration) ────────────────────────
//
// R5 kararı tamamlanıyor: özkaynak enjeksiyonu artık half-gap rasyo hedefine göre
// hesaplanır. Sabit %2/%5/%12 aktif bazlı yüzde yerine hedefe ölçülü adım.
//
// MANUFACTURING sektörü: debtToAssets=0.48 → sectorMedian=0.52
//
// T_R83_1: Rasyo altı firma → A10 tutar üretir (rasyo bazlı seçilir)
// T_R83_2: Rasyo üstü firma → A10 null → portfolyoda yok
// T_R83_3: A10B rasyo altı firma → computeAmount üretir (aynı helper)
// T_R83_4: A10 transparency → kind:'margin', current < sectorMedian (R8.3 sonrası)
// T_R83_5: ORGANIKA (500=10M, assets≈26M) → A10 tutar mantıklı aralıkta

// MANUFACTURING rasyo altı: 500=8M, aktif≈45M → %18 < %52
const R83_LOW_EQUITY_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  accountBalances: {
    '102':  3_000_000,   // Bankalar (current assets)
    '120': 12_000_000,   // Ticari Alacaklar
    '153': 10_000_000,   // Stok
    '250': 20_000_000,   // MDV (fixed assets)
    '300': 30_000_000,   // KV Borç
    '400': 15_000_000,   // UV Borç
    '500':  8_000_000,   // Özkaynak (8M/45M ≈ %18 < %52)
  },
  incomeStatement: {
    netSales:        40_000_000,
    costOfGoodsSold: 28_000_000,
    grossProfit:     12_000_000,
    operatingProfit:  6_000_000,
    netIncome:        2_000_000,
    interestExpense:  1_500_000,
  },
}

// MANUFACTURING rasyo üstü: 500=35M, aktif≈50M → %70 > %52
const R83_HIGH_EQUITY_INPUT: EngineInput = {
  sector:        'MANUFACTURING',
  currentRating: 'B',
  accountBalances: {
    '102':  5_000_000,
    '120': 10_000_000,
    '250': 35_000_000,
    '300': 15_000_000,
    '500': 35_000_000,   // Özkaynak (35M/50M = %70 > %52 → null guard)
  },
  incomeStatement: {
    netSales:        30_000_000,
    costOfGoodsSold: 20_000_000,
    grossProfit:     10_000_000,
    operatingProfit:  5_000_000,
    netIncome:        2_000_000,
    interestExpense:    500_000,
  },
}

describe('R8.3 — A10/A10B rasyo bazlı engine entegrasyon', () => {

  const a10  = ACTION_CATALOG_V3['A10_CASH_EQUITY_INJECTION']
  const a10b = ACTION_CATALOG_V3['A10B_PROMISSORY_NOTE_EQUITY_INJECTION']

  // Catalog erişim guard (README: named export yasak)
  test('T_R83_0 — A10/A10B catalog erişim + computeAmount tanımlı (R8.3)', () => {
    expect(a10).toBeDefined()
    expect(a10b).toBeDefined()
    // README: ?. operatörü tuzağı → ! kullan
    expect(a10.computeAmount).toBeDefined()
    expect(a10b.computeAmount).toBeDefined()
    expect(a10.useRatioBasedAmount).toBe(true)
    expect(a10b.useRatioBasedAmount).toBe(true)
  })

  // T_R83_1: Rasyo altı firma → A10 portfolyoda, tutar > 0
  test('T_R83_1 — rasyo altı firma (%18 < %52) → A10 portfolyoda, tutar makul', () => {
    const result = runEngineV3({
      ...R83_LOW_EQUITY_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION'] },
    })
    const a10Result = result.portfolio.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    expect(a10Result).toBeDefined()
    expect(a10Result!.amountTRY).toBeGreaterThan(2_000_000)
    // Tutar mantıklı aralıkta (aktif=45M, half-gap → çok küçük veya büyük olmamalı)
    expect(a10Result!.amountTRY).toBeLessThan(100_000_000)
  })

  // T_R83_2: Rasyo üstü firma → A10 portfolyoda YOK (null guard)
  test('T_R83_2 — rasyo üstü firma (%70 > %52) → A10 portfolyoda yok (null guard)', () => {
    const result = runEngineV3({
      ...R83_HIGH_EQUITY_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION'] },
    })
    const a10Result = result.portfolio.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    expect(a10Result).toBeUndefined()
  })

  // T_R83_3: A10B rasyo altı firma → computeAmount aynı helper → tutar üretir
  test('T_R83_3 — A10B rasyo altı firma → portfolyoda, A10 ile aynı computeAmount', () => {
    const result = runEngineV3({
      ...R83_LOW_EQUITY_INPUT,
      options: { allowedActionIds: ['A10B_PROMISSORY_NOTE_EQUITY_INJECTION'] },
    })
    const a10bResult = result.portfolio.find(a => a.actionId === 'A10B_PROMISSORY_NOTE_EQUITY_INJECTION')
    expect(a10bResult).toBeDefined()
    expect(a10bResult!.amountTRY).toBeGreaterThan(2_000_000)
    // A10B yevmiye: 121 DEBIT / 500 CREDIT (DOKUNULMAZ)
    const legs = a10bResult!.transactions.flatMap(tx => tx.legs)
    expect(legs.some(l => l.accountCode === '121' && l.side === 'DEBIT')).toBe(true)
    expect(legs.some(l => l.accountCode === '500' && l.side === 'CREDIT')).toBe(true)
  })

  // T_R83_4: A10 transparency — kind:'margin', current < sectorMedian
  test('T_R83_4 — A10 ratioTransparency: kind=margin, current < sectorMedian', () => {
    const result = runEngineV3({
      ...R83_LOW_EQUITY_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION'] },
    })
    const a10Result = result.portfolio.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    expect(a10Result).toBeDefined()
    const rt = a10Result!.ratioTransparency
    expect(rt).toBeDefined()
    expect(rt!.kind).toBe('margin')
    const marginRt = rt as any
    // current < sectorMedian (%52) — rasyo altı firma
    expect(marginRt.current).toBeLessThan(0.52)
    expect(marginRt.current).toBeGreaterThan(0)
  })

  // T_R83_5: A10 yevmiye DOKUNULMAZ — 102 DEBIT / 500 CREDIT
  test('T_R83_5 — A10 yevmiye DOKUNULMAZ: 102 DEBIT / 500 CREDIT', () => {
    const result = runEngineV3({
      ...R83_LOW_EQUITY_INPUT,
      options: { allowedActionIds: ['A10_CASH_EQUITY_INJECTION'] },
    })
    const a10Result = result.portfolio.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')
    expect(a10Result).toBeDefined()
    const legs = a10Result!.transactions.flatMap(tx => tx.legs)
    expect(legs.some(l => l.accountCode === '102' && l.side === 'DEBIT')).toBe(true)
    expect(legs.some(l => l.accountCode === '500' && l.side === 'CREDIT')).toBe(true)
  })

})
