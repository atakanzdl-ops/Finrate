/**
 * DECISION LAYER (V3-10b) — BANKER DECISION ANSWER FORMATTER
 *
 * Bu dosya PURE FORMATTER'dir. Yeni hesaplama yapmaz.
 * engineV3.ts ciktisini UI-ready banker cevabina donusturur.
 *
 * SORUMLULUKLARI:
 *   - ExecutiveAnswer: Yonetici ozeti (rating gecisi + feasibility + guven)
 *   - ActionPlanRow[]: "Sirket ne yapmali?" - horizon bazli aksiyon plani
 *   - NotchPlan x2: 1 not ve 2 not iyilesme plani
 *   - AccountingImpactTable: Muhasebe etki tablosu (borclar/alacaklar)
 *   - WhyCapitalAloneNotEnough: "Sermaye yetmez" aciklamasi
 *   - TargetFeasibilityExplanation: Hedef ulasilabilirlik aciklamasi
 *   - IfNotDoneRisk: Yapilmazsa risk
 *   - UiReadyRows: Duz tablo satirlari (frontend render icin)
 *   - RejectedInsights: Neden reddedildi
 *   - ConsultantNarrative: CFO/banker dili (v4 yeni eklenti)
 *   - ComparisonWithV2: V2 vs V3 karsilastirma (opsiyonel)
 *
 * KRITIK KURALLAR:
 *   - leg.amount kullanilir (leg.amountTRY DEGIL — AccountingLeg interface)
 *   - ACTION_CATALOG_V3[id] kullanilir (Record, .find() degil)
 *   - dedupeActions: ayni actionId+amountTRY combination portfoyler arasi tekrar etmez
 *   - Yeni matematik/skor hesabi YAPILMAZ — sadece engineResult verisi formatlanir
 */

import type { AccountingLeg } from './contracts'
import type {
  EngineResult,
  SelectedAction,
  FeasibilityAssessment,
} from './engineV3'
import { ACTION_CATALOG_V3 } from './actionCatalogV3'
import type { RatingGrade } from './ratingReasoning'
import {
  ACTION_CATEGORY_MAP,
  ratingToIndex,
} from './ratingReasoning'
import type {
  CeilingConstraint,
  DriverGroup,
  MissedOpportunity,
  NotchScenario,
} from './ratingReasoning'

// Unused import guard
void 0 as unknown as AccountingLeg
void 0 as unknown as FeasibilityAssessment

// ─── EXECUTIVE ANSWER ────────────────────────────────────────────────────────

export interface ExecutiveAnswer {
  /** Mevcut rating */
  currentRating: RatingGrade
  /** Istenen hedef */
  requestedTarget: RatingGrade
  /** Motor'un hesapladigi ulasilabilir hedef */
  achievableTarget: RatingGrade
  /** Hedef istenen ile ayni mi? */
  targetMatchesRequest: boolean
  /** Guven seviyesi */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  /** Guven modifier (0.25-1.0) */
  confidenceModifier: number
  /** Kac not kazanildi */
  notchesGained: number
  /** Ust satir baslik (UI heading) */
  headline: string
  /** Alt baslik / aciklama (UI subtitle) */
  subtitle: string
  /** Ozet bir-iki cumle (CFO icin) */
  executiveSummary: string
  /** Ceiling aktif mi */
  hasCeiling: boolean
  /** Ceiling aciklamasi */
  ceilingNote?: string
}

// ─── ACTION PLAN ROW ─────────────────────────────────────────────────────────

export type ActionHorizonLabel = 'Kısa Vade (0-6 ay)' | 'Orta Vade (6-18 ay)' | 'Uzun Vade (18-36 ay)'

export interface ActionPlanRow {
  rank: number
  actionId: string
  actionName: string
  horizon: 'short' | 'medium' | 'long'
  horizonLabel: ActionHorizonLabel
  amountTRY: number
  amountFormatted: string
  category: 'STRUCTURAL' | 'COSMETIC' | 'HYBRID'
  categoryLabel: string
  sustainability: string
  qualityScore: number
  estimatedNotchContribution: number
  /** Neden secildi */
  whySelected: string
  /** Muhasebe etkisi ozeti (tek cumle) */
  accountingEffect: string
  /** CFO rationale (action template'den) */
  cfoRationale: string
  /** Banker perspective (action template'den) */
  bankerPerspective: string
}

