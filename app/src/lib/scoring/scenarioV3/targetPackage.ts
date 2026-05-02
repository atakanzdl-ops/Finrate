/**
 * TARGET PACKAGE SELECTOR (Faz 7.3.8d-FIX)
 *
 * Mevcut V3 portföyünden, kullanıcının istediği hedef rating'e
 * ulaşmak için OPTİMAL aksiyon paketini seçer.
 *
 * Algoritma — minimum-cardinality alt küme araması:
 *   1. requestedTarget parse edilir; geçersizse → tüm liste fallback
 *   2. currentIdx >= targetIdx → boş paket, reachedTarget=true
 *   3. Boş portföy → reachedTarget=false, boş paket
 *   4. Cardinality k = 1..N için tüm C(N,k) alt kümesi denenir;
 *      her biri calculateActualPostActionRating ile gerçek post-rating'e çevrilir.
 *      İlk feasible cardinality'de durulur (minimum aksiyon sayısı garantili).
 *   5. Aynı k için tie-break sırası:
 *        a) En düşük totalAmountTRY
 *        b) En yakın hedef (achievedIdx asc — hedefi en az aşan)
 *   6. Hiçbir alt küme yeterli değilse → tüm liste fallback,
 *      reachedTarget=false, achievedRating=fullPortfolio post-rating
 *
 * KORUMA: N > SUBSET_SEARCH_LIMIT (12) ise 2^N patlamasını engellemek
 *   için subset search atlanır, fullPortfolio + uyarı dönülür.
 *
 * ÇIKTI ŞEKLİ DEĞİŞMEDİ (sözleşme):
 *   { selectedActions, meta: TargetPackageMeta, validation }
 *
 * selectedActions sırası: alt küme bulunduktan sonra fullPortfolio
 *   orijinal sırası korunur (vade ve impact düzeni bozulmaz).
 *
 * KRİTİK:
 *   score.ts / ratios.ts / subjective.ts DOKUNULMAZ — sadece
 *   calculateActualPostActionRating helper'ı tüketilir.
 */

import { calculateActualPostActionRating } from './postActionRating'
import type { ActualRatingValidation }     from './postActionRating'
import type { AccountingTransaction }      from './contracts'
import type { SelectedAction }             from './engineV3'
import {
  RATING_ORDER,
  ratingToIndex,
  type RatingGrade,
} from './ratingReasoning'

// ─── ÇIKTI TİPLERİ (sözleşme: değişmedi) ──────────────────────────────────────

export interface TargetPackageMeta {
  /** Hedef rating tutuldu mu? (achievedIdx >= targetIdx) */
  reachedTarget:            boolean
  /** Seçilen paket uygulandığında elde edilen gerçek rating */
  achievedRating:           RatingGrade
  /** Seçilen aksiyonların toplam tutarı */
  totalAmountTRY:           number
  /** Seçilen paketteki aksiyon sayısı */
  selectedActionCount:      number
  /** Tam V3 portföyündeki aksiyon sayısı */
  fullPortfolioActionCount: number
  /** true → minimal subset bulunamadı veya search atlandı; tüm liste fallback */
  fallback:                 boolean
  /** Edge case açıklamaları (UI'da gösterim opsiyoneldir) */
  warnings:                 string[]
}

export interface TargetPackageResult {
  /** UI'ın "Firma Ne Yapmalı?" listesinde göstereceği aksiyonlar */
  selectedActions: SelectedAction[]
  /** Paket meta verisi (UI banner'ları için) */
  meta:            TargetPackageMeta
  /** Son ölçülen post-action validation (debug/audit için) */
  validation:      ActualRatingValidation | null
}

/**
 * Alt küme araması için üst sınır.
 * 12 → 2^12-1 = 4095 alt küme (kabul edilebilir).
 * Üstünde patlama riski; greedy fallback uygulanır.
 */
const SUBSET_SEARCH_LIMIT = 12

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Geçerli bir RatingGrade ise normalize edip döner; değilse null. */
function tryParseRating(rating: string | undefined | null): RatingGrade | null {
  if (!rating) return null
  const clean = rating.trim().toUpperCase().replace(/[+-]/g, '')
  if ((RATING_ORDER as readonly string[]).includes(clean)) return clean as RatingGrade
  return null
}

