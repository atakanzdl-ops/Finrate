/**
 * R8.4.3 — İSRA FIXTURE TESTİ (Teşhis / Regression)
 *
 * Analiz ID: d2b65eff + 9f0d261c — CONSTRUCTION sektörü, stok çakışması
 *
 * Bu test şunları doğrular:
 *   1. GUARD_UNIT   — validatePortfolioResources A18+A19 birlikte infeasible döner
 *   2. GUARD_ALONE  — A18 veya A19 tek başına feasible döner
 *   3. SUBSET_GUARD — selectTargetPackage alt küme aramasında A18+A19 birlikte seçmez
 *   4. NR_GUARD     — NOT_REACHED yolunda safePortfolio 150'yi negatife düşürmez
 *
 * İSRA parametreleri:
 *   sector:  CONSTRUCTION
 *   150:     307_700_000 TL (dominant stok)
 *   120:     129_300_000 TL (alacak)
 *   340:     937_000_000 TL (alınan avanslar)
 *   G=0.40   grossMargin (netSales=700M, grossProfit=280M)
 *
 * Hesap:
 *   A18_amount  = 243_000_000 → costAmount = 243M × 0.60 = 145_800_000
 *   A19_amount  = 270_000_000 → costAmount = 270M × 0.60 = 162_000_000
 *   Toplam 150 CREDIT = 307_800_000 > 307_700_000 → -100_000 → infeasible
 */

import { getActionTemplateV3 }        from '../actionCatalogV3'
import { validatePortfolioResources }  from '../portfolioResourceGuard'
import { selectTargetPackage }         from '../targetPackage'
import type { SelectedAction }         from '../engineV3'
import type { ActionBuildContext }     from '../contracts'

// ─── İSRA Sabit Parametreleri ────────────────────────────────────────────────

const INITIAL_BALANCES = {
  '100': 50_000_000,
  '120': 129_300_000,
  '150': 307_700_000,   // dominant stok
  '300': 200_000_000,
  '340': 937_000_000,   // alınan avanslar
  '400': 500_000_000,
  '500': 150_000_000,
}

const ISRA_GROSS_MARGIN    = 0.40         // G = 0.40
const A18_AMOUNT           = 243_000_000  // cost = 243M × 0.60 = 145.8M
const A19_AMOUNT           = 270_000_000  // cost = 270M × 0.60 = 162.0M
const COST_A18             = Math.round(A18_AMOUNT * (1 - ISRA_GROSS_MARGIN)) // 145_800_000
const COST_A19             = Math.round(A19_AMOUNT * (1 - ISRA_GROSS_MARGIN)) // 162_000_000
const COMBINED_COST        = COST_A18 + COST_A19                               // 307_800_000
const INITIAL_STOCK        = INITIAL_BALANCES['150']                           // 307_700_000

/** A18 buildTransactions context */
function makeA18Context(): ActionBuildContext {
  return {
    sector:          'CONSTRUCTION',
    horizon:         'medium',
    analysis:        {},
    amount:          A18_AMOUNT,
    previousActions: [],
    accountBalances: INITIAL_BALANCES,
    netSales:        700_000_000,
    grossProfit:     280_000_000,           // G = 0.40
    baselineNetSales:        700_000_000,
    baselineGrossProfit:     280_000_000,
    baselineAccountBalances: INITIAL_BALANCES,
  }
}

/** A19 buildTransactions context */
function makeA19Context(): ActionBuildContext {
  return {
    sector:          'CONSTRUCTION',
    horizon:         'short',
    analysis:        {},
    amount:          A19_AMOUNT,
    previousActions: [],
    accountBalances: INITIAL_BALANCES,
    netSales:        700_000_000,
    grossProfit:     280_000_000,
    baselineNetSales:        700_000_000,
    baselineGrossProfit:     280_000_000,
    baselineAccountBalances: INITIAL_BALANCES,
  }
}

/** Catalog'dan gerçek işlem kaydını üret */
function buildA18Txs() {
  const tmpl = getActionTemplateV3('A18_NET_SALES_GROWTH')
  if (!tmpl) throw new Error('A18 katalogda bulunamadı')
  return tmpl.buildTransactions(makeA18Context())
}

function buildA19Txs() {
  const tmpl = getActionTemplateV3('A19_ADVANCE_TO_REVENUE')
  if (!tmpl) throw new Error('A19 katalogda bulunamadı')
  return tmpl.buildTransactions(makeA19Context())
}

