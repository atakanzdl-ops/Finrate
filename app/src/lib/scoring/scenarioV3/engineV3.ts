/**
 * ENGINE V3 (V3-10a) - HYBRID GREEDY ORCHESTRATOR
 *
 * Bu dosya V3'un orchestrator'udur. 9 katmani birlestirir:
 *   V3-1 contracts, V3-2 actionCatalog, V3-3 ledger, V3-4 quality,
 *   V3-5 sustainability, V3-6 sector, V3-7 guardrails,
 *   V3-8 productivity, V3-9 ratingReasoning
 *
 * ALGORITMA: Hybrid Greedy + Local Repair
 *   1. Aday aksiyonlari uret
 *   2. Her aday icin: quality x productivity_repair x diversity_bonus x repeat_decay skorlari
 *   3. En iyi adayi sec, ledger uygula
 *   4. Metrikleri tazele, layer'lari tekrar calistir
 *   5. Iterative portfolio aggregate guardrail
 *   6. Hedef rating'e ulasinca veya skor duseyince dur
 *   7. Local repair: missed opportunities'dan ekleme dene
 *
 * KUMULATIF HORIZON YAPISI:
 *   short = ilk 2-4 aksiyon (hemen yapilabilir)
 *   medium = short + ek yapisal aksiyonlar
 *   long = medium + stratejik donusum
 *
 * ITERATIF KATMAN TAZELEME:
 *   Ledger: her adimda
 *   Quality: her adimda
 *   Guardrail: her adimda
 *   Productivity: her adimda
 *   Sustainability: portfoy sonunda + gerekirse ara kontrol
 *   Sector: portfoy sonunda
 *   RatingReasoning: final snapshot
 *
 * TUTAR OPTIMIZASYONU: Materiality-bound scaled
 *   1. suggestedAmount baslangic
 *   2. Firma buyuklugune gore olcekle
 *   3. Kaynak hesap bakiyesi sinir
 *   4. Materiality alt sinir (MATERIALITY_BY_HORIZON)
 *   5. Guardrail ust sinir
 *   6. 4 aday tutar dene: min / typical / aggressive / maxRealistic
 *
 * YENI MEKANIZMALAR (ChatGPT review sonrasi):
 *   - DecisionTrace: string trace degil, yapilandirilmis kayit
 *     (hangi adaylar degerlendirildi, hangisi secildi, neden)
 *   - RepeatDecay: ayni aksiyon tekrar secildiginde score carpani uygulanir
 *     orchestrator seviyesinde (quality engine'den ayri)
 *   - DiversityPenalty: ayni DriverCategory'den ustuste secim cezalandirilir
 *     (cumulative same-category penalty)
 *
 * AMAC: "En yuksek skoru bulan motor" DEGIL
 *       "En gercekci rating iyilestirme yol haritasini bulan motor"
 */

import type {
  SectorCode,
  ActionTemplateV3,
  AccountingTransaction,
  HorizonKey,
} from './contracts'

import {
  SUSTAINABILITY_MULTIPLIER,
  MATERIALITY_BY_HORIZON,
} from './contracts'

import { ACTION_CATALOG_V3 } from './actionCatalogV3'

import { buildRatioTransparency } from './ratioHelpers'

import {
  applyTransactions,
} from './ledgerEngine'
import type { AccountBalance } from './ledgerEngine'

import {
  calculateQuality,
} from './qualityEngine'
import type { ContextSignals, QualityResult } from './qualityEngine'

import {
  analyzeSustainability,
} from './sustainabilityEngine'
import type { PortfolioAction as SustPortfolioAction } from './sustainabilityEngine'

import {
  analyzeSectorIntelligence,
  isActionSemanticallyImpossibleForSector,
} from './sectorIntelligence'
import type { SectorMetricKey } from './sectorIntelligence'

import {
  checkActionGuardrails,
  checkPortfolioAggregateRules,
  ACTION_DEPENDENCY_GRAPH,
} from './semanticGuardrails'

import {
  analyzeAssetProductivity,
  ACTION_REPAIR_PROFILES,
} from './assetProductivity'
import type { RepairStrength } from './assetProductivity'

import {
  analyzeRatingReasoning,
  ratingToIndex,
  ACTION_CATEGORY_MAP,
} from './ratingReasoning'
import type { RatingGrade } from './ratingReasoning'

// Unused imports - imported for type completeness but not referenced directly
void 0 as unknown as typeof ratingToIndex

// ACTION_LIST - iterable form of the record (Record degil Array)
const ACTION_LIST: ActionTemplateV3[] = Object.values(ACTION_CATALOG_V3)

// ─── INPUT TYPES ──────────────────────────────────────────────────────────────

export interface EngineInput {
  sector: SectorCode
  currentRating: RatingGrade

  /** Hedef rating - opsiyonel, verilmezse motor optimize eder */
  targetRating?: RatingGrade

  /** Firma hesap bakiyeleri - TDHP hesap kodu => tutar */
  accountBalances: Record<string, number>

  /** Gelir tablosu ozeti */
  incomeStatement: {
    netSales: number
    costOfGoodsSold: number
    grossProfit: number
    operatingProfit: number
    netIncome: number
    interestExpense: number
    operatingCashFlow?: number
  }

  /** Opsiyonel: arama uzayini daraltmak icin filtre */
  options?: {
    maxActionsPerHorizon?: number
    maxTotalActions?: number
    allowedActionIds?: string[]
    disallowedActionIds?: string[]
    aggressiveness?: 'conservative' | 'typical' | 'aggressive'
  }
}

// ─── OUTPUT TYPES ─────────────────────────────────────────────────────────────

export interface SelectedAction {
  actionId:                   string
  actionName:                 string
  horizon:                    HorizonKey
  amountTRY:                  number
  transactions:               AccountingTransaction[]

  qualityScore:               number
  productivityRepairStrength: string
  sustainability:             string
  sectorCompatibility:        number
  guardrailSeverity:          string

  /** Bu aksiyonun rating'e katki skoru */
  estimatedNotchContribution: number

  /** Tekrar decay carpani uygulanmis halde */
  repeatDecayApplied:         number

  /** Diversity penalty uygulanmis halde */
  diversityPenaltyApplied:    number

  narrative:                  string

  /** UI transparency bloku — sadece computeAmount aktif aksiyonlarda dolu */
  ratioTransparency?:         import('./contracts').RatioTransparency
}

export interface HorizonPortfolio {
  horizon:                    HorizonKey
  actions:                    SelectedAction[]
  cumulativeActions:          SelectedAction[]
  targetRatingAtThisHorizon:  RatingGrade
  notchesGainedCumulative:    number
  totalAmountTRY:             number
  keyInefficienciesRepaired:  string[]
}

export interface FeasibilityAssessment {
  requestedTarget:  RatingGrade
  achievableTarget: RatingGrade
  isFeasible:       boolean
  reason:           string
  requirements:     string[]
}

/**
 * Yapilandirilmis karar kaydi.
 * Her iterasyonda hangi adaylar bakildi, hangisi secildi, neden.
 */
export interface DecisionTraceNode {
  iteration:  number
  horizon:    HorizonKey
  phase:      'GREEDY_SELECTION' | 'LOCAL_REPAIR'

  /** Bu iterasyonda degerlendirilen tum adaylar - skora gore sirali */
  evaluatedCandidates: Array<{
    actionId:                   string
    amountTRY:                  number
    amountLabel:                string
    rawScore:                   number
    qualityScore:               number
    productivityRepairStrength: string
    diversityPenalty:           number
    repeatDecay:                number
    /** Optimizer karar skoru (0-1 arası): quality × productivity × decay × diversity. analysisRecord.finalScore ile KARISTIRILMAMALI. Faz 1 Bulgu #3. */
    optimizerScore:             number
    rejected:                   boolean
    rejectionReason?:           string
  }>

  /** Secilen aday (varsa) */
  selectedActionId:   string | null
  selectedAmountTRY:  number | null
  selectionReason:    string

  /** Bu adimdan sonra firma context snapshot */
  contextAfter: {
    totalAssets:          number
    totalRevenue:         number
    cashBalance:          number
    keyAccountBalances:   Record<string, number>
  }
}

export interface EngineResult {
  version:             'v3'
  sector:              SectorCode
  currentRating:       RatingGrade
  rawTargetRating:     RatingGrade
  finalTargetRating:   RatingGrade
  notchesGained:       number
  confidence:          'HIGH' | 'MEDIUM' | 'LOW'
  confidenceModifier:  number

  horizons: {
    short:  HorizonPortfolio
    medium: HorizonPortfolio
    long:   HorizonPortfolio
  }

  portfolio:    SelectedAction[]
  feasibility?: FeasibilityAssessment

