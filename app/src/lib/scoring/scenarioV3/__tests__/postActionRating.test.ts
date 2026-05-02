/**
 * Faz 7.3.8a — postActionRating.ts testleri
 *
 * calculateActualPostActionRating:
 *   1. ledgerApplied başarılı/başarısız senaryoları
 *   2. subjectiveTotal sabit tutulur
 *   3. isEstimateConfirmed mantığı
 *   4. Uyarı mesajları (hatalı transaction)
 *   5. DEKAM fixture entegrasyonu
 */

import { calculateActualPostActionRating } from '../postActionRating'
import type { ActualRatingValidation }     from '../postActionRating'
import type { AccountingTransaction }      from '../contracts'

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

/** Dengeli basit transaction: 340 (KV avans) → 440 (UV avans) */
function makeBalancedTx(amount = 5_000_000): AccountingTransaction {
  return {
    transactionId: 'tx-test-01',
    description:   'KV avans → UV (test)',
    semanticType:  'RESTRUCTURE',
    legs: [
      { accountCode: '340', side: 'DEBIT',  amount },  // LIABILITY azalır
      { accountCode: '440', side: 'CREDIT', amount },  // LIABILITY artar
    ],
  }
}

/** Dengesiz transaction: DEBIT ≠ CREDIT → allApplied=false */
function makeUnbalancedTx(): AccountingTransaction {
  return {
    transactionId: 'tx-bad-01',
    description:   'Dengesiz kayıt (test)',
    semanticType:  'RESTRUCTURE',
    legs: [
      { accountCode: '300', side: 'CREDIT', amount: 1_000_000 },
      { accountCode: '400', side: 'DEBIT',  amount: 2_000_000 },  // DEBIT ≠ CREDIT
    ],
  }
}

/** Taban params: DEKAM benzeri, sektör olmadan sıfır subjektif */
const BASE_PARAMS = {
  initialBalances: {
    '300':  5_400_000,
    '320':  6_500_000,
    '340': 29_700_000,
    '400':  5_000_000,
    '600': 80_000_000,  // Satışlar
    '620': 55_000_000,  // SMM
  },
  sector:               'inşaat',
  subjectiveTotal:      0,
  v3EstimatedRating:    'BB',
  currentObjectiveScore: 45,
  currentCombinedScore:  45,
  currentActualRating:  'CCC',
}

// ─── 1. Temel yapı ────────────────────────────────────────────────────────────

describe('calculateActualPostActionRating — temel yapı', () => {
  test('transaction yok → hata yok, postActualRating üretilir', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    expect(result).toBeDefined()
    expect(typeof result.postActualRating).toBe('string')
    expect(result.postActualRating.length).toBeGreaterThan(0)
  })

  test('postObjectiveScore 0-100 arasında', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    expect(result.postObjectiveScore).toBeGreaterThanOrEqual(0)
    expect(result.postObjectiveScore).toBeLessThanOrEqual(100)
  })

  test('postCombinedScore 0-100 arasında', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    expect(result.postCombinedScore).toBeGreaterThanOrEqual(0)
    expect(result.postCombinedScore).toBeLessThanOrEqual(100)
  })

  test('currentObjectiveScore / currentCombinedScore / currentActualRating giriş değerleri korunur', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    expect(result.currentObjectiveScore).toBe(BASE_PARAMS.currentObjectiveScore)
    expect(result.currentCombinedScore).toBe(BASE_PARAMS.currentCombinedScore)
    expect(result.currentActualRating).toBe(BASE_PARAMS.currentActualRating)
  })
})

// ─── 2. ledgerApplied ─────────────────────────────────────────────────────────

describe('calculateActualPostActionRating — ledgerApplied', () => {
  test('dengeli transaction → ledgerApplied true, warnings boş', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [makeBalancedTx()],
    })
    expect(result.ledgerApplied).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  test('transaction yok → ledgerApplied true', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    expect(result.ledgerApplied).toBe(true)
  })

  test('dengesiz transaction → ledgerApplied false, warnings dolu', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [makeUnbalancedTx()],
    })
    expect(result.ledgerApplied).toBe(false)
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  test('dengesiz transaction → postActualRating yine üretilir (hesaplama devam eder)', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [makeUnbalancedTx()],
    })
    expect(typeof result.postActualRating).toBe('string')
    expect(result.postActualRating.length).toBeGreaterThan(0)
  })
})

// ─── 3. subjectiveTotal sabit ────────────────────────────────────────────────

describe('calculateActualPostActionRating — subjectiveTotal sabit', () => {
  test('subjectiveTotal çıktıda giriş değerine eşit', () => {
    const result0 = calculateActualPostActionRating({
      ...BASE_PARAMS,
      subjectiveTotal: 0,
      transactions: [],
    })
    expect(result0.subjectiveTotal).toBe(0)
  })

  test('subjectiveTotal=12 → çıktıda 12', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      subjectiveTotal: 12,
      transactions: [],
    })
    expect(result.subjectiveTotal).toBe(12)
  })

  test('subjectiveTotal artisi postCombinedScore artisini saglar', () => {
    const r0 = calculateActualPostActionRating({
      ...BASE_PARAMS, subjectiveTotal: 0, transactions: [],
    })
    const r12 = calculateActualPostActionRating({
      ...BASE_PARAMS, subjectiveTotal: 12, transactions: [],
    })
    // Subjektif arttıkça kombine skor artar (veya ceiling nedeniyle aynı kalabilir)
    expect(r12.postCombinedScore).toBeGreaterThanOrEqual(r0.postCombinedScore)
  })
})

