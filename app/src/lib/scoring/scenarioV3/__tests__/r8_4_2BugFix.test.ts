/**
 * R8.4.2 — A05 120-only hesap + Fallback guard testleri.
 *
 * Kapsam:
 *   BUG A — A05 helper'da 120+121 toplamı yerine sadece 120 kullanımı
 *   BUG B — N>12 FALLBACK yolunda validatePortfolioResources çağrısı
 *
 * README dersleri uygulandı:
 *   - Birim test + engine entegrasyon testi (R6 dersi)
 *   - allowedActionIds ile izole test (R7A dersi)
 *
 * Sabitler:
 *   T_A05_3..5   — getReceivableCollectionTarget 120-only birim testleri
 *   T_A05_ENG_1  — Engine entegrasyon: büyük 121 varken 120 negatife düşmez
 *   T_FB_1..3    — validatePortfolioResources fallback guard birim testleri
 *   T_FB_ENG_1   — selectTargetPackage N>12 fallback yolu uçtan uca entegrasyon
 */

import { getReceivableCollectionTarget }         from '../ratioHelpers'
import { validatePortfolioResources }            from '../portfolioResourceGuard'
import { selectTargetPackage }                   from '../targetPackage'
import { runEngineV3 }                           from '../engineV3'
import type { EngineInput, SelectedAction }      from '../engineV3'
import type { FirmContext }                      from '../contracts'
import type { AccountingTransaction }            from '../contracts'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<FirmContext> = {}): FirmContext {
  return {
    sector:            'CONSTRUCTION',
    accountBalances:   {},
    totalAssets:       500_000_000,
    totalEquity:        50_000_000,
    totalRevenue:      200_000_000,
    netIncome:          10_000_000,
    netSales:          200_000_000,
    operatingProfit:    20_000_000,
    grossProfit:        40_000_000,
    interestExpense:     5_000_000,
    operatingCashFlow:  15_000_000,
    period:            'ANNUAL',
    ...overrides,
  } as FirmContext
}

function makeTx(
  id: string,
  legs: { accountCode: string; side: 'DEBIT' | 'CREDIT'; amount: number }[]
): AccountingTransaction {
  return {
    transactionId: id,
    description:   id,
    semanticType:  'OPERATIONAL_REVENUE',
    legs: legs.map(l => ({
      accountCode:  l.accountCode,
      accountName:  l.accountCode,
      side:         l.side,
      amount:       l.amount,
      description:  l.accountCode,
    })),
  }
}

// ─── T_A05 — getReceivableCollectionTarget 120-only ──────────────────────────

describe('R8.4.2 — A05 helper: sadece 120 kullanılır (121 göz ardı)', () => {

  // T_A05_3: İSRA-benzeri büyük 121 — amount ≤ 120 bakiyesi (negatif düşmez)
  test('T_A05_3 — İSRA-benzeri: büyük 121 olsa da amount ≤ ar120', () => {
    // İSRA: 120=129.3M, 121=771M
    // R8.4.2 öncesi: ar=900M, amount=270.1M > 120 bakiyesi → 120 negatife düşüyordu
    // R8.4.2 sonrası: ar=120=129.3M, amount bu değeri aşamaz
    const ctx = makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: {
        '120': 129_300_000,
        '121': 771_000_000,  // BÜYÜK — eskiden amount'u şişiriyordu
      },
      netSales: 200_000_000,  // DSO = (129.3/200) × 365 = 236 gün > 79 × 1.1
    })
    const result = getReceivableCollectionTarget(ctx, { halfGap: true })
    // Guard 1: DSO=236 > 86.9 → pass
    // amount = 129.3M - targetAR ≤ 129.3M (sadece 120 baz)
    expect(result).not.toBeNull()
    expect(result!).toBeLessThanOrEqual(129_300_000)
    expect(result!).toBeGreaterThan(0)
  })

  // T_A05_4: Büyük 121 varken DSO hesabı sadece 120 üzerinden
  // 120=10M, 121=1B, netSales=100M → DSO(120 only) = 36.5 gün < 53 × 1.1 → null
  test('T_A05_4 — DSO(120 only)=36.5 gün, sektör altı → null', () => {
    const ctx = makeCtx({
      sector:          'MANUFACTURING',
      accountBalances: {
        '120':         10_000_000,
        '121': 1_000_000_000,  // R8.4.2 öncesi: DSO=3680 gün, çok büyük amount
      },
      netSales: 100_000_000,
    })
    // MANUFACTURING bm=53: 10M/100M×365=36.5 < 53×1.1=58.3 → null
    expect(getReceivableCollectionTarget(ctx, { halfGap: true })).toBeNull()
  })

  // T_A05_5: 120=0, 121 büyük → null guard (ar=0)
  test('T_A05_5 — 120=0 (alacak yok) → null', () => {
    const ctx = makeCtx({
      accountBalances: {
        '120':             0,
        '121': 100_000_000,
      },
      netSales: 50_000_000,
    })
    expect(getReceivableCollectionTarget(ctx, { halfGap: true })).toBeNull()
  })

  // T_A05_6: Normal senaryo — 120 yüksek DSO, 121=0 — davranış korunur
  // CONSTRUCTION, 120=50M, netSales=50M → DSO=365 >> 79 bm
  test('T_A05_6 — normal yüksek DSO, 121=0 → half-gap tutar üretir', () => {
    const ctx = makeCtx({
      sector:          'CONSTRUCTION',
      accountBalances: { '120': 50_000_000 },
      netSales:        50_000_000,
    })
    // DSO=365 > 86.9 → halfGapDSO=(365+79)/2=222 → targetAR=50M×222/365=30.4M
    // amount=50M-30.4M=19.6M; 19.6M ≤ 50M (120 bakiyesi) ✓
    const result = getReceivableCollectionTarget(ctx, { halfGap: true })
    expect(result).not.toBeNull()
    expect(result!).toBeGreaterThan(500_000)
    expect(result!).toBeLessThanOrEqual(50_000_000)  // ≤ 120 bakiyesi
  })
})