  reasoning: {
    bindingCeiling:      unknown
    supportingCeilings:  unknown[]
    drivers:             unknown
    missedOpportunities: unknown[]
    oneNotchScenario:    unknown
    twoNotchScenario:    unknown
    sensitivityAnalysis: unknown
    bankerSummary:       string
    /** PATCH 1: RatingTransition tam nesnesi — blockedByPortfolioCapacity vb. */
    transition:          unknown
  }

  layerSummaries: {
    productivity:  unknown
    sustainability: unknown
    sector:        unknown
    guardrails:    unknown[]
  }

  /** Yapilandirilmis karar izi - debug + explainability */
  decisionTrace: DecisionTraceNode[]

  debug?: {
    iterations:         number
    rejectedCandidates: Array<{ actionId: string; reason: string }>
    ledgerChangeLog:    unknown[]
    algorithmTrace:     string[]
  }
}

// ─── INTERNAL TYPES ───────────────────────────────────────────────────────────

interface FirmContext {
  sector:           SectorCode
  accountBalances:  Record<string, number>
  totalAssets:      number
  totalEquity:      number
  totalRevenue:     number
  netIncome:        number
  netSales:         number
  operatingProfit:  number
  grossProfit:      number
  interestExpense:  number
  operatingCashFlow: number | null
  /** Finansal dönem tipi — computeAmount period-day hesabı için */
  period?:          string
}

interface AmountCandidate {
  amountTRY:          number
  label:              'min' | 'typical' | 'aggressive' | 'maxRealistic' | 'rasyo-hedef'
  ratioTransparency?: import('./contracts').RatioTransparency
}

interface ScoreBreakdown {
  totalScore:                 number
  qualityScore:               number
  productivityRepairStrength: string
  sustainabilityWeight:       number
  horizonFit:                 number
  guardrailPenalty:           number
  repeatDecay:                number
  diversityPenalty:           number
  breakdown:                  string
  transactions:               AccountingTransaction[]
}

// ─── HORIZON LIMITS ───────────────────────────────────────────────────────────

const HORIZON_LIMITS: Record<HorizonKey, { maxActions: number }> = {
  short:  { maxActions: 4 },
  medium: { maxActions: 3 },
  long:   { maxActions: 2 },
}

// ─── REPEAT DECAY (ORCHESTRATOR LEVEL) ───────────────────────────────────────

/**
 * Ayni aksiyon tekrar secildiginde orchestrator seviyesinde ek decay.
 * V3-4 quality engine'in internal repeatMultiplier'indan AYRI.
 *
 * previousSelectionCount = 0 → ilk kez → decay yok (1.0)
 * previousSelectionCount = 1 → ikinci kez → action.repeatDecay.second
 * previousSelectionCount = 2 → ucuncu kez → action.repeatDecay.third
 * previousSelectionCount >= maxRepeats → 0 (engel)
 */
function calculateRepeatDecay(
  action: ActionTemplateV3,
  previousSelectionCount: number,
): number {
  if (previousSelectionCount === 0) return 1.0
  if (previousSelectionCount >= action.repeatDecay.maxRepeats) return 0

  if (previousSelectionCount === 1) return action.repeatDecay.second
  if (previousSelectionCount === 2) return action.repeatDecay.third
  return 0.10  // 4+ tekrar — neredeyse etkisiz
}

// ─── DIVERSITY PENALTY ────────────────────────────────────────────────────────

/**
 * Ayni DriverCategory'den ustuste secim cezalandirilir.
 * Diversified repair tercih edilir.
 *
 * STRUCTURAL: daha toleranli (operasyonel donusum cesitli olabilir)
 * COSMETIC + HYBRID: daha sert penalti
 */
function calculateDiversityPenalty(
  actionId:              string,
  previouslySelectedIds: string[],
): number {
  const category = ACTION_CATEGORY_MAP[actionId]
  if (!category) return 0

  const sameCategoryCount = previouslySelectedIds.filter(
    id => ACTION_CATEGORY_MAP[id] === category
  ).length

  if (sameCategoryCount === 0) return 0

  if (category === 'STRUCTURAL') {
    const p = [0, 0.10, 0.20, 0.35]
    return p[Math.min(sameCategoryCount, p.length - 1)]
  }

  // COSMETIC ve HYBRID
  const p = [0, 0.15, 0.30, 0.50]
  return p[Math.min(sameCategoryCount, p.length - 1)]
}

// ─── ACCOUNT HELPERS ──────────────────────────────────────────────────────────

function sumByPrefix(balances: Record<string, number>, prefix: string): number {
  return Object.entries(balances).reduce((sum, [code, amount]) => {
    return code.startsWith(prefix) ? sum + Math.abs(amount) : sum
  }, 0)
}

function sumByCodes(balances: Record<string, number>, codes: string[]): number {
  return codes.reduce((sum, code) => sum + Math.abs(balances[code] ?? 0), 0)
}

function recordToAccountBalances(rec: Record<string, number>): AccountBalance[] {
  return Object.entries(rec).map(([accountCode, amount]) => ({ accountCode, amount }))
}

function accountBalancesToRecord(balances: AccountBalance[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const b of balances) result[b.accountCode] = b.amount
  return result
}

// ─── FIRM CONTEXT ─────────────────────────────────────────────────────────────

function buildInitialFirmContext(input: EngineInput): FirmContext {
  const b = input.accountBalances

  // TDHP hesap gruplari
  const currentAssets = sumByPrefix(b, '1')   // 1xx donen varliklar
  const fixedAssets   = sumByPrefix(b, '2')   // 2xx duran varliklar
  const totalAssets   = currentAssets + fixedAssets

  // Ozkaynak: 5xx hesaplar
  const totalEquity = sumByPrefix(b, '5')

  return {
    sector:           input.sector,
    accountBalances:  { ...input.accountBalances },
    totalAssets,
    totalEquity,
    totalRevenue:     input.incomeStatement.netSales,
    netIncome:        input.incomeStatement.netIncome,
    netSales:         input.incomeStatement.netSales,
    operatingProfit:  input.incomeStatement.operatingProfit,
    grossProfit:      input.incomeStatement.grossProfit,
    interestExpense:  input.incomeStatement.interestExpense,
    operatingCashFlow: input.incomeStatement.operatingCashFlow ?? null,
    period: (input as any).financialData?.period ?? 'ANNUAL',
  }
}

function updateFirmContextFromTransactions(
  context:      FirmContext,
  transactions: AccountingTransaction[],
): FirmContext {
  if (transactions.length === 0) return context

  const initialBalances = recordToAccountBalances(context.accountBalances)
  const ledgerResult    = applyTransactions(transactions, initialBalances)

  if (!ledgerResult.allApplied) {
    // Ledger hatasi - context degistirmeden don
    return context
  }

  const updatedBalances = accountBalancesToRecord(ledgerResult.finalBalances)

  const currentAssets = sumByPrefix(updatedBalances, '1')
  const fixedAssets   = sumByPrefix(updatedBalances, '2')
  const totalAssets   = currentAssets + fixedAssets
  const totalEquity   = sumByPrefix(updatedBalances, '5')

  return {
    ...context,
    accountBalances: updatedBalances,
    totalAssets,
    totalEquity,
  }
}

function snapshotContext(ctx: FirmContext): DecisionTraceNode['contextAfter'] {
  return {
    totalAssets:   ctx.totalAssets,
    totalRevenue:  ctx.totalRevenue,
    cashBalance:   ctx.accountBalances['102'] ?? 0,
    keyAccountBalances: {
      '102': ctx.accountBalances['102'] ?? 0,
      '120': ctx.accountBalances['120'] ?? 0,
      '150': ctx.accountBalances['150'] ?? 0,
      '350': ctx.accountBalances['350'] ?? 0,
      '500': ctx.accountBalances['500'] ?? 0,
    },
  }
}

// ─── SECTOR METRICS ───────────────────────────────────────────────────────────

function computeSectorMetrics(ctx: FirmContext): Record<SectorMetricKey, number> {
  const b = ctx.accountBalances

  const currentAssets  = sumByPrefix(b, '1')
  const stLiabilities  = sumByPrefix(b, '3')
  const ltLiabilities  = sumByPrefix(b, '4')
  const totalLiabilities = stLiabilities + ltLiabilities
  const equity         = ctx.totalEquity || 1
  const totalAssets    = ctx.totalAssets || 1

  const inventory      = sumByCodes(b, ['150','151','152','153','157','158'])
  const cashBalance    = sumByCodes(b, ['100','101','102','103','108'])

  const safe = (n: number, d: number, fallback = 0) => d > 0 ? n / d : fallback

  return {
    currentRatio:     safe(currentAssets, stLiabilities, 1.0),
    quickRatio:       safe(currentAssets - inventory, stLiabilities, 1.0),
    cashRatio:        safe(cashBalance, stLiabilities, 0),
    debtToEquity:     safe(totalLiabilities, equity, 10.0),
    debtToAssets:     safe(totalLiabilities, totalAssets, 0.8),
    interestCoverage: safe(ctx.operatingProfit, ctx.interestExpense, 5.0),
    assetTurnover:    safe(ctx.netSales, totalAssets, 0),
    operatingMargin:  safe(ctx.operatingProfit, ctx.netSales > 0 ? ctx.netSales : 1, 0),
  }
}

