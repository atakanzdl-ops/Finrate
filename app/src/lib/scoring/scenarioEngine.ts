/**
 * Finrate — Senaryo Motoru (Iterative Re-Greedy)
 *
 * runScenarios():
 *   Kısa / Orta / Uzun vadeli 3 senaryo üretir.
 *   Her senaryoda iteratif açgözlü algoritma ile en yüksek skor katkısı
 *   sağlayan aksiyonları seçer; max 8 iterasyon, hedef nota ulaşınca durur.
 */

import type { BalanceSheet } from './mutation'
import { applyMutation }     from './mutation'
import type { RatioResult }  from './ratios'
import { scoreToRating }     from './score'
import { ACTIONS, ACCOUNT_ACTIONS, type ActionId, type Difficulty, type TimeHorizon } from './actions'
import type { AccountBalanceSheet } from './simulator'
import { applyAccountMutation, balanceSheetToAccounts } from './simulator'

// ─── TİPLER ──────────────────────────────────────────────────────────────────

export interface ScenarioAction {
  actionId:        ActionId
  label:           string
  description:     string
  amountTL:        number
  mutationApplied: Partial<BalanceSheet>
  ratioBefore:     Partial<RatioResult>
  ratioAfter:      Partial<RatioResult>
  scoreDelta:      number
  difficulty:      Difficulty
  timeHorizon:     TimeHorizon
  howTo:           string
}

export interface ScenarioResult {
  horizon:          TimeHorizon
  horizonLabel:     string      // "Acil Müdahale (0–3 Ay)" vb.
  targetGrade:      string      // Hedeflenen not
  actions:          ScenarioAction[]
  scoreBefore:      number
  scoreAfter:       number
  gradeBefore:      string
  gradeAfter:       string
  totalTLMovement:  number      // Toplam TL hareketi
  goalReached:      boolean     // Hedef nota ulaşıldı mı
  error?:           string      // Validasyon hatası (opsiyonel)
}

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

/** Hedef not → minimum skor eşiği (küçükten büyüğe) */
const GRADE_SCORES: Record<string, number> = {
  D: 0, C: 30, CC: 36, CCC: 44,
  B: 52, BB: 60, BBB: 68,
  A: 76, AA: 84, AAA: 93,
}

/** Senaryo açıklama etiketleri */
const HORIZON_LABELS: Record<TimeHorizon, string> = {
  short:  'Acil Müdahale (0–3 Ay)',
  medium: 'Orta Vadeli Plan (3–12 Ay)',
  long:   'Uzun Vadeli Strateji (1–3 Yıl)',
}

/** Horizon bazlı izin verilen zaman aralıkları */
const HORIZON_FILTER: Record<TimeHorizon, TimeHorizon[]> = {
  short:  ['short'],
  medium: ['short', 'medium'],
  long:   ['short', 'medium', 'long'],
}

const MAX_ITERATIONS = 8

// ─── YARDIMCILAR ──────────────────────────────────────────────────────────────

/** Skor raporlamasında kullanılan temel rasyo alt kümesi */
function extractKeyRatios(r: RatioResult): Partial<RatioResult> {
  return {
    currentRatio:     r.currentRatio,
    quickRatio:       r.quickRatio,
    interestCoverage: r.interestCoverage,
    netProfitMargin:  r.netProfitMargin,
    grossMargin:      r.grossMargin,
    equityRatio:      r.equityRatio,
    debtToEquity:     r.debtToEquity,
    debtToEbitda:     r.debtToEbitda,
    roa:              r.roa,
    roe:              r.roe,
  }
}

// ─── TEK SENARYO ──────────────────────────────────────────────────────────────

