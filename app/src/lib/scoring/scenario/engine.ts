import type {
  SixGroupAnalysis, ActionEffect, ActionId,
  MeaningfulImpactThresholds, MicroFilterConfig,
} from './contracts'
import {
  MIN_EXECUTION_SCORE, SCORE_EPS,
  MIN_EXECUTION_SCORE_SHORT, MIN_EXECUTION_SCORE_MEDIUM, MIN_EXECUTION_SCORE_LONG,
  MAX_ACTIONS_SHORT, MAX_ACTIONS_MEDIUM, MAX_ACTIONS_LONG,
  MAX_REPEAT_PER_ACTION_LONG,
} from './contracts'
import { buildSixGroupAnalysis } from './analyzer'
import { generateCandidates, type ActionCandidate } from './candidateGenerator'
import { applyCandidate } from './applier'
import { type HorizonKey } from './capMatrix'
import {
  determineRegime, determineGapBand, initialUnlockStage,
  computeCumulativeGuardrails, shouldUnlock, nextUnlockStage,
  GUARDRAIL_BREACH_POLICY, ABSOLUTE_GROUP_SHARE_HARD_STOP,
  type Regime, type GapBand,
} from './adaptivePolicy'
import { calculateRatiosFromAccounts } from '../ratios'
import { calculateScore, scoreToRating } from '../score'
import { computeDynamicThresholds, type StressLevel } from './dynamicThresholds'
import { computeDynamicMicroFilter } from './dynamicMicroFilter'

export interface ScenarioHorizon {
  key: 'short' | 'medium' | 'long'
  label: string
  allowedActionIds: ActionId[]
}

/**
 * Her senaryonun hangi aksiyonları içerebileceğini belirler.
 * Codex tablosundaki time horizon'a göre gruplama.
 */
export const HORIZONS: ScenarioHorizon[] = [
  {
    key: 'short',
    label: 'Acil Müdahale (0–3 Ay)',
    // Hızlı uygulanabilir aksiyonlar
    allowedActionIds: [
      'A04_CASH_PAYDOWN_ST',
      'A05_RECEIVABLE_COLLECTION',
      'A06_INVENTORY_OPTIMIZATION',
      'A07_PREPAID_EXPENSE_RELEASE',
    ],
  },
  {
    key: 'medium',
    label: 'Yapısal İyileştirme (3–12 Ay)',
    allowedActionIds: [
      'A01_ST_FIN_DEBT_TO_LT',
      'A02_TRADE_PAYABLE_TO_LT',
      'A03_ADVANCE_TO_LT',
      'A05_RECEIVABLE_COLLECTION',
      'A06_INVENTORY_OPTIMIZATION',
      'A08_FIXED_ASSET_DISPOSAL',
      'A12_GROSS_MARGIN_IMPROVEMENT',
      'A13_OPEX_OPTIMIZATION',
      'A14_FINANCE_COST_OPTIMIZATION',
    ],
  },
  {
    key: 'long',
    label: 'Stratejik Dönüşüm (1–3 Yıl)',
    allowedActionIds: [
      'A01_ST_FIN_DEBT_TO_LT',
      'A02_TRADE_PAYABLE_TO_LT',
      'A03_ADVANCE_TO_LT',
      'A09_SALE_LEASEBACK',
      'A10_EQUITY_INJECTION',
      'A11_EARNINGS_RETENTION',
      'A12_GROSS_MARGIN_IMPROVEMENT',
      'A13_OPEX_OPTIMIZATION',
      'A14_FINANCE_COST_OPTIMIZATION',
    ],
  },
]

export type StopReasonCode =
  | 'CUM_GUARDRAIL_EQUITY_PP'
  | 'CUM_GUARDRAIL_KVYK_PP'
  | 'CUM_GUARDRAIL_GROUP_SHARE_DETERIORATION'
  | 'CUM_GUARDRAIL_ABSOLUTE_HARD_STOP'
  | 'MAX_ACTIONS_REACHED'
  | 'TARGET_REACHED'
  | 'NO_VALID_CANDIDATES'

export interface StopReason {
  code: StopReasonCode
  message: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail?: Record<string, any>
}