// ─── TUTAR OPTIMIZASYONU ─────────────────────────────────────────────────────

function getBasisAmount(action: ActionTemplateV3, context: FirmContext): number {
  const sa = action.suggestedAmount
  switch (sa.basis) {
    case 'assets':  return context.totalAssets
    case 'revenue': return context.totalRevenue || context.netSales
    case 'equity':  return Math.max(context.totalEquity, 1)
    case 'source_account': {
      const codes = action.preconditions.requiredAccountCodes ?? []
      if (codes.length === 0) return context.totalAssets
      return sumByCodes(context.accountBalances, codes)
    }
    case 'target_group':
    default:
      return context.totalAssets
  }
}

function calculateAmountCandidates(
  action:   ActionTemplateV3,
  context:  FirmContext,
  horizon:  HorizonKey,
): AmountCandidate[] {
  // ─── computeAmount override (feature flag korumalı) ───────────────────
  // ŞART 1: Flag kontrolü computeAmount çağrısından ÖNCE.
  // Flag kapalıyken action.computeAmount tanımlı OLSA BİLE çağrılmaz.
  if (process.env.ENABLE_RATIO_BASED_AMOUNTS === 'true') {
    // ŞART 2: Flag açık ama aksiyonda computeAmount yoksa eski yol devam eder.
    if (action.computeAmount) {
      const v = action.computeAmount(context)
      // ŞART 3: null / 0 / negatif → fallback'e geç.
      if (v !== null && v > 0) {
        // Materiality bypass: computeAmount aktif aksiyonlarda
        // MATERIALITY_BY_HORIZON.minAbsoluteAmountTRY uygulanmaz.
        const transparency = buildRatioTransparency(action, context, v)
        return [{
          amountTRY: v,
          label: 'rasyo-hedef',
          ratioTransparency: transparency ?? undefined,
        }]
      }
    }
  }
  // ─── eski yüzde mantığı (değiştirilmedi) ──────────────────────────────

  const sa        = action.suggestedAmount
  const basis     = getBasisAmount(action, context)
  const matLimit  = MATERIALITY_BY_HORIZON[horizon]

  const minAbs    = Math.max(sa.absoluteMinTRY, matLimit.minAbsoluteAmountTRY)
  const maxAbs    = sa.absoluteMaxTRY ?? (basis * sa.maxPctOfBasis * 2)

  const minAmt        = Math.max(basis * sa.minPctOfBasis,     minAbs)
  const typicalAmt    = Math.max(basis * sa.typicalPctOfBasis, minAbs)
  const aggressiveAmt = Math.min(typicalAmt * 1.5,             maxAbs)
  const maxRealAmt    = Math.min(basis * sa.maxPctOfBasis,     maxAbs)

  // Materiality alt siniri
  const matMin = context.totalAssets * matLimit.minAmountPctOfAssets

  const candidates: AmountCandidate[] = [
    { amountTRY: minAmt,        label: 'min'          },
    { amountTRY: typicalAmt,    label: 'typical'      },
    { amountTRY: aggressiveAmt, label: 'aggressive'   },
    { amountTRY: maxRealAmt,    label: 'maxRealistic' },
  ]

  // Materiality filtrelemesi + pozitif olanlari sec
  return candidates.filter(c =>
    c.amountTRY > 0 &&
    c.amountTRY >= matMin &&
    c.amountTRY >= minAbs
  )
}

// ─── TDHP GRUP EŞLEMESİ ─────────────────────────────────────────────────────

/**
 * TDHP hesap grubu eşleme.
 * İlk 2 hane grup kodu (30=Mali Borçlar, 32=Ticari Borçlar, 15=Stoklar vb.)
 * Önce tam eşleşme, yoksa grup içinde herhangi bir alt hesap.
 * Sadece pure numeric ve istenen uzunlukta/daha uzun kodları kabul eder.
 */
function findBalanceInGroup(
  balances:     Record<string, number>,
  requiredCode: string,
): { code: string; balance: number } | null {
  // 1. Exact match öncelik
  const exactBal = balances[requiredCode]
  if (exactBal != null && Math.abs(exactBal) > 0) {
    return { code: requiredCode, balance: exactBal }
  }
  // 2. TDHP grup fallback (ilk 2 hane, güvenli filtrelerle)
  const groupPrefix = requiredCode.slice(0, 2)
  for (const [code, bal] of Object.entries(balances)) {
    if (
      /^\d+$/.test(code) &&                  // sadece rakam (30A, KOD30 elenir)
      code.length >= requiredCode.length &&   // yeterli uzunluk
      code.startsWith(groupPrefix) &&
      Math.abs(bal) > 0
    ) {
      return { code, balance: bal }
    }
  }
  return null
}

// ─── APPLICABILITY KONTROLU ───────────────────────────────────────────────────

function isActionApplicable(
  action:               ActionTemplateV3,
  context:              FirmContext,
  horizon:              HorizonKey,
  previouslySelected:   string[],
): { applicable: boolean; reason?: string } {
  // 1. Horizon destegi
  if (!action.horizons.includes(horizon)) {
    return { applicable: false, reason: `Horizon ${horizon} desteklenmiyor` }
  }

  // 2. Sektor uyumlulugu
  const sectorCompat = action.sectorCompatibility[context.sector]
  if (sectorCompat === 'not_applicable') {
    return { applicable: false, reason: `${context.sector} sektoru icin uygulanamaz` }
  }

  // 3. Semantic sektör impossibility (V3-6)
  const semantic = isActionSemanticallyImpossibleForSector(action.id, context.sector)
  if (semantic.impossible) {
    return { applicable: false, reason: semantic.reason ?? 'Semantik imkansizlik' }
  }

  // 4. Preconditions - required account codes (TDHP grup-match ile)
  const requiredCodes = action.preconditions.requiredAccountCodes ?? []
  for (const code of requiredCodes) {
    const found = findBalanceInGroup(context.accountBalances, code)
    if (!found) {
      return {
        applicable: false,
        reason: `Kaynak hesap ${code} grubu (${code.slice(0, 2)}X) bakiyesi yok`,
      }
    }
  }

  // 5. Min source amount — SADECE requiredAccountCodes varsa bakiye kontrol et.
  // requiredCodes boş olan aksiyonlarda (kârlılık/gelir/sermaye: A10, A12, A13, A18 vb.)
  // reduce() → 0 döner → 0 < minSourceAmountTRY → her zaman YANLIŞ REJECT.
  // Bu aksiyonlar için eligibility kaynağı aşağıdaki customCheck'tir (5b).
  if (action.preconditions.minSourceAmountTRY && requiredCodes.length > 0) {
    const sourceBalance = requiredCodes.reduce(
      (s, c) => s + (findBalanceInGroup(context.accountBalances, c)?.balance ?? 0), 0
    )
    if (sourceBalance < action.preconditions.minSourceAmountTRY) {
      return {
        applicable: false,
        reason: `Kaynak bakiye yetersiz: ${sourceBalance.toFixed(0)} < ${action.preconditions.minSourceAmountTRY}`,
      }
    }
  }

  // 5b. customCheck — preconditions.customCheck varsa çalıştır.
  // Hem requiredCodes olan hem olmayan tüm aksiyonlar için geçerlidir.
  // Katalog customCheck'leri analysis.accounts[] array'i bekler;
  // recordToAccountBalances() ile FirmContext.accountBalances adapt edilir.
  if (action.preconditions.customCheck) {
    const analysisProxy = { accounts: recordToAccountBalances(context.accountBalances) }
    const checkResult   = action.preconditions.customCheck(analysisProxy)
    if (!checkResult.pass) {
      return {
        applicable: false,
        reason: checkResult.reason ?? 'Precondition customCheck basarisiz',
      }
    }
  }

  // 6. Sector must include/exclude
  const mustInclude = action.preconditions.sectorMustInclude
  if (mustInclude && mustInclude.length > 0 && !mustInclude.includes(context.sector)) {
    return { applicable: false, reason: `Sadece ${mustInclude.join(',')} sektorleri icin gecerli` }
  }
  const mustExclude = action.preconditions.sectorMustExclude
  if (mustExclude && mustExclude.includes(context.sector)) {
    return { applicable: false, reason: `${context.sector} sektoru icin uygulanamaz (sector exclude)` }
  }

  // 7. ACTION_DEPENDENCY_GRAPH - requires kontrolu (V3-7)
  const depSpec = ACTION_DEPENDENCY_GRAPH[action.id]
  if (depSpec?.requires && depSpec.requires.length > 0) {
    for (const req of depSpec.requires) {
      if (!previouslySelected.includes(req)) {
        return { applicable: false, reason: `Oncelikle ${req} uygulanmali (requires)` }
      }
    }
  }

  // 8. Mutually exclusive
  if (depSpec?.mutuallyExclusiveWith) {
    for (const excl of depSpec.mutuallyExclusiveWith) {
      if (previouslySelected.includes(excl)) {
        return { applicable: false, reason: `${excl} ile birlikte kullanılamaz (mutually exclusive)` }
      }
    }
  }

  // 9. Requires positive earnings
  if (depSpec?.requiresPositiveEarnings && context.netIncome <= 0) {
    return { applicable: false, reason: 'Pozitif net kar gerektirir' }
  }

  // 10a. Ratio-based aksiyonlar tek seferlik secilir.
  // computeAmount cap'i "12 ayda uygulanabilir maksimum" olarak tasarlandi;
  // ayni aksiyonu tekrar secmek cap mantigi ile celiski olusturur.
  // targetRatio VEYA computeAmount tanimliysa bu kural devreye girer.
  if (action.targetRatio != null || action.computeAmount != null) {
    const alreadyUsed = previouslySelected.some(id => id === action.id)
    if (alreadyUsed) {
      return { applicable: false, reason: 'Ratio-based aksiyon zaten secildi (tek seferlik kural)' }
    }
  }

  // 10b. Repeat max kontrolu (standart aksiyonlar)
  const prevCount = previouslySelected.filter(id => id === action.id).length
  if (prevCount >= action.repeatDecay.maxRepeats) {
    return { applicable: false, reason: `Max tekrar (${action.repeatDecay.maxRepeats}) asildi` }
  }

  return { applicable: true }
}