// ─── NOTCH PLAN ──────────────────────────────────────────────────────────────

export interface NotchPlan {
  targetNotches: number
  targetRating: RatingGrade
  requiredActionIds: string[]
  requiredActionNames: string[]
  totalAmountTRY: number
  totalAmountFormatted: string
  isAchievable: boolean
  blockedBy?: string
  keyAction?: string
  narrative: string
  /** Engine'in notch scenario'sundan alınan raw veri */
  engineScenario: NotchScenario
}

// ─── ACCOUNTING IMPACT TABLE ─────────────────────────────────────────────────

export interface AccountingImpactRow {
  rank: number
  horizon: 'short' | 'medium' | 'long'
  actionId: string
  actionName: string
  transactionId: string
  transactionDescription: string
  legSide: 'DEBIT' | 'CREDIT'
  accountCode: string
  accountName: string
  amountTRY: number
  amountFormatted: string
  semanticType: string
}

// ─── UI READY ROW ─────────────────────────────────────────────────────────────

export interface UiReadyRow {
  id: string
  horizon: 'short' | 'medium' | 'long'
  horizonLabel: ActionHorizonLabel
  rank: number
  actionId: string
  actionName: string
  amountTRY: number
  amountFormatted: string
  category: string
  categoryLabel: string
  qualityScore: number
  notchContribution: number
  sustainability: string
  whySelected: string
  cfoRationale: string
}

// ─── REJECTED INSIGHT ────────────────────────────────────────────────────────

export interface RejectedInsight {
  actionId: string
  actionName: string
  reason: string
  estimatedNotchImpact: number
  category: string
  isFromMissedOpportunities: boolean
}

// ─── CONSULTANT NARRATIVE ─────────────────────────────────────────────────────

export interface ConsultantNarrative {
  /** "Şirketin temel sorunu nedir?" — kısa problem tanımı */
  problem: string
  /** "Neden bu rating seviyesindesiniz?" — kök neden */
  coreIssue: string
  /** "İlk 6 ayda ne yapmalısınız?" — acil adımlar */
  shortTermPriority: string
  /** "Kalıcı iyileşme için ne lazım?" — yapısal dönüşüm */
  structuralNeed: string
  /** "Bankacı bunu nasıl görür?" — banka perspektifi */
  bankerView: string
}

// ─── COMPARISON WITH V2 ──────────────────────────────────────────────────────

export interface ComparisonWithV2 {
  v2ActionCount: number
  v3ActionCount: number
  /** V3'te olup V2'de olmayan aksiyonlar */
  newActionsInV3: string[]
  /** V2'de olup V3'te olmayan aksiyonlar */
  removedFromV2: string[]
  /** V3'ün confidence'i V2'den yüksek mi? */
  v3HigherConfidence: boolean
  /** Fark açıklaması */
  diffNote: string
}

// ─── MAIN OUTPUT ─────────────────────────────────────────────────────────────