export interface ScenarioOutput {
  horizon: 'short' | 'medium' | 'long'
  horizonLabel: string
  actions: ActionEffect[]
  scoreBefore: number
  scoreAfter: number
  gradeBefore: string
  gradeAfter: string
  totalTLMovement: number
  goalReached: boolean
  targetGrade: string
  stopReason?: StopReason
  // Aşama 5a-2: horizon atlandıysa true
  skipped?: boolean
  skipReason?: string
  watchlist?: string[]
}

export interface EngineMetrics {
  /** Seçilen aksiyonlar içinde herhangi bir cap'e takılan oran (0..1) */
  capHitRate: number
  /** Verim filtresiyle elenmiş aday sayısı (tüm horizonlar toplamı) */
  efficiencyRejectedCount: number
  /** Şok guardrail ile elenmiş aday sayısı */
  shockGuardrailCount: number
  /** Kümülatif guardrail ile loop kırılma sayısı (horizon toplamı) */
  cumulativeGuardrailBreaks: number
  /** Guardrail kodu bazlı skip/kırılma sayıları (tüm horizonlar toplamı) */
  guardrailRejectedCountByCode: Partial<Record<StopReasonCode, number>>
  /** Horizon bazlı istatistikler */
  byHorizon: Record<HorizonKey, {
    candidatesGenerated: number
    candidatesEvaluated: number
    candidatesAccepted: number
    stopReasonCode?: StopReasonCode
  }>
  /** Sektör bazlı cap isabet sayısı */
  bySector?: {
    sector: string
    capHits: number
  }
}

/**
 * Codex önerisine göre — acil müdahale gerekli mi?
 * Aşağıdaki sinyallerden en az biri varsa Acil horizon aktif olur.
 */
export interface EmergencyAssessment {
  required: boolean
  signals: string[]
  skippedSignals: string[]  // Veri yetersizliği nedeniyle değerlendirilemeyen sinyaller
}

export function assessEmergencyNeed(analysis: SixGroupAnalysis): EmergencyAssessment {
  const signals: string[] = []
  const skippedSignals: string[] = []

  const currentRatio = analysis.ratios.CURRENT_RATIO?.value
  const cashRatio = analysis.ratios.CASH_RATIO?.value
  const interestCoverage = analysis.ratios.INTEREST_COVERAGE?.value

  // Sinyal 1: Cari oran < 1.0
  if (currentRatio !== undefined && currentRatio !== null && currentRatio > 0) {
    if (currentRatio < 1.0) {
      signals.push(`Cari oran kritik seviyede: ${currentRatio.toFixed(2)} (< 1.0)`)
    }
  } else {
    skippedSignals.push('Cari oran verisi yok')
  }

  // Sinyal 2: Faiz karşılama oranı < 1.5
  // Faiz gideri yoksa (660/661 = 0) faiz karşılama hesaplanamaz — bu durumda sinyal tetiklenmesin
  const hasInterestExpense = analysis.accounts.some(a =>
    (a.accountCode.startsWith('660') || a.accountCode.startsWith('661')) &&
    a.amount !== 0
  )

  if (hasInterestExpense && interestCoverage !== undefined && interestCoverage !== null) {
    if (interestCoverage > 0 && interestCoverage < 1.5) {
      signals.push(`Faiz karşılama yetersiz: ${interestCoverage.toFixed(2)}x (< 1.5x)`)
    }
  } else if (!hasInterestExpense) {
    skippedSignals.push('Faiz gideri yok — faiz karşılama değerlendirilmedi')
  } else {
    skippedSignals.push('Faiz karşılama verisi yok')
  }

  // Sinyal 3: Nakit oranı — VERİ KONTROLÜ
  // Hazır değerler hesapları (100, 101, 102, 108) FinancialAccount'ta var mı?
  const hasCashAccountData = analysis.accounts.some(a =>
    ['100', '101', '102', '108'].includes(a.accountCode) && a.amount !== 0
  )

  if (hasCashAccountData && cashRatio !== undefined && cashRatio !== null) {
    if (cashRatio >= 0 && cashRatio < 0.05) {
      signals.push(`Nakit oranı düşük: ${cashRatio.toFixed(2)} (< 0.05)`)
    }
  } else {
    skippedSignals.push('Hazır değerler verisi eksik — nakit oranı değerlendirilmedi')
  }

  // Sinyal 4: KVYK > Dönen Varlıklar (net işletme sermayesi negatif)
  const kvyk = analysis.groups.SHORT_TERM_LIABILITIES.total
  const donenVarliklar = analysis.groups.CURRENT_ASSETS.total

  if (kvyk > 0 && donenVarliklar > 0) {
    if (kvyk > donenVarliklar) {
      const pct = ((kvyk - donenVarliklar) / donenVarliklar * 100).toFixed(0)
      signals.push(`KVYK dönen varlıkları %${pct} aşıyor (net işletme sermayesi negatif)`)
    }
  } else {
    skippedSignals.push('KVYK veya Dönen Varlık verisi yok')
  }

  return {
    required: signals.length > 0,
    signals,
    skippedSignals,
  }
}