/** SelectedAction yapısı — transactions gerçek catalog çıktısı */
function makeSelectedAction(
  id: string,
  amountTRY: number,
  txs: ReturnType<typeof buildA18Txs>,
): SelectedAction {
  return {
    actionId:                   id,
    actionName:                 id,
    horizon:                    'medium',
    amountTRY,
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

// ─── Yardımcı: 150 hesabının toplam CREDIT miktarını hesapla ─────────────────

function total150Credit(actions: SelectedAction[]): number {
  return actions
    .flatMap(a => a.transactions)
    .flatMap(t => t.legs)
    .filter(l => l.accountCode === '150' && l.side === 'CREDIT')
    .reduce((sum, l) => sum + l.amount, 0)
}

// ─── T_FIXTURE_SETUP — Katalog doğrulaması ───────────────────────────────────

describe('R8.4.3 İSRA Fixture — kurulum doğrulaması', () => {
  test('A18 ve A19 katalogdan üretilir, 150 CREDIT legs içerir', () => {
    const a18Txs = buildA18Txs()
    const a19Txs = buildA19Txs()

    expect(a18Txs.length).toBeGreaterThan(0)
    expect(a19Txs.length).toBeGreaterThan(0)

    // A18: CONSTRUCTION + stok mevcut → A18_REVENUE_AND_COST (150 CREDIT içermeli)
    const a18_150 = a18Txs.flatMap(t => t.legs).filter(l => l.accountCode === '150' && l.side === 'CREDIT')
    expect(a18_150.length).toBeGreaterThan(0)
    expect(a18_150[0].amount).toBeCloseTo(COST_A18, -3)  // ±1000 TL tolerans

    // A19: CONSTRUCTION + stok mevcut + avans mevcut → A19_DELIVERY_REVENUE_AND_COST (150 CREDIT)
    const a19_150 = a19Txs.flatMap(t => t.legs).filter(l => l.accountCode === '150' && l.side === 'CREDIT')
    expect(a19_150.length).toBeGreaterThan(0)
    expect(a19_150[0].amount).toBeCloseTo(COST_A19, -3)

    // Toplam > başlangıç bakiyesi
    const combined = a18_150[0].amount + a19_150[0].amount
    expect(combined).toBeGreaterThan(INITIAL_STOCK)
    console.log(`A18 cost: ${a18_150[0].amount.toLocaleString()} TL`)
    console.log(`A19 cost: ${a19_150[0].amount.toLocaleString()} TL`)
    console.log(`Combined: ${combined.toLocaleString()} TL (limit: ${INITIAL_STOCK.toLocaleString()} TL)`)
    console.log(`Fark: ${(combined - INITIAL_STOCK).toLocaleString()} TL`)
  })
})

// ─── T_GUARD_UNIT — Doğrudan guard birimi ────────────────────────────────────

describe('R8.4.3 İSRA Fixture — Guard birim testi', () => {

  test('GUARD_UNIT_1 — A18+A19 birlikte: infeasible (150 negatife düşer)', () => {
    const allTxs = [...buildA18Txs(), ...buildA19Txs()]
    const result = validatePortfolioResources(allTxs, INITIAL_BALANCES)

    // Kombinasyon uygulanamaz — 150 bakiyesi negatife iner
    expect(result.feasible).toBe(false)
    expect(result.reason).toBeTruthy()
    console.log(`Guard infeasible reason: ${result.reason}`)
  })

  test('GUARD_UNIT_2 — Yalnız A18: feasible (150 yeterli)', () => {
    const a18Txs = buildA18Txs()
    const result = validatePortfolioResources(a18Txs, INITIAL_BALANCES)

    expect(result.feasible).toBe(true)
    // 150 remaining = 307.7M - COST_A18 = 307.7 - 145.8 = 161.9M
    const remaining150 = INITIAL_STOCK - COST_A18
    expect(remaining150).toBeGreaterThan(0)
    console.log(`A18 alone: 150 remaining = ${remaining150.toLocaleString()} TL`)
  })

  test('GUARD_UNIT_3 — Yalnız A19: feasible (150 yeterli, maxByStock cap geçerli)', () => {
    const a19Txs = buildA19Txs()
    const result = validatePortfolioResources(a19Txs, INITIAL_BALANCES)

    expect(result.feasible).toBe(true)
    const remaining150 = INITIAL_STOCK - COST_A19
    expect(remaining150).toBeGreaterThan(0)
    console.log(`A19 alone: 150 remaining = ${remaining150.toLocaleString()} TL`)
  })
})

// ─── T_NR_ISRA — selectTargetPackage NOT_REACHED yolu ───────────────────────

describe('R8.4.3 İSRA Fixture — selectTargetPackage NOT_REACHED guard', () => {

  test('NR_ISRA_1 — 7 pad + A18 + A19 → NOT_REACHED → 150 negatife düşmez', () => {
    // 7 boş pad + A18 (medium pos) + A19 (short pos) = 9 ≤ 12 → subset arama
    const pads = Array.from({ length: 7 }, (_, i) =>
      makeSelectedAction(`PAD_${String(i + 1).padStart(2, '0')}`, 1_000_000, []),
    )
    const a18 = makeSelectedAction('A18_NET_SALES_GROWTH', A18_AMOUNT, buildA18Txs())
    const a19 = makeSelectedAction('A19_ADVANCE_TO_REVENUE', A19_AMOUNT, buildA19Txs())

    // A19 (short) önce, A18 (medium) sonra — engine sırası
    const portfolio: SelectedAction[] = [a19, ...pads.slice(0, 3), a18, ...pads.slice(3)]
    expect(portfolio.length).toBe(9)

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BBB',
      requestedTarget:       'AAA',   // ulaşılamaz → NOT_REACHED
    })

    // NOT_REACHED tetiklendi
    expect(result.meta.status).toBe('NOT_REACHED')
    expect(result.meta.fallback).toBe(true)

    // R8.4.3 guard mesajı var
    const guardMsg = result.meta.warnings.find(w =>
      w.includes('R8.4.3') && w.includes('NOT_REACHED'),
    )
    expect(guardMsg).toBeTruthy()
    console.log(`Guard warning: ${guardMsg}`)

    // A18+A19 birlikte YOK
    const ids = result.selectedActions.map(a => a.actionId)
    expect(ids.includes('A18_NET_SALES_GROWTH') && ids.includes('A19_ADVANCE_TO_REVENUE')).toBe(false)

    // 150 negatif değil
    const used150 = total150Credit(result.selectedActions)
    expect(used150).toBeLessThanOrEqual(INITIAL_STOCK)
    console.log(`150 kullanım: ${used150.toLocaleString()} / ${INITIAL_STOCK.toLocaleString()} TL`)
  })

  test('NR_ISRA_2 — REACHED yolunda da A18+A19 birlikte seçilmez (subset guard)', () => {
    // Sadece 3 aksiyon: guard A18+A19 subset'ini reddeder → ya A18 ya A19 seçilir
    const a18 = makeSelectedAction('A18_NET_SALES_GROWTH', A18_AMOUNT, buildA18Txs())
    const a19 = makeSelectedAction('A19_ADVANCE_TO_REVENUE', A19_AMOUNT, buildA19Txs())

    // Üçüncü aksiyon: boş (150'ye dokunmaz)
    const padAction = makeSelectedAction('A05_DSO_REDUCTION', 50_000_000, [])

    const portfolio: SelectedAction[] = [a19, padAction, a18]
    expect(portfolio.length).toBe(3)

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BBB',
      requestedTarget:       'BBB',   // elde edilebilir bir hedef
    })

    // Hangi yol gelirse gelsin: A18+A19 birlikte YOK
    const ids = result.selectedActions.map(a => a.actionId)
    const bothPresent = ids.includes('A18_NET_SALES_GROWTH') && ids.includes('A19_ADVANCE_TO_REVENUE')
    expect(bothPresent).toBe(false)
    console.log(`Status: ${result.meta.status}, Selected: [${ids.join(', ')}]`)

    // 150 tüketimi ≤ başlangıç bakiyesi
    const used150 = total150Credit(result.selectedActions)
    expect(used150).toBeLessThanOrEqual(INITIAL_STOCK)
  })
})

// ─── T_DEPLOY_CHECK — Deployment savunma testi ───────────────────────────────

describe('R8.4.3 İSRA Fixture — Deployment savunma (kod versiyonu)', () => {
  test('COMBINED_COST gerçekten INITIAL_STOCK\'u geçiyor (hesap doğrulaması)', () => {
    console.log(`COST_A18:       ${COST_A18.toLocaleString()} TL`)
    console.log(`COST_A19:       ${COST_A19.toLocaleString()} TL`)
    console.log(`COMBINED_COST:  ${COMBINED_COST.toLocaleString()} TL`)
    console.log(`INITIAL_STOCK:  ${INITIAL_STOCK.toLocaleString()} TL`)
    console.log(`FARK:          +${(COMBINED_COST - INITIAL_STOCK).toLocaleString()} TL`)

    expect(COMBINED_COST).toBeGreaterThan(INITIAL_STOCK)
  })
})