function runSingleScenario(
  sheet:           BalanceSheet,
  sector:          string,
  horizon:         TimeHorizon,
  targetGrade:     string,
  currentScore:    number,    // combined skor (display + goal karşılaştırması)
  subjectiveBonus: number,    // combined - finansal; aksiyonlar boyunca sabit kalır
): ScenarioResult {
  const targetScore   = GRADE_SCORES[targetGrade] ?? 60
  const allowedTimes  = HORIZON_FILTER[horizon]

  // Horizon + sektör filtresi (eşik: 0.2; sıfır aksiyon kalırsa 0.1'e düşer)
  let candidatePool = Object.values(ACTIONS).filter(a => {
    if (!allowedTimes.includes(a.timeHorizon)) return false
    return (a.sectorFeasibility[sector] ?? 0.5) >= 0.2
  })
  if (candidatePool.length === 0) {
    candidatePool = Object.values(ACTIONS).filter(a => {
      if (!allowedTimes.includes(a.timeHorizon)) return false
      return (a.sectorFeasibility[sector] ?? 0.5) >= 0.1
    })
  }

  let currentSheet: BalanceSheet = { ...sheet }
  let currentScoreValue          = currentScore
  const selectedActions: ScenarioAction[] = []
  const usedIds                  = new Set<ActionId>()

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // Hedefe ulaşıldıysa dur
    if (currentScoreValue >= targetScore) break

    let bestGain     = -Infinity
    let bestActionId: ActionId | null = null
    let bestAmount   = 0
    let bestMutation: Partial<BalanceSheet> | null = null

    // Greedy: her kalan aksiyon için gain hesapla
    for (const action of candidatePool) {
      if (usedIds.has(action.id)) continue

      const range  = action.calcRange(currentSheet)
      const amount = range.suggested
      if (amount <= 0) continue

      const mutation    = action.mutate(currentSheet, amount)
      const result      = applyMutation(currentSheet, mutation, sector)
      const feasibility = action.sectorFeasibility[sector] ?? 0.5
      const gain        = result.scoreDelta * feasibility

      if (gain > bestGain) {
        bestGain     = gain
        bestActionId = action.id
        bestAmount   = amount
        bestMutation = mutation
      }
    }

    // Pozitif katkı sağlayan aksiyon kalmadıysa dur
    if (!bestActionId || bestGain <= 0 || !bestMutation) break

    // Seçilen aksiyonu uygula
    const bestAction = ACTIONS[bestActionId]
    const result     = applyMutation(currentSheet, bestMutation, sector)

    selectedActions.push({
      actionId:        bestActionId,
      label:           bestAction.label,
      description:     bestAction.description,
      amountTL:        bestAmount,
      mutationApplied: bestMutation,
      ratioBefore:     extractKeyRatios(result.ratiosBefore),
      ratioAfter:      extractKeyRatios(result.ratiosAfter),
      scoreDelta:      result.scoreDelta,
      difficulty:      bestAction.difficulty,
      timeHorizon:     bestAction.timeHorizon,
      howTo:           bestAction.howTo(currentSheet, bestAmount),
    })

    usedIds.add(bestActionId)
    currentSheet      = result.after
    // Finansal delta sabit subjektif bonus ile combined skora dönüşür
    currentScoreValue = result.scoreAfter.finalScore + subjectiveBonus
  }

  return {
    horizon,
    horizonLabel:    HORIZON_LABELS[horizon],
    targetGrade,
    actions:         selectedActions,
    scoreBefore:     currentScore,
    scoreAfter:      currentScoreValue,
    gradeBefore:     scoreToRating(currentScore),
    gradeAfter:      scoreToRating(currentScoreValue),
    totalTLMovement: selectedActions.reduce((s, a) => s + a.amountTL, 0),
    goalReached:     currentScoreValue >= (GRADE_SCORES[targetGrade] ?? 60),
  }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * 3 senaryo döner: short → medium → long
 *
 * @param sheet           Mevcut bilanço
 * @param sector          Sektör adı (sectorFeasibility için)
 * @param currentScore    Combined skor (finansal + subjektif)
 * @param targetGrade     Hedef not ("BBB", "BB" vb.)
 * @param subjectiveBonus Combined − finansal fark (varsayılan 0 — grup/subjektif yok)
 */
export function runScenarios(
  sheet:            BalanceSheet,
  sector:           string,
  currentScore:     number,
  targetGrade:      string,
  subjectiveBonus = 0,
): ScenarioResult[] {
  const targetScore  = GRADE_SCORES[targetGrade]
  const currentGrade = scoreToRating(currentScore)

  // Hedef not bilinmiyorsa veya mevcut skordan düşük/eşitse erken dön
  if (targetScore === undefined || targetScore <= currentScore) {
    return [{
      horizon:         'short',
      horizonLabel:    'Hedef Not Geçersiz',
      targetGrade,
      actions:         [],
      scoreBefore:     currentScore,
      scoreAfter:      currentScore,
      gradeBefore:     currentGrade,
      gradeAfter:      currentGrade,
      totalTLMovement: 0,
      goalReached:     false,
      error:           'Hedef not mevcut nottan yüksek olmalı',
    }]
  }

  const horizons: TimeHorizon[] = ['short', 'medium', 'long']
  return horizons.map(h =>
    runSingleScenario(sheet, sector, h, targetGrade, currentScore, subjectiveBonus),
  )
}

// ─── YARDIMCI EXPORT ──────────────────────────────────────────────────────────

/**
 * Hedef not skoru — UI'da göstermek için
 * Örn: getTargetScore("BBB") → 68
 */
export function getTargetScore(grade: string): number {
  return GRADE_SCORES[grade] ?? 60
}

// ─── HESAP KODU BAZLI TEK SENARYO ────────────────────────────────────────────