// ─── SKOR HESAPLAMA ───────────────────────────────────────────────────────────

/**
 * Aksiyon + tutar + horizon icin toplam aday skoru.
 *
 * Formul (explainable):
 *   baseScore = qualityScore x productivityWeight x sustainabilityWeight x horizonFit
 *   afterGuardrail = baseScore x (1 - guardrailPenalty)
 *   afterDecay = afterGuardrail x repeatDecay
 *   afterDiversity = afterDecay x (1 - diversityPenalty)
 *
 * qualityScore    -> V3-4 calculateQuality()  (GERCEK CALL)
 * productivityWeight -> V3-8 ACTION_REPAIR_PROFILES  (GERCEK LOOKUP)
 * sustainabilityWeight -> V3-1 SUSTAINABILITY_MULTIPLIER  (GERCEK SABIT)
 * guardrailPenalty -> V3-7 checkActionGuardrails()  (GERCEK CALL)
 *
 * repeatDecay: orchestrator-level decay (V3-4'un internal repeatMultiplier'indan AYRI)
 * Notes: repeatIndex=1 (first-time) quality engine'e veriliyor, orchestrator decay ayri uygulaniyor
 */
function scoreCandidate(
  action:                ActionTemplateV3,
  amountTRY:             number,
  context:               FirmContext,
  horizon:               HorizonKey,
  previouslySelectedIds: string[],
): ScoreBreakdown {

  // 0. Horizon fit - binary (hareket olmayan horizon'a skor yok)
  const horizonFit = action.horizons.includes(horizon) ? 1.0 : 0.0
  if (horizonFit === 0.0) {
    return {
      totalScore: 0, qualityScore: 0, productivityRepairStrength: 'NONE',
      sustainabilityWeight: 0, horizonFit: 0, guardrailPenalty: 0,
      repeatDecay: 1, diversityPenalty: 0,
      breakdown: 'horizon_fit=0 (not in action.horizons)',
      transactions: [],
    }
  }

  // 1. Transactions build - context signals icin de kullanilacak
  const buildCtx = {
    sector:          context.sector,
    horizon,
    analysis:        context.accountBalances as unknown,
    amount:          amountTRY,
    previousActions: previouslySelectedIds,
  }
  const transactions = action.buildTransactions(buildCtx)

  // 2. Quality score - V3-4 calculateQuality() GERCEK CALL
  //    repeatIndex = 1 (her zaman first-time quality degerlendir)
  //    Orchestrator-level repeat decay ayri mekanizma olarak uygulanir
  const assetProductivityLow =
    context.totalAssets > 0 && (context.netSales / context.totalAssets) < 0.35

  const contextSignals: ContextSignals = {
    assetProductivityLow,
    salesGrowthAlongside:        false,
    inventoryTurnoverBelowSector: false,
    inventoryDumpingSignal:      false,
  }

  const qualityResult = calculateQuality({
    template:       action,
    transactions,
    sector:         context.sector,
    repeatIndex:    1,       // orchestrator decay ayri uygulanir
    rawScoreDelta:  1.0,     // normalized base; adjustedScoreDelta = finalQuality
    contextSignals,
  })
  const qualityScore = qualityResult.breakdown.finalQuality

  // 3. Productivity repair weight - V3-8 ACTION_REPAIR_PROFILES GERCEK LOOKUP
  const repairProfile  = ACTION_REPAIR_PROFILES[action.id]
  let strongestRepair: RepairStrength = 'NONE'
  if (repairProfile && Object.keys(repairProfile.repairs).length > 0) {
    const repairOrder: RepairStrength[] = ['PRIMARY', 'STRONG', 'MODERATE', 'WEAK', 'NONE']
    const repairValues = Object.values(repairProfile.repairs) as RepairStrength[]
    for (const level of repairOrder) {
      if (repairValues.includes(level)) {
        strongestRepair = level
        break
      }
    }
  }
  const productivityWeightMap: Record<RepairStrength, number> = {
    PRIMARY: 1.0, STRONG: 0.8, MODERATE: 0.5, WEAK: 0.3, NONE: 0.1,
  }
  const productivityWeight = productivityWeightMap[strongestRepair]

  // 4. Sustainability weight - V3-1 SUSTAINABILITY_MULTIPLIER GERCEK SABIT
  const sustainabilityWeight = SUSTAINABILITY_MULTIPLIER[action.sustainability]

  // 5. Guardrail penalty - V3-7 checkActionGuardrails() GERCEK CALL
  const guardrailReport = checkActionGuardrails({
    action,
    transactions,
    proposedAmountTRY:            amountTRY,
    accountBalances:              context.accountBalances,
    firmContext: {
      totalAssets:   context.totalAssets,
      totalEquity:   context.totalEquity,
      totalRevenue:  context.totalRevenue,
      netIncome:     context.netIncome,
      sector:        context.sector,
    },
    horizon,
    previouslySelectedActionIds: previouslySelectedIds,
  })
  const guardrailPenalty =
    guardrailReport.hasHardReject ? 1.0 :
    guardrailReport.hasSoftBlock  ? 0.7 :
    guardrailReport.hasWarning    ? 0.2 : 0.0

  // 6. Repeat decay - orchestrator seviyesi (V3-4'tan AYRI)
  const sameActionCount = previouslySelectedIds.filter(id => id === action.id).length
  const repeatDecay     = calculateRepeatDecay(action, sameActionCount)

  // 7. Diversity penalty
  const diversityPenalty = calculateDiversityPenalty(action.id, previouslySelectedIds)

  // 8. Final skor formulu
  let score = qualityScore * productivityWeight * sustainabilityWeight * horizonFit
  score *= (1 - guardrailPenalty)
  score *= repeatDecay
  score *= (1 - diversityPenalty)

  const breakdown =
    `quality=${qualityScore.toFixed(3)}` +
    ` x prod=${productivityWeight.toFixed(2)}` +
    ` x sust=${sustainabilityWeight.toFixed(2)}` +
    ` x hz=${horizonFit.toFixed(1)}` +
    ` x (1-guard=${guardrailPenalty.toFixed(2)})` +
    ` x decay=${repeatDecay.toFixed(2)}` +
    ` x (1-div=${diversityPenalty.toFixed(2)})` +
    ` = ${score.toFixed(3)}`

  return {
    totalScore:                 score,
    qualityScore,
    productivityRepairStrength: strongestRepair,
    sustainabilityWeight,
    horizonFit,
    guardrailPenalty,
    repeatDecay,
    diversityPenalty,
    breakdown,
    transactions,
  }
}