export interface EngineResult {
  analysis: SixGroupAnalysis
  scenarios: ScenarioOutput[]
  currentScore: number
  currentGrade: string
  sector: string
  emergencyAssessment: EmergencyAssessment
  appliedThresholds: MeaningfulImpactThresholds
  appliedMicroFilter: MicroFilterConfig
  stressLevel: string
  engineMetrics: EngineMetrics
}

interface EvalStats {
  evaluated: number
  accepted: number
  efficiencyRejected: number
  shockRejected: number
}

/**
 * Her aksiyon için etki hesaplar, geçerli olanları döndürür.
 * minScore: horizon bazlı eşik (long için daha düşük)
 */
function evaluateCandidates(
  analysis: SixGroupAnalysis,
  candidates: ActionCandidate[],
  sector: string,
  thresholds: MeaningfulImpactThresholds,
  minScore: number = MIN_EXECUTION_SCORE,
  horizon: HorizonKey = 'medium',
  regime: Regime = 'STABLE',
  gapBand: GapBand = 'MEDIUM',
  unlockStage: 0 | 1 | 2 = 0
): { results: Array<{ candidate: ActionCandidate; effect: ActionEffect }>; stats: EvalStats } {
  const results: Array<{ candidate: ActionCandidate; effect: ActionEffect }> = []
  const stats: EvalStats = { evaluated: 0, accepted: 0, efficiencyRejected: 0, shockRejected: 0 }

  for (const candidate of candidates) {
    if (!candidate.preconditionPassed) continue
    if (candidate.feasibilityMultiplier === 0) continue

    stats.evaluated++
    try {
      const effect = applyCandidate(analysis, candidate, candidate.amountSuggested, sector, thresholds, horizon, regime, gapBand, unlockStage)

      if (effect.scoreBreakdown.finalPriorityScore > minScore + SCORE_EPS) {
        results.push({ candidate, effect })
        stats.accepted++
      } else {
        // Neden reddedildi — constraint tracking
        if (effect.constraintsTriggered.includes('EFFICIENCY_FILTER')) stats.efficiencyRejected++
        if (effect.constraintsTriggered.includes('SHOCK_GUARDRAIL'))   stats.shockRejected++
      }
    } catch {
      // Aksiyon uygulanamadı, atla
      continue
    }
  }

  return { results, stats }
}

/**
 * Çakışma çözümü — conflictsWith listesi ve priority density.
 */
function resolveConflicts(
  evaluated: Array<{ candidate: ActionCandidate; effect: ActionEffect }>
): Array<{ candidate: ActionCandidate; effect: ActionEffect }> {
  // Skora göre azalan sırala
  const sorted = [...evaluated].sort(
    (a, b) => b.effect.scoreBreakdown.finalPriorityScore - a.effect.scoreBreakdown.finalPriorityScore
  )

  const selected: Array<{ candidate: ActionCandidate; effect: ActionEffect }> = []
  const blockedActionIds = new Set<ActionId>()

  for (const item of sorted) {
    if (blockedActionIds.has(item.candidate.actionId)) continue

    selected.push(item)

    // Conflicts ile işaretle
    for (const conflictId of item.candidate.template.conflictsWith) {
      blockedActionIds.add(conflictId)
    }
  }

  return selected
}

