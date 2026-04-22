import type {
  SixGroupAnalysis, ActionEffect, ActionId,
  MeaningfulImpactThresholds, MicroFilterConfig,
} from './contracts'
import {} from './contracts'
import { buildSixGroupAnalysis } from './analyzer'
import { generateCandidates, type ActionCandidate } from './candidateGenerator'
import { applyCandidate } from './applier'
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
  // Aşama 5a-2: horizon atlandıysa true
  skipped?: boolean
  skipReason?: string
  watchlist?: string[]
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
}

/**
 * Her aksiyon için etki hesaplar, geçerli olanları döndürür.
 */
function evaluateCandidates(
  analysis: SixGroupAnalysis,
  candidates: ActionCandidate[],
  sector: string,
  thresholds: MeaningfulImpactThresholds
): Array<{ candidate: ActionCandidate; effect: ActionEffect }> {
  const results: Array<{ candidate: ActionCandidate; effect: ActionEffect }> = []

  for (const candidate of candidates) {
    if (!candidate.preconditionPassed) continue
    if (candidate.feasibilityMultiplier === 0) continue

    try {
      const effect = applyCandidate(analysis, candidate, candidate.amountSuggested, sector, thresholds)

      // Minimal impact olanları elediğimizde skor 0 olur — ama yine de listeye ekle, sıralamaya bırak
      if (effect.scoreBreakdown.finalPriorityScore > 0) {
        results.push({ candidate, effect })
      }
    } catch {
      // Aksiyon uygulanamadı, atla
      continue
    }
  }

  return results
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
  maxActions: number,
  thresholds: MeaningfulImpactThresholds,
  stressLevel: StressLevel,
  microFilter: MicroFilterConfig
): ScenarioOutput {
  let currentAnalysis = analysis
  let scoreNow = currentScore
  let gradeNow = currentGrade
  let totalTL = 0
  const chosenActions: ActionEffect[] = []

  for (let i = 0; i < maxActions; i++) {
    if (scoreNow >= targetScore) break

    // Aday üret
    const candidates = generateCandidates(currentAnalysis, { stressLevel, microFilter }).filter(c =>
      horizon.allowedActionIds.includes(c.actionId)
    )

    // Daha önce seçilen aksiyonları at (aynı aksiyonu iki kez önerme)
    const alreadyPicked = new Set(chosenActions.map(a => a.actionId))
    const fresh = candidates.filter(c => !alreadyPicked.has(c.actionId))

    // Değerlendir
    const evaluated = evaluateCandidates(currentAnalysis, fresh, sector, thresholds)
    if (evaluated.length === 0) break

    // Çakışma çözümü
    const resolved = resolveConflicts(evaluated)
    if (resolved.length === 0) break

    // En yüksek skorlu seçilir
    const best = resolved[0]

    // Uygula — yeni analiz üret
    const updatedAccounts = currentAnalysis.accounts.map(acc => {
      const mv = best.effect.accountMovements.find(m => m.accountCode === acc.accountCode)
      return mv ? { accountCode: acc.accountCode, amount: acc.amount + mv.delta } : { accountCode: acc.accountCode, amount: acc.amount }
    })

    // Yeni hesaplar (ör. hedef hesap analysis'te yoksa ekle)
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
          CURRENT_RATIO: best.effect.afterRatios.CURRENT_RATIO,
          QUICK_RATIO: best.effect.afterRatios.QUICK_RATIO,
          CASH_RATIO: best.effect.afterRatios.CASH_RATIO,
          DEBT_TO_EQUITY: best.effect.afterRatios.DEBT_TO_EQUITY,
          EQUITY_RATIO: best.effect.afterRatios.EQUITY_RATIO,
          INTEREST_COVERAGE: best.effect.afterRatios.INTEREST_COVERAGE,
        },
      }
    )

    // Gerçek skor hesaplama — güncel bilanço state'inden
    const updatedAccountsForScore = currentAnalysis.accounts.map(a => ({
      accountCode: a.accountCode,
      amount: a.amount,
    }))

    const newRatios = calculateRatiosFromAccounts(updatedAccountsForScore)
    const newScoreResult = calculateScore(newRatios, sector)

    // Subjektif bonus korunur — sadece finansal skor değişir
    const newFinancialScore = newScoreResult.finalScore
    scoreNow = Math.min(100, newFinancialScore + subjectiveBonus)
    gradeNow = scoreToRating(scoreNow)

    chosenActions.push(best.effect)
    totalTL += best.effect.amountApplied
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
  maxActionsPerHorizon?: number
}

export function runScenarioEngine(input: RunEngineInput): EngineResult {
  const maxActions = input.maxActionsPerHorizon ?? 8

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

  const scenarios: ScenarioOutput[] = HORIZONS.map(horizon => {
    // Kısa horizon sadece acil durum varsa çalışsın
    if (horizon.key === 'short' && !emergency.required) {
      return {
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
          'Faiz karşılama oranı — 2.0x altına inerse finansal yük değerlendirilmeli',
        ],
      }
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
      maxActions,
      dynamicThresholds,
      stressLevel,
      microFilter
    )
  })

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
  }
}
