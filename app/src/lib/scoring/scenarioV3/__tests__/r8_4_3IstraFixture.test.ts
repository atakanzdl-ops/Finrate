/**
 * R8.4.3 — İSRA FIXTURE TESTİ (Teşhis / Regression)
 *
 * Analiz ID: d2b65eff + 9f0d261c — CONSTRUCTION sektörü, stok çakışması
 *
 * ── TEMEL BULGU (engine sequential context) ──────────────────────────────────
 *   Engine horizon sırası: short → medium → long.
 *   A19 horizon = 'short' → SHORT PASS'ta seçilir, INITIAL balance görür.
 *   A18 horizon = 'medium' → MEDIUM PASS'ta seçilir, A19 sonrası UPDATED balance görür.
 *
 *   SHORT  pass: A19 selected → costAmount_A19 = 162M (maxByStock=512.9M >> 270M, cap yok)
 *                context update: 150 = 307_743_978 − 162_000_000 = 145_743_978
 *   MEDIUM pass: A18 selected → maxByStock = 145_743_978 / 0.60 = 242_906_630 < 243M
 *                A18 CAPPED → costAmount_A18 = 145_743_978
 *   Combined: 162_000_000 + 145_743_978 = 307_743_978 = initial_150 → 0 remaining → FEASIBLE ✓
 *
 *   fullPortfolio = [...shortActions, ...mediumActions] → A19 önce, A18 sonra.
 *   validatePortfolioResources: sequential apply → A19 first → 0 deficit → FEASIBLE ✓
 *
 * ── FIXTURE TESTİNİN KAPSAMI ─────────────────────────────────────────────────
 *   1. FIXTURE_SETUP  — katalog doğrulaması
 *   2. GUARD_UNIT     — "eş zamanlı initial balance" senaryosu (teorik, engine'de olmaz)
 *   3. GUARD_ENGINE   — gerçek engine sırası: A19 önce (initial), A18 sonra (remaining)
 *   4. NR_GUARD       — NOT_REACHED yolunda guard testi (fixture: A18 initial → infeasible)
 *
 * ── NEDEN FIXTURE'DA A18+A19 INFEASIBLE, CANLIDA FEASIBLE? ──────────────────
 *   Fixture GUARD_UNIT_1: allTxs = [A18_txs(initial), A19_txs(initial)]
 *     → A18 first: 150 = 307.7M − 145.8M = 161.9M
 *     → A19 next:  150 = 161.9M − 162.0M = −56K TL → INFEASIBLE ✓ (teorik test)
 *
 *   Gerçek engine: transactions = [A19_txs(initial), A18_txs(remaining=145.74M)]
 *     → A19 first: 150 = 307.74M − 162.0M = 145.74M ✓
 *     → A18 next:  150 = 145.74M − 145.74M = 0 ✓ → FEASIBLE ✓ (canlı davranış)
 *
 * İSRA parametreleri:
 *   sector:  CONSTRUCTION
 *   150:     307_700_000 TL (dominant stok — test fixture; canlı: 307_743_978)
 *   120:     129_300_000 TL (alacak)
 *   340:     937_000_000 TL (alınan avanslar)
 *   G=0.40   grossMargin (netSales=700M, grossProfit=280M)
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
  '150': 307_700_000,   // dominant stok (test fixture değeri; canlı: 307_743_978)
  '300': 200_000_000,
  '340': 937_000_000,   // alınan avanslar
  '400': 500_000_000,
  '500': 150_000_000,
}

const ISRA_GROSS_MARGIN    = 0.40         // G = 0.40
const A18_AMOUNT           = 243_000_000  // cost = 243M × 0.60 = 145.8M
const A19_AMOUNT           = 270_000_000  // cost = 270M × 0.60 = 162.0M

// ── "Eş zamanlı initial" senaryo sabitleri (GUARD_UNIT_* testleri için) ──────
// Her iki aksiyon da INITIAL bakiyeyle build edilirse ne olur?
// → Combined > initial → infeasible (teorik senaryo; gerçek engine'de olmaz)
const COST_A18             = Math.round(A18_AMOUNT * (1 - ISRA_GROSS_MARGIN)) // 145_800_000
const COST_A19             = Math.round(A19_AMOUNT * (1 - ISRA_GROSS_MARGIN)) // 162_000_000
const COMBINED_COST        = COST_A18 + COST_A19                               // 307_800_000
const INITIAL_STOCK        = INITIAL_BALANCES['150']                           // 307_700_000

// ── "Engine sequential" senaryo sabitleri (GUARD_ENGINE_* testleri için) ──────
// Gerçek engine: A19 önce (short, initial), A18 sonra (medium, remaining)
const REMAINING_STOCK_AFTER_A19 = INITIAL_STOCK - COST_A19                    // 145_700_000
//   A18 maxByStock = 145_700_000 / 0.60 = 242_833_333  →  A18 CAPPED
//   A18 costAmount ≤ REMAINING_STOCK_AFTER_A19
//   Combined A18 + A19 cost = REMAINING_STOCK_AFTER_A19 + A18_cost ≤ INITIAL_STOCK → FEASIBLE

/** A18 buildTransactions context — INITIAL bakiye ile (teorik senaryo) */
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

