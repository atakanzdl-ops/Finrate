/**
 * Faz 7.3.12-PRE-FIX — consolidateByActionId ratioTransparency rebuild testleri.
 *
 * Sorun: Çoklu parçalı aksiyon (A10: short + medium + long) consolidate edildiğinde
 *   amountTRY toplam doğru toplanıyor ancak ratioTransparency ilk parçanın tutarıyla
 *   hesaplanmış değerini koruyordu.
 *
 * Çözüm: consolidateByActionId merge sonrası realisticTarget'ı toplam tutarla yeniden
 *   hesaplar. Tek parçalı aksiyonlar etkilenmez.
 */

import { consolidateByActionId } from '../decisionLayer'
import type { SelectedAction } from '../engineV3'
import type {
  MarginRatioTransparency,
  TurnoverRatioTransparency,
  BalanceRatioTransparency,
  HorizonKey,
} from '../contracts'

// ─── Test yardımcıları ────────────────────────────────────────────────────────

function makeAction(
  actionId:          string,
  amountTRY:         number,
  horizon:           HorizonKey = 'short',
  ratioTransparency?: SelectedAction['ratioTransparency'],
): SelectedAction {
  return {
    actionId,
    actionName:                 actionId,
    horizon,
    amountTRY,
    transactions:               [],
    qualityScore:               0.8,
    productivityRepairStrength: 'MODERATE',
    sustainability:             'RECURRING',
    sectorCompatibility:        1,
    guardrailSeverity:          'PASS',
    estimatedNotchContribution: 0.5,
    repeatDecayApplied:         1,
    diversityPenaltyApplied:    1,
    narrative:                  '',
    ratioTransparency,
  }
}

// ─── Faz 7.3.12-PRE-FIX — consolidateByActionId ──────────────────────────────