// ─── 4. isEstimateConfirmed ───────────────────────────────────────────────────

describe('calculateActualPostActionRating — isEstimateConfirmed', () => {
  test('v3EstimatedRating postActualRating ile aynıysa true', () => {
    // İlk çalıştırmadan postActualRating'i al
    const first = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
    })
    // Aynı estimatedRating ile tekrar çalıştır
    const second = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [],
      v3EstimatedRating: first.postActualRating,
    })
    expect(second.isEstimateConfirmed).toBe(true)
  })

  test('v3EstimatedRating farklıysa false', () => {
    // Düşük bakiyeli firmada 'AAA' tahmininin yanlış olması beklenir
    const result = calculateActualPostActionRating({
      initialBalances: { '320': 1_000_000, '600': 1_000_000 },
      transactions:          [],
      sector:                'imalat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'AAA',   // Gerçek rating bu olmayacak
      currentObjectiveScore: 10,
      currentCombinedScore:  10,
      currentActualRating:   'D',
    })
    // Çok düşük bakiyede gerçek rating AAA olamaz
    expect(result.isEstimateConfirmed).toBe(false)
  })

  test('isEstimateConfirmed her zaman (postActualRating === v3EstimatedRating) boolean\'ı', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      transactions: [makeBalancedTx()],
    })
    expect(result.isEstimateConfirmed)
      .toBe(result.postActualRating === result.v3EstimatedRating)
  })
})

// ─── 5. Sektör string'i ───────────────────────────────────────────────────────

describe('calculateActualPostActionRating — sektör', () => {
  test('inşaat sektörü hatası olmadan hesap yapar', () => {
    const result = calculateActualPostActionRating({
      ...BASE_PARAMS,
      sector: 'inşaat',
      transactions: [],
    })
    expect(result.postObjectiveScore).toBeGreaterThanOrEqual(0)
  })

  test('imalat sektörü farklı skor üretebilir', () => {
    const resultInsaat = calculateActualPostActionRating({
      ...BASE_PARAMS,
      sector: 'inşaat',
      transactions: [],
    })
    const resultImalat = calculateActualPostActionRating({
      ...BASE_PARAMS,
      sector: 'imalat',
      transactions: [],
    })
    // Sektörler farklı benchmark kullandığından skor farklı olabilir
    // (aynı da olabilir — sadece tipler doğru)
    expect(typeof resultInsaat.postObjectiveScore).toBe('number')
    expect(typeof resultImalat.postObjectiveScore).toBe('number')
  })
})

// ─── 6. DEKAM fixture entegrasyonu ───────────────────────────────────────────

describe('calculateActualPostActionRating — DEKAM fixture', () => {
  const DEKAM_BALANCES = {
    '300':  5_400_000,
    '320':  6_500_000,
    '340': 29_700_000,
    '331':          0,
    '400':  5_000_000,
    '600': 80_000_000,   // Satışlar
    '620': 55_000_000,   // SMM
  }

  // A03 aksiyonu: KV avans (340) → UV avans (440)
  const A03_TX: AccountingTransaction = {
    transactionId: 'A03-dekam',
    description:   'KV alınan avans → UV (A03)',
    semanticType:  'RESTRUCTURE',
    legs: [
      { accountCode: '340', side: 'DEBIT',  amount: 10_000_000 },
      { accountCode: '440', side: 'CREDIT', amount: 10_000_000 },
    ],
  }

  test('DEKAM: aksiyonlar uygulanıyor (ledgerApplied true)', () => {
    const result = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [A03_TX],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    expect(result.ledgerApplied).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  test('DEKAM: postActualRating geçerli rating stringi', () => {
    const result = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [A03_TX],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    const validRatings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'CC', 'C', 'D']
    expect(validRatings).toContain(result.postActualRating)
  })

  test('DEKAM: subjectiveTotal=0 → postCombinedScore = round(postObjectiveScore * 0.70) ± ceiling', () => {
    const result = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [A03_TX],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    // subjectiveTotal=0 ile kombine ≤ round(objective * 0.70)
    expect(result.postCombinedScore)
      .toBeLessThanOrEqual(Math.round(result.postObjectiveScore * 0.70) + 1)
  })

  test('DEKAM: A03 uygulaması KV yükünü azaltır (postObjectiveScore >= initial)', () => {
    const withAction = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [A03_TX],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    const withoutAction = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    // Aksiyonla skor iyileşmeli veya en azından kötüleşmemeli
    expect(withAction.postObjectiveScore).toBeGreaterThanOrEqual(
      withoutAction.postObjectiveScore
    )
  })

  test('DEKAM: isEstimateConfirmed boolean tutarlı', () => {
    const result = calculateActualPostActionRating({
      initialBalances:       DEKAM_BALANCES,
      transactions:          [A03_TX],
      sector:                'inşaat',
      subjectiveTotal:       0,
      v3EstimatedRating:     'BB',
      currentObjectiveScore: 42,
      currentCombinedScore:  42,
      currentActualRating:   'CCC',
    })
    expect(result.isEstimateConfirmed)
      .toBe(result.postActualRating === result.v3EstimatedRating)
  })
})