export interface DecisionAnswer {
  executiveAnswer: ExecutiveAnswer
  whatCompanyShouldDo: ActionPlanRow[]
  oneNotchPlan: NotchPlan
  twoNotchPlan: NotchPlan
  accountingImpactTable: AccountingImpactRow[]
  whyCapitalAloneIsNotEnough: string
  targetFeasibilityExplanation: string
  ifNotDoneRisk: string
  uiReadyRows: UiReadyRow[]
  rejectedInsights: RejectedInsight[]
  consultantNarrative: ConsultantNarrative
  comparisonWithV2?: ComparisonWithV2
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function formatTRY(amount: number): string {
  if (amount >= 1_000_000_000) {
    return `₺${(amount / 1_000_000_000).toFixed(1)} Mrd`
  }
  if (amount >= 1_000_000) {
    return `₺${(amount / 1_000_000).toFixed(1)} Mn`
  }
  if (amount >= 1_000) {
    return `₺${(amount / 1_000).toFixed(0)} K`
  }
  return `₺${amount.toFixed(0)}`
}

function horizonLabel(h: 'short' | 'medium' | 'long'): ActionHorizonLabel {
  if (h === 'short')  return 'Kısa Vade (0-6 ay)'
  if (h === 'medium') return 'Orta Vade (6-18 ay)'
  return 'Uzun Vade (18-36 ay)'
}

function categoryLabel(cat: string): string {
  if (cat === 'STRUCTURAL') return 'Yapısal'
  if (cat === 'COSMETIC')   return 'Muhasebesel'
  if (cat === 'HYBRID')     return 'Karma'
  return cat
}

/**
 * Ayni actionId + amountTRY kombinasyonu portfoyler arasi tekrar etmez.
 * Cumulative horizon yapisi nedeniyle short aksiyonlar medium + long'da da gorunur.
 * dedupeActions yalnizca unique kombinasyonlari dondurur.
 */
export function dedupeActions(actions: SelectedAction[]): SelectedAction[] {
  const seen = new Set<string>()
  return actions.filter(a => {
    const key = `${a.actionId}::${a.amountTRY}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// ─── BUILDER: EXECUTIVE ANSWER ───────────────────────────────────────────────

function buildExecutiveAnswer(
  engineResult: EngineResult,
  requestedTarget: RatingGrade,
): ExecutiveAnswer {
  const {
    currentRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
  } = engineResult

  const targetMatchesRequest = finalTargetRating === requestedTarget
  const achievedRequested    = ratingToIndex(finalTargetRating) >= ratingToIndex(requestedTarget)

  // Binding ceiling kontrolu
  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const hasCeiling     = bindingCeiling !== null && bindingCeiling !== undefined

  let headline: string
  let subtitle: string

  if (notchesGained === 0) {
    headline = `${currentRating} seviyesinde kalınıyor`
    subtitle  = 'Mevcut koşullar altında rating iyileşmesi sağlanamıyor'
  } else if (achievedRequested) {
    headline = `${currentRating} → ${finalTargetRating} iyileşme mümkün`
    subtitle  = `${notchesGained} kademe iyileşme — hedef ${requestedTarget} ulaşılabilir`
  } else {
    headline = `${currentRating} → ${finalTargetRating} (hedef ${requestedTarget} kısıtlı)`
    subtitle  = `${notchesGained} kademe iyileşme — tam hedef ceiling nedeniyle sınırlı`
  }

  let executiveSummary = engineResult.reasoning.bankerSummary as string

  const ceilingNote = hasCeiling
    ? `${bindingCeiling!.source} ceiling aktif: ${bindingCeiling!.reason} (max ${bindingCeiling!.maxRating})`
    : undefined

  return {
    currentRating,
    requestedTarget,
    achievableTarget:    finalTargetRating,
    targetMatchesRequest,
    confidence,
    confidenceModifier,
    notchesGained,
    headline,
    subtitle,
    executiveSummary,
    hasCeiling,
    ceilingNote,
  }
}

// ─── BUILDER: ACTION PLAN ROWS ───────────────────────────────────────────────

function buildActionPlan(engineResult: EngineResult): ActionPlanRow[] {
  const deduped = dedupeActions(engineResult.portfolio)
  const rows: ActionPlanRow[] = []

  deduped.forEach((action, idx) => {
    const template  = ACTION_CATALOG_V3[action.actionId]
    const cat       = ACTION_CATEGORY_MAP[action.actionId] ?? 'HYBRID'

    // Aksiyon'un muhasebe transaction'larindan kisa etki ozeti
    const txDesc = action.transactions[0]?.description ?? action.actionName

    rows.push({
      rank:                     idx + 1,
      actionId:                 action.actionId,
      actionName:               action.actionName,
      horizon:                  action.horizon,
      horizonLabel:             horizonLabel(action.horizon),
      amountTRY:                action.amountTRY,
      amountFormatted:          formatTRY(action.amountTRY),
      category:                 cat,
      categoryLabel:            categoryLabel(cat),
      sustainability:           action.sustainability,
      qualityScore:             action.qualityScore,
      estimatedNotchContribution: action.estimatedNotchContribution,
      whySelected:              action.narrative,
      accountingEffect:         txDesc,
      cfoRationale:             template?.cfoRationale     ?? action.narrative,
      bankerPerspective:        template?.bankerPerspective ?? '',
    })
  })

  return rows
}

// ─── BUILDER: NOTCH PLANS ────────────────────────────────────────────────────

function buildOneNotchPlan(engineResult: EngineResult): NotchPlan {
  const scenario = engineResult.reasoning.oneNotchScenario as NotchScenario
  const currentIdx = ratingToIndex(engineResult.currentRating)
  const targetRating = (
    currentIdx + 1 < 22
      ? ['D','C','CC','CCC-','CCC','CCC+','B-','B','B+','BB-','BB','BB+','BBB-','BBB','BBB+','A-','A','A+','AA-','AA','AA+','AAA'][currentIdx + 1]
      : 'AAA'
  ) as RatingGrade

  // Portfoyden 1 not icin gereken aksiyonlari al
  const requiredActions = scenario.requiredActions.slice(0, 3)
  const matchedInPortfolio = engineResult.portfolio.filter(
    a => requiredActions.includes(a.actionId)
  )

  const totalAmount = matchedInPortfolio.reduce((s, a) => s + a.amountTRY, 0)
  const keyAction   = requiredActions[0]
  const template    = keyAction ? ACTION_CATALOG_V3[keyAction] : undefined

  return {
    targetNotches:       1,
    targetRating,
    requiredActionIds:   requiredActions,
    requiredActionNames: requiredActions.map(
      id => ACTION_CATALOG_V3[id]?.name ?? id
    ),
    totalAmountTRY:       totalAmount,
    totalAmountFormatted: formatTRY(totalAmount),
    isAchievable:         scenario.isAchievable,
    blockedBy:            scenario.blockedBy,
    keyAction:            template?.name,
    narrative:            scenario.narrative,
    engineScenario:       scenario,
  }
}

function buildTwoNotchPlan(engineResult: EngineResult): NotchPlan {
  const scenario = engineResult.reasoning.twoNotchScenario as NotchScenario
  const currentIdx = ratingToIndex(engineResult.currentRating)
  const targetIdx  = Math.min(currentIdx + 2, 21)
  const ratingOrder = ['D','C','CC','CCC-','CCC','CCC+','B-','B','B+','BB-','BB','BB+','BBB-','BBB','BBB+','A-','A','A+','AA-','AA','AA+','AAA']
  const targetRating = ratingOrder[targetIdx] as RatingGrade

  const requiredActions = scenario.requiredActions.slice(0, 4)
  const matchedInPortfolio = engineResult.portfolio.filter(
    a => requiredActions.includes(a.actionId)
  )
  const totalAmount = matchedInPortfolio.reduce((s, a) => s + a.amountTRY, 0)
  const keyAction   = requiredActions[0]
  const template    = keyAction ? ACTION_CATALOG_V3[keyAction] : undefined

  return {
    targetNotches:       2,
    targetRating,
    requiredActionIds:   requiredActions,
    requiredActionNames: requiredActions.map(
      id => ACTION_CATALOG_V3[id]?.name ?? id
    ),
    totalAmountTRY:       totalAmount,
    totalAmountFormatted: formatTRY(totalAmount),
    isAchievable:         scenario.isAchievable,
    blockedBy:            scenario.blockedBy,
    keyAction:            template?.name,
    narrative:            scenario.narrative,
    engineScenario:       scenario,
  }
}

// ─── BUILDER: ACCOUNTING IMPACT TABLE ────────────────────────────────────────

function buildAccountingImpactTable(engineResult: EngineResult): AccountingImpactRow[] {
  const deduped = dedupeActions(engineResult.portfolio)
  const rows: AccountingImpactRow[] = []
  let rank = 1

  for (const action of deduped) {
    for (const tx of action.transactions) {
      for (const leg of tx.legs) {
        rows.push({
          rank:                   rank++,
          horizon:                action.horizon,
          actionId:               action.actionId,
          actionName:             action.actionName,
          transactionId:          tx.transactionId,
          transactionDescription: tx.description,
          legSide:                leg.side,
          accountCode:            leg.accountCode,
          accountName:            leg.accountName ?? '',
          // leg.amount — AccountingLeg interface kullanir .amount (NOT .amountTRY)
          amountTRY:              leg.amount,
          amountFormatted:        formatTRY(leg.amount),
          semanticType:           tx.semanticType,
        })
      }
    }
  }

  return rows
}

// ─── BUILDER: WHY CAPITAL ALONE NOT ENOUGH ───────────────────────────────────

function buildWhyCapitalAloneNotEnough(engineResult: EngineResult): string {
  const productivity = engineResult.layerSummaries.productivity as {
    productivityScore: number
    metrics: { trappedAssetsShare: number }
    inefficiencyFlags: Array<{ type: string; severity: string; description: string }>
  } | null

  if (!productivity) {
    return 'Varlık verimliliği analizi mevcut değil.'
  }

  const score   = productivity.productivityScore
  const trapped = productivity.metrics.trappedAssetsShare
  const parts: string[] = []

  if (score < 0.30) {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} seviyesinde — nakit enjeksiyonu tek başına ` +
      'rating iyileştirmez; aktif çalışmıyorsa yeni sermaye de işlevsiz kalır.'
    )
  } else if (score < 0.50) {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} — sermaye gerekli ama yeterli değil; ` +
      'operasyonel dönüşüm eşlik etmezse etkisi sınırlı.'
    )
  } else {
    parts.push(
      `Varlık verimliliği %${(score * 100).toFixed(0)} — sermaye yapısal iyileşmeyi destekleyebilir.`
    )
  }

  if (trapped > 0.60) {
    parts.push(
      `Varlıkların %${(trapped * 100).toFixed(0)}'i kilitli/atıl — ` +
      'bu varlıklar monetize edilmeden nakit yaratma kapasitesi artmaz.'
    )
  }

  const criticalFlags = productivity.inefficiencyFlags.filter(f => f.severity === 'CRITICAL').slice(0, 2)
  for (const flag of criticalFlags) {
    parts.push(`${flag.type}: ${flag.description}`)
  }

  return parts.join(' ')
}

