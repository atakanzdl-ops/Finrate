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
import { ACTIONS, type ActionId, type Difficulty, type TimeHorizon } from './actions'

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
}

// ─── SABİTLER ─────────────────────────────────────────────────────────────────

/** Hedef not → minimum skor eşiği */
const GRADE_TARGET_SCORE: Record<string, number> = {
  AAA: 93, AA: 84, A: 76, BBB: 68, BB: 60, B: 52, CCC: 44, CC: 36, C: 30,
}

/** Senaryo açıklama etiketleri */
const HORIZON_LABELS: Record<TimeHorizon, string> = {
  short:  'Acil Müdahale (0–3 Ay)',
  medium: 'Orta Vadeli Plan (3–12 Ay)',
  long:   'Uzun Vadeli Strateji (1–3 Yıl)',
}

/**
 * Her aksiyon için kısa uygulama notu.
 * actions.ts'i değiştirmeden burada tanımlandı (prompt gereksinimi).
 */
const HOW_TO: Record<ActionId, string> = {
  kv_to_uv:            'Mevcut KV kredileri için banka ile UV yapılandırma müzakeresi yapın',
  collect_receivables: '90+ gün gecikmiş alacaklara ihtar gönderin, %2–3 iskonto teklif edin',
  liquidate_inventory: 'Yavaş hareket eden stokları indirimli satışa çıkarın',
  repay_kv_debt:       'Atıl kasadan KV kredi erken kapatın',
  reduce_opex:         'Genel yönetim ve pazarlama giderlerini gözden geçirin',
  improve_margin:      'Tedarikçi fiyat müzakeresi veya verimlilik artışı ile maliyet düşürün',
  refinance:           'Yüksek faizli krediler için alternatif banka teklifleri alın',
  capital_increase:    'Ortak sermaye koyması veya yeni ortak girişi ile özkaynak güçlendirin',
  retain_profit:       'Bu yıl kâr dağıtımını durdurun, kârı işletmede bırakın',
  sell_asset:          'Kullanılmayan makine, araç veya gayrimenkul satışı yapın',
  shorten_dso:         'Müşteri ödeme vadelerini kısaltın, peşin ödemeye teşvik için iskonto sunun',
  extend_dpo:          'Tedarikçilerle vade uzatma müzakeresi yapın',
  increase_revenue:    'Atıl kapasite için yeni müşteri/sözleşme arayışına girin',
  close_credit:        'Kullanılmayan kredi limitlerini kapatarak faiz yükünü azaltın',
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
  sheet:        BalanceSheet,
  sector:       string,
  horizon:      TimeHorizon,
  targetGrade:  string,
  currentScore: number,
): ScenarioResult {
  const targetScore   = GRADE_TARGET_SCORE[targetGrade] ?? 60
  const allowedTimes  = HORIZON_FILTER[horizon]

  // Horizon + sektör filtresi
  const candidatePool = Object.values(ACTIONS).filter(a => {
    if (!allowedTimes.includes(a.timeHorizon)) return false
    const feasibility = a.sectorFeasibility[sector] ?? 0.5
    return feasibility >= 0.3
  })

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
      howTo:           HOW_TO[bestActionId],
    })

    usedIds.add(bestActionId)
    currentSheet      = result.after
    currentScoreValue = result.scoreAfter.finalScore
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
    goalReached:     currentScoreValue >= (GRADE_TARGET_SCORE[targetGrade] ?? 60),
  }
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * 3 senaryo döner: short → medium → long
 *
 * @param sheet        Mevcut bilanço
 * @param sector       Sektör adı (sectorFeasibility için)
 * @param currentScore Mevcut final skor
 * @param targetGrade  Hedef not ("BBB", "BB" vb.)
 */
export function runScenarios(
  sheet:        BalanceSheet,
  sector:       string,
  currentScore: number,
  targetGrade:  string,
): ScenarioResult[] {
  const horizons: TimeHorizon[] = ['short', 'medium', 'long']
  return horizons.map(h =>
    runSingleScenario(sheet, sector, h, targetGrade, currentScore),
  )
}

// ─── YARDIMCI EXPORT ──────────────────────────────────────────────────────────

/**
 * Hedef not skoru — UI'da göstermek için
 * Örn: getTargetScore("BBB") → 68
 */
export function getTargetScore(grade: string): number {
  return GRADE_TARGET_SCORE[grade] ?? 60
}
