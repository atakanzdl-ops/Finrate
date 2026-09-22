/**
 * R8.4.3 — NOT_REACHED guard + MAX_RETRY kaldırma testleri.
 *
 * Kapsam:
 *   BUG 1 — MAX_FALLBACK_GUARD_RETRY=5 (FALLBACK yolu, N>12)
 *   BUG 2 — NOT_REACHED fullPortfolio GUARD'SIZ döner (subset yolu, N≤12)
 *
 * README dersleri uygulandı:
 *   - Birim test + selectTargetPackage entegrasyon testi (R6 dersi)
 *   - makeTx / makeAction yardımcıları (R8.4.2 pattern)
 *
 * Sabitler:
 *   T_NR_1   — NOT_REACHED guard: A18+A19 safePortfolio'dan çıkar
 *   T_NR_2   — NOT_REACHED guard: çakışma yok → fullPortfolio korunur
 *   T_MR_1   — MAX_RETRY kaldırma: 15+ aksiyon, A18/A19 ortada, unlimited pop
 *   T_MR_2   — MAX_RETRY kaldırma: boş portföy kenar durumu
 *
 * İSRA kanıtı (analiz d2b65eff, R8.4.2 sonrası):
 *   fullPortfolio = 9 (HORIZON 4+3+2) ≤ SUBSET_SEARCH_LIMIT=12 → subset search
 *   A18+A19 subset guard doğru reddeder; kalan combo BBB'ye ulaşamaz
 *   → allFeasible=[] → NOT_REACHED → fullPortfolio GUARD'SIZ → 150 -0.1M BUG
 */

import { selectTargetPackage }            from '../targetPackage'
import type { SelectedAction }            from '../engineV3'
import type { AccountingTransaction }     from '../contracts'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function makeTx(
  id: string,
  legs: { accountCode: string; side: 'DEBIT' | 'CREDIT'; amount: number }[],
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

/** A18: 120 DEBIT 145.8M, 150 CREDIT 145.8M (dengeli) */
function makeA18(): SelectedAction {
  return makeAction('A18_NET_SALES_GROWTH', [
    makeTx('A18_REVENUE_AND_COST', [
      { accountCode: '120', side: 'DEBIT',  amount: 145_800_000 },
      { accountCode: '150', side: 'CREDIT', amount: 145_800_000 },
    ]),
  ])
}

/** A19: 120 DEBIT 162M, 150 CREDIT 162M (dengeli) */
function makeA19(): SelectedAction {
  return makeAction('A19_ADVANCE_TO_REVENUE', [
    makeTx('A19_DELIVERY_REVENUE_AND_COST', [
      { accountCode: '120', side: 'DEBIT',  amount: 162_000_000 },
      { accountCode: '150', side: 'CREDIT', amount: 162_000_000 },
    ]),
  ])
}

const INITIAL_BALANCES = {
  '150': 307_700_000,   // A18+A19 birlikte: 307.7-145.8-162 = -0.1M → infeasible
  '120': 500_000_000,   // her iki DEBIT için yeterli
}

// ─── T_NR — NOT_REACHED guard (BUG 2) ───────────────────────────────────────

describe('R8.4.3 — NOT_REACHED guard (BUG 2 fix)', () => {

  // T_NR_1: allFeasible boş → safePortfolio A18 veya A19'u çıkarır
  // Portfolio: 6 pad (txsiz) + A18 + A19 = 8 (≤12 → subset search)
  // Target 'AAA': hiçbir safe combo ulaşamaz → NOT_REACHED tetiklenir
  // Guard: A18+A19 birlikte infeasible → A19 (son) poplanır → A18 kalır
  test('T_NR_1 — NOT_REACHED: A18+A19 birlikte → A19 çıkar, 150 negatife düşmez', () => {
    const pads = Array.from({ length: 6 }, (_, i) =>
      makeAction(`PAD_0${i + 1}`),                // boş tx → 150'ye dokunmaz
    )
    const a18 = makeA18()
    const a19 = makeA19()

    // A18 önce, A19 en sonda → guard A19'u önce popar
    const portfolio: SelectedAction[] = [...pads, a18, a19]
    expect(portfolio.length).toBe(8)   // ≤ SUBSET_SEARCH_LIMIT(12) → subset search

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BBB',
      requestedTarget:       'AAA',   // B → AAA ulaşılamaz → NOT_REACHED
    })

    // 1. NOT_REACHED yolu tetiklendi
    expect(result.meta.status).toBe('NOT_REACHED')
    expect(result.meta.fallback).toBe(true)

    // 2. Guard çalıştı — R8.4.3 mesajı var
    const guardMsg = result.meta.warnings.find(w => w.includes('R8.4.3'))
    expect(guardMsg).toBeTruthy()

    // 3. A18+A19 birlikte DEĞİL
    const ids = result.selectedActions.map(a => a.actionId)
    const hasA18 = ids.includes('A18_NET_SALES_GROWTH')
    const hasA19 = ids.includes('A19_ADVANCE_TO_REVENUE')
    expect(hasA18 && hasA19).toBe(false)   // ikisi birden yasak

    // 4. 150 tüketimi ≤ başlangıç bakiyesi
    const total150 = result.selectedActions
      .flatMap(a => a.transactions)
      .flatMap(t => t.legs.filter(l => l.accountCode === '150' && l.side === 'CREDIT'))
      .reduce((sum, l) => sum + l.amount, 0)
    expect(total150).toBeLessThanOrEqual(307_700_000)
  })

  // T_NR_2: NOT_REACHED ama çakışma yok → safePortfolio = fullPortfolio (değişmez)
  // Sadece pad aksiyonlar (txsiz) → guard hep feasible → pop olmaz
  test('T_NR_2 — NOT_REACHED + çakışmasız portföy → fullPortfolio korunur', () => {
    const pads = Array.from({ length: 6 }, (_, i) =>
      makeAction(`SAFE_0${i + 1}`),
    )

    const result = selectTargetPackage({
      portfolio:             pads,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BBB',
      requestedTarget:       'AAA',   // ulaşılamaz → NOT_REACHED
    })

    // 1. NOT_REACHED (hedef ulaşılamaz)
    expect(result.meta.status).toBe('NOT_REACHED')

    // 2. Kaynak çakışması YOK → guard pop yapmadı → selectedActionCount = fullPortfolio
    expect(result.selectedActions.length).toBe(pads.length)

    // 3. Pad aksiyonlar hepsi korundu (guard false positive yok)
    const ids = result.selectedActions.map(a => a.actionId)
    expect(ids).toContain('SAFE_01')
    expect(ids).toContain('SAFE_06')
  })
})

