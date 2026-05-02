/**
 * POST-ACTION RATING DOĞRULAMA HELPER (Faz 7.3.8a)
 *
 * V3 engine'in tahmin ettiği post-action rating'i gerçek score.ts
 * hesapıyla doğrular. Akış:
 *
 *   1. applyTransactions → post-action bilançosu
 *   2. calculateRatiosFromAccounts → post-action rasyolar
 *   3. calculateScore → post-action objektif skor
 *   4. combineScores (subjektif sabit) → post-action kombine skor
 *   5. scoreToRating → gerçek post-action rating
 *   6. V3 tahminiyle karşılaştır → isEstimateConfirmed
 *
 * score.ts / ratios.ts / subjective.ts DOKUNULMAZ — sadece tüketilir.
 */

import { applyTransactions } from './ledgerEngine'
import type { AccountBalance } from './ledgerEngine'
import { calculateRatiosFromAccounts } from '../ratios'
import { calculateScore, scoreToRating }    from '../score'
import { combineScores }                    from '../subjective'
import type { AccountingTransaction }       from './contracts'

// ─── Arayüz ──────────────────────────────────────────────────────────────────

export interface ActualRatingValidation {
  /** Mevcut objektif skor (aksiyon öncesi) */
  currentObjectiveScore: number
  /** Post-action objektif skor */
  postObjectiveScore: number
  /** Subjektif puan (sabit — değişmez) */
  subjectiveTotal: number
  /** Mevcut kombine skor */
  currentCombinedScore: number
  /** Post-action kombine skor */
  postCombinedScore: number

  /** Mevcut gerçek rating */
  currentActualRating: string
  /** Post-action gerçek rating (score.ts hesabı) */
  postActualRating: string
  /** V3 engine tahmin rating'i */
  v3EstimatedRating: string

  /** V3 tahmini gerçek rating ile örtüşüyor mu? */
  isEstimateConfirmed: boolean

  /** Tüm transaction'lar başarıyla uygulandı mı? */
  ledgerApplied: boolean
  /** Yevmiye veya hesaplama uyarıları */
  warnings: string[]
}

// ─── Ana hesaplama ────────────────────────────────────────────────────────────

/**
 * Aksiyonları bilançoya uygular ve gerçek post-action rating'i hesaplar.
 *
 * @param initialBalances  - Aksiyon öncesi bakiyeler (Record<string, number>)
 * @param transactions     - Uygulanacak muhasebe kayıtları
 * @param sector           - Firma sektörü (ham string — score.ts'e iletilir)
 * @param subjectiveTotal  - Subjektif puan (sabit tutulur)
 * @param v3EstimatedRating - V3 engine'in tahmin ettiği rating
 * @param currentObjectiveScore - Mevcut objektif skor
 * @param currentCombinedScore  - Mevcut kombine skor
 * @param currentActualRating   - Mevcut gerçek rating
 */
export function calculateActualPostActionRating(params: {
  initialBalances:      Record<string, number>
  transactions:         AccountingTransaction[]
  sector:               string
  subjectiveTotal:      number
  v3EstimatedRating:    string
  currentObjectiveScore: number
  currentCombinedScore:  number
  currentActualRating:   string
}): ActualRatingValidation {
  const warnings: string[] = []

  // ── Adım 1: Record<string, number> → AccountBalance[] ────────────────────
  const initialBalancesArray: AccountBalance[] = Object.entries(params.initialBalances)
    .map(([accountCode, amount]) => ({ accountCode, amount }))

  // ── Adım 2: Transaction'ları uygula ──────────────────────────────────────
  let finalBalances: AccountBalance[]
  let ledgerApplied = false

  try {
    const ledgerResult = applyTransactions(params.transactions, initialBalancesArray)

    finalBalances  = ledgerResult.finalBalances
    ledgerApplied  = ledgerResult.allApplied

    if (!ledgerResult.allApplied && ledgerResult.totalErrors.length > 0) {
      warnings.push(...ledgerResult.totalErrors.map(e => `Ledger hatası: ${e}`))
    }
    if (ledgerResult.totalWarnings.length > 0) {
      warnings.push(...ledgerResult.totalWarnings)
    }
  } catch (err) {
    warnings.push(`Yevmiye uygulanamadı: ${String(err)}`)
    // Hata durumunda başlangıç bakiyeleriyle devam et
    finalBalances = initialBalancesArray
    ledgerApplied = false
  }

  // ── Adım 3: Post-action rasyolar ──────────────────────────────────────────
  // AccountBalance[] → {accountCode, amount}[] uyumlu (Prisma.Decimal | number kabul eder)
  const postRatios = calculateRatiosFromAccounts(finalBalances)

  // ── Adım 4: Post-action objektif skor ────────────────────────────────────
  const postScoreResult  = calculateScore(postRatios, params.sector)
  const postObjectiveScore = postScoreResult.finalScore

  // ── Adım 5: Kombine skor (subjektif sabit) ────────────────────────────────
  const postCombinedScore = combineScores(postObjectiveScore, params.subjectiveTotal)

  // ── Adım 6: Gerçek post-action rating ────────────────────────────────────
  const postActualRating = scoreToRating(postCombinedScore)

  // ── Adım 7: V3 tahmini ile karşılaştır ───────────────────────────────────
  const isEstimateConfirmed = postActualRating === params.v3EstimatedRating

  return {
    currentObjectiveScore: params.currentObjectiveScore,
    postObjectiveScore,
    subjectiveTotal:        params.subjectiveTotal,
    currentCombinedScore:   params.currentCombinedScore,
    postCombinedScore,
    currentActualRating:    params.currentActualRating,
    postActualRating,
    v3EstimatedRating:      params.v3EstimatedRating,
    isEstimateConfirmed,
    ledgerApplied,
    warnings,
  }
}
