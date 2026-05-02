/**
 * TARGET PACKAGE SELECTOR (Faz 7.3.8d)
 *
 * Mevcut V3 portföyünden, kullanıcının istediği hedef rating'e
 * ulaşmak için MİNİMAL aksiyon paketini seçer.
 *
 * Algoritma — greedy prefix:
 *   1. Aksiyonları engine sırasıyla (priority/notch katkısı) gez
 *   2. Her adımda kümülatif transaction setini calculateActualPostActionRating
 *      ile gerçek post-rating'e çevir
 *   3. achievedIdx >= targetIdx olur olmaz dur → reachedTarget = true
 *   4. Liste biter ve hedef yoksa → tüm liste fallback, reachedTarget = false
 *
 * Edge case'ler:
 *   - Boş portfolio              → boş paket, reachedTarget = false
 *   - Hedef = mevcut rating (eşit/altında) → boş paket, reachedTarget = true
 *   - İlk aksiyon hedefi tutuyor → 1 aksiyonluk paket
 *   - Hedef ulaşılmıyor          → tüm liste fallback, reachedTarget = false
 *   - Geçersiz hedef rating      → tüm liste fallback (warning ile)
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

// ─── ÇIKTI TİPLERİ ────────────────────────────────────────────────────────────

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
  /** true → minimal subset bulunamadı, tüm liste fallback olarak gösterildi */
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

  // ── EDGE 5: Geçersiz hedef → tüm liste fallback ─────────────────────────────
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

  // ── EDGE 2: Mevcut rating zaten hedefte/üstünde → boş paket, hedef tutuldu ──
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

  // ── EDGE 1: Boş portföy → hedef ulaşılamıyor ────────────────────────────────
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

  // ── ANA DÖNGÜ: Greedy prefix — ilk hedefi tutan k'da dur ────────────────────
  let lastValidation: ActualRatingValidation | null = null

  for (let k = 1; k <= fullCount; k++) {
    const prefix = fullPortfolio.slice(0, k)
    const transactions = flattenTransactions(prefix)

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

    // Hedefe ulaşıldı mı? (eşit veya üstü)
    if (achievedIdx >= targetIdx) {
      const totalAmount = prefix.reduce((s, a) => s + (a.amountTRY ?? 0), 0)
      return {
        selectedActions: prefix,
        validation,
        meta: {
          reachedTarget:            true,
          achievedRating,
          totalAmountTRY:           totalAmount,
          selectedActionCount:      prefix.length,
          fullPortfolioActionCount: fullCount,
          fallback:                 false,
          warnings,
        },
      }
    }
  }

  // ── EDGE 4: Liste tükendi, hedef tutmadı → tüm liste fallback ───────────────
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