describe('Faz 7.3.12-PRE-FIX — consolidateByActionId transparency rebuild', () => {

  // DEKAM-like değerler: E_baseline=6.1Mn, A_baseline=315Mn
  // - current = 6.1 / 315 ≈ 0.01937 (%1.94)
  // - SHORT parça (a1=11.86Mn) ile rt1 = (6.1+11.86)/(315+11.86) ≈ 0.0549 (%5.49)
  // - TOPLAM 38.51Mn ile rt_total = (6.1+38.51)/(315+38.51) ≈ 0.1262 (%12.6) ← fix hedefi
  const E_b = 6_100_000
  const A_b = 315_000_000
  const baselineCurrent = E_b / A_b  // 0.019365...

  const a1  = 11_860_000   // short parça
  const a2  = 12_810_000   // medium parça
  const a3  = 13_840_000   // long parça
  const TOTAL = a1 + a2 + a3  // 38_510_000

  function makeMarginRt(amount: number): MarginRatioTransparency {
    return {
      kind:             'margin',
      metricLabel:      'Özkaynak / Aktif',
      current:          baselineCurrent,
      realisticTarget:  (E_b + amount) / (A_b + amount),
      sectorMedian:     0.34,
      formula: {
        description: 'Özkaynak / Aktif = Özkaynaklar / Toplam Aktif → A10 sonrası: (Özkaynak + Tutar) / (Aktif + Tutar)',
      },
    }
  }

  // ── TEST 1 ──────────────────────────────────────────────────────────────────

  test('TEST 1: A10 üç parçalı — realisticTarget toplam tutarla yeniden hesaplanır (~%12.6)', () => {
    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', a1, 'short',  makeMarginRt(a1)),
      makeAction('A10_CASH_EQUITY_INJECTION', a2, 'medium', makeMarginRt(a2)),
      makeAction('A10_CASH_EQUITY_INJECTION', a3, 'long',   makeMarginRt(a3)),
    ]

    const consolidated = consolidateByActionId(pieces)

    // Tek kayıt
    expect(consolidated).toHaveLength(1)

    // Tutar toplandı
    expect(consolidated[0].amountTRY).toBe(TOTAL)

    const rt = consolidated[0].ratioTransparency as MarginRatioTransparency
    expect(rt).toBeDefined()
    expect(rt.kind).toBe('margin')

    // current değişmedi — baseline (%1.94)
    expect(rt.current).toBeCloseTo(baselineCurrent, 5)

    // realisticTarget = (E_b + TOTAL) / (A_b + TOTAL) ≈ %12.62
    const expected = (E_b + TOTAL) / (A_b + TOTAL)
    expect(rt.realisticTarget).toBeCloseTo(expected, 4)

    // İlk parçanın yanlış değeri (%5.49) artık gösterilmiyor
    const wrongFirstPieceRt = (E_b + a1) / (A_b + a1)
    expect(rt.realisticTarget).not.toBeCloseTo(wrongFirstPieceRt, 2)
  })

  // ── TEST 2 ──────────────────────────────────────────────────────────────────

  test('TEST 2: Tek parçalı A05 — transparency değişmez (regresyon yok)', () => {
    const balanceTr: BalanceRatioTransparency = {
      kind:             'balance',
      currentBalance:   18_000_000,
      realisticTarget:   5_500_000,
      sectorMedian:      3_000_000,
      capPercent:        0.25,
      formula: {
        targetLabel:  'Hedef Alacak',
        basisLabel:   'Net Satış',
        basisValue:    50_000_000,
        targetDays:    40,
        periodDays:   365,
      },
      attribution: { sourceType: 'TCMB_DIRECT', sectorLabel: 'İmalat', year: 2024 },
      method:           'period-end-balance',
    }

    const pieces: SelectedAction[] = [
      makeAction('A05_RECEIVABLE_COLLECTION', 12_500_000, 'short', balanceTr),
    ]

    const consolidated = consolidateByActionId(pieces)

    expect(consolidated).toHaveLength(1)
    // Tek parça — transparency AYNEN korunur (deep-equal)
    expect(consolidated[0].ratioTransparency).toEqual(balanceTr)
  })

  // ── TEST 3 ──────────────────────────────────────────────────────────────────

  test('TEST 3: A18 iki parçalı turnover — realisticTarget toplam tutarla yeniden hesaplanır', () => {
    const netSales    = 50_000_000
    const totalAssets = 250_000_000
    const amt1        =  7_500_000   // medium
    const amt2        =  8_000_000   // long
    const total       = amt1 + amt2  // 15_500_000

    const makeTurnoverRt = (amount: number): TurnoverRatioTransparency => ({
      kind:             'turnover',
      metricLabel:      'Aktif Devir Hızı',
      current:          netSales / totalAssets,
      realisticTarget:  (netSales + amount) / totalAssets,
      sectorMedian:     0.80,
      formula: {
        description:  'Aktif Devir Hızı = Net Satış / Toplam Aktif',
        netSales,
        totalAssets,
      },
    })

    const pieces: SelectedAction[] = [
      makeAction('A18_NET_SALES_GROWTH', amt1, 'medium', makeTurnoverRt(amt1)),
      makeAction('A18_NET_SALES_GROWTH', amt2, 'long',   makeTurnoverRt(amt2)),
    ]

    const consolidated = consolidateByActionId(pieces)

    expect(consolidated).toHaveLength(1)
    expect(consolidated[0].amountTRY).toBe(total)

    const rt = consolidated[0].ratioTransparency as TurnoverRatioTransparency
    expect(rt.kind).toBe('turnover')

    // realisticTarget = (netSales + total) / totalAssets
    const expected = (netSales + total) / totalAssets
    expect(rt.realisticTarget).toBeCloseTo(expected, 6)

    // İlk parçanın değeri artık gösterilmiyor
    expect(rt.realisticTarget).not.toBeCloseTo((netSales + amt1) / totalAssets, 6)
  })

  // ── TEST 4 ──────────────────────────────────────────────────────────────────

  test('TEST 4: margin kind rt1 ≈ current — degenerate input, crash yok, rebuild atlanır', () => {
    // rt1 = current → (rt1 - c) = 0 → bölme sıfır → A = ∞ → skip
    const degenerateRt: MarginRatioTransparency = {
      kind:             'margin',
      metricLabel:      'Test',
      current:          0.05,
      realisticTarget:  0.05,  // = current → degenerate
      sectorMedian:     0.34,
      formula:          { description: '...' },
    }

    const normalSecondPiece: MarginRatioTransparency = {
      ...degenerateRt,
      realisticTarget: 0.08,
    }

    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', 5_000_000, 'short',  degenerateRt),
      makeAction('A10_CASH_EQUITY_INJECTION', 6_000_000, 'medium', normalSecondPiece),
    ]

    // Crash olmamalı
    expect(() => consolidateByActionId(pieces)).not.toThrow()

    const consolidated = consolidateByActionId(pieces)
    expect(consolidated).toHaveLength(1)
    // Rebuild atlandı → ilk parçanın (degenerate) rt'si korunur
    const rt = consolidated[0].ratioTransparency as MarginRatioTransparency
    expect(rt.realisticTarget).toBeCloseTo(0.05, 6)
  })

  // ── TEST 5 (ek regresyon) ────────────────────────────────────────────────────

  test('TEST 5: Farklı actionId\'ler — birbirini etkilemez', () => {
    const marginRt: MarginRatioTransparency = {
      kind:             'margin',
      metricLabel:      'Özkaynak / Aktif',
      current:          baselineCurrent,
      realisticTarget:  (E_b + a1) / (A_b + a1),
      sectorMedian:     0.34,
      formula:          { description: '...' },
    }

    const turnoverRt: TurnoverRatioTransparency = {
      kind:             'turnover',
      metricLabel:      'Aktif Devir Hızı',
      current:          0.20,
      realisticTarget:  0.23,
      sectorMedian:     0.80,
      formula:          { description: '...', netSales: 50_000_000, totalAssets: 250_000_000 },
    }

    const pieces: SelectedAction[] = [
      makeAction('A10_CASH_EQUITY_INJECTION', a1, 'short',  marginRt),
      makeAction('A10_CASH_EQUITY_INJECTION', a2, 'medium', { ...marginRt, realisticTarget: (E_b + a2) / (A_b + a2) }),
      makeAction('A18_NET_SALES_GROWTH',       5_000_000, 'medium', turnoverRt),
    ]

    const consolidated = consolidateByActionId(pieces)

    // A10 + A18 = 2 kayıt
    expect(consolidated).toHaveLength(2)

    const a10 = consolidated.find(a => a.actionId === 'A10_CASH_EQUITY_INJECTION')!
    const a18 = consolidated.find(a => a.actionId === 'A18_NET_SALES_GROWTH')!

    // A10 doğru rebuild
    expect(a10.amountTRY).toBe(a1 + a2)
    const a10rt = a10.ratioTransparency as MarginRatioTransparency
    expect(a10rt.realisticTarget).toBeCloseTo((E_b + a1 + a2) / (A_b + a1 + a2), 4)

    // A18 tek parça — değişmedi
    expect(a18.amountTRY).toBe(5_000_000)
    const a18rt = a18.ratioTransparency as TurnoverRatioTransparency
    expect(a18rt.realisticTarget).toBeCloseTo(0.23, 6)
  })

})