// ─── GREEDY SELECTION LOOP ────────────────────────────────────────────────────

function runGreedySelection(
  context:          FirmContext,
  horizon:          HorizonKey,
  selectedSoFar:    SelectedAction[],
  maxActions:       number,
  aggressiveness:   string,
  rejectedLog:      Array<{ actionId: string; reason: string }>,
  algorithmTrace:   string[],
  decisionTrace:    DecisionTraceNode[],
  allowedIds?:      string[],
  disallowedIds?:   string[],
): SelectedAction[] {

  const selected:      SelectedAction[] = []
  let currentContext = { ...context, accountBalances: { ...context.accountBalances } }
  let iterationCount = 0
  const maxIterations = 50

  while (selected.length < maxActions && iterationCount < maxIterations) {
    iterationCount++

    const allSelectedIds = [
      ...selectedSoFar.map(s => s.actionId),
      ...selected.map(s => s.actionId),
    ]

    // ── Aday listesi ─────────────────────────────────────────────────────────
    type CandidateEntry = {
      action:          ActionTemplateV3
      amountCandidate: AmountCandidate
      score:           number
      breakdown:       ScoreBreakdown
      rejected:        boolean
      rejectionReason?: string
    }
    const candidates: CandidateEntry[] = []

    for (const action of ACTION_LIST) {
      // Filtreler
      if (allowedIds && !allowedIds.includes(action.id)) continue
      if (disallowedIds && disallowedIds.includes(action.id))  continue

      // Applicability
      const applicability = isActionApplicable(action, currentContext, horizon, allSelectedIds)
      if (!applicability.applicable) {
        rejectedLog.push({ actionId: action.id, reason: applicability.reason ?? 'not applicable' })
        continue
      }

      // Tutar adaylari
      const amountCandidates = calculateAmountCandidates(action, currentContext, horizon)
      if (amountCandidates.length === 0) {
        rejectedLog.push({ actionId: action.id, reason: 'no valid amount candidates' })
        continue
      }

      // Aggressiveness'a gore filtre
      // 'rasyo-hedef': computeAmount aktif aksiyonlar — her aggressiveness seviyesinde dahil edilir.
      const labelsToUse = aggressiveness === 'conservative'
        ? ['min', 'typical', 'rasyo-hedef']
        : aggressiveness === 'aggressive'
          ? ['aggressive', 'maxRealistic', 'rasyo-hedef']
          : ['typical', 'aggressive', 'rasyo-hedef']

      for (const amt of amountCandidates) {
        if (!labelsToUse.includes(amt.label)) {
          algorithmTrace.push(
            `[label_filter] ${action.id}: label='${amt.label}' whitelist dışı, atlandı (aggressiveness=${aggressiveness})`
          )
          continue
        }

        const scoreResult = scoreCandidate(action, amt.amountTRY, currentContext, horizon, allSelectedIds)
        if (scoreResult.totalScore <= 0) continue

        candidates.push({
          action,
          amountCandidate: amt,
          score:           scoreResult.totalScore,
          breakdown:       scoreResult,
          rejected:        false,
        })
      }
    }

    // ── Skora gore sirala ────────────────────────────────────────────────────
    candidates.sort((a, b) => b.score - a.score)

    if (candidates.length === 0) {
      algorithmTrace.push(`[${horizon}] iter ${iterationCount}: no candidates, stopping`)
      decisionTrace.push({
        iteration:           iterationCount,
        horizon,
        phase:               'GREEDY_SELECTION',
        evaluatedCandidates: [],
        selectedActionId:    null,
        selectedAmountTRY:   null,
        selectionReason:     'No applicable candidates',
        contextAfter:        snapshotContext(currentContext),
      })
      break
    }

    // ── Aggregate guardrail ile en iyi adayi sec ──────────────────────────
    let selectedCandidate: CandidateEntry | null = null

    for (const candidate of candidates) {
      const aggregateResults = checkPortfolioAggregateRules({
        portfolio: [
          ...selectedSoFar.map(a => ({ actionId: a.actionId, amountTRY: a.amountTRY })),
          ...selected.map(a => ({ actionId: a.actionId, amountTRY: a.amountTRY })),
          { actionId: candidate.action.id, amountTRY: candidate.amountCandidate.amountTRY },
        ],
        firmContext: {
          totalAssets:   currentContext.totalAssets,
          totalEquity:   currentContext.totalEquity,
          totalRevenue:  currentContext.totalRevenue,
          netIncome:     currentContext.netIncome,
        },
      })

      const hasHard = aggregateResults.some(r => r.severity === 'HARD_REJECT')
      const hasSoft = aggregateResults.some(r => r.severity === 'SOFT_BLOCK')

      if (hasHard || hasSoft) {
        const reason = aggregateResults
          .filter(r => r.severity === 'HARD_REJECT' || r.severity === 'SOFT_BLOCK')
          .map(r => r.message)
          .join('; ')
        candidate.rejected        = true
        candidate.rejectionReason = `Aggregate guardrail: ${reason}`
        rejectedLog.push({ actionId: candidate.action.id, reason: candidate.rejectionReason })
        continue
      }

      selectedCandidate = candidate
      break
    }

    // ── DecisionTrace kaydi ──────────────────────────────────────────────────
    decisionTrace.push({
      iteration: iterationCount,
      horizon,
      phase:     'GREEDY_SELECTION',
      evaluatedCandidates: candidates.slice(0, 10).map(c => ({
        actionId:                   c.action.id,
        amountTRY:                  c.amountCandidate.amountTRY,
        amountLabel:                c.amountCandidate.label,
        rawScore:                   c.rejected
          ? 0
          : c.score / Math.max((1 - c.breakdown.diversityPenalty) * c.breakdown.repeatDecay, 0.001),
        qualityScore:               c.breakdown.qualityScore,
        productivityRepairStrength: c.breakdown.productivityRepairStrength,
        diversityPenalty:           c.breakdown.diversityPenalty,
        repeatDecay:                c.breakdown.repeatDecay,
        optimizerScore:             c.score,
        rejected:                   c.rejected,
        rejectionReason:            c.rejectionReason,
      })),
      selectedActionId:   selectedCandidate?.action.id ?? null,
      selectedAmountTRY:  selectedCandidate?.amountCandidate.amountTRY ?? null,
      selectionReason:    selectedCandidate
        ? `Highest score ${selectedCandidate.score.toFixed(3)} passed aggregate guardrails`
        : 'All candidates rejected by aggregate guardrails',
      contextAfter: snapshotContext(currentContext),
    })

    if (!selectedCandidate) {
      algorithmTrace.push(`[${horizon}] iter ${iterationCount}: all candidates rejected`)
      break
    }

    // ── Aksiyonu portfoye ekle ────────────────────────────────────────────────
    const sa: SelectedAction = {
      actionId:                   selectedCandidate.action.id,
      actionName:                 selectedCandidate.action.name,
      horizon,
      amountTRY:                  selectedCandidate.amountCandidate.amountTRY,
      transactions:               selectedCandidate.breakdown.transactions,
      qualityScore:               selectedCandidate.breakdown.qualityScore,
      productivityRepairStrength: selectedCandidate.breakdown.productivityRepairStrength,
      sustainability:             String(selectedCandidate.action.sustainability),
      sectorCompatibility:        selectedCandidate.action.sectorCompatibility[context.sector] === 'primary' ? 1.0
                                  : selectedCandidate.action.sectorCompatibility[context.sector] === 'applicable' ? 0.9 : 0,
      guardrailSeverity:          selectedCandidate.breakdown.guardrailPenalty === 0 ? 'PASS'
                                  : selectedCandidate.breakdown.guardrailPenalty < 0.5 ? 'WARNING' : 'SOFT_BLOCK',
      estimatedNotchContribution: estimateNotchContribution(selectedCandidate.breakdown),
      repeatDecayApplied:         selectedCandidate.breakdown.repeatDecay,
      diversityPenaltyApplied:    selectedCandidate.breakdown.diversityPenalty,
      narrative: `${selectedCandidate.action.name}: ${selectedCandidate.breakdown.breakdown}`,
      ratioTransparency:          selectedCandidate.amountCandidate.ratioTransparency,
    }

    selected.push(sa)

    // ── Context guncelle ──────────────────────────────────────────────────────
    currentContext = updateFirmContextFromTransactions(currentContext, sa.transactions)

    algorithmTrace.push(
      `[${horizon}] iter ${iterationCount}: selected ${sa.actionId}` +
      ` (${selectedCandidate.amountCandidate.label},` +
      ` ${(sa.amountTRY / 1e6).toFixed(1)}M TL,` +
      ` score=${selectedCandidate.score.toFixed(3)},` +
      ` decay=${selectedCandidate.breakdown.repeatDecay.toFixed(2)},` +
      ` div=${selectedCandidate.breakdown.diversityPenalty.toFixed(2)})`
    )

    // ── Konverjans kontrolu ───────────────────────────────────────────────────
    if (selected.length >= 2) {
      const lastContrib = selected[selected.length - 1].estimatedNotchContribution
      if (lastContrib < 0.05) {
        algorithmTrace.push(`[${horizon}] marginal contribution < 0.05, stopping early`)
        break
      }
    }
  }

  return selected
}

