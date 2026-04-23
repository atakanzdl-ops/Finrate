/**
 * RATING REASONING (V3-9) - EXPLAINABLE REASONING SYNTHESIS LAYER
 *
 * Bu katman V3'un synthesizer'idir. 5 katmani birlestirir:
 *   - V3-4 qualityEngine
 *   - V3-5 sustainabilityEngine
 *   - V3-6 sectorIntelligence
 *   - V3-7 semanticGuardrails
 *   - V3-8 assetProductivity
 *
 * KIMLIK: SYNTHESIS, SCORING DEGIL
 *   - Yeni opaque skor motoru YAZMAZ
 *   - Yeni matematiksel formul uydurmaz
 *   - Onceki katmanlarin skorlarini ACIKLANABILIR KURALLARLA yorumlar
 *
 * CEILING MANTIGI:
 *   V3-5 sustainability ceiling (gelir kalitesi zayifsa)
 *   V3-9 productivity ceiling (aktif uretkenligi zayifsa) - BU KATMAN KOYAR
 *   V3-7 guardrail ceiling (HARD_REJECT veya coklu SOFT_BLOCK)
 *   final ceiling = min(tum ceiling'ler) = binding ceiling
 *   diger aktif ceiling'ler = supporting ceilings
 *
 * DOUBLE-COUNTING KORUMASI:
 *   - Ayni zayiflik sadece bir mekanizmada TAM cezalandirilir
 *   - Diger mekanizmalarda YUMUSATILARAK uygulanir
 *   - severityConsumed flag ile takip edilir
 *
 * CONFIDENCE BOUNDED DEGRADATION:
 *   - Multiplicative cascade 0.25 minimum'una clamp'lanir
 *   - Asiri kotumserlik onlenir
 *
 * "SERMAYE YETMEZ" MANTIGI:
 *   Hard rule degil - weighted reasoning penalty.
 *   if productivity < 0.30 AND portfolio cosmetic-heavy AND trapped assets high
 *     -> rating improvement confidence duser (min 0.25)
 *     -> "likidite duzeldi ama aktif calismiyor" narrative
 *
 * CIKTI:
 *   - ratingRecommendation (mevcut + onerilen)
 *   - bindingCeiling + supportingCeilings[]
 *   - positiveDrivers / negativeDrivers
 *   - structuralDrivers / cosmeticDrivers
 *   - oneNotchScenario / twoNotchScenario
 *   - missedOpportunities
 *   - sensitivityAnalysis
 *   - bankerSummary
 */

import type {
  SectorCode,
  ActionTemplateV3,
} from './contracts'

import type {
  QualityResult,
} from './qualityEngine'

import type {
  SustainabilityResult,
} from './sustainabilityEngine'

import type {
  SectorIntelligenceResult,
} from './sectorIntelligence'

import type {
  GuardrailReport,
} from './semanticGuardrails'

import type {
  AssetProductivityResult,
  InefficiencyType,
} from './assetProductivity'

// Unused import guard — tipler tanimlanmis ama dogrudan kullanilmiyor
void 0 as unknown as ActionTemplateV3
void 0 as unknown as SectorCode

// ─── RATING GRADE ─────────────────────────────────────────────────────────────

export type RatingGrade =
  | 'AAA' | 'AA+' | 'AA' | 'AA-'
  | 'A+' | 'A' | 'A-'
  | 'BBB+' | 'BBB' | 'BBB-'
  | 'BB+' | 'BB' | 'BB-'
  | 'B+' | 'B' | 'B-'
  | 'CCC+' | 'CCC' | 'CCC-'
  | 'CC' | 'C' | 'D'

export const RATING_ORDER: RatingGrade[] = [
  'D', 'C', 'CC',
  'CCC-', 'CCC', 'CCC+',
  'B-', 'B', 'B+',
  'BB-', 'BB', 'BB+',
  'BBB-', 'BBB', 'BBB+',
  'A-', 'A', 'A+',
  'AA-', 'AA', 'AA+', 'AAA',
]

export function ratingToIndex(rating: RatingGrade): number {
  return RATING_ORDER.indexOf(rating)
}

export function indexToRating(index: number): RatingGrade {
  if (index < 0) return 'D'
  if (index >= RATING_ORDER.length) return 'AAA'
  return RATING_ORDER[index]
}

export function tighterCeiling(a: RatingGrade, b: RatingGrade): RatingGrade {
  return ratingToIndex(a) <= ratingToIndex(b) ? a : b
}

export function notchUp(rating: RatingGrade, notches: number): RatingGrade {
  return indexToRating(ratingToIndex(rating) + notches)
}

// ─── SEVERITY CONSUMPTION ─────────────────────────────────────────────────────

/**
 * Bir zayifligin hangi mekanizma tarafindan tam cezalandirildigi.
 * Double-counting korumasi icin kullanilir.
 */
