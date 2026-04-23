import type {
  ActionId, ActionTemplate, SixGroupAnalysis, GroupCode,
  FeasibilityLevel, AccountLine, SectorCode, DistributionMode,
  AmountBasis, MicroFilterConfig,
} from './contracts'
import { ACTION_CATALOG } from './actionCatalog'
import { SECTOR_PROFILES } from './sectorProfiles'
import type { StressLevel } from './dynamicThresholds'
import { evaluateDynamicPrecondition } from './dynamicPreconditions'
import { getTargetCapPct, getGlobalCapPct, type HorizonKey } from './capMatrix'
import {
  computeTargetCapMultiplier, computeGlobalCapMultiplier,
  type Regime, type GapBand,
} from './adaptivePolicy'

export interface ActionCandidate {
  actionId: ActionId
  template: ActionTemplate
  amountMin: number
  amountMax: number
  amountSuggested: number
  distributionMode: DistributionMode
  feasibility: FeasibilityLevel
  feasibilityMultiplier: number
  eligibleSourceAccounts: AccountLine[]
  eligibleTargetAccounts: AccountLine[]
  preconditionPassed: boolean
  preconditionFailures: string[]
  sectorPrioritized: boolean
  sectorDiscouraged: boolean
  bindingCap?: 'targetGroup' | 'assets' | 'range' | null  // Fix E: hangi cap bağlayıcıydı
}

// Fix E: computeBoundedAmount sonucu
export interface AmountCapResult {
  amount: number
  bindingCap: 'targetGroup' | 'assets' | 'range' | null
  targetGroupCap: number
  assetsCap: number
  rangeCap: number
}

/**
 * Fix E + F-2 + F-3c: Çift taraflı büyüklük kontrolü.
 * targetMaxPct ve globalMaxPct, ufuk+sektör bazlı cap matrisine
 * regime × gap × stage adaptive çarpanlar uygulanarak hesaplanır.
 */
export function computeBoundedAmount(
  base: number,
  template: ActionTemplate,
  analysis: SixGroupAnalysis,
  horizon: HorizonKey = 'medium',
  sector: SectorCode = 'MANUFACTURING',
  regime: Regime = 'STABLE',
  gapBand: GapBand = 'MEDIUM',
  unlockStage: 0 | 1 | 2 = 0
): AmountCapResult {
  const rangeCap = base * template.amountRule.maxPct

  // Hedef grup cap'i — ufuk + sektör + adaptive çarpan
  let targetGroupCap = Infinity
  if (template.targetGroup !== 'EXTERNAL') {
    const tgt = template.targetGroup as Exclude<GroupCode, 'EXTERNAL'>
    const targetGroupTotal = Math.abs(analysis.groups[tgt]?.total ?? 0)
    if (targetGroupTotal > 0) {
      const baseTargetPct = getTargetCapPct(template.id as ActionId, horizon, sector)
      const targetMult    = computeTargetCapMultiplier(regime, horizon, gapBand, unlockStage)
      targetGroupCap = targetGroupTotal * baseTargetPct * targetMult
    }
  }

  // Global aktif cap'i — ufuk + adaptive çarpan
  const assetsCap = analysis.totals.assets > 0
    ? analysis.totals.assets *
      getGlobalCapPct(template.id as ActionId, horizon) *
      computeGlobalCapMultiplier(regime, horizon, gapBand, unlockStage)
    : Infinity

  const raw = base * template.amountRule.suggestedPct
  const effectiveCap = Math.min(rangeCap, targetGroupCap, assetsCap)
  const minFloor = base * template.amountRule.minPct
  const amount = Math.max(minFloor, Math.min(raw, effectiveCap))

  // Hangi cap bağlayıcı oldu?
  let bindingCap: 'targetGroup' | 'assets' | 'range' | null = null
  if (raw > effectiveCap) {
    // En küçük cap bağlayıcıdır
    if (targetGroupCap <= assetsCap && targetGroupCap <= rangeCap) {
      bindingCap = 'targetGroup'
    } else if (assetsCap <= targetGroupCap && assetsCap <= rangeCap) {
      bindingCap = 'assets'
    } else {
      bindingCap = 'range'
    }
  }

  return { amount, bindingCap, targetGroupCap, assetsCap, rangeCap }
}

/**
 * Feasibility level'ı çarpana çevirir.
 */
function feasibilityToMultiplier(level: FeasibilityLevel): number {
  switch (level) {
    case "HIGH": return 1.0
    case "MEDIUM": return 0.75
    case "LOW": return 0.45
    case "BLOCKED": return 0
  }
}