// ─── T_A05_ENG — Engine entegrasyon (README R6 dersi zorunluluğu) ─────────────

describe('R8.4.2 — A05 engine entegrasyon: 120 negatife düşmez', () => {

  // T_A05_ENG_1: İSRA-benzeri büyük 121 — engine A05 seçerse 120 sınırı içinde
  test('T_A05_ENG_1 — büyük 121 varken A05 amountTRY ≤ ar120', () => {
    const input: EngineInput = {
      sector:         'CONSTRUCTION',
      currentRating:  'B',
      targetRating:   'BBB',
      accountBalances: {
        '120': 129_300_000,
        '121': 771_000_000,
        '102':  25_900_000,
        '300': 200_000_000,
        '400': 150_000_000,
        '150': 307_700_000,
        '153':  10_000_000,
      },
      incomeStatement: {
        netSales:        200_000_000,
        costOfGoodsSold: 120_000_000,
        grossProfit:      80_000_000,
        operatingProfit:  30_000_000,
        netIncome:        10_000_000,
        interestExpense:   5_000_000,
      },
      period: 'ANNUAL',
      options: {
        allowedActionIds: ['A05_RECEIVABLE_COLLECTION'],
      },
    }

    const result = runEngineV3(input)
    const a05 = result.portfolio.find(a => a.actionId === 'A05_RECEIVABLE_COLLECTION')

    if (a05) {
      // A05 seçildiyse amount ≤ 120 bakiyesi olmalı (129.3M)
      expect(a05.amountTRY).toBeLessThanOrEqual(129_300_000)
      expect(a05.amountTRY).toBeGreaterThan(0)
    }
    // A05 seçilmeyebilir de (DSO guard, materyalite vb.) — bu da geçerli
    // Önemli olan: seçilirse negatif 120 üretmemesi
  })
})

// ─── T_FB — validatePortfolioResources fallback guard ────────────────────────

describe('R8.4.2 — Fallback guard (N > 12 yolu)', () => {

  // T_FB_1: İSRA A18+A19 birleşik — 150 negatife düşer → infeasible
  // Dengeli yevmiye: 120 DEBIT = 150 CREDIT (basit stok-alacak dönüşümü)
  test('T_FB_1 — A18+A19 birlikte 150 → -0.1M infeasible', () => {
    const txA18 = makeTx('A18', [
      { accountCode: '120', side: 'DEBIT',  amount: 145_800_000 },  // alacak artar
      { accountCode: '150', side: 'CREDIT', amount: 145_800_000 },  // stok azalır
    ])
    const txA19 = makeTx('A19', [
      { accountCode: '120', side: 'DEBIT',  amount: 162_000_000 },
      { accountCode: '150', side: 'CREDIT', amount: 162_000_000 },
    ])
    const result = validatePortfolioResources(
      [txA18, txA19],
      { '150': 307_700_000, '120': 100_000_000 },
    )
    // 307.7M − 145.8M − 162M = −0.1M → infeasible
    expect(result.feasible).toBe(false)
    expect(result.reason).toBeTruthy()
  })

  // T_FB_2: Sadece A18 — 150 pozitif kalır → feasible
  test('T_FB_2 — Sadece A18 → 150 pozitif, feasible', () => {
    const txA18 = makeTx('A18', [
      { accountCode: '120', side: 'DEBIT',  amount: 145_800_000 },
      { accountCode: '150', side: 'CREDIT', amount: 145_800_000 },
    ])
    const result = validatePortfolioResources(
      [txA18],
      { '150': 307_700_000, '120': 100_000_000 },
    )
    // 307.7M − 145.8M = 161.9M > 0 → feasible
    expect(result.feasible).toBe(true)
  })

  // T_FB_3: Çakışmasız portföy → feasible
  test('T_FB_3 — Çakışmasız kombinasyon → feasible', () => {
    const txs = [
      makeTx('TX1', [
        { accountCode: '102', side: 'CREDIT', amount: 100_000_000 },
        { accountCode: '120', side: 'DEBIT',  amount: 100_000_000 },
      ]),
    ]
    const result = validatePortfolioResources(
      txs,
      { '102': 200_000_000, '120': 50_000_000 },
    )
    expect(result.feasible).toBe(true)
  })
})