// ─── BUILDER: TARGET FEASIBILITY EXPLANATION ─────────────────────────────────

function buildTargetFeasibilityExplanation(
  engineResult: EngineResult,
  requestedTarget: RatingGrade,
): string {
  const {
    currentRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
    feasibility,
  } = engineResult

  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const targetAchieved = ratingToIndex(finalTargetRating) >= ratingToIndex(requestedTarget)

  const parts: string[] = []

  if (targetAchieved) {
    parts.push(
      `${currentRating} → ${requestedTarget} geçişi mümkün görünüyor. ` +
      `${notchesGained} kademe iyileşme, güven: ${confidence} ` +
      `(%${(confidenceModifier * 100).toFixed(0)}).`
    )
  } else {
    parts.push(
      `${requestedTarget} hedefine ulaşılamıyor — ulaşılabilir maksimum: ${finalTargetRating}. ` +
      `${notchesGained} kademe iyileşme mümkün.`
    )
  }

  if (bindingCeiling) {
    parts.push(
      `${bindingCeiling.source} ceiling ${bindingCeiling.maxRating} seviyesinde aktif: ` +
      `${bindingCeiling.reason}.`
    )
  }

  if (feasibility) {
    if (!feasibility.isFeasible) {
      parts.push(`Fizibilite: ${feasibility.reason}`)
      if (feasibility.requirements.length > 0) {
        parts.push(`Gereksinimler: ${feasibility.requirements.join('; ')}.`)
      }
    }
  }

  return parts.join(' ')
}