// ─── T_MR — MAX_RETRY kaldırma (BUG 1) ──────────────────────────────────────

describe('R8.4.3 — MAX_RETRY kaldırma (BUG 1 fix)', () => {

  // T_MR_1: N=16 (>12) → FALLBACK; A18 ve A19 sıranın başında (son 5'te DEĞİL)
  // Eski (MAX_RETRY=5): 5 pop → pads çıkar, A18+A19 kalır → infeasible portföy döner
  // Yeni (unlimited):   sıranın başına ulaşana kadar pop → A19 çıkar → feasible
  test('T_MR_1 — N=16 fallback: A18/A19 başta (sıranın son 5\'inde değil), unlimited pop ile çözülür', () => {
    const a18 = makeA18()
    const a19 = makeA19()

    // A18 pos-0, A19 pos-1, PAD02..PAD15 arkada (14 pad)
    // Eski: 5 pop (PAD15..PAD11) → A18+A19 hâlâ sıranın başında → infeasible dönerdi
    // Yeni: pop devam (PAD10..PAD02, A19-pos1) → A18 tek kalır → feasible
    const pads = Array.from({ length: 14 }, (_, i) =>
      makeAction(`PAD_${String(i + 2).padStart(2, '0')}`),
    )
    const portfolio: SelectedAction[] = [a18, a19, ...pads]
    expect(portfolio.length).toBe(16)   // >12 → FALLBACK

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BB',
      requestedTarget:       'BBB',   // FALLBACK hedef
    })

    // 1. FALLBACK yolu tetiklendi
    expect(result.meta.fallback).toBe(true)
    expect(result.meta.status).toBe('FALLBACK')

    // 2. A18+A19 birlikte değil (unlimited pop A19'u buldu ve çıkardı)
    const ids = result.selectedActions.map(a => a.actionId)
    const hasA18 = ids.includes('A18_NET_SALES_GROWTH')
    const hasA19 = ids.includes('A19_ADVANCE_TO_REVENUE')
    expect(hasA18 && hasA19).toBe(false)

    // 3. Guard uyarısı var (R8.4.3)
    const guardMsg = result.meta.warnings.find(w => w.includes('R8.4.3'))
    expect(guardMsg).toBeTruthy()

    // 4. 150 tüketimi ≤ başlangıç bakiyesi
    const total150 = result.selectedActions
      .flatMap(a => a.transactions)
      .flatMap(t => t.legs.filter(l => l.accountCode === '150' && l.side === 'CREDIT'))
      .reduce((sum, l) => sum + l.amount, 0)
    expect(total150).toBeLessThanOrEqual(307_700_000)
  })

  // T_MR_2: Tüm aksiyonlar infeasible (birden fazla kez infeasible) → boş portföy
  // Açıklama: Her aksiyon tek başına 150 CREDIT 400M yapıyorsa, 1 kalınca da infeasible
  // Beklenen: safePortfolio boş, sonsuz döngü yok
  test('T_MR_2 — Her aksiyon tek başına infeasible → safePortfolio boş, döngü yok', () => {
    // 3 aksiyon, her biri 150'yi tek başına sıfırın altına düşürür
    const bigCredit = (id: string) => makeAction(id, [
      makeTx(`${id}_TX`, [
        { accountCode: '120', side: 'DEBIT',  amount: 400_000_000 },
        { accountCode: '150', side: 'CREDIT', amount: 400_000_000 },  // 400M > 307.7M
      ]),
    ])

    const portfolio = [bigCredit('BIG_01'), bigCredit('BIG_02'), bigCredit('BIG_03')]
    expect(portfolio.length).toBe(3)   // ≤12 → subset search

    const result = selectTargetPackage({
      portfolio,
      initialBalances:       INITIAL_BALANCES,
      sector:                'CONSTRUCTION',
      subjectiveTotal:       20,
      currentObjectiveScore: 50,
      currentCombinedScore:  70,
      currentActualRating:   'B',
      v3EstimatedRating:     'BB',
      requestedTarget:       'AAA',
    })

    // 1. NOT_REACHED tetiklendi (her combo infeasible veya hedef ulaşılamaz)
    expect(result.meta.status).toBe('NOT_REACHED')

    // 2. Guard çalıştı: hiçbir tek aksiyon feasible değil → safePortfolio boş
    expect(result.selectedActions.length).toBe(0)

    // 3. totalAmountTRY = 0 (boş portföy)
    expect(result.meta.totalAmountTRY).toBe(0)

    // 4. Sonsuz döngü olmadı (test timeout'a girmedi)
    // Bu test geçerse döngü düzgün terminate oldu
  })
})
