import type {
  SixGroupAnalysis, ActionEffect, ActionId,
  MeaningfulImpactThresholds,
} from './contracts'
import { DEFAULT_THRESHOLDS } from './contracts'
import { buildSixGroupAnalysis } from './analyzer'
import { generateCandidates, type ActionCandidate } from './candidateGenerator'
import { applyCandidate } from './applier'

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
}

export interface EngineResult {
  analysis: SixGroupAnalysis
  scenarios: ScenarioOutput[]
  currentScore: number
  currentGrade: string
  sector: string
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
  thresholds: MeaningfulImpactThresholds
): ScenarioOutput {
  let currentAnalysis = analysis
  let scoreNow = currentScore
  const gradeNow = currentGrade
  let totalTL = 0
  const chosenActions: ActionEffect[] = []

  for (let i = 0; i < maxActions; i++) {
    if (scoreNow >= targetScore) break

    // Aday üret
    const candidates = generateCandidates(currentAnalysis).filter(c =>
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

    // Skor güncelle
    // Burada gerçek score.ts kullanılması gerekiyor — şimdilik priority score'un %10'unu ekle
    // TODO: entegrasyon aşamasında calculateScore ile değiştir
    const scoreIncrement = best.effect.scoreBreakdown.finalPriorityScore * 0.10
    scoreNow = Math.min(100, scoreNow + scoreIncrement + subjectiveBonus * 0)

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
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS
  const maxActions = input.maxActionsPerHorizon ?? 8

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const analysis = buildSixGroupAnalysis(input.accounts, {
    companyId: input.companyId,
    scenarioId: input.scenarioId,
    sector: input.sector,
    ratios: input.currentRatios as Parameters<typeof buildSixGroupAnalysis>[1]['ratios'],
  })

  const scenarios: ScenarioOutput[] = HORIZONS.map(horizon =>
    buildScenario(
      analysis,
      horizon,
      input.sector,
      input.currentScore,
      input.currentGrade,
      input.targetGrade,
      input.targetScore,
      input.subjectiveBonus ?? 0,
      maxActions,
      thresholds
    )
  )

  return {
    analysis,
    scenarios,
    currentScore: input.currentScore,
    currentGrade: input.currentGrade,
    sector: input.sector,
  }
}