export interface SeverityConsumption {
  productivityWeakness:   'NOT_USED' | 'CONSUMED_BY_CEILING' | 'CONSUMED_BY_CONFIDENCE'
  sustainabilityWeakness: 'NOT_USED' | 'CONSUMED_BY_CEILING' | 'CONSUMED_BY_CONFIDENCE'
  cosmeticPortfolio:      'NOT_USED' | 'CONSUMED_BY_CONFIDENCE' | 'CONSUMED_BY_NARRATIVE'
  guardrailIssues:        'NOT_USED' | 'CONSUMED_BY_CEILING' | 'CONSUMED_BY_CONFIDENCE'
}

export function initSeverityConsumption(): SeverityConsumption {
  return {
    productivityWeakness:   'NOT_USED',
    sustainabilityWeakness: 'NOT_USED',
    cosmeticPortfolio:      'NOT_USED',
    guardrailIssues:        'NOT_USED',
  }
}

// ─── CEILING CONSTRAINTS ──────────────────────────────────────────────────────

export interface CeilingConstraint {
  source:    'SUSTAINABILITY' | 'PRODUCTIVITY' | 'SEMANTIC_GUARDRAIL' | 'SECTOR_REALITY'
  maxRating: RatingGrade
  reason:    string
  evidence:  string[]
}

/**
 * Productivity ceiling'i belirle.
 *
 * Mantik:
 *   - productivityScore < 0.20 ve CRITICAL inefficiency varsa -> ceiling B-
 *   - productivityScore < 0.30 veya SEVERE inefficiency >=2  -> ceiling B+
 *   - productivityScore < 0.50                               -> ceiling BB
 *   - productivityScore < 0.70                               -> ceiling BBB
 *   - productivityScore >= 0.70                              -> ceiling yok
 *
 * Ceiling aktif olursa -> severityConsumption.productivityWeakness = CONSUMED_BY_CEILING
 */
export function calculateProductivityCeiling(
  productivity: AssetProductivityResult,
  consumption:  SeverityConsumption,
): CeilingConstraint | null {
  const score        = productivity.productivityScore
  const criticalCount = productivity.inefficiencyFlags.filter(f => f.severity === 'CRITICAL').length
  const severeCount   = productivity.inefficiencyFlags.filter(f => f.severity === 'SEVERE').length

  let maxRating: RatingGrade
  let reason: string
  const evidence: string[] = []

  if (score < 0.20 && criticalCount >= 1) {
    maxRating = 'B-'
    reason    = 'Aktif uretkenligi kritik seviyede - rating tavani B- olarak sinirlanmistir'
    evidence.push(`Productivity score: ${(score * 100).toFixed(0)}% (kritik esik: 20%)`)
    evidence.push(`${criticalCount} CRITICAL aktif kilitlenmesi tespit edildi`)
  } else if (score < 0.30 || severeCount >= 2) {
    maxRating = 'B+'
    reason    = 'Aktif uretkenligi zayif - rating tavani B+'
    evidence.push(`Productivity score: ${(score * 100).toFixed(0)}%`)
    if (severeCount >= 2) evidence.push(`${severeCount} SEVERE aktif kilitlenmesi`)
  } else if (score < 0.50) {
    maxRating = 'BB'
    reason    = 'Aktif uretkenligi orta-alti - rating tavani BB'
    evidence.push(`Productivity score: ${(score * 100).toFixed(0)}%`)
  } else if (score < 0.70) {
    maxRating = 'BBB'
    reason    = 'Aktif uretkenligi orta - rating tavani BBB'
    evidence.push(`Productivity score: ${(score * 100).toFixed(0)}%`)
  } else {
    return null  // ceiling yok
  }

  // Kritik / SEVERE inefficiency'leri evidence'a ekle
  const topFlags = productivity.inefficiencyFlags
    .filter(f => f.severity === 'CRITICAL' || f.severity === 'SEVERE')
    .slice(0, 3)
  for (const flag of topFlags) {
    evidence.push(`${flag.type}: ${flag.description}`)
  }

  // Double-counting korumasi: bu zayiflik ceiling'de tuketildi
  consumption.productivityWeakness = 'CONSUMED_BY_CEILING'

  return { source: 'PRODUCTIVITY', maxRating, reason, evidence }
}

/**
 * Sustainability ceiling'i V3-5 sonucundan turet.
 * SustainabilityConstraints: { hasCeiling, maxAchievableRating, ceilingReasons, ... }
 */
export function extractSustainabilityCeiling(
  sustainability: SustainabilityResult,
  consumption:    SeverityConsumption,
): CeilingConstraint | null {
  const c = sustainability.constraints
  if (!c.hasCeiling || !c.maxAchievableRating) return null

  consumption.sustainabilityWeakness = 'CONSUMED_BY_CEILING'

  return {
    source:    'SUSTAINABILITY',
    maxRating: c.maxAchievableRating as RatingGrade,
    reason:    'Gelir kalitesi / sustainability zayif - rating tavani uygulandi',
    evidence:  c.ceilingReasons ?? [],
  }
}