function runSingleAccountScenario(
  sheet:           AccountBalanceSheet,
  sector:          string,
  horizon:         TimeHorizon,
  targetGrade:     string,
  currentScore:    number,
  subjectiveBonus: number,
): ScenarioResult {
  const targetScore  = GRADE_SCORES[targetGrade] ?? 60
  const allowedTimes = HORIZON_FILTER[horizon]

  // Horizon + sektör filtresi
  let candidatePool = Object.values(ACCOUNT_ACTIONS).filter(a => {
    if (!allowedTimes.includes(a.timeHorizon)) return false
    return (a.sectorFeasibility[sector] ?? 0.5) >= 0.2
  })
  if (candidatePool.length === 0) {
    candidatePool = Object.values(ACCOUNT_ACTIONS).filter(a => {
      if (!allowedTimes.includes(a.timeHorizon)) return false
      return (a.sectorFeasibility[sector] ?? 0.5) >= 0.1
    })
  }

  let currentSheet: AccountBalanceSheet = { accounts: new Map(sheet.accounts) }
  let currentScoreValue = currentScore
  const selectedActions: ScenarioAction[] = []
  const usedIds = new Set<ActionId>()

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (currentScoreValue >= targetScore) break

    let bestGain     = -Infinity
    let bestActionId: ActionId | null = null
    let bestAmount   = 0

    for (const action of candidatePool) {
      if (usedIds.has(action.id)) continue

      const range  = action.calcRange(currentSheet)
      const amount = range.suggested
      if (amount <= 0) continue

      const mutation    = action.mutate(currentSheet, amount)
      const result      = applyAccountMutation(currentSheet, mutation, sector)
      const feasibility = action.sectorFeasibility[sector] ?? 0.5
      const gain        = result.scoreDelta * feasibility

      if (gain > bestGain) {
        bestGain     = gain
        bestActionId = action.id
        bestAmount   = amount
      }
    }

    if (!bestActionId || bestGain <= 0) break

    const bestAction = ACCOUNT_ACTIONS[bestActionId]
    const mutation   = bestAction.mutate(currentSheet, bestAmount)
    const result     = applyAccountMutation(currentSheet, mutation, sector)

    selectedActions.push({
      actionId:        bestActionId,
      label:           bestAction.label,
      description:     bestAction.description,
      amountTL:        bestAmount,
      mutationApplied: {},   // AccountMutation — aggregate BalanceSheet kullanılmıyor
      ratioBefore:     extractKeyRatios(result.ratiosBefore),
      ratioAfter:      extractKeyRatios(result.ratiosAfter),
      scoreDelta:      result.scoreDelta,
      difficulty:      bestAction.difficulty,
      timeHorizon:     bestAction.timeHorizon,
      howTo:           bestAction.howTo(currentSheet, bestAmount),
    })

    usedIds.add(bestActionId)
    currentSheet      = result.after
    currentScoreValue = result.scoreAfter.finalScore + subjectiveBonus
  }

  return {
    horizon,
    horizonLabel:    HORIZON_LABELS[horizon],
    targetGrade,
    actions:         selectedActions,
    scoreBefore:     currentScore,
    scoreAfter:      currentScoreValue,
    gradeBefore:     scoreToRating(currentScore),
    gradeAfter:      scoreToRating(currentScoreValue),
    totalTLMovement: selectedActions.reduce((s, a) => s + a.amountTL, 0),
    goalReached:     currentScoreValue >= (GRADE_SCORES[targetGrade] ?? 60),
  }
}

// ─── HESAP KODU BAZLI ANA FONKSİYON ─────────────────────────────────────────

/**
 * 3 senaryo döner (short → medium → long) hesap kodu bazlı simülasyon ile.
 *
 * @param sheet               AccountBalanceSheet (Map<kod, bakiye>)
 * @param sector              Sektör adı
 * @param currentCombinedScore Combined skor (finansal + subjektif)
 * @param targetGrade         Hedef not ("BBB", "BB" vb.)
 * @param subjectiveBonus     Combined − finansal fark (varsayılan 0)
 */
export function runAccountScenarios(
  sheet:               AccountBalanceSheet,
  sector:              string,
  currentCombinedScore: number,
  targetGrade:         string,
  subjectiveBonus    = 0,
): ScenarioResult[] {
  const targetScore  = GRADE_SCORES[targetGrade]
  const currentGrade = scoreToRating(currentCombinedScore)

  if (targetScore === undefined || targetScore <= currentCombinedScore) {
    return [{
      horizon:         'short',
      horizonLabel:    'Hedef Not Geçersiz',
      targetGrade,
      actions:         [],
      scoreBefore:     currentCombinedScore,
      scoreAfter:      currentCombinedScore,
      gradeBefore:     currentGrade,
      gradeAfter:      currentGrade,
      totalTLMovement: 0,
      goalReached:     false,
      error:           'Hedef not mevcut nottan yüksek olmalı',
    }]
  }

  const horizons: TimeHorizon[] = ['short', 'medium', 'long']
  return horizons.map(h =>
    runSingleAccountScenario(sheet, sector, h, targetGrade, currentCombinedScore, subjectiveBonus),
  )
}