/** Bir aksiyon listesinin transaction'larını dedupe ederek toplar (actionId+amountTRY). */
function flattenTransactions(actions: SelectedAction[]): AccountingTransaction[] {
  const seen = new Set<string>()
  const out: AccountingTransaction[] = []
  for (const a of actions) {
    const key = `${a.actionId}::${a.amountTRY}`
    if (seen.has(key)) continue
    seen.add(key)
    for (const t of (a.transactions ?? [])) out.push(t)
  }
  return out
}

/**
 * Lex-order combinations of indices [0..n-1] of size k.
 * yielded array sıralıdır → fullPortfolio sırası alt küme içinde korunur.
 */
function* combinationsOfSize(n: number, k: number): Generator<number[]> {
  if (k <= 0 || k > n) return
  const indices = Array.from({ length: k }, (_, i) => i)
  yield [...indices]
  while (true) {
    let i = k - 1
    while (i >= 0 && indices[i] === n - k + i) i--
    if (i < 0) return
    indices[i]++
    for (let j = i + 1; j < k; j++) {
      indices[j] = indices[j - 1] + 1
    }
    yield [...indices]
  }
}

// ─── ANA API ──────────────────────────────────────────────────────────────────

export interface SelectTargetPackageParams {
  /** V3 engine portföyü — engine sırasıyla gelmeli (priority/notch katkı) */
  portfolio:              SelectedAction[]
  /** Aksiyon öncesi bilanço bakiyeleri */
  initialBalances:        Record<string, number>
  /** Firma sektörü — ham string (score.ts'e iletilir) */
  sector:                 string
  /** Subjektif puan — sabit tutulur */
  subjectiveTotal:        number
  /** Mevcut objektif skor (route.ts hesaplar) */
  currentObjectiveScore:  number
  /** Mevcut kombine skor */
  currentCombinedScore:   number
  /** Mevcut gerçek rating (legacy notch'lu kabul edilir, normalize edilir) */
  currentActualRating:    string
  /** V3 engine'in tahmin ettiği post-rating */
  v3EstimatedRating:      string
  /** Kullanıcının istediği hedef rating */
  requestedTarget:        RatingGrade | string
}