/**
 * Guardrail HARD_REJECT veya coklu SOFT_BLOCK ceiling etkisi.
 */
export function extractGuardrailCeiling(
  guardrail:   GuardrailReport,
  consumption: SeverityConsumption,
): CeilingConstraint | null {
  if (guardrail.hasHardReject) {
    consumption.guardrailIssues = 'CONSUMED_BY_CEILING'
    return {
      source:    'SEMANTIC_GUARDRAIL',
      maxRating: 'CCC',
      reason:    'Portfoy semantic guardrail HARD_REJECT - rating iyilesmesi gecersiz',
      evidence:  guardrail.results
        .filter(r => r.severity === 'HARD_REJECT')
        .map(r => r.message),
    }
  }

  const softBlockCount = guardrail.results.filter(r => r.severity === 'SOFT_BLOCK').length
  if (softBlockCount >= 3) {
    consumption.guardrailIssues = 'CONSUMED_BY_CEILING'
    return {
      source:    'SEMANTIC_GUARDRAIL',
      maxRating: 'B',
      reason:    'Coklu SOFT_BLOCK - portfoy uygulanabilirligi ciddi sekilde kisitli',
      evidence:  guardrail.results
        .filter(r => r.severity === 'SOFT_BLOCK')
        .map(r => r.message)
        .slice(0, 5),
    }
  }

  return null
}

/**
 * Binding ceiling = en siki olan.
 * Supporting ceilings = aktif olan digerleri.
 */
export function resolveBindingCeiling(ceilings: CeilingConstraint[]): {
  binding:    CeilingConstraint | null
  supporting: CeilingConstraint[]
} {
  if (ceilings.length === 0) return { binding: null, supporting: [] }

  let binding = ceilings[0]
  for (const c of ceilings) {
    if (ratingToIndex(c.maxRating) < ratingToIndex(binding.maxRating)) {
      binding = c
    }
  }

  const supporting = ceilings.filter(c => c !== binding)
  return { binding, supporting }
}

// ─── PORTFOLIO COMPOSITION ────────────────────────────────────────────────────

export type DriverCategory = 'STRUCTURAL' | 'COSMETIC' | 'HYBRID'

export const ACTION_CATEGORY_MAP: Record<string, DriverCategory> = {
  A01_ST_FIN_DEBT_TO_LT:        'COSMETIC',
  A02_TRADE_PAYABLE_TO_LT:      'COSMETIC',
  A03_ADVANCE_TO_LT:            'COSMETIC',
  A04_CASH_PAYDOWN_ST:          'HYBRID',
  A05_RECEIVABLE_COLLECTION:    'STRUCTURAL',
  A06_INVENTORY_MONETIZATION:   'STRUCTURAL',
  A07_PREPAID_RELEASE:          'HYBRID',
  A08_FIXED_ASSET_DISPOSAL:     'STRUCTURAL',
  A09_SALE_LEASEBACK:           'HYBRID',
  A10_CASH_EQUITY_INJECTION:    'HYBRID',
  A11_RETAIN_EARNINGS:          'STRUCTURAL',
  A12_GROSS_MARGIN_IMPROVEMENT: 'STRUCTURAL',
  A13_OPEX_OPTIMIZATION:        'STRUCTURAL',
  A14_FINANCE_COST_REDUCTION:   'HYBRID',
  A15_DEBT_TO_EQUITY_SWAP:      'COSMETIC',
  A16_CASH_BUFFER_BUILD:        'HYBRID',
  A17_KKEG_CLEANUP:             'COSMETIC',
  A18_NET_SALES_GROWTH:         'STRUCTURAL',
  A19_ADVANCE_TO_REVENUE:       'STRUCTURAL',
  A20_YYI_MONETIZATION:         'STRUCTURAL',
}

export interface PortfolioComposition {
  totalActions:     number
  structuralCount:  number
  cosmeticCount:    number
  hybridCount:      number
  structuralShare:  number
  cosmeticShare:    number
  isCosmeticHeavy:  boolean
  isStructuralHeavy: boolean
}

export function analyzePortfolioComposition(
  portfolioActionIds: string[],
): PortfolioComposition {
  let structural = 0, cosmetic = 0, hybrid = 0
  for (const id of portfolioActionIds) {
    const category = ACTION_CATEGORY_MAP[id]
    if (category === 'STRUCTURAL')     structural++
    else if (category === 'COSMETIC')  cosmetic++
    else if (category === 'HYBRID')    hybrid++
  }
  const total = portfolioActionIds.length || 1
  return {
    totalActions:      portfolioActionIds.length,
    structuralCount:   structural,
    cosmeticCount:     cosmetic,
    hybridCount:       hybrid,
    structuralShare:   structural / total,
    cosmeticShare:     cosmetic / total,
    isCosmeticHeavy:   (cosmetic / total) > 0.5,
    isStructuralHeavy: (structural / total) > 0.5,
  }
}