/**
 * A18 buildTransactions context — A19 SONRASI remaining bakiye ile (gerçek engine senaryosu).
 * Engine medium pass'ta A18 bu context ile build edilir; 150 = REMAINING_STOCK_AFTER_A19.
 * maxByStock = REMAINING_STOCK_AFTER_A19 / (1-G) → A18 CAPPED → costAmount ≤ remaining.
 */
function makeA18ContextAfterA19(): ActionBuildContext {
  return {
    sector:          'CONSTRUCTION',
    horizon:         'medium',
    analysis:        {},
    amount:          A18_AMOUNT,   // computeAmount sonucu (243M); maxByStock cap devreye girer
    previousActions: [],
    accountBalances: {
      ...INITIAL_BALANCES,
      '150': REMAINING_STOCK_AFTER_A19,   // A19 sonrası güncel bakiye
    },
    netSales:        700_000_000,
    grossProfit:     280_000_000,
    baselineNetSales:        700_000_000,
    baselineGrossProfit:     280_000_000,
    baselineAccountBalances: INITIAL_BALANCES,
  }
}

/** A19 buildTransactions context — INITIAL bakiye ile (short horizon, her zaman initial görür) */
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

/** Catalog'dan gerçek işlem kaydını üret — INITIAL bakiye ile */
function buildA18Txs() {
  const tmpl = getActionTemplateV3('A18_NET_SALES_GROWTH')
  if (!tmpl) throw new Error('A18 katalogda bulunamadı')
  return tmpl.buildTransactions(makeA18Context())
}

/** Catalog'dan gerçek işlem kaydını üret — A19 SONRASI remaining bakiye ile */
function buildA18TxsAfterA19() {
  const tmpl = getActionTemplateV3('A18_NET_SALES_GROWTH')
  if (!tmpl) throw new Error('A18 katalogda bulunamadı')
  return tmpl.buildTransactions(makeA18ContextAfterA19())
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

    // Eş zamanlı initial senaryo: Toplam > başlangıç bakiyesi
    const combined = a18_150[0].amount + a19_150[0].amount
    expect(combined).toBeGreaterThan(INITIAL_STOCK)
    console.log(`A18 cost (initial ctx): ${a18_150[0].amount.toLocaleString()} TL`)
    console.log(`A19 cost (initial ctx): ${a19_150[0].amount.toLocaleString()} TL`)
    console.log(`Combined: ${combined.toLocaleString()} TL (limit: ${INITIAL_STOCK.toLocaleString()} TL)`)
    console.log(`Fark: ${(combined - INITIAL_STOCK).toLocaleString()} TL`)
  })
})

// ─── T_GUARD_UNIT — Guard birim testi (TEORİK: eş zamanlı initial bakiye) ────
//
// ÖNEMLİ NOT: Bu testler "her iki aksiyon da initial bakiyeyle build edilirse ne olur?"
// sorusunu yanıtlar. Gerçek engine'de bu OLMAZ: A19 short horizon'da önce seçilir
// ve A18 medium horizon'da A19 sonrası UPDATED bakiyeyle build edilir.
// Gerçek engine senaryosu için GUARD_ENGINE_* testlerine bakın.