// ─── BUILDER: IF NOT DONE RISK ────────────────────────────────────────────────

function buildIfNotDoneRisk(engineResult: EngineResult): string {
  const drivers         = engineResult.reasoning.drivers as DriverGroup | null
  const missed          = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  const bindingCeiling  = engineResult.reasoning.bindingCeiling as CeilingConstraint | null

  const parts: string[] = []

  if (bindingCeiling) {
    parts.push(
      `Mevcut ${bindingCeiling.source} ceiling aşılmazsa rating ${bindingCeiling.maxRating} ` +
      `tavanında kalıcı olarak sıkışır.`
    )
  }

  if (drivers && drivers.negative.length > 0) {
    parts.push(
      `Temel riskler çözülmezse: ${drivers.negative.slice(0, 2).join('; ')}.`
    )
  }

  if (missed && missed.length > 0) {
    const topMissed = missed.slice(0, 2)
    parts.push(
      `Adreslenmeyen kritik alanlar: ${topMissed.map(m => m.actionId).join(', ')} ` +
      `— bu aksiyonlar yapılmazsa ${topMissed[0].estimatedNotchImpact > 0
        ? `yaklaşık ${topMissed[0].estimatedNotchImpact} not kayıp riski var`
        : 'iyileşme sınırlı kalır'}.`
    )
  }

  if (parts.length === 0) {
    parts.push('Önerilen aksiyonlar uygulanmazsa mevcut rating seviyesi korunur, iyileşme gerçekleşmez.')
  }

  return parts.join(' ')
}