// ─── RATING TRANSITION ────────────────────────────────────────────────────────

/**
 * Rating transition ile confidence hesabi.
 *
 * DOUBLE-COUNTING KORUMASI:
 *   - Productivity ceiling zaten aktifse (CONSUMED_BY_CEILING),
 *     confidence modifier SADECE ek bir bagimsiz problem icin uygulanir.
 *   - Cosmetic-heavy portfoy AYRl bir problem -> confidence kesilir.
 *   - Ayni zayiflik hem ceiling hem confidence'ta TAM cezalandirilmaz.
 *
 * CONFIDENCE BOUNDED DEGRADATION:
 *   - minConfidence = 0.25 mutlak taban
 */
export interface RatingTransition {
  currentRating:     RatingGrade
  rawTargetRating:   RatingGrade
  finalTargetRating: RatingGrade
  notchesGained:     number
  confidence:        'HIGH' | 'MEDIUM' | 'LOW'
  confidenceModifier: number
  confidenceReasons: string[]
  explanation:       string
  blockedByCeiling:  boolean
  bindingCeiling?:   CeilingConstraint
}

const MIN_CONFIDENCE = 0.25  // Bounded degradation floor

export function buildRatingTransition(
  currentRating:   RatingGrade,
  rawTargetRating: RatingGrade,
  bindingCeiling:  CeilingConstraint | null,
  productivity:    AssetProductivityResult,
  composition:     PortfolioComposition,
  consumption:     SeverityConsumption,
): RatingTransition {
  // Ceiling uygulanmasi
  let finalTargetRating = rawTargetRating
  let blockedByCeiling  = false
  if (
    bindingCeiling &&
    ratingToIndex(rawTargetRating) > ratingToIndex(bindingCeiling.maxRating)
  ) {
    finalTargetRating = bindingCeiling.maxRating
    blockedByCeiling  = true
  }

  const notchesGained = ratingToIndex(finalTargetRating) - ratingToIndex(currentRating)

  // Confidence hesabi — DOUBLE-COUNTING GUARD
  let confidenceModifier      = 1.0
  const confidenceReasons: string[] = []

  const productivityWeak = productivity.productivityScore < 0.30
  const trappedHigh      = productivity.metrics.trappedAssetsShare > 0.70

  // Cosmetic-heavy portfoy ayri bir problem; zaten tuketilmediyse confidence'i dusur
  if (composition.isCosmeticHeavy && consumption.cosmeticPortfolio === 'NOT_USED') {
    if (productivityWeak) {
      // Iki bagimsiz problem birlesimi
      confidenceModifier *= 0.40
      confidenceReasons.push(
        'Portfoy cosmetic-agirlikli VE aktif uretkenligi zayif - iki bagimsiz risk'
      )
    } else {
      confidenceModifier *= 0.70
      confidenceReasons.push('Portfoy cosmetic-agirlikli - structural donusum sinirli')
    }
    consumption.cosmeticPortfolio = 'CONSUMED_BY_CONFIDENCE'
  }

  // Trapped assets yuksek AMA structural onarim yetersiz
  const hasStructuralRepair = composition.structuralCount >= 2
  if (trappedHigh && !hasStructuralRepair) {
    if (consumption.productivityWeakness === 'CONSUMED_BY_CEILING') {
      // Productivity ceiling zaten aktif — YUMUSATILMIS kesinti
      confidenceModifier *= 0.80
      confidenceReasons.push(
        'Trapped assets yuksek, structural onarim aksiyonu yetersiz (ek risk - ceiling zaten aktif)'
      )
    } else {
      // Ceiling yok — tam kesinti
      confidenceModifier *= 0.60
      confidenceReasons.push(
        'Trapped assets yuksek ama structural onarim aksiyonu yetersiz'
      )
    }
  }

  // BOUNDED DEGRADATION — 0.25 altina inmez
  confidenceModifier = Math.max(confidenceModifier, MIN_CONFIDENCE)

  let confidence: RatingTransition['confidence']
  if (confidenceModifier >= 0.80)      confidence = 'HIGH'
  else if (confidenceModifier >= 0.50) confidence = 'MEDIUM'
  else                                 confidence = 'LOW'

  let explanation =
    `${currentRating} -> ${finalTargetRating} (${notchesGained} kademe iyilesme).`
  if (blockedByCeiling && bindingCeiling) {
    explanation +=
      ` ${bindingCeiling.source} ceiling'i ${bindingCeiling.maxRating} seviyesinde sinirliyor: ${bindingCeiling.reason}.`
  }
  if (confidenceReasons.length > 0) {
    explanation += ` Guven: ${confidenceReasons.join('; ')}.`
  }

  return {
    currentRating,
    rawTargetRating,
    finalTargetRating,
    notchesGained,
    confidence,
    confidenceModifier,
    confidenceReasons,
    explanation,
    blockedByCeiling,
    bindingCeiling: bindingCeiling ?? undefined,
  }
}