/**
 * Precondition kontrolü — basit condition key parser.
 * Desteklenen formatlar:
 *   "group.<GroupCode>.total" → groups[X].total
 *   "group.<GroupCode>.share" → groups[X].shareOfReferenceBase
 *   "group.<GroupCode>.account.<code>" → o hesabın bakiyesi
 *   "ratio.<RatioCode>" → ratios[X].value
 *   "metric.<metricKey>" → şimdilik desteklenmiyor, true döner
 */
function evalCondition(analysis: SixGroupAnalysis, key: string): number | null {
  const parts = key.split('.')

  if (parts[0] === 'group' && parts.length >= 3) {
    const groupCode = parts[1] as Exclude<GroupCode, "EXTERNAL">
    const group = analysis.groups[groupCode]
    if (!group) return null

    if (parts[2] === 'total') return Math.abs(group.total)
    if (parts[2] === 'share') return group.shareOfReferenceBase
    if (parts[2] === 'account' && parts[3]) {
      const acc = analysis.accounts.find(a => a.accountCode === parts[3] && a.group === groupCode)
      return acc ? Math.abs(acc.amount) : 0
    }
  }

  if (parts[0] === 'ratio' && parts[1]) {
    const ratio = analysis.ratios[parts[1] as keyof typeof analysis.ratios]
    return ratio?.value ?? null
  }

  if (parts[0] === 'metric') {
    // TODO: metric hesaplama — şimdilik true
    return 1
  }

  return null
}

function checkConditions(
  analysis: SixGroupAnalysis,
  conditions: ActionTemplate['preconditions']
): { passed: boolean; failures: string[] } {
  const failures: string[] = []

  for (const cond of conditions) {
    const actual = evalCondition(analysis, cond.key)
    if (actual === null) {
      failures.push(`${cond.key} değerlendirilemedi`)
      continue
    }

    let ok = false
    switch (cond.operator) {
      case ">": ok = actual > cond.value; break
      case ">=": ok = actual >= cond.value; break
      case "<": ok = actual < cond.value; break
      case "<=": ok = actual <= cond.value; break
      case "=": ok = actual === cond.value; break
      case "!=": ok = actual !== cond.value; break
    }

    if (!ok) {
      failures.push(`${cond.key} ${cond.operator} ${cond.value} (gerçek: ${actual.toFixed(2)})`)
    }
  }

  return { passed: failures.length === 0, failures }
}

/**
 * Aksiyonun kaynak grubunda eligible hesapları filtreler.
 * Prefix eşleşmesi ve mikro filtre uygular.
 */
function findEligibleAccounts(
  analysis: SixGroupAnalysis,
  template: ActionTemplate,
  targetType: 'source' | 'target'
): AccountLine[] {
  const prefixes = template.accountMappings.flatMap(m =>
    targetType === 'source' ? m.sourceAccountPrefixes : m.targetAccountPrefixes
  )

  if (prefixes.length === 0) return []

  const targetGroup = targetType === 'source' ? template.sourceGroup : template.targetGroup

  return analysis.accounts.filter(line => {
    if (line.group !== targetGroup) return false
    // Prefix ile başlıyor mu veya tam eşleşiyor mu
    return prefixes.some(p => line.accountCode === p || line.accountCode.startsWith(p))
  })
}

/**
 * Tutar basis'ine göre hesaplama.
 */
function computeAmountBase(
  analysis: SixGroupAnalysis,
  basis: AmountBasis,
  eligibleSources: AccountLine[]
): number {
  switch (basis) {
    case "SOURCE_GROUP_TOTAL":
      return eligibleSources.length > 0
        ? Math.abs(analysis.groups[eligibleSources[0].group as Exclude<GroupCode, "EXTERNAL">].total)
        : 0

    case "ELIGIBLE_SOURCE_TOTAL":
      return eligibleSources.reduce((s, l) => s + Math.abs(l.amount), 0)

    case "BALANCE_SHEET_TOTAL":
      return analysis.totals.assets

    case "INCOME_STATEMENT_TOTAL":
      return analysis.totals.incomeStatementTotal

    case "REVENUE_TOTAL":
      return analysis.totals.revenueTotal ?? 0

    case "TARGET_GAP_CLOSURE":
      // TODO: hedef not gap'e göre hesapla — şimdilik 0
      return 0
  }
}

/**
 * Dağıtım modunu analiz konsantrasyonuna göre belirler.
 */