describe('R8.4.3 İSRA Fixture — Guard birim testi (teorik: eş zamanlı initial)', () => {

  test('GUARD_UNIT_1 — [A18_initial, A19_initial]: infeasible (teorik, engine\'de olmaz)', () => {
    // Teorik senaryo: A18 ÖNCE (initial context), A19 SONRA (initial context)
    // Engine'de A19 short (önce), A18 medium (sonra, cap'li) → gerçekte FEASIBLE
    // Bu test guard mantığının çalıştığını doğrular — ancak fixture sırası yanlış.
    const allTxs = [...buildA18Txs(), ...buildA19Txs()]  // A18 önce = teorik sıra
    const result = validatePortfolioResources(allTxs, INITIAL_BALANCES)

    // A18 uygulanır: 150 = 307.7M − 145.8M = 161.9M ✓
    // A19 uygulanır: 150 = 161.9M − 162.0M = −56K TL → INFEASIBLE
    expect(result.feasible).toBe(false)
    expect(result.reason).toBeTruthy()
    console.log(`Guard infeasible reason (teorik): ${result.reason}`)
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

// ─── T_GUARD_ENGINE — Guard testi (GERÇEK ENGINE SENARYOSU) ──────────────────
//
// Gerçek engine davranışı:
//   1. SHORT  horizon: A19 seçilir → INITIAL context → costAmount = 162M
//   2. Context update: 150 = 307.7M − 162M = 145.7M
//   3. MEDIUM horizon: A18 seçilir → UPDATED context (remaining=145.7M)
//      maxByStock = 145.7M / 0.60 = 242.8M < 243M → A18 CAPPED
//      A18 costAmount ≤ 145.7M (remaining bakiye)
//   4. Combined ≤ 307.7M = initial_150 → FEASIBLE ✓

describe('R8.4.3 İSRA Fixture — Guard gerçek engine sırası (GUARD_ENGINE)', () => {

  test('GUARD_ENGINE_1 — A18 remaining context ile cap\'lenir (maxByStock)', () => {
    // A18'in "A19 sonrası remaining bakiye" ile build edilmesi
    const a18TxsAfterA19 = buildA18TxsAfterA19()

    const a18_150_after = a18TxsAfterA19
      .flatMap(t => t.legs)
      .filter(l => l.accountCode === '150' && l.side === 'CREDIT')

    expect(a18_150_after.length).toBeGreaterThan(0)
    const costA18AfterA19 = a18_150_after[0].amount

    // A18 CAPPED: costAmount ≤ REMAINING_STOCK_AFTER_A19
    expect(costA18AfterA19).toBeLessThanOrEqual(REMAINING_STOCK_AFTER_A19 + 1) // +1 float tolerans
    // Ve artık A18 initial context'teki 145.8M'den küçük
    expect(costA18AfterA19).toBeLessThan(COST_A18)

    console.log(`A18 cost (initial ctx):   ${COST_A18.toLocaleString()} TL`)
    console.log(`A18 cost (remaining ctx): ${costA18AfterA19.toLocaleString()} TL`)
    console.log(`Remaining stock:          ${REMAINING_STOCK_AFTER_A19.toLocaleString()} TL`)
    console.log(`A18 capped by maxByStock: ${costA18AfterA19 <= REMAINING_STOCK_AFTER_A19}`)
  })

  test('GUARD_ENGINE_2 — [A19_initial, A18_remaining]: FEASIBLE (gerçek engine sırası)', () => {
    // Gerçek sıra: A19 önce (short, initial context), A18 sonra (medium, remaining context)
    const allTxsEngineOrder = [...buildA19Txs(), ...buildA18TxsAfterA19()]
    const result = validatePortfolioResources(allTxsEngineOrder, INITIAL_BALANCES)

    // A19 uygulanır: 150 = 307.7M − 162M = 145.7M ✓
    // A18 uygulanır: 150 = 145.7M − costA18(≤145.7M) = ≥0 ✓
    expect(result.feasible).toBe(true)

    const a19_150 = buildA19Txs().flatMap(t => t.legs)
      .filter(l => l.accountCode === '150' && l.side === 'CREDIT')[0]?.amount ?? 0
    const a18_150 = buildA18TxsAfterA19().flatMap(t => t.legs)
      .filter(l => l.accountCode === '150' && l.side === 'CREDIT')[0]?.amount ?? 0
    const combined = a18_150 + a19_150

    expect(combined).toBeLessThanOrEqual(INITIAL_STOCK + 1) // +1 float tolerans
    console.log(`Engine sırası: A19(${a19_150.toLocaleString()}) + A18_cap(${a18_150.toLocaleString()}) = ${combined.toLocaleString()} TL`)
    console.log(`Initial stock: ${INITIAL_STOCK.toLocaleString()} TL`)
    console.log(`Kalan: ${(INITIAL_STOCK - combined).toLocaleString()} TL → FEASIBLE ✓`)
  })

  test('GUARD_ENGINE_3 — [A18_initial, A19_initial] sırası ile fark: A18 cap\'siz → INFEASIBLE', () => {
    // Fixture sırası (yanlış): A18 initial → uncapped (145.8M) → A19 120'ye sığmıyor
    const wrongOrder = [...buildA18Txs(), ...buildA19Txs()]
    const wrongResult = validatePortfolioResources(wrongOrder, INITIAL_BALANCES)
    expect(wrongResult.feasible).toBe(false)

    // Doğru engine sırası: A19 önce (initial) → A18 sonra (remaining, capped) → FEASIBLE
    const correctOrder = [...buildA19Txs(), ...buildA18TxsAfterA19()]
    const correctResult = validatePortfolioResources(correctOrder, INITIAL_BALANCES)
    expect(correctResult.feasible).toBe(true)

    console.log('Fixture sırası (yanlış): INFEASIBLE ✓ (test geçti ama gerçek engine değil)')
    console.log('Engine sırası (doğru):  FEASIBLE   ✓ (canlı REACHED davranışı)')
  })
})

// ─── T_NR_ISRA — selectTargetPackage NOT_REACHED yolu ───────────────────────
//
// NOT: Bu testlerde makeSelectedAction kullanılır; A18 transactions INITIAL context
// ile build edilir (buildA18Txs). Bu, A18 maxByStock cap DEĞİL, tam 145.8M cost.
// Bu senaryo: fixture transaction'ları (initial ctx A18) gerçek engine transaction
// değil — gerçek engine'de A18 capped (145.74M). Testler fixture değerleriyle
// guard'ın NOT_REACHED yolunu doğrular.

describe('R8.4.3 İSRA Fixture — selectTargetPackage NOT_REACHED guard', () => {

  test('NR_ISRA_1 — 7 pad + A18(initial) + A19(initial) → NOT_REACHED → 150 negatife düşmez', () => {
    // 7 boş pad + A18 (medium pos) + A19 (short pos) = 9 ≤ 12 → subset arama
    // A18 ve A19 her ikisi de initial context ile build edildi (143.8M + 162M > 307.7M)
    // → subset search A18+A19 birlikte REDDEDER (guard check)
    // → NOT_REACHED: safePortfolio da A18+A19 birlikte barındırmaz
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

    // 150 negatif değil
    const used150 = total150Credit(result.selectedActions)
    expect(used150).toBeLessThanOrEqual(INITIAL_STOCK)
    console.log(`150 kullanım: ${used150.toLocaleString()} / ${INITIAL_STOCK.toLocaleString()} TL`)
  })

  test('NR_ISRA_2 — REACHED yolunda A18(initial)+A19(initial) birlikte seçilmez (subset guard)', () => {
    // A18 transactions INITIAL context ile → costAmount = 145.8M (uncapped)
    // A19 transactions INITIAL context ile → costAmount = 162.0M
    // Combined = 307.8M > 307.7M (initial_150) → subset guard REDDEDER
    // → Subset search A18+A19 birlikte seçemez; ya A18 ya A19 seçilir
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

    // Hangi yol gelirse gelsin: A18+A19 birlikte YOK (initial ctx A18 → combined > initial → guard rejects)
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
  test('COMBINED_COST (eş zamanlı) gerçekten INITIAL_STOCK\'u geçiyor', () => {
    console.log(`COST_A18:       ${COST_A18.toLocaleString()} TL   (initial context)`)
    console.log(`COST_A19:       ${COST_A19.toLocaleString()} TL   (initial context)`)
    console.log(`COMBINED_COST:  ${COMBINED_COST.toLocaleString()} TL   (eş zamanlı)`)
    console.log(`INITIAL_STOCK:  ${INITIAL_STOCK.toLocaleString()} TL`)
    console.log(`FARK:          +${(COMBINED_COST - INITIAL_STOCK).toLocaleString()} TL   (teorik açık)`)
    console.log()
    console.log(`REMAINING_STOCK_AFTER_A19: ${REMAINING_STOCK_AFTER_A19.toLocaleString()} TL   (gerçek engine)`)
    console.log(`A18_AMOUNT:                ${A18_AMOUNT.toLocaleString()} TL   (computeAmount)`)
    console.log(`maxByStock (engine):       ${(REMAINING_STOCK_AFTER_A19 / (1-ISRA_GROSS_MARGIN)).toFixed(0)} TL   (cap sınırı)`)
    console.log(`A18 CAPPED:                A18_AMOUNT (${A18_AMOUNT.toLocaleString()}) > maxByStock → cap geçerli`)

    expect(COMBINED_COST).toBeGreaterThan(INITIAL_STOCK)
    // Engine sırası ile combined ≤ initial_stock
    expect(REMAINING_STOCK_AFTER_A19 + Math.min(A18_AMOUNT * (1-ISRA_GROSS_MARGIN), REMAINING_STOCK_AFTER_A19))
      .toBeLessThanOrEqual(INITIAL_STOCK)
  })
})