// ─── MISSED OPPORTUNITIES ────────────────────────────────────────────────────

export interface MissedOpportunity {
  actionId:              string
  category:             DriverCategory
  reason:               string
  estimatedNotchImpact: number
  relatedInefficiency?: InefficiencyType
}

export function identifyMissedOpportunities(
  portfolioActionIds: string[],
  productivity:       AssetProductivityResult,
): MissedOpportunity[] {
  const portfolioSet = new Set(portfolioActionIds)
  const missed: MissedOpportunity[] = []

  for (const area of productivity.repairPriorityAreas) {
    if (
      area.portfolioCoverage === 'NOT_ADDRESSED' &&
      area.priority         === 'HIGH'
    ) {
      for (const recommendedId of area.recommendedActions) {
        if (!portfolioSet.has(recommendedId)) {
          missed.push({
            actionId:             recommendedId,
            category:             ACTION_CATEGORY_MAP[recommendedId] ?? 'HYBRID',
            reason:               `${area.inefficiencyType} (${area.severity}) kapsanmamis - ${recommendedId} bu kilitlenmeyi onarir`,
            estimatedNotchImpact: area.severity === 'CRITICAL' ? 2 : area.severity === 'SEVERE' ? 1 : 0,
            relatedInefficiency:  area.inefficiencyType,
          })
          break  // Her alan icin bir aksiyon yeter
        }
      }
    }
  }

  return missed
}

// ─── SENSITIVITY ANALYSIS ─────────────────────────────────────────────────────

export interface SensitivityPoint {
  ifProductivityScore: number
  wouldBeCeiling:      RatingGrade
  deltaFromCurrent:    number
}

export interface SensitivityAnalysis {
  currentProductivityScore: number
  currentCeiling:           RatingGrade
  scenarios:                SensitivityPoint[]
  bottleneck:               string
}

export function buildSensitivityAnalysis(
  productivity:       AssetProductivityResult,
  productivityCeiling: CeilingConstraint | null,
): SensitivityAnalysis {
  const currentScore = productivity.productivityScore
  const current      = productivityCeiling?.maxRating ?? 'AAA'

  const scenarios: SensitivityPoint[] = [
    { ifProductivityScore: 0.20, wouldBeCeiling: 'B-',  deltaFromCurrent: 0 },
    { ifProductivityScore: 0.30, wouldBeCeiling: 'B+',  deltaFromCurrent: 0 },
    { ifProductivityScore: 0.50, wouldBeCeiling: 'BB',  deltaFromCurrent: 0 },
    { ifProductivityScore: 0.70, wouldBeCeiling: 'BBB', deltaFromCurrent: 0 },
    { ifProductivityScore: 0.85, wouldBeCeiling: 'AAA', deltaFromCurrent: 0 },
  ]

  for (const s of scenarios) {
    s.deltaFromCurrent = ratingToIndex(s.wouldBeCeiling) - ratingToIndex(current)
  }

  // En zayif komponenti bul
  const components = productivity.componentScores
  const entries = Object.entries(components) as Array<[keyof typeof components, number]>
  entries.sort((a, b) => a[1] - b[1])
  const weakest = entries[0]

  const bottleneck =
    `En zayif component: ${weakest[0]} (%${(weakest[1] * 100).toFixed(0)}). ` +
    `Bu metrik iyilesirse productivity score hizla yukselir.`

  return {
    currentProductivityScore: currentScore,
    currentCeiling:           current,
    scenarios,
    bottleneck,
  }
}

// ─── NOTCH SCENARIOS ─────────────────────────────────────────────────────────

export interface NotchScenario {
  targetNotches:                 number
  requiredActions:               string[]
  requiredInefficiencyRepairs:   InefficiencyType[]
  isAchievable:                  boolean
  blockedBy?:                    string
  narrative:                     string
}

export function buildOneNotchScenario(
  productivity: AssetProductivityResult,
): NotchScenario {
  const highNotAddressed = productivity.repairPriorityAreas.filter(
    a => a.priority === 'HIGH' && a.portfolioCoverage === 'NOT_ADDRESSED'
  )

  if (highNotAddressed.length === 0) {
    return {
      targetNotches:               1,
      requiredActions:             [],
      requiredInefficiencyRepairs: [],
      isAchievable:                true,
      narrative:                   'Mevcut portfoy 1 kademe iyilesme icin yeterli gorunuyor.',
    }
  }

  const topArea = highNotAddressed[0]
  const actions = topArea.recommendedActions.slice(0, 2)

  return {
    targetNotches:               1,
    requiredActions:             actions,
    requiredInefficiencyRepairs: [topArea.inefficiencyType],
    isAchievable:                true,
    narrative:
      `1 kademe iyilesme icin ${topArea.inefficiencyType} onarimi gerekli. ` +
      `Onerilen: ${actions.join(', ')}.`,
  }
}