interface BuildScenarioResult extends ScenarioOutput {
  _metrics: {
    candidatesGenerated: number
    candidatesEvaluated: number
    candidatesAccepted: number
    efficiencyRejected: number
    shockRejected: number
    cumulativeGuardrailBreak: boolean
    guardrailRejectedCountByCode: Partial<Record<StopReasonCode, number>>
  }
}

/**
 * Senaryo üretimi — belirli horizon için top N aksiyon seçer ve zincir halinde uygular.
 */
function buildScenario(
  analysis: SixGroupAnalysis,
  horizon: ScenarioHorizon,
  sector: string,
  currentScore: number,
  currentGrade: string,
  targetGrade: string,
  targetScore: number,
  subjectiveBonus: number,
  thresholds: MeaningfulImpactThresholds,
  stressLevel: StressLevel,
  microFilter: MicroFilterConfig
): BuildScenarioResult {
  const horizonKey = horizon.key as HorizonKey

  // Fix F-3c: Adaptive policy context — regime, gap band, unlock stage
  const regime: Regime   = determineRegime(currentScore, stressLevel)
  const gapBand: GapBand = determineGapBand(currentScore, targetScore)
  let unlockStage: 0|1|2 = initialUnlockStage(currentScore, targetScore)
  let cumulativeGuards   = computeCumulativeGuardrails(regime, horizonKey, unlockStage)

  if (process.env.DEBUG_SCENARIO) {
    console.log(`[buildScenario:${horizonKey}] Regime=${regime}, GapBand=${gapBand}, UnlockStage=${unlockStage}`)
  }

  // Horizon bazlı sınırlar
  const maxActions = horizonKey === 'long' ? MAX_ACTIONS_LONG
    : horizonKey === 'medium' ? MAX_ACTIONS_MEDIUM
    : MAX_ACTIONS_SHORT

  const minExecScore = horizonKey === 'long' ? MIN_EXECUTION_SCORE_LONG
    : horizonKey === 'medium' ? MIN_EXECUTION_SCORE_MEDIUM
    : MIN_EXECUTION_SCORE_SHORT

  const allowRepeat = horizonKey === 'long'

  // F-3c Part 2: Baseline shares for deterioration guardrail
  const initialAtotal = analysis.totals.assets > 0 ? analysis.totals.assets : 1
  const initialLtotal = analysis.totals.liabilitiesAndEquity > 0 ? analysis.totals.liabilitiesAndEquity : 1
  const initialShares = {
    CURRENT_ASSETS:         analysis.groups.CURRENT_ASSETS.total / initialAtotal,
    NON_CURRENT_ASSETS:     analysis.groups.NON_CURRENT_ASSETS.total / initialAtotal,
    SHORT_TERM_LIABILITIES: analysis.groups.SHORT_TERM_LIABILITIES.total / initialLtotal,
    LONG_TERM_LIABILITIES:  analysis.groups.LONG_TERM_LIABILITIES.total / initialLtotal,
    EQUITY:                 analysis.groups.EQUITY.total / initialLtotal,
  }
  const initialEquityShare = initialShares.EQUITY
  const initialKvykShare   = initialShares.SHORT_TERM_LIABILITIES

  let currentAnalysis = analysis
  let scoreNow = currentScore
  let gradeNow = currentGrade
  let totalTL = 0
  const chosenActions: ActionEffect[] = []
  let stopReason: StopReason | undefined

  // Metrics accumulators
  let totalCandidatesGenerated = 0
  let totalCandidatesEvaluated = 0
  let totalCandidatesAccepted  = 0
  let totalEfficiencyRejected  = 0
  let totalShockRejected       = 0
  let cumulativeGuardrailBreak = false
  const guardrailRejectedByCode: Partial<Record<StopReasonCode, number>> = {}
  const incGuardrail = (code: StopReasonCode) => {
    guardrailRejectedByCode[code] = (guardrailRejectedByCode[code] ?? 0) + 1
  }

  outerLoop: for (let i = 0; i < maxActions; i++) {
    if (scoreNow >= targetScore) {
      stopReason = { code: 'TARGET_REACHED', message: `Hedef skor ${targetScore} ulaşıldı` }
      break
    }

    // Her slot için en fazla 2 deneme: deneme 0 = normal, deneme 1 = unlock sonrası
    let best: { candidate: ActionCandidate; effect: ActionEffect } | null = null

    for (let attempt = 0; attempt < 2; attempt++) {
      // Aday üret — horizonKey + adaptive regime/gap/stage
      const allCandidates = generateCandidates(
        currentAnalysis, horizonKey, { stressLevel, microFilter }, regime, gapBand, unlockStage
      ).filter(c => horizon.allowedActionIds.includes(c.actionId))
      totalCandidatesGenerated += allCandidates.length

      // Tekrar kontrolü
      let fresh: ActionCandidate[]
      if (allowRepeat) {
        const countByAction = new Map<string, number>()
        for (const a of chosenActions) {
          countByAction.set(a.actionId, (countByAction.get(a.actionId) ?? 0) + 1)
        }
        fresh = allCandidates.filter(c => (countByAction.get(c.actionId) ?? 0) < MAX_REPEAT_PER_ACTION_LONG)
      } else {
        const alreadyPicked = new Set(chosenActions.map(a => a.actionId))
        fresh = allCandidates.filter(c => !alreadyPicked.has(c.actionId))
      }

      if (fresh.length === 0) {
        if (!stopReason) stopReason = { code: 'NO_VALID_CANDIDATES', message: 'Geçerli aday aksiyon kalmadı (tekrar sınırı)' }
        break outerLoop
      }

      // Değerlendir — adaptive efficiency filter
      const { results: evaluated, stats: evalStats } = evaluateCandidates(
        currentAnalysis, fresh, sector, thresholds, minExecScore, horizonKey, regime, gapBand, unlockStage
      )
      totalCandidatesEvaluated += evalStats.evaluated
      totalCandidatesAccepted  += evalStats.accepted
      totalEfficiencyRejected  += evalStats.efficiencyRejected
      totalShockRejected       += evalStats.shockRejected

      if (evaluated.length === 0) {
        // Unlock dene (ilk denemede)
        if (attempt === 0 && shouldUnlock(scoreNow >= targetScore, targetScore - scoreNow, true, unlockStage)) {
          unlockStage = nextUnlockStage(unlockStage)
          cumulativeGuards = computeCumulativeGuardrails(regime, horizonKey, unlockStage)
          continue
        }
        if (!stopReason) stopReason = { code: 'NO_VALID_CANDIDATES', message: 'Geçerli aday aksiyon kalmadı (filtre sonrası)' }
        break outerLoop
      }

      // Çakışma çözümü
      const resolved = resolveConflicts(evaluated)
      if (resolved.length === 0) {
        if (!stopReason) stopReason = { code: 'NO_VALID_CANDIDATES', message: 'Geçerli aday aksiyon kalmadı (çakışma sonrası)' }
        break outerLoop
      }

      // ─────────────────────────────────────────────────
      // F-3c Part 2: SKIP_AND_TRY_NEXT — Pre-selection guardrail
      // ─────────────────────────────────────────────────
      let skipCount = 0
      const maxSkip = GUARDRAIL_BREACH_POLICY.maxSkippedCandidatesPerIteration

      for (const item of resolved) {
        if (skipCount >= maxSkip) break

        const aa  = item.effect.afterAnalysis
        const aT  = aa.totals.assets > 0 ? aa.totals.assets : 1
        const lT  = aa.totals.liabilitiesAndEquity > 0 ? aa.totals.liabilitiesAndEquity : 1

        const newCAShare  = aa.groups.CURRENT_ASSETS.total / aT
        const newNCAShare = aa.groups.NON_CURRENT_ASSETS.total / aT
        const newSTLShare = aa.groups.SHORT_TERM_LIABILITIES.total / lT
        const newLTLShare = aa.groups.LONG_TERM_LIABILITIES.total / lT
        const newEqShare  = aa.groups.EQUITY.total / lT

        // Kontrol 1: Mutlak hard stop (herhangi bir grubun payı > 0.98)
        if (Math.max(newCAShare, newNCAShare, newSTLShare, newLTLShare, newEqShare) > ABSOLUTE_GROUP_SHARE_HARD_STOP) {
          skipCount++
          incGuardrail('CUM_GUARDRAIL_ABSOLUTE_HARD_STOP')
          continue
        }

        // Kontrol 2: Kümülatif bozulma — herhangi bir grubun payı başlangıca göre kötüleşti mi?
        const worstDeterioration = Math.max(
          0,
          newCAShare  - initialShares.CURRENT_ASSETS,
          newNCAShare - initialShares.NON_CURRENT_ASSETS,
          newSTLShare - initialShares.SHORT_TERM_LIABILITIES,
          newLTLShare - initialShares.LONG_TERM_LIABILITIES,
          initialShares.EQUITY - newEqShare,  // özkaynak azalması = bozulma
        )
        if (worstDeterioration > cumulativeGuards.maxGroupShareDeteriorationPP) {
          skipCount++
          incGuardrail('CUM_GUARDRAIL_GROUP_SHARE_DETERIORATION')
          continue
        }

        // Kontrol 3: Kümülatif özkaynak artışı PP
        if (newEqShare - initialEquityShare > cumulativeGuards.maxEquityIncreasePP) {
          skipCount++
          incGuardrail('CUM_GUARDRAIL_EQUITY_PP')
          continue
        }

        // Kontrol 4: Kümülatif KVYK azalışı PP
        if (initialKvykShare - newSTLShare > cumulativeGuards.maxKvykDecreasePP) {
          skipCount++
          incGuardrail('CUM_GUARDRAIL_KVYK_PP')
          continue
        }

        // Tüm kontroller geçildi — bu adayı seç
        best = item
        break
      }

      if (best) break  // Aday bulundu — attempt döngüsünden çık

      // Hiçbir aday guardrail'ı geçemedi — unlock dene (ilk denemede)
      if (attempt === 0 && shouldUnlock(scoreNow >= targetScore, targetScore - scoreNow, true, unlockStage)) {
        unlockStage = nextUnlockStage(unlockStage)
        cumulativeGuards = computeCumulativeGuardrails(regime, horizonKey, unlockStage)
        continue  // attempt 1
      }

      // Gerçekten hiç aday yok
      if (!stopReason) stopReason = {
        code: 'NO_VALID_CANDIDATES',
        message: 'Tüm adaylar guardrail veya filtre tarafından engellendi',
      }
      cumulativeGuardrailBreak = skipCount > 0
      break outerLoop
    }  // end attempt loop

    if (!best) break  // Güvenlik — normalde outerLoop break ile çıkılmış olmalı

    // ─────────────────────────────────────────────────
    // Seçilen adayı uygula — yeni analiz üret
    // ─────────────────────────────────────────────────
    const updatedAccounts = currentAnalysis.accounts.map(acc => {
      const mv = best!.effect.accountMovements.find(m => m.accountCode === acc.accountCode)
      return mv ? { accountCode: acc.accountCode, amount: acc.amount + mv.delta } : { accountCode: acc.accountCode, amount: acc.amount }
    })

    for (const mv of best.effect.accountMovements) {
      const exists = updatedAccounts.find(a => a.accountCode === mv.accountCode)
      if (!exists) {
        updatedAccounts.push({ accountCode: mv.accountCode, amount: mv.delta })
      }
    }

    currentAnalysis = buildSixGroupAnalysis(
      updatedAccounts.filter(a => a.amount !== 0),
      {
        companyId: analysis.companyId,
        scenarioId: analysis.scenarioId,
        sector,
        ratios: {
          CURRENT_RATIO:    best.effect.afterRatios.CURRENT_RATIO,
          QUICK_RATIO:      best.effect.afterRatios.QUICK_RATIO,
          CASH_RATIO:       best.effect.afterRatios.CASH_RATIO,
          DEBT_TO_EQUITY:   best.effect.afterRatios.DEBT_TO_EQUITY,
          EQUITY_RATIO:     best.effect.afterRatios.EQUITY_RATIO,
          INTEREST_COVERAGE: best.effect.afterRatios.INTEREST_COVERAGE,
        },
      }
    )

    // Gerçek skor hesaplama — güncel bilanço state'inden
    const updatedAccountsForScore = currentAnalysis.accounts.map(a => ({
      accountCode: a.accountCode,
      amount: a.amount,
    }))

    const newRatios      = calculateRatiosFromAccounts(updatedAccountsForScore)
    const newScoreResult = calculateScore(newRatios, sector)

    // Subjektif bonus korunur — sadece finansal skor değişir
    const scoreBefore = scoreNow
    scoreNow  = Math.min(100, newScoreResult.finalScore + subjectiveBonus)
    gradeNow  = scoreToRating(scoreNow)

    best.effect.actualScoreDelta  = scoreNow - scoreBefore
    best.effect.scoreBeforeAction = scoreBefore
    best.effect.scoreAfterAction  = scoreNow

    chosenActions.push(best.effect)
    totalTL += best.effect.amountApplied
  }

  // Döngü normal tamamlandıysa (maxActions'a ulaşıldı)
  if (!stopReason && chosenActions.length >= maxActions) {
    stopReason = { code: 'MAX_ACTIONS_REACHED', message: `${maxActions} aksiyon sınırına ulaşıldı` }
  }

  // Tutarlılık kontrolü: toplam delta ≈ senaryo skor artışı (±0.1 tolerans)
  const totalDelta    = chosenActions.reduce((s, a) => s + a.actualScoreDelta, 0)
  const scenarioDelta = scoreNow - currentScore
  if (chosenActions.length > 0 && Math.abs(totalDelta - scenarioDelta) > 0.1) {
    console.warn(
      `[engine] Tutarsızlık [${horizon.key}]: Σ actualScoreDelta=${totalDelta.toFixed(2)}, senaryo Δ=${scenarioDelta.toFixed(2)}`
    )
  }

  return {
    horizon: horizon.key,
    horizonLabel: horizon.label,
    actions: chosenActions,
    scoreBefore: currentScore,
    scoreAfter: scoreNow,
    gradeBefore: currentGrade,
    gradeAfter: gradeNow,
    totalTLMovement: totalTL,
    goalReached: scoreNow >= targetScore,
    targetGrade,
    stopReason,
    _metrics: {
      candidatesGenerated:         totalCandidatesGenerated,
      candidatesEvaluated:         totalCandidatesEvaluated,
      candidatesAccepted:          totalCandidatesAccepted,
      efficiencyRejected:          totalEfficiencyRejected,
      shockRejected:               totalShockRejected,
      cumulativeGuardrailBreak,
      guardrailRejectedCountByCode: guardrailRejectedByCode,
    },
  }
}