// ─── LOCAL REPAIR ─────────────────────────────────────────────────────────────

function runLocalRepair(
  selected:         SelectedAction[],
  context:          FirmContext,
  missedOpportunities: unknown[],
  algorithmTrace:   string[],
  decisionTrace:    DecisionTraceNode[],
): SelectedAction[] {
  const repaired    = [...selected]
  let iterCount     = 0
  let repairContext = { ...context, accountBalances: { ...context.accountBalances } }

  const highPriority = (missedOpportunities as Array<{
    actionId: string; estimatedNotchImpact: number; reason: string
  }>).filter(m => m.estimatedNotchImpact >= 1)

  for (const missed of highPriority) {
    iterCount++

    // DUPLICATE GUARD - zaten portfoyde varsa atla
    if (repaired.some(a => a.actionId === missed.actionId)) {
      algorithmTrace.push(`[local_repair] iter ${iterCount}: ${missed.actionId} already in portfolio, skipping`)
      decisionTrace.push({
        iteration: iterCount,
        horizon:   'medium',
        phase:     'LOCAL_REPAIR',
        evaluatedCandidates: [{
          actionId: missed.actionId, amountTRY: 0, amountLabel: 'n/a',
          rawScore: 0, qualityScore: 0, productivityRepairStrength: 'n/a',
          diversityPenalty: 0, repeatDecay: 0, optimizerScore: 0,
          rejected: true, rejectionReason: 'Already in portfolio (duplicate guard)',
        }],
        selectedActionId: null, selectedAmountTRY: null,
        selectionReason:  'Duplicate prevented',
        contextAfter:     snapshotContext(repairContext),
      })
      continue
    }

    const action = ACTION_CATALOG_V3[missed.actionId]
    if (!action) continue

    const horizon = action.horizons[0] ?? 'medium'
    const allIds  = repaired.map(s => s.actionId)

    // Applicability
    const applicability = isActionApplicable(action, repairContext, horizon, allIds)
    if (!applicability.applicable) {
      algorithmTrace.push(`[local_repair] iter ${iterCount}: ${missed.actionId} NOT applicable - ${applicability.reason}`)
      decisionTrace.push({
        iteration: iterCount, horizon, phase: 'LOCAL_REPAIR',
        evaluatedCandidates: [{
          actionId: action.id, amountTRY: 0, amountLabel: 'n/a',
          rawScore: 0, qualityScore: 0, productivityRepairStrength: 'n/a',
          diversityPenalty: 0, repeatDecay: 0, optimizerScore: 0,
          rejected: true, rejectionReason: applicability.reason,
        }],
        selectedActionId: null, selectedAmountTRY: null,
        selectionReason: `Not applicable: ${applicability.reason}`,
        contextAfter: snapshotContext(repairContext),
      })
      continue
    }

    const amounts = calculateAmountCandidates(action, repairContext, horizon)
    const typical = amounts.find(a => a.label === 'typical') ?? amounts[0]
    if (!typical) continue

    // Aggregate guardrail
    const aggResults = checkPortfolioAggregateRules({
      portfolio: [
        ...repaired.map(a => ({ actionId: a.actionId, amountTRY: a.amountTRY })),
        { actionId: action.id, amountTRY: typical.amountTRY },
      ],
      firmContext: {
        totalAssets:   repairContext.totalAssets,
        totalEquity:   repairContext.totalEquity,
        totalRevenue:  repairContext.totalRevenue,
        netIncome:     repairContext.netIncome,
      },
    })

    const blocked = aggResults.some(r => r.severity === 'HARD_REJECT' || r.severity === 'SOFT_BLOCK')
    if (blocked) {
      const reason = `Aggregate guardrail block: ${aggResults.filter(r => r.severity === 'HARD_REJECT' || r.severity === 'SOFT_BLOCK').map(r => r.message).join('; ')}`
      algorithmTrace.push(`[local_repair] iter ${iterCount}: ${missed.actionId} blocked - ${reason}`)
      decisionTrace.push({
        iteration: iterCount, horizon, phase: 'LOCAL_REPAIR',
        evaluatedCandidates: [{
          actionId: action.id, amountTRY: typical.amountTRY, amountLabel: typical.label,
          rawScore: 0, qualityScore: 0, productivityRepairStrength: 'PRIMARY',
          diversityPenalty: 0, repeatDecay: 1.0, finalScore: 0,
          rejected: true, rejectionReason: reason,
        }],
        selectedActionId: null, selectedAmountTRY: null,
        selectionReason: reason,
        contextAfter: snapshotContext(repairContext),
      })
      continue
    }

    // Quality score - V3-4 calculateQuality() GERCEK CALL
    const repairTxs = action.buildTransactions({
      sector: repairContext.sector, horizon,
      analysis: repairContext.accountBalances as unknown,
      amount: typical.amountTRY, previousActions: allIds,
    })
    const repairQuality = calculateQuality({
      template: action, transactions: repairTxs, sector: repairContext.sector,
      repeatIndex: 1, rawScoreDelta: 1.0,
    })
    const repairQualityScore = repairQuality.breakdown.finalQuality

    repaired.push({
      actionId:                   action.id,
      actionName:                 action.name,
      horizon,
      amountTRY:                  typical.amountTRY,
      transactions:               repairTxs,
      qualityScore:               repairQualityScore,
      productivityRepairStrength: 'PRIMARY',
      sustainability:             String(action.sustainability),
      sectorCompatibility:        action.sectorCompatibility[repairContext.sector] === 'primary' ? 1.0 : 0.9,
      guardrailSeverity:          'INFO',
      estimatedNotchContribution: missed.estimatedNotchImpact,
      repeatDecayApplied:         1.0,
      diversityPenaltyApplied:    0,
      narrative:                  `Local repair: ${missed.reason}`,
    })

    repairContext = updateFirmContextFromTransactions(repairContext, repairTxs)
    algorithmTrace.push(`[local_repair] iter ${iterCount}: added ${missed.actionId} (${(typical.amountTRY / 1e6).toFixed(1)}M TL)`)

    decisionTrace.push({
      iteration: iterCount, horizon, phase: 'LOCAL_REPAIR',
      evaluatedCandidates: [{
        actionId: action.id, amountTRY: typical.amountTRY, amountLabel: typical.label,
        rawScore: repairQualityScore, qualityScore: repairQualityScore,
        productivityRepairStrength: 'PRIMARY',
        diversityPenalty: 0, repeatDecay: 1.0, optimizerScore: repairQualityScore,
        rejected: false,
      }],
      selectedActionId: action.id, selectedAmountTRY: typical.amountTRY,
      selectionReason: `Missed opportunity repair: ${missed.reason}`,
      contextAfter: snapshotContext(repairContext),
    })
  }

  return repaired
}

// ─── KUMULATIF HORIZON PORTFOLIO ─────────────────────────────────────────────

function buildHorizonPortfolios(
  shortActions:  SelectedAction[],
  mediumActions: SelectedAction[],
  longActions:   SelectedAction[],
  reasoningTarget: RatingGrade,
): { short: HorizonPortfolio; medium: HorizonPortfolio; long: HorizonPortfolio } {
  const shortCumulative  = shortActions
  const mediumCumulative = [...shortActions, ...mediumActions]
  const longCumulative   = [...shortActions, ...mediumActions, ...longActions]

  const inefficienciesFromActions = (actions: SelectedAction[]) =>
    [...new Set(actions
      .filter(a => a.productivityRepairStrength === 'PRIMARY' || a.productivityRepairStrength === 'STRONG')
      .map(a => a.productivityRepairStrength)
    )]

  return {
    short: {
      horizon:                   'short',
      actions:                   shortActions,
      cumulativeActions:         shortCumulative,
      targetRatingAtThisHorizon: reasoningTarget,
      notchesGainedCumulative:   0,
      totalAmountTRY:            shortCumulative.reduce((s, a) => s + a.amountTRY, 0),
      keyInefficienciesRepaired: inefficienciesFromActions(shortCumulative),
    },
    medium: {
      horizon:                   'medium',
      actions:                   mediumActions,
      cumulativeActions:         mediumCumulative,
      targetRatingAtThisHorizon: reasoningTarget,
      notchesGainedCumulative:   0,
      totalAmountTRY:            mediumCumulative.reduce((s, a) => s + a.amountTRY, 0),
      keyInefficienciesRepaired: inefficienciesFromActions(mediumCumulative),
    },
    long: {
      horizon:                   'long',
      actions:                   longActions,
      cumulativeActions:         longCumulative,
      targetRatingAtThisHorizon: reasoningTarget,
      notchesGainedCumulative:   0,
      totalAmountTRY:            longCumulative.reduce((s, a) => s + a.amountTRY, 0),
      keyInefficienciesRepaired: inefficienciesFromActions(longCumulative),
    },
  }
}