// ─── BUILDER: UI READY ROWS ──────────────────────────────────────────────────

function buildUiReadyRows(engineResult: EngineResult): UiReadyRow[] {
  const deduped = dedupeActions(engineResult.portfolio)

  return deduped.map((action, idx) => {
    const cat     = ACTION_CATEGORY_MAP[action.actionId] ?? 'HYBRID'
    const template = ACTION_CATALOG_V3[action.actionId]

    return {
      id:               `${action.actionId}-${action.horizon}-${idx}`,
      horizon:          action.horizon,
      horizonLabel:     horizonLabel(action.horizon),
      rank:             idx + 1,
      actionId:         action.actionId,
      actionName:       action.actionName,
      amountTRY:        action.amountTRY,
      amountFormatted:  formatTRY(action.amountTRY),
      category:         cat,
      categoryLabel:    categoryLabel(cat),
      qualityScore:     action.qualityScore,
      notchContribution: action.estimatedNotchContribution,
      sustainability:   action.sustainability,
      whySelected:      action.narrative,
      cfoRationale:     template?.cfoRationale ?? action.narrative,
    }
  })
}

// ─── BUILDER: REJECTED INSIGHTS ──────────────────────────────────────────────

function buildRejectedInsights(engineResult: EngineResult): RejectedInsight[] {
  const insights: RejectedInsight[] = []
  const portfolioIds = new Set(engineResult.portfolio.map(a => a.actionId))

  // 1. Engine'in debug.rejectedCandidates listesi
  const rejectedCandidates = engineResult.debug?.rejectedCandidates ?? []
  for (const rc of rejectedCandidates) {
    if (portfolioIds.has(rc.actionId)) continue  // portfoydekileri atla
    const template = ACTION_CATALOG_V3[rc.actionId]
    const cat      = ACTION_CATEGORY_MAP[rc.actionId] ?? 'HYBRID'
    insights.push({
      actionId:                 rc.actionId,
      actionName:               template?.name ?? rc.actionId,
      reason:                   rc.reason,
      estimatedNotchImpact:     0,
      category:                 cat,
      isFromMissedOpportunities: false,
    })
  }

  // 2. ratingReasoning.missedOpportunities — portfoyden kacan kritik firsatlar
  const missed = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  if (missed) {
    for (const m of missed) {
      if (portfolioIds.has(m.actionId)) continue
      // Duplicate check
      if (insights.some(i => i.actionId === m.actionId)) continue
      const template = ACTION_CATALOG_V3[m.actionId]
      insights.push({
        actionId:                 m.actionId,
        actionName:               template?.name ?? m.actionId,
        reason:                   m.reason,
        estimatedNotchImpact:     m.estimatedNotchImpact,
        category:                 m.category,
        isFromMissedOpportunities: true,
      })
    }
  }

  // Tahmini not etkisine gore sirala (yuksekten dusuge)
  insights.sort((a, b) => b.estimatedNotchImpact - a.estimatedNotchImpact)

  return insights
}

// ─── BUILDER: CONSULTANT NARRATIVE ───────────────────────────────────────────