// ─── T_FB_ENG — selectTargetPackage fallback entegrasyon ─────────────────────

describe('R8.4.2 — Fallback entegrasyon: N>12 yolu selectTargetPackage üzerinden', () => {

  /**
   * Minimal SelectedAction factory.
   * transactions=[] → ledger'a hiçbir şey iletmez; guard testi için pad yeterli.
   */
  function makeAction(id: string, txs: AccountingTransaction[] = []): SelectedAction {
    return {
      actionId:                   id,
      actionName:                 id,
      horizon:                    'short',
      amountTRY:                  1_000_000,
      transactions:               txs,
      qualityScore:               0.5,
      productivityRepairStrength: 'MEDIUM',
      sustainability:             'MEDIUM',
      sectorCompatibility:        0.8,
      guardrailSeverity:          'NONE',
      estimatedNotchContribution: 0.1,
      repeatDecayApplied:         1.0,
      diversityPenaltyApplied:    1.0,
      narrative:                  '',
    }
  }

  // T_FB_ENG_1: N>12 → fallback guard tetiklenir, A18+A19 çakışması yakalanır, A19 çıkar.
  //
  // Kurulum:
  //   - 12 pad aksiyon (işlemsiz — guard'ı etkilemez)
  //   - A18: 120 DEBIT 145.8M, 150 CREDIT 145.8M
  //   - A19: 120 DEBIT 162.0M, 150 CREDIT 162.0M   ← son sıraya eklenir → ilk poplanır
  //   Toplam: 14 aksiyon > SUBSET_SEARCH_LIMIT (12) → FALLBACK yolu
  //
  //   150 başlangıç bakiyesi = 307.7M
  //   A18+A19 birlikte: 307.7 − 145.8 − 162.0 = −0.1M → infeasible
  //   Sonra A19 çıkar:  307.7 − 145.8        = +161.9M → feasible ✓
  test('T_FB_ENG_1 — N=14 fallback, A18+A19 çakışması yakalanır, A19 portföyden çıkar', () => {
    // 12 pad aksiyon (işlemsiz)
    const padActions: SelectedAction[] = Array.from({ length: 12 }, (_, i) =>
      makeAction(`PAD_${String(i + 1).padStart(2, '0')}`),
    )

    // A18 — dengeli yevmiye: 150 stok azalır
    const a18Txs: AccountingTransaction[] = [makeTx('A18', [
      { accountCode: '120', side: 'DEBIT',  amount: 145_800_000 },
      { accountCode: '150', side: 'CREDIT', amount: 145_800_000 },
    ])]
    const a18 = makeAction('A18_INVENTORY_REDUCTION', a18Txs)

    // A19 — dengeli yevmiye: 150 stok azalır (SON SIRA → ilk pop hedefi)
    const a19Txs: AccountingTransaction[] = [makeTx('A19', [
      { accountCode: '120', side: 'DEBIT',  amount: 162_000_000 },
      { accountCode: '150', side: 'CREDIT', amount: 162_000_000 },
    ])]
    const a19 = makeAction('A19_COGS_REDUCTION', a19Txs)

    // Toplam 14 aksiyon: A19 en sonda (ilk poplanır)
    const portfolio: SelectedAction[] = [...padActions, a18, a19]
    expect(portfolio.length).toBe(14)  // > SUBSET_SEARCH_LIMIT (12)

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       { '150': 307_700_000, '120': 500_000_000 },
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BB',
      requestedTarget:       'BBB',
    })

    // 1. FALLBACK yolu tetiklendi
    expect(result.meta.fallback).toBe(true)
    expect(result.meta.status).toBe('FALLBACK')

    // 2. Guard mesajı warnings'a yazıldı
    // R8.4.3: FALLBACK guard prefix 'R8.4.2' → 'R8.4.3' olarak güncellendi
    const guardWarning = result.meta.warnings.find(w => w.includes('R8.4.3'))
    expect(guardWarning).toBeTruthy()

    // 3. A19 çıkarıldı (çakışma kaynağı)
    const finalIds = result.selectedActions.map(a => a.actionId)
    expect(finalIds).not.toContain('A19_COGS_REDUCTION')

    // 4. A18 kaldı (150 bakiyesi 161.9M — pozitif)
    expect(finalIds).toContain('A18_INVENTORY_REDUCTION')

    // 5. 150 nihai bakiyesi negatif olmamalı
    const totalCredit150 = result.selectedActions
      .flatMap(a => a.transactions)
      .filter(t => t.legs.some(l => l.accountCode === '150' && l.side === 'CREDIT'))
      .flatMap(t => t.legs.filter(l => l.accountCode === '150' && l.side === 'CREDIT'))
      .reduce((sum, l) => sum + l.amount, 0)
    expect(totalCredit150).toBeLessThanOrEqual(307_700_000)  // ≤ başlangıç bakiyesi
  })
})