// ─── FEASIBILITY ASSESSMENT ───────────────────────────────────────────────────

function assessFeasibility(
  requestedTarget:  RatingGrade,
  achievableTarget: RatingGrade,
  bindingCeiling:   unknown,
  productivity:     { productivityScore: number },
): FeasibilityAssessment {
  if (ratingToIndex(requestedTarget) <= ratingToIndex(achievableTarget)) {
    return {
      requestedTarget, achievableTarget,
      isFeasible: true,
      reason:     'İstenen hedef rating ulaşılabilir',
      requirements: [],
    }
  }

  const gap          = ratingToIndex(requestedTarget) - ratingToIndex(achievableTarget)
  const requirements: string[] = []

  const bc = bindingCeiling as { source?: string; maxRating?: string } | null
  if (bc?.source && bc?.maxRating) {
    requirements.push(
      `${bc.source} tavanı ${bc.maxRating} seviyesinde — ` +
      `bu tavanı aşmak için ${bc.source.toLowerCase()} köklü biçimde iyileştirilmeli`
    )
  }

  if (productivity.productivityScore < 0.30) {
    requirements.push(
      'Aktif verimliliği %30 altında — ' +
      'satış artışı, stok nakde dönüşüm ve atıl duran varlıkların elden çıkarılması önceliklendirilmeli'
    )
  }

  return {
    requestedTarget, achievableTarget,
    isFeasible: false,
    reason:
      `İstenen hedef ${gap} kategori uzakta. ` +
      `Mevcut bilanço ve operasyonel yapıyla bu kategoriye ulaşmak mümkün görünmüyor.`,
    requirements,
  }
}

// ─── YARDIMCILAR ─────────────────────────────────────────────────────────────

function buildProductivityInput(ctx: FirmContext, portfolio: SelectedAction[]) {
  const b = ctx.accountBalances
  return {
    sector:            ctx.sector,
    totalAssets:       ctx.totalAssets,
    cashAndEquivalents: sumByCodes(b, ['100','101','102','103','108']),
    tradeReceivables:  sumByCodes(b, ['120','121']),
    inventory:         sumByCodes(b, ['150','151','152','153']),
    workInProgress:    sumByCodes(b, ['350','351','352','353','354','355','356','357','358']),
    advancesGiven:     sumByCodes(b, ['159','179','259']),
    prepaidExpenses:   sumByCodes(b, ['180']),
    fixedAssetsNet:    sumByCodes(b, ['252','253','254','255']),
    netSales:          ctx.netSales,
    costOfGoodsSold:   ctx.netSales - ctx.grossProfit,
    grossProfit:       ctx.grossProfit,
    operatingProfit:   ctx.operatingProfit,
    operatingCashFlow: ctx.operatingCashFlow ?? undefined,
    proposedActions:   portfolio.map(p => ({ actionId: p.actionId, amountTRY: p.amountTRY })),
  }
}

function buildSustainabilityInput(
  ctx:       FirmContext,
  portfolio: SelectedAction[],
  currentRating?: RatingGrade,
  targetRating?:  RatingGrade,
) {
  // PortfolioAction[] - her aksiyon icin quality result hesapla
  const portfolioActions: SustPortfolioAction[] = portfolio.map(sa => {
    const action = ACTION_CATALOG_V3[sa.actionId]
    if (!action) return null

    const txs = action.buildTransactions({
      sector: ctx.sector, horizon: sa.horizon,
      analysis: ctx.accountBalances as unknown,
      amount: sa.amountTRY, previousActions: [],
    })

    const qr: QualityResult = calculateQuality({
      template: action, transactions: txs, sector: ctx.sector,
      repeatIndex: 1, rawScoreDelta: 1.0,
    })

    return { template: action, qualityResult: qr, amountTRY: sa.amountTRY }
  }).filter((x): x is SustPortfolioAction => x !== null)

  return {
    incomeStatement: {
      accounts:     ctx.accountBalances,
      netIncome:    ctx.netIncome,
      totalRevenue: ctx.totalRevenue,
    },
    portfolio:    portfolioActions,
    currentRating: currentRating ? String(currentRating) : undefined,
    targetRating:  targetRating  ? String(targetRating)  : undefined,
  }
}

function buildGuardrailResults(
  ctx:       FirmContext,
  portfolio: SelectedAction[],
) {
  return portfolio.flatMap(a => {
    const action = ACTION_CATALOG_V3[a.actionId]
    if (!action) return []

    const report = checkActionGuardrails({
      action,
      transactions:                a.transactions,
      proposedAmountTRY:           a.amountTRY,
      accountBalances:             ctx.accountBalances,
      firmContext: {
        totalAssets:   ctx.totalAssets,
        totalEquity:   ctx.totalEquity,
        totalRevenue:  ctx.totalRevenue,
        netIncome:     ctx.netIncome,
        sector:        ctx.sector,
      },
      horizon:                     a.horizon,
      previouslySelectedActionIds: portfolio.filter(x => x !== a).map(x => x.actionId),
    })
    return report.results
  })
}

function estimateNotchContribution(breakdown: ScoreBreakdown): number {
  const repairMap: Record<string, number> = {
    PRIMARY: 2.0, STRONG: 1.0, MODERATE: 0.5, WEAK: 0.2, NONE: 0.0,
  }
  const base = repairMap[breakdown.productivityRepairStrength] ?? 0.0
  return base * breakdown.repeatDecay * (1 - breakdown.diversityPenalty)
}

// ─── ANA FONKSIYON runEngineV3 ────────────────────────────────────────────────