export function buildTwoNotchScenario(
  productivity: AssetProductivityResult,
  composition:  PortfolioComposition,
): NotchScenario {
  const allHigh        = productivity.repairPriorityAreas.filter(a => a.priority === 'HIGH')
  const notAddressed   = allHigh.filter(a => a.portfolioCoverage === 'NOT_ADDRESSED')
  const required       = new Set<string>()
  const inefficiencies: InefficiencyType[] = []

  for (const area of notAddressed.slice(0, 3)) {
    for (const action of area.recommendedActions.slice(0, 1)) {
      required.add(action)
    }
    inefficiencies.push(area.inefficiencyType)
  }

  const needsStructural = productivity.productivityScore < 0.40
  const blockedBy       = needsStructural && composition.isCosmeticHeavy
    ? 'Portfoy cosmetic-heavy; 2 not iyilesme icin structural aksiyonlar ' +
      '(A18 satis artisi, A06 stok erime, A20 YYI monetization) zorunlu'
    : undefined

  return {
    targetNotches:               2,
    requiredActions:             Array.from(required),
    requiredInefficiencyRepairs: inefficiencies,
    isAchievable:                !blockedBy,
    blockedBy,
    narrative: blockedBy
      ? `2 kademe iyilesme mevcut portfoyle mumkun degil: ${blockedBy}.`
      : `2 kademe iyilesme icin ${inefficiencies.length} kritik alan onarilmali. ` +
        `Aksiyonlar: ${Array.from(required).join(', ')}.`,
  }
}

// ─── DRIVERS ─────────────────────────────────────────────────────────────────

export interface DriverGroup {
  positive:   string[]
  negative:   string[]
  structural: string[]
  cosmetic:   string[]
}

/**
 * Driver'lari olustururken DOUBLE-COUNTING korumasi uygulanir.
 * Ayni zayiflik zaten ceiling'de kullanildiysa, negative driver'da TEKRAR gorulmez.
 */
export function buildDrivers(
  qualityResults:     QualityResult[],
  sustainability:     SustainabilityResult,
  sector:             SectorIntelligenceResult,
  productivity:       AssetProductivityResult,
  composition:        PortfolioComposition,
  consumption:        SeverityConsumption,
  portfolioActionIds: string[],
): DriverGroup {
  const positive:   string[] = []
  const negative:   string[] = []
  const structural: string[] = []
  const cosmetic:   string[] = []

  // ── POZITIF DRIVER'LAR ───────────────────────────────────────────────────
  if (productivity.productivityScore >= 0.50) {
    positive.push(
      `Aktif uretkenligi ${(productivity.productivityScore * 100).toFixed(0)}% seviyesinde`
    )
  }
  if (composition.isStructuralHeavy) {
    positive.push(
      `Portfoy structural-heavy (${composition.structuralCount}/${composition.totalActions} aksiyon)`
    )
  }
  const fit = sector.benchmarkSnapshot.overallSectorFit
  if (fit === 'STRONG' || fit === 'TYPICAL') {
    positive.push(`Sektor baglamina uyum: ${fit}`)
  }
  for (const repair of productivity.actionRepairAssessment) {
    if (repair.repairStrength === 'PRIMARY' || repair.repairStrength === 'STRONG') {
      positive.push(`${repair.actionId}: ${repair.productivityNote}`)
    }
  }

  // ── NEGATIF DRIVER'LAR — DOUBLE-COUNTING GUARD ───────────────────────────
  // Productivity zayifligi ceiling'de tuketildiyse burada TEKRAR listelenemez.
  // Sadece productivity zayif AMA ceiling koymadiysa (score 0.30-0.50) burada gorunur.
  if (
    productivity.productivityScore < 0.30 &&
    consumption.productivityWeakness !== 'CONSUMED_BY_CEILING'
  ) {
    negative.push(
      `Aktif uretkenligi kritik (%${(productivity.productivityScore * 100).toFixed(0)})`
    )
  }

  // Inefficiency flag'leri — ceiling'de zaten listelendiyse tekrar etme
  if (consumption.productivityWeakness !== 'CONSUMED_BY_CEILING') {
    const flagsToShow = productivity.inefficiencyFlags
      .filter(f => f.severity === 'CRITICAL' || f.severity === 'SEVERE')
      .slice(0, 3)
    for (const flag of flagsToShow) {
      negative.push(`${flag.type}: ${flag.description}`)
    }
  }

  // Cosmetic-heavy zayifligi confidence'ta tuketildiyse burada TEKRAR listelenmez
  if (
    composition.isCosmeticHeavy &&
    consumption.cosmeticPortfolio !== 'CONSUMED_BY_CONFIDENCE'
  ) {
    negative.push(
      `Portfoy cosmetic-heavy (${composition.cosmeticCount}/${composition.totalActions} reclass aksiyon)`
    )
  }

  // Sustainability zayifligi varsa
  if (
    sustainability.constraints.hasCeiling &&
    consumption.sustainabilityWeakness !== 'CONSUMED_BY_CEILING'
  ) {
    negative.push(
      `Sustainability zayif: ${sustainability.constraints.ceilingReasons[0] ?? 'gelir kalitesi dusuk'}`
    )
  }

  // ── STRUCTURAL / COSMETIC AKSIYON LISTESI ────────────────────────────────
  for (const id of portfolioActionIds) {
    const cat = ACTION_CATEGORY_MAP[id]
    if (cat === 'STRUCTURAL')    structural.push(id)
    else if (cat === 'COSMETIC') cosmetic.push(id)
  }

  // qualityResults ileride weighted negative/positive hesabi icin hazir
  void qualityResults

  return { positive, negative, structural, cosmetic }
}