function determineDistributionMode(
  template: ActionTemplate,
  eligibleSources: AccountLine[]
): DistributionMode {
  if (eligibleSources.length === 0) return template.distributionDefault

  const eligibleCount = eligibleSources.length
  const totalEligible = eligibleSources.reduce((s, l) => s + Math.abs(l.amount), 0)
  if (totalEligible === 0) return template.distributionDefault

  const sorted = [...eligibleSources].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
  const top1Share = Math.abs(sorted[0].amount) / totalEligible
  const top3Share = sorted.slice(0, 3).reduce((s, l) => s + Math.abs(l.amount), 0) / totalEligible
  const hhi = sorted.reduce((sum, l) => {
    const share = Math.abs(l.amount) / totalEligible
    return sum + share * share
  }, 0)

  if (eligibleCount <= 2 || top1Share >= 0.55 || hhi >= 0.35) return "LARGEST_FIRST"
  if (top3Share <= 0.45 && hhi < 0.18) return "PROPORTIONAL"
  return "HYBRID_70_30"
}

/**
 * Ana fonksiyon — tüm aday aksiyonları üretir.
 * horizon: cap matrisinin hangi sütununu belirler.
 * regime/gapBand/unlockStage: F-3c adaptive çarpanlar için.
 */
export function generateCandidates(
  analysis: SixGroupAnalysis,
  horizon: HorizonKey = 'medium',
  context?: {
    stressLevel?: StressLevel
    microFilter?: MicroFilterConfig
  },
  regime: Regime = 'STABLE',
  gapBand: GapBand = 'MEDIUM',
  unlockStage: 0 | 1 | 2 = 0
): ActionCandidate[] {
  const candidates: ActionCandidate[] = []
  const sectorProfile = SECTOR_PROFILES[analysis.sector]

  for (const template of Object.values(ACTION_CATALOG)) {
    // Blocked aksiyonları at
    if (sectorProfile.blockedActions.includes(template.id)) continue

    const feasibility = template.sectorFeasibility[analysis.sector]
    if (feasibility === "BLOCKED") continue

    // Statik precondition kontrolü
    const { passed, failures } = checkConditions(analysis, template.preconditions)

    // Dinamik precondition (A04-A07 için)
    let dynamicPass = true
    const dynamicFailures: string[] = []
    if (context?.stressLevel !== undefined && context?.microFilter !== undefined) {
      const dyn = evaluateDynamicPrecondition(template.id, analysis, {
        stressLevel: context.stressLevel,
        microFilter: context.microFilter,
      })
      dynamicPass = dyn.pass
      dynamicFailures.push(...dyn.reasons)
    }

    const combinedPass = passed && dynamicPass
    const combinedFailures = [...failures, ...dynamicFailures]

    // Eligible accounts
    const eligibleSources = findEligibleAccounts(analysis, template, 'source')
    const eligibleTargets = findEligibleAccounts(analysis, template, 'target')

    // A10 için EXTERNAL source — accounts listesinde olmaz
    const hasExternalSource = template.sourceGroup === "EXTERNAL"

    if (!hasExternalSource && eligibleSources.length === 0) continue

    // Tutar hesapla
    const base = hasExternalSource
      ? analysis.totals.assets
      : computeAmountBase(analysis, template.amountRule.basis, eligibleSources)

    if (base <= 0) continue

    const amountMin = Math.max(
      base * template.amountRule.minPct,
      template.amountRule.absoluteMin ?? 0
    )
    const amountMax = Math.min(
      base * template.amountRule.maxPct,
      template.amountRule.absoluteMax ?? Infinity
    )

    // Fix E + F-2 + F-3c: computeBoundedAmount ile ufuk+sektör+adaptive cap uygula
    const capResult = computeBoundedAmount(base, template, analysis, horizon, analysis.sector, regime, gapBand, unlockStage)
    const amountSuggested = capResult.amount

    const distributionMode = hasExternalSource
      ? template.distributionDefault
      : determineDistributionMode(template, eligibleSources)

    candidates.push({
      actionId: template.id,
      template,
      amountMin,
      amountMax,
      amountSuggested,
      distributionMode,
      feasibility,
      feasibilityMultiplier: feasibilityToMultiplier(feasibility),
      eligibleSourceAccounts: eligibleSources,
      eligibleTargetAccounts: eligibleTargets,
      preconditionPassed: combinedPass,
      preconditionFailures: combinedFailures,
      sectorPrioritized: sectorProfile.priorityActions.includes(template.id),
      sectorDiscouraged: sectorProfile.discouragedActions.includes(template.id),
      bindingCap: capResult.bindingCap,
    })
  }

  return candidates
}