export function selectTargetPackage(params: SelectTargetPackageParams): TargetPackageResult {
  const warnings: string[]   = []
  const fullPortfolio        = params.portfolio
  const fullCount            = fullPortfolio.length
  const currentIdx           = ratingToIndex(params.currentActualRating)
  const fallbackCurrent      = tryParseRating(params.currentActualRating) ?? 'C'

  const targetGrade = tryParseRating(String(params.requestedTarget))

  // ── EDGE: Geçersiz hedef → tüm liste fallback ───────────────────────────────
  if (!targetGrade) {
    warnings.push(
      `Geçersiz hedef rating: '${params.requestedTarget}' — tüm aksiyon listesi gösteriliyor.`,
    )
    const totalAmount = fullPortfolio.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
    return {
      selectedActions: fullPortfolio,
      validation: null,
      meta: {
        reachedTarget:            false,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           totalAmount,
        selectedActionCount:      fullCount,
        fullPortfolioActionCount: fullCount,
        fallback:                 true,
        warnings,
      },
    }
  }

  const targetIdx = ratingToIndex(targetGrade)

  // ── EDGE: Mevcut rating zaten hedefte/üstünde → boş paket ───────────────────
  if (currentIdx >= targetIdx) {
    return {
      selectedActions: [],
      validation: null,
      meta: {
        reachedTarget:            true,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           0,
        selectedActionCount:      0,
        fullPortfolioActionCount: fullCount,
        fallback:                 false,
        warnings,
      },
    }
  }

  // ── EDGE: Boş portföy ───────────────────────────────────────────────────────
  if (fullCount === 0) {
    warnings.push('Portföy boş — hedef rating elde edilemiyor.')
    return {
      selectedActions: [],
      validation: null,
      meta: {
        reachedTarget:            false,
        achievedRating:           fallbackCurrent,
        totalAmountTRY:           0,
        selectedActionCount:      0,
        fullPortfolioActionCount: 0,
        fallback:                 false,
        warnings,
      },
    }
  }

  // ── KORUMA: N büyükse 2^N patlamasını engelle ───────────────────────────────
  if (fullCount > SUBSET_SEARCH_LIMIT) {
    warnings.push(
      `Aksiyon sayısı (${fullCount}) alt küme arama eşiğini (${SUBSET_SEARCH_LIMIT}) aşıyor — ` +
      'optimal paket araması atlandı, tüm portföy gösteriliyor.',
    )
    const transactions = flattenTransactions(fullPortfolio)
    const validation = calculateActualPostActionRating({
      initialBalances:        params.initialBalances,
      transactions,
      sector:                 params.sector,
      subjectiveTotal:        params.subjectiveTotal,
      v3EstimatedRating:      params.v3EstimatedRating,
      currentObjectiveScore:  params.currentObjectiveScore,
      currentCombinedScore:   params.currentCombinedScore,
      currentActualRating:    params.currentActualRating,
    })
    const achievedRating = tryParseRating(validation.postActualRating) ?? fallbackCurrent
    const achievedIdx    = ratingToIndex(achievedRating)
    const totalAmount    = fullPortfolio.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
    return {
      selectedActions: fullPortfolio,
      validation,
      meta: {
        reachedTarget:            achievedIdx >= targetIdx,
        achievedRating,
        totalAmountTRY:           totalAmount,
        selectedActionCount:      fullCount,
        fullPortfolioActionCount: fullCount,
        fallback:                 true,
        warnings,
      },
    }
  }

  // ── ALT KÜME ARAMASI: cardinality ascending, ilk feasible'da dur ────────────
  type Candidate = {
    indices:        number[]
    validation:     ActualRatingValidation
    achievedRating: RatingGrade
    achievedIdx:    number
    totalAmount:    number
  }

  let lastValidation: ActualRatingValidation | null = null

  for (let k = 1; k <= fullCount; k++) {
    let bestAtK: Candidate | null = null

    for (const indices of combinationsOfSize(fullCount, k)) {
      const subset = indices.map(i => fullPortfolio[i])
      const totalAmount = subset.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
      const transactions = flattenTransactions(subset)

      const validation = calculateActualPostActionRating({
        initialBalances:        params.initialBalances,
        transactions,
        sector:                 params.sector,
        subjectiveTotal:        params.subjectiveTotal,
        v3EstimatedRating:      params.v3EstimatedRating,
        currentObjectiveScore:  params.currentObjectiveScore,
        currentCombinedScore:   params.currentCombinedScore,
        currentActualRating:    params.currentActualRating,
      })
      lastValidation = validation

      const achievedRating = tryParseRating(validation.postActualRating) ?? fallbackCurrent
      const achievedIdx    = ratingToIndex(achievedRating)

      // Hedefe ulaşmıyorsa atla
      if (achievedIdx < targetIdx) continue

      // Bu k için en iyi mi? Tie-break: tutar asc → achievedIdx asc
      if (
        !bestAtK ||
        totalAmount < bestAtK.totalAmount ||
        (totalAmount === bestAtK.totalAmount && achievedIdx < bestAtK.achievedIdx)
      ) {
        bestAtK = { indices: [...indices], validation, achievedRating, achievedIdx, totalAmount }
      }
    }

    if (bestAtK) {
      // Minimum cardinality bulundu — erken çık.
      // bestAtK.indices zaten sıralı (combinationsOfSize lex-order üretir),
      // bu yüzden fullPortfolio orijinal sırası korunur.
      const selectedActions = bestAtK.indices.map(i => fullPortfolio[i])
      return {
        selectedActions,
        validation: bestAtK.validation,
        meta: {
          reachedTarget:            true,
          achievedRating:           bestAtK.achievedRating,
          totalAmountTRY:           bestAtK.totalAmount,
          selectedActionCount:      selectedActions.length,
          fullPortfolioActionCount: fullCount,
          fallback:                 false,
          warnings,
        },
      }
    }
  }

  // ── EDGE: Hiçbir alt küme yeterli değil → tüm liste fallback ────────────────
  // Not: arama k=N'a kadar gittiğinden lastValidation tüm portföye aittir.
  warnings.push(
    'Mevcut aksiyonlarla hedef rating elde edilemiyor — tüm portföy gösteriliyor.',
  )
  const totalAmount = fullPortfolio.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
  const finalAchieved = lastValidation
    ? (tryParseRating(lastValidation.postActualRating) ?? fallbackCurrent)
    : fallbackCurrent

  return {
    selectedActions: fullPortfolio,
    validation: lastValidation,
    meta: {
      reachedTarget:            false,
      achievedRating:           finalAchieved,
      totalAmountTRY:           totalAmount,
      selectedActionCount:      fullCount,
      fullPortfolioActionCount: fullCount,
      fallback:                 true,
      warnings,
    },
  }
}