// ─── BANKER SUMMARY ───────────────────────────────────────────────────────────

export function buildBankerSummary(
  currentRating:      RatingGrade,
  transition:         RatingTransition,
  bindingCeiling:     CeilingConstraint | null,
  supportingCeilings: CeilingConstraint[],
  productivity:       AssetProductivityResult,
  composition:        PortfolioComposition,
  missed:             MissedOpportunity[],
): string {
  const parts: string[] = []

  // Giris
  parts.push(`${currentRating} -> ${transition.finalTargetRating} (${transition.notchesGained} kademe).`)

  // Binding ceiling
  if (bindingCeiling) {
    parts.push(
      `Rating tavani: ${bindingCeiling.maxRating} (${bindingCeiling.source}). ${bindingCeiling.reason}.`
    )
  }

  // Supporting ceilings
  if (supportingCeilings.length > 0) {
    const supportingText = supportingCeilings
      .map(c => `${c.source} (${c.maxRating})`)
      .join(', ')
    parts.push(`Ek baski kaynaklari: ${supportingText}.`)
  }

  // Portfoy degerlendirmesi
  if (composition.isCosmeticHeavy) {
    parts.push(
      `Portfoy %${(composition.cosmeticShare * 100).toFixed(0)} cosmetic - ` +
      `muhasebesel duzenleme agirlikli, operasyonel donusum sinirli.`
    )
  } else if (composition.isStructuralHeavy) {
    parts.push(
      `Portfoy %${(composition.structuralShare * 100).toFixed(0)} structural - ` +
      `operasyonel donusum aksiyonlari agirlikli.`
    )
  }

  // Productivity vurgusu — "sermaye yetmez" mantigi
  if (productivity.productivityScore < 0.30) {
    parts.push(
      `Aktif uretkenligi %${(productivity.productivityScore * 100).toFixed(0)} - ` +
      `rating iyilesmesi icin likidite iyilesmesi tek basina yetmez, aktif donusumu zorunlu.`
    )
  }

  // Missed opportunities
  if (missed.length > 0) {
    const topMissed = missed.slice(0, 2).map(m => m.actionId).join(', ')
    parts.push(`Eksik kalan kritik aksiyonlar: ${topMissed}.`)
  }

  // Guven ozeti
  if (transition.confidence === 'LOW') {
    parts.push(
      `Rating iyilesme guveni DUSUK - confidence modifier ` +
      `${(transition.confidenceModifier * 100).toFixed(0)}% (minimum %25 tabaninda).`
    )
  } else if (transition.confidence === 'HIGH') {
    parts.push(`Rating iyilesme guveni YUKSEK.`)
  }

  return parts.join(' ')
}

// ─── ANA API ─────────────────────────────────────────────────────────────────

export interface RatingReasoningInput {
  currentRating:      RatingGrade
  rawTargetRating:    RatingGrade
  qualityResults:     QualityResult[]
  sustainability:     SustainabilityResult
  sector:             SectorIntelligenceResult
  guardrail:          GuardrailReport
  productivity:       AssetProductivityResult
  portfolioActionIds: string[]
}

export interface RatingReasoningResult {
  transition:            RatingTransition
  bindingCeiling:        CeilingConstraint | null
  supportingCeilings:    CeilingConstraint[]
  severityConsumption:   SeverityConsumption
  drivers:               DriverGroup
  portfolioComposition:  PortfolioComposition
  oneNotchScenario:      NotchScenario
  twoNotchScenario:      NotchScenario
  missedOpportunities:   MissedOpportunity[]
  sensitivityAnalysis:   SensitivityAnalysis
  bankerSummary:         string
}