export function runEngineV3(input: EngineInput): EngineResult {
  const algorithmTrace:     string[]                                      = []
  const rejectedCandidates: Array<{ actionId: string; reason: string }>   = []
  const decisionTrace:      DecisionTraceNode[]                           = []

  const aggressiveness  = input.options?.aggressiveness ?? 'typical'
  const allowedIds      = input.options?.allowedActionIds
  const disallowedIds   = input.options?.disallowedActionIds

  algorithmTrace.push(`Engine V3 started - sector: ${input.sector}, current: ${input.currentRating}, target: ${input.targetRating ?? 'auto'}`)

  // ── FAZ 1: HAZIRLIK ───────────────────────────────────────────────────────
  let workingContext = buildInitialFirmContext(input)

  // ── FAZ 2: HORIZON GREEDY SELECTION ──────────────────────────────────────
  const shortMax  = input.options?.maxActionsPerHorizon ?? HORIZON_LIMITS.short.maxActions
  const mediumMax = HORIZON_LIMITS.medium.maxActions
  const longMax   = HORIZON_LIMITS.long.maxActions

  const shortActions = runGreedySelection(
    workingContext, 'short', [], shortMax, aggressiveness,
    rejectedCandidates, algorithmTrace, decisionTrace, allowedIds, disallowedIds,
  )
  for (const a of shortActions) {
    workingContext = updateFirmContextFromTransactions(workingContext, a.transactions)
  }

  const mediumActions = runGreedySelection(
    workingContext, 'medium', shortActions, mediumMax, aggressiveness,
    rejectedCandidates, algorithmTrace, decisionTrace, allowedIds, disallowedIds,
  )
  for (const a of mediumActions) {
    workingContext = updateFirmContextFromTransactions(workingContext, a.transactions)
  }

  const longActions = runGreedySelection(
    workingContext, 'long', [...shortActions, ...mediumActions], longMax, aggressiveness,
    rejectedCandidates, algorithmTrace, decisionTrace, allowedIds, disallowedIds,
  )
  for (const a of longActions) {
    workingContext = updateFirmContextFromTransactions(workingContext, a.transactions)
  }

  let fullPortfolio = [...shortActions, ...mediumActions, ...longActions]

  // ── FAZ 3: ILK KATMAN ANALIZI ─────────────────────────────────────────────
  const productivityInputV1  = buildProductivityInput(workingContext, fullPortfolio)
  let   productivity         = analyzeAssetProductivity(productivityInputV1)

  const sustainabilityInputV1 = buildSustainabilityInput(
    workingContext, fullPortfolio, input.currentRating, input.targetRating
  )
  let sustainability = analyzeSustainability(sustainabilityInputV1)

  const sectorMetrics = computeSectorMetrics(workingContext)
  const sector        = analyzeSectorIntelligence({ sector: input.sector, metrics: sectorMetrics })

  let guardrailResults = buildGuardrailResults(workingContext, fullPortfolio)

  const defaultTarget: RatingGrade = input.targetRating ?? 'BB'

  // PATCH 1: Portfoyun toplam notch kapasitesini hesapla (FAZ 3 sonrasi)
  const portfolioNotchCapacityV1 = fullPortfolio.reduce(
    (sum, action) => sum + (action.estimatedNotchContribution ?? 0), 0,
  )

  let reasoning = analyzeRatingReasoning({
    currentRating:      input.currentRating,
    rawTargetRating:    defaultTarget,
    qualityResults:     [],
    sustainability,
    sector,
    guardrail: {
      results:         guardrailResults,
      hasHardReject:   guardrailResults.some(r => r.severity === 'HARD_REJECT'),
      hasSoftBlock:    guardrailResults.some(r => r.severity === 'SOFT_BLOCK'),
      hasWarning:      guardrailResults.some(r => r.severity === 'WARNING'),
      highestSeverity: guardrailResults.some(r => r.severity === 'HARD_REJECT')
        ? 'HARD_REJECT'
        : guardrailResults.some(r => r.severity === 'SOFT_BLOCK')
          ? 'SOFT_BLOCK' : 'PASS',
    },
    productivity,
    portfolioActionIds: fullPortfolio.map(a => a.actionId),
    portfolioNotchCapacity: portfolioNotchCapacityV1,  // PATCH 1
  })

  // ── FAZ 4: LOCAL REPAIR ───────────────────────────────────────────────────
  const repaired = runLocalRepair(
    fullPortfolio, workingContext, reasoning.missedOpportunities,
    algorithmTrace, decisionTrace,
  )

  if (repaired.length > fullPortfolio.length) {
    fullPortfolio = repaired
    const newActions = repaired.slice(fullPortfolio.length)
    let repairCtx = workingContext
    for (const a of newActions) {
      repairCtx = updateFirmContextFromTransactions(repairCtx, a.transactions)
    }
    workingContext = repairCtx

    // Katmanlari yeniden calistir
    const prodInput2   = buildProductivityInput(workingContext, fullPortfolio)
    productivity       = analyzeAssetProductivity(prodInput2)

    const sustInput2   = buildSustainabilityInput(workingContext, fullPortfolio, input.currentRating, input.targetRating)
    sustainability     = analyzeSustainability(sustInput2)

    guardrailResults   = buildGuardrailResults(workingContext, fullPortfolio)

    // PATCH 1: Repair sonrasi guncellenmis kapasite
    const portfolioNotchCapacityV2 = fullPortfolio.reduce(
      (sum, action) => sum + (action.estimatedNotchContribution ?? 0), 0,
    )

    reasoning = analyzeRatingReasoning({
      currentRating:   input.currentRating,
      rawTargetRating: defaultTarget,
      qualityResults:  [],
      sustainability,
      sector,
      guardrail: {
        results:         guardrailResults,
        hasHardReject:   guardrailResults.some(r => r.severity === 'HARD_REJECT'),
        hasSoftBlock:    guardrailResults.some(r => r.severity === 'SOFT_BLOCK'),
        hasWarning:      guardrailResults.some(r => r.severity === 'WARNING'),
        highestSeverity: 'PASS',
      },
      productivity,
      portfolioActionIds: fullPortfolio.map(a => a.actionId),
      portfolioNotchCapacity: portfolioNotchCapacityV2,  // PATCH 1
    })
  }

  // ── FAZ 5: OUTPUT YAPISI ──────────────────────────────────────────────────
  const shortFinal  = fullPortfolio.filter(a => a.horizon === 'short')
  const mediumFinal = fullPortfolio.filter(a => a.horizon === 'medium')
  const longFinal   = fullPortfolio.filter(a => a.horizon === 'long')

  const horizons = buildHorizonPortfolios(
    shortFinal, mediumFinal, longFinal,
    reasoning.transition.finalTargetRating,
  )

  const feasibility = input.targetRating
    ? assessFeasibility(input.targetRating, reasoning.transition.finalTargetRating, reasoning.bindingCeiling, productivity)
    : undefined

  algorithmTrace.push(
    `Engine V3 completed - ${fullPortfolio.length} actions,` +
    ` ${reasoning.transition.notchesGained} notches,` +
    ` final: ${reasoning.transition.finalTargetRating},` +
    ` confidence: ${reasoning.transition.confidence}`
  )

  return {
    version:             'v3',
    sector:              input.sector,
    currentRating:       input.currentRating,
    rawTargetRating:     defaultTarget,
    finalTargetRating:   reasoning.transition.finalTargetRating,
    notchesGained:       reasoning.transition.notchesGained,
    confidence:          reasoning.transition.confidence,
    confidenceModifier:  reasoning.transition.confidenceModifier,
    horizons,
    portfolio:           fullPortfolio,
    feasibility,
    reasoning: {
      bindingCeiling:      reasoning.bindingCeiling,
      supportingCeilings:  reasoning.supportingCeilings,
      drivers:             reasoning.drivers,
      missedOpportunities: reasoning.missedOpportunities,
      oneNotchScenario:    reasoning.oneNotchScenario,
      twoNotchScenario:    reasoning.twoNotchScenario,
      sensitivityAnalysis: reasoning.sensitivityAnalysis,
      bankerSummary:       reasoning.bankerSummary,
      transition:          reasoning.transition,  // PATCH 1
    },
    layerSummaries: {
      productivity,
      sustainability,
      sector,
      guardrails: guardrailResults,
    },
    decisionTrace,
    debug: {
      iterations:         algorithmTrace.length,
      rejectedCandidates,
      ledgerChangeLog:    [],
      algorithmTrace,
    },
  }
}

/**
 * GELECEKTEKI IYILESTIRMELER (ChatGPT review - V3 sonrasi):
 *
 * 1. NONLINEAR SCORING — Su an scoreCandidate lineer carpim.
 *    Ileride nonlinear weighting: PRIMARY repair sustainability dususu bastirsin.
 *
 * 2. BOUNDED RECURSIVE REPAIR — Local repair su an tek pass. Eklenen aksiyon
 *    yeni missed opportunity yaratabilir. Bounded (max 2 pass) recursive repair.
 *
 * 3. OPERASYONEL KAPASITE REALISM — Net sales +200% teknik mumkun gorunur ama
 *    calisan/fabrika/kapasite yoksa gercekci degil. Firma buyuklugune gore sinir.
 *
 * 4. ACTION EXPIRY — Short aksiyonu long horizon'da anlamsiz olabilir
 *    (gecici nakit tamponu 3 yil sonra alakasiz).
 *
 * 5. LEDGER SIMULATION CACHE — Ayni action+amount tekrar tekrar simule ediliyor.
 *    Memoization performans kazandirir.
 *
 * 6. PORTFOLIO STABILITY SCORE — V3-9 confidence var ama portfoy stabilite
 *    (agresif amount + cok aksiyon + yuksek dependency) ayrica olculmeli.
 *
 * 7. ADAPTIVE maxIterations — 50 sabit. Kucuk firmada fazla, buyukte az.
 *
 * 8. NOTCH CONTRIBUTION CALIBRATION — PRIMARY=2 heuristic. Backtest gerekir.
 *
 * 9. SECTOR FEEDBACK LOOP — Aksiyon sonrasi firma sektor normuna yaklasinca
 *    scoring degismeli.
 *
 * 10. PORTFOLIO COST-OF-EXECUTION — Hukuki zorluk, operasyonel zorluk, zaman
 *     maliyeti eklenmeli.
 *
 * 11. MULTI-PORTFOLIO BRANCHING — liquidity-first / growth-first / deleverage-first
 *     alternatif stratejiler.
 *
 * 12. BEAM SEARCH — K-best portfoy paralel. Greedy'nin lokal optima sorununu asmak.
 *
 * 13. TRANSACTION-LEVEL LIQUIDITY CONTINUITY — Kumulatif nakit izleme her adimda.
 *
 * 14. WEIGHTED DEPENDENCY — preferredAfter binary yerine tutar agirlikli
 *     (A04 50M gerekiyor, A05 20M uretti - yetersiz).
 *
 * 15. BACKTESTING HARNESS — Gercek firma verisiyle algoritmanin test edilmesi.
 */