/**
 * Motorun ana giriş noktası — 3 senaryoyu üretir.
 */
export interface RunEngineInput {
  accounts: { accountCode: string; amount: number }[]
  companyId: string
  scenarioId: string
  sector: string
  currentScore: number
  currentGrade: string
  targetGrade: string
  targetScore: number
  subjectiveBonus?: number
  currentRatios?: Partial<Record<string, number>>
  thresholds?: MeaningfulImpactThresholds
  /** @deprecated Horizon bazlı sınırlar artık contracts.ts sabitleriyle yönetilir */
  maxActionsPerHorizon?: number
}

export function runScenarioEngine(input: RunEngineInput): EngineResult {

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysis = buildSixGroupAnalysis(input.accounts, {
    companyId: input.companyId,
    scenarioId: input.scenarioId,
    sector: input.sector,
    ratios: input.currentRatios as Parameters<typeof buildSixGroupAnalysis>[1]['ratios'],
  })

  // Dinamik eşik hesaplama — analysis hazır olduktan sonra
  const dynamicThresholds = input.thresholds ?? computeDynamicThresholds(
    analysis,
    input.currentScore,
    input.targetScore,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stressLevel: StressLevel = (dynamicThresholds as any)._factors?.stressLevel ?? 'MILD'
  const microFilter = computeDynamicMicroFilter(analysis, stressLevel)

  const emergency = assessEmergencyNeed(analysis)

  const buildResults = HORIZONS.map(horizon => {
    // Kısa horizon sadece acil durum varsa çalışsın
    if (horizon.key === 'short' && !emergency.required) {
      const skipped: BuildScenarioResult = {
        horizon: 'short',
        horizonLabel: horizon.label,
        actions: [],
        scoreBefore: input.currentScore,
        scoreAfter: input.currentScore,
        gradeBefore: input.currentGrade,
        gradeAfter: input.currentGrade,
        totalTLMovement: 0,
        goalReached: false,
        targetGrade: input.targetGrade,
        skipped: true,
        skipReason: 'Firmada likidite stresi sinyali yok — acil müdahale gerekmiyor',
        watchlist: [
          'Cari oran takibi — 1.2 altına düşerse tedbir alın',
          'Nakit pozisyonu — 30 günlük ödeme yükümlülüklerini karşılamalı',
          'Faiz karşılama oranı — 2.0x altına inerse finansal yük değerlendirilmedi',
        ],
        _metrics: {
          candidatesGenerated: 0, candidatesEvaluated: 0, candidatesAccepted: 0,
          efficiencyRejected: 0, shockRejected: 0, cumulativeGuardrailBreak: false,
          guardrailRejectedCountByCode: {},
        },
      }
      return skipped
    }

    return buildScenario(
      analysis,
      horizon,
      input.sector,
      input.currentScore,
      input.currentGrade,
      input.targetGrade,
      input.targetScore,
      input.subjectiveBonus ?? 0,
      dynamicThresholds,
      stressLevel,
      microFilter
    )
  })

  // Strip _metrics from public scenarios array
  const scenarios: ScenarioOutput[] = buildResults.map(({ _metrics: _m, ...rest }) => rest)

  // Aggregate EngineMetrics
  const horizonKeys: HorizonKey[] = ['short', 'medium', 'long']
  const byHorizon = Object.fromEntries(
    horizonKeys.map((k, idx) => {
      const m = buildResults[idx]._metrics
      return [k, {
        candidatesGenerated: m.candidatesGenerated,
        candidatesEvaluated: m.candidatesEvaluated,
        candidatesAccepted:  m.candidatesAccepted,
        stopReasonCode:      buildResults[idx].stopReason?.code,
      }]
    })
  ) as Record<HorizonKey, { candidatesGenerated: number; candidatesEvaluated: number; candidatesAccepted: number; stopReasonCode?: StopReasonCode }>

  const allActions = buildResults.flatMap(r => r.actions)
  const capHitCount = allActions.filter(a => a.bindingCap !== null && a.bindingCap !== undefined).length
  const capHitRate  = allActions.length > 0 ? capHitCount / allActions.length : 0

  const efficiencyRejectedCount   = buildResults.reduce((s, r) => s + r._metrics.efficiencyRejected, 0)
  const shockGuardrailCount       = buildResults.reduce((s, r) => s + r._metrics.shockRejected, 0)
  const cumulativeGuardrailBreaks = buildResults.filter(r => r._metrics.cumulativeGuardrailBreak).length

  // Aggregate guardrailRejectedCountByCode across horizons
  const guardrailRejectedCountByCode: Partial<Record<StopReasonCode, number>> = {}
  for (const r of buildResults) {
    for (const [code, cnt] of Object.entries(r._metrics.guardrailRejectedCountByCode)) {
      const k = code as StopReasonCode
      guardrailRejectedCountByCode[k] = (guardrailRejectedCountByCode[k] ?? 0) + (cnt as number)
    }
  }

  const engineMetrics: EngineMetrics = {
    capHitRate,
    efficiencyRejectedCount,
    shockGuardrailCount,
    cumulativeGuardrailBreaks,
    guardrailRejectedCountByCode,
    byHorizon,
    bySector: { sector: input.sector, capHits: capHitCount },
  }

  return {
    analysis,
    scenarios,
    currentScore: input.currentScore,
    currentGrade: input.currentGrade,
    sector: input.sector,
    emergencyAssessment: emergency,
    appliedThresholds: dynamicThresholds,
    appliedMicroFilter: microFilter,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stressLevel: (dynamicThresholds as any)._factors?.stressLevel ?? 'UNKNOWN',
    engineMetrics,
  }
}