export function analyzeRatingReasoning(
  input: RatingReasoningInput,
): RatingReasoningResult {
  // Double-counting koruma tracker'i — sifirlanmis
  const consumption = initSeverityConsumption()

  // 1. Tum ceiling'leri topla (her biri consumption'i gunceller)
  const activeCeilings: CeilingConstraint[] = []

  const productivityCeiling   = calculateProductivityCeiling(input.productivity, consumption)
  const sustainabilityCeiling = extractSustainabilityCeiling(input.sustainability, consumption)
  const guardrailCeiling      = extractGuardrailCeiling(input.guardrail, consumption)

  if (productivityCeiling)   activeCeilings.push(productivityCeiling)
  if (sustainabilityCeiling) activeCeilings.push(sustainabilityCeiling)
  if (guardrailCeiling)      activeCeilings.push(guardrailCeiling)

  // 2. Binding + supporting ceilings ayrimi
  const { binding: bindingCeiling, supporting: supportingCeilings } =
    resolveBindingCeiling(activeCeilings)

  // 3. Portfoy kompozisyonu
  const portfolioComposition = analyzePortfolioComposition(input.portfolioActionIds)

  // 4. Rating transition (confidence — consumption'i gunceller)
  const transition = buildRatingTransition(
    input.currentRating,
    input.rawTargetRating,
    bindingCeiling,
    input.productivity,
    portfolioComposition,
    consumption,
  )

  // 5. Driver'lar (consumption'a gore double-counting guard)
  const drivers = buildDrivers(
    input.qualityResults,
    input.sustainability,
    input.sector,
    input.productivity,
    portfolioComposition,
    consumption,
    input.portfolioActionIds,
  )

  // 6. Notch senaryolari
  const oneNotchScenario = buildOneNotchScenario(input.productivity)
  const twoNotchScenario = buildTwoNotchScenario(input.productivity, portfolioComposition)

  // 7. Missed opportunities
  const missedOpportunities = identifyMissedOpportunities(
    input.portfolioActionIds,
    input.productivity,
  )

  // 8. Sensitivity analysis
  const sensitivityAnalysis = buildSensitivityAnalysis(
    input.productivity,
    productivityCeiling,
  )

  // 9. Banker summary
  const bankerSummary = buildBankerSummary(
    input.currentRating,
    transition,
    bindingCeiling,
    supportingCeilings,
    input.productivity,
    portfolioComposition,
    missedOpportunities,
  )

  return {
    transition,
    bindingCeiling,
    supportingCeilings,
    severityConsumption:  consumption,
    drivers,
    portfolioComposition,
    oneNotchScenario,
    twoNotchScenario,
    missedOpportunities,
    sensitivityAnalysis,
    bankerSummary,
  }
}

/**
 * GELECEKTEKI IYILESTIRMELER:
 *
 * 1. ACTION-WEIGHTED COMPOSITION — Su an cosmetic/structural sayica olculuyor.
 *    Ileride TL-weighted veya quality-weighted kompozisyon daha hassas olur.
 *
 * 2. A10 CONTEXT-SENSITIVE CATEGORY — A10 hybrid sabit.
 *    Ileride: distressed turnaround'da structural'a yakin, sadece cash park'ta cosmetic'e yakin.
 *
 * 3. DOWNGRADE NARRATIVE — Su an sadece iyilesme yonu yaziliyor.
 *    Portfoy rating'i kotulestirirse de reasoning gerekir.
 *
 * 4. OPTIMIZATION-BASED NOTCH SCENARIOS — buildTwoNotchScenario deterministic.
 *    Ileride V3-10 orchestrator optimization ile bagli olmali.
 *
 * 5. ESTIMATED NOTCH IMPACT CALIBRATION — CRITICAL=2, SEVERE=1 kaba.
 *    Ileride sector-weighted ve rating-distance-weighted kalibrasyon.
 *
 * 6. NO_CEILING TYPE — Su an null. Ileride NO_CEILING enum degeri daha temiz.
 *
 * 7. POSITIVE DRIVERS THRESHOLD CALIBRATION — productivity >= 0.50 pozitif driver
 *    biraz optimistic. Sektor bazli esin ayarlanabilir.
 *
 * 8. REASONING CONSISTENCY AUDIT — Cikti icerisinde celiski olabilir
 *    (ceiling B- + cok pozitif summary). Internal audit layer gerekebilir.
 *
 * 9. CAUSAL REASONING GRAPH — Su an rule-based. Ileride hangi driver hangi
 *    sonucu dogurdu graph olarak tutulmali (explainability v2).
 *
 * 10. SECTOR-AWARE NOTCH SCENARIOS — 1/2 not senaryolari sektorden bagimsiz.
 *     Insaat vs perakende farkli aksiyon kombinasyonu gerektirir.
 *
 * 11. HISTORICAL TREND — Snapshot bazli. Ileride trend reasoning eklenmeli.
 *
 * 12. MULTI-PORTFOLIO COMPARISON — Tek portfoy reasoning'i. Ileride
 *     3 alternatif portfoy karsilastirmasi desteklenmeli.
 *
 * 13. BANKER NARRATIVE TEMPLATES — String birlestirme. Ileride template sistemi.
 *
 * 14. PEER COMPARISON — "Benzer firmalarda bu portfoy X sonuc verdi"
 *     referans senaryolari. Sektor benchmark'larla entegre.
 */