function buildConsultantNarrative(engineResult: EngineResult): ConsultantNarrative {
  const drivers        = engineResult.reasoning.drivers as DriverGroup | null
  const bindingCeiling = engineResult.reasoning.bindingCeiling as CeilingConstraint | null
  const productivity   = engineResult.layerSummaries.productivity as {
    productivityScore: number
    metrics: { trappedAssetsShare: number }
    inefficiencyFlags: Array<{ type: string; severity: string }>
  } | null

  const sustainability = engineResult.layerSummaries.sustainability as {
    constraints?: { hasCeiling?: boolean; ceilingReasons?: string[] }
  } | null

  const composition = engineResult.reasoning as {
    drivers?: { structural?: string[]; cosmetic?: string[] }
  }
  void composition  // kullanilmayacak, dogrudan drivers kullanilacak

  // ── problem ──────────────────────────────────────────────────────────────
  let problem = `Şirket ${engineResult.currentRating} rating seviyesinde.`

  if (drivers && drivers.negative.length > 0) {
    problem += ` Temel sorunlar: ${drivers.negative.slice(0, 2).join('; ')}.`
  } else if (productivity && productivity.productivityScore < 0.40) {
    problem += ` Varlık verimliliği düşük (%${(productivity.productivityScore * 100).toFixed(0)}).`
  }

  // ── coreIssue ─────────────────────────────────────────────────────────────
  let coreIssue = ''

  if (bindingCeiling) {
    coreIssue = `Rating iyileşmesinin önündeki temel engel: ${bindingCeiling.source} ` +
      `(${bindingCeiling.reason}). Bu sorun çözülmeden ${bindingCeiling.maxRating} ` +
      `tavanını kırmanız mümkün değil.`
  } else if (sustainability?.constraints?.hasCeiling) {
    const reason = sustainability.constraints.ceilingReasons?.[0] ?? 'gelir kalitesi düşük'
    coreIssue = `Gelir kalitesi sorunu: ${reason}. Sürdürülebilir gelir tabanı oluşturulmadan rating iyileşmesi kalıcı olmaz.`
  } else if (productivity && productivity.productivityScore < 0.30) {
    coreIssue = `Kritik varlık kilitlenmesi — aktiflerinizin önemli bir kısmı değer üretmiyor. ` +
      `Bu sorunu çözmeden sadece bilanço düzenlemeleri yeterli olmaz.`
  } else {
    coreIssue = `Mevcut rating seviyesinin temel nedeni finansal yapı ve operasyonel verimlilik dengesidir.`
  }

  // ── shortTermPriority ─────────────────────────────────────────────────────
  const shortActions = engineResult.horizons.short.actions.slice(0, 2)
  let shortTermPriority = ''

  if (shortActions.length > 0) {
    const actionNames = shortActions.map(a => ACTION_CATALOG_V3[a.actionId]?.name ?? a.actionName)
    shortTermPriority =
      `İlk 6 ayda öncelikli adımlar: ${actionNames.join(' ve ')}. ` +
      `Toplam tutar: ${formatTRY(shortActions.reduce((s, a) => s + a.amountTRY, 0))}.`
  } else {
    shortTermPriority = 'Kısa vadeli aksiyon planı oluşturulmadı — önce operasyonel hazırlık gerekiyor.'
  }

  // ── structuralNeed ────────────────────────────────────────────────────────
  const longActions    = engineResult.horizons.long.actions
  const missedOpps     = engineResult.reasoning.missedOpportunities as MissedOpportunity[] | null
  let structuralNeed   = ''

  if (drivers && drivers.structural.length > 0) {
    structuralNeed =
      `Kalıcı iyileşme için yapısal dönüşüm şart: ${drivers.structural.slice(0, 3).join(', ')}. `
  }

  if (longActions.length > 0) {
    const longNames = longActions.slice(0, 2).map(
      a => ACTION_CATALOG_V3[a.actionId]?.name ?? a.actionName
    )
    structuralNeed += `Uzun vadede: ${longNames.join(' ve ')}.`
  } else if (missedOpps && missedOpps.length > 0) {
    const topMissed = missedOpps[0]
    structuralNeed += `Kritik eksik: ${ACTION_CATALOG_V3[topMissed.actionId]?.name ?? topMissed.actionId} uygulanmadan hedef rating'e ulaşmak zorlaşıyor.`
  }

  if (!structuralNeed) {
    structuralNeed = 'Mevcut portföy yapısal dönüşümü kapsıyor — tutarlı uygulama yeterli.'
  }

  // ── bankerView ────────────────────────────────────────────────────────────
  const { confidence, confidenceModifier, finalTargetRating, notchesGained } = engineResult

  let bankerView =
    `Bankacı gözünden: ${engineResult.currentRating} → ${finalTargetRating} ` +
    `(${notchesGained} kademe), güven ${confidence} (%${(confidenceModifier * 100).toFixed(0)}). `

  if (confidence === 'HIGH') {
    bankerView += 'Kredi komitesi bu yol haritasını olumlu karşılar — tutarlı uygulama şart.'
  } else if (confidence === 'MEDIUM') {
    bankerView += 'Orta güven — uygulama riski var. Takip mekanizması kurulmalı.'
  } else {
    bankerView +=
      'Düşük güven — bilanço düzenlemeleri yeterli değil, köklü operasyonel değişim gerekiyor. ' +
      'Bankacılar teminat ve nakit akışı analizine odaklanacak.'
  }

  return {
    problem,
    coreIssue,
    shortTermPriority,
    structuralNeed,
    bankerView,
  }
}

// ─── BUILDER: COMPARISON WITH V2 ─────────────────────────────────────────────

function buildComparisonWithV2(
  engineResult: EngineResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v2Result: any,
): ComparisonWithV2 {
  const v3ActionIds = new Set(engineResult.portfolio.map(a => a.actionId))

  // V2 action id'leri
  const v2ActionIds: string[] = Array.isArray(v2Result?.scenarios)
    ? v2Result.scenarios.flatMap(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => Array.isArray(s.actions) ? s.actions.map((a: any) => a.actionId ?? a.id ?? '') : []
      ).filter(Boolean)
    : []

  const v2Set = new Set<string>(v2ActionIds)

  const newActionsInV3    = [...v3ActionIds].filter(id => !v2Set.has(id))
  const removedFromV2     = [...v2Set].filter(id => !v3ActionIds.has(id))

  const v2Confidence      = v2Result?.confidence ?? 0
  const v3HigherConfidence = engineResult.confidenceModifier > (v2Confidence / 100)

  const diffNote = newActionsInV3.length === 0 && removedFromV2.length === 0
    ? 'V3 portföyü V2 ile büyük ölçüde örtüşüyor.'
    : `V3'te ${newActionsInV3.length} yeni aksiyon eklendi, ` +
      `V2'den ${removedFromV2.length} aksiyon çıkarıldı. ` +
      'V3 ekonomik gerçeklik ve varlık verimliliği katmanları ekliyor.'

  return {
    v2ActionCount:       v2Set.size,
    v3ActionCount:       v3ActionIds.size,
    newActionsInV3,
    removedFromV2,
    v3HigherConfidence,
    diffNote,
  }
}

// ─── ANA API ─────────────────────────────────────────────────────────────────

/**
 * engineV3.ts ciktisini banker UI cevabina donusturur.
 *
 * @param engineResult - runEngineV3 ciktisi
 * @param requestedTarget - kullanicinin istedigi hedef rating
 * @param v2Result - opsiyonel V2 karsilastirma (null = atla)
 */
export function buildDecisionAnswer(
  engineResult:    EngineResult,
  requestedTarget: RatingGrade,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  v2Result: any | null = null,
): DecisionAnswer {
  const executiveAnswer              = buildExecutiveAnswer(engineResult, requestedTarget)
  const whatCompanyShouldDo          = buildActionPlan(engineResult)
  const oneNotchPlan                 = buildOneNotchPlan(engineResult)
  const twoNotchPlan                 = buildTwoNotchPlan(engineResult)
  const accountingImpactTable        = buildAccountingImpactTable(engineResult)
  const whyCapitalAloneIsNotEnough   = buildWhyCapitalAloneNotEnough(engineResult)
  const targetFeasibilityExplanation = buildTargetFeasibilityExplanation(engineResult, requestedTarget)
  const ifNotDoneRisk                = buildIfNotDoneRisk(engineResult)
  const uiReadyRows                  = buildUiReadyRows(engineResult)
  const rejectedInsights             = buildRejectedInsights(engineResult)
  const consultantNarrative          = buildConsultantNarrative(engineResult)

  const comparisonWithV2 = v2Result != null
    ? buildComparisonWithV2(engineResult, v2Result)
    : undefined

  return {
    executiveAnswer,
    whatCompanyShouldDo,
    oneNotchPlan,
    twoNotchPlan,
    accountingImpactTable,
    whyCapitalAloneIsNotEnough,
    targetFeasibilityExplanation,
    ifNotDoneRisk,
    uiReadyRows,
    rejectedInsights,
    consultantNarrative,
    comparisonWithV2,
  }
}
