# Finrate — Senaryo Motoru Tam Mimari Dokümantasyonu
> ChatGPT için hazırlanmıştır — 2026-04-23
> Bu dosya tüm kaynak kodları, canlı test verisi ve motor çıktısını içermektedir.

---

## Bölüm 1 — Proje Genel Bakış

**Finrate**, Türk KOBİ'leri için banka kalitesi finansal değerlendirme platformudur.

- **Stack:** Next.js 15, TypeScript, Prisma ORM, NeonDB (Postgres), Vercel
- **Scoring Modeli:** v3.0 Hibrit — 4 kategori (Likidite %25, Karlılık %30, Kaldıraç %30, Faaliyet %15)
- **Hesap Sistemi:** Türk TDHP (Tek Düzen Hesap Planı), kodlar 100–692
- **Rating Bantları:** CCC(44), B(52), BB(60), BBB(68), A(76), AA(84), AAA(93)
- **Senaryo Motoru:** Greedy iteratif, 14 aksiyon (A01–A14), 3 ufuk (short/medium/long)

**Mevcut Motor Durumu:**  
DEKAM 2024 (imalat sektörü, BB hedefi) → Short: atlandı, Medium: 50.0→50.5 (kısmi), Long: 50.0→65.3 BB **TARGET_REACHED**. Ancak long'daki tek aksiyon A10 (Sermaye Artırımı) ×3 tekrardır — motor bağımsız çalışmayı başaramıyor.

---

## Bölüm 2 — Dosya Ağacı (`src/lib/scoring` + ilgili dosyalar)

```
src/lib/scoring/
├── ratios.ts              # 25-rasyo hesaplayıcı (FinancialInput → RatioResult)
├── score.ts               # Hibrit scoring v3.0 (RatioResult + sektör → ScoringResult)
├── benchmarks.ts          # Sektör benchmark değerleri (median, ağırlıklar)
├── chartOfAccounts.ts     # Tam TDHP — 100-692 arası hesap meta verisi (contra, side)
├── accountMapper.ts       # Aggregate ↔ hesap kodu dönüşüm (mapFinancialDataToAccounts, rebuildAggregateFromAccounts)
├── reversalMap.ts         # Ters bakiye reklasifikasyon kuralları
└── scenario/
    ├── contracts.ts           # Tüm tip tanımları + sabitler (ActionId, SixGroupAnalysis, ActionEffect…)
    ├── analyzer.ts            # buildSixGroupAnalysis() — ham hesaplar → SixGroupAnalysis
    ├── candidateGenerator.ts  # generateCandidates() — ActionCandidate[] üretir
    ├── applier.ts             # applyCandidate() — aksiyon uygulama + skor hesabı
    ├── engine.ts              # runScenarioEngine() — 3 ufuk senaryosu, greedy loop
    ├── actionCatalog.ts       # 14 ActionTemplate tanımı (A01–A14)
    ├── adaptivePolicy.ts      # Regime × GapBand × UnlockStage politikası
    ├── capMatrix.ts           # CAP_MATRIX, GLOBAL_CAP_MATRIX, SECTOR_MULT
    ├── actionFamilies.ts      # 3 aile: WC_COMPOSITION, DEBT_STRUCTURE, EQUITY_PNL
    ├── dynamicThresholds.ts   # computeDynamicThresholds() — boyut × stres × gap
    ├── dynamicMicroFilter.ts  # computeDynamicMicroFilter() — sektör × stres
    ├── dynamicPreconditions.ts # evaluateA04/A05/A06/A07 dinamik ön koşulları
    └── sectorProfiles.ts      # 6 sektör profili + mapSectorToCode()

src/app/api/scenarios/v2/route.ts    # POST /api/scenarios/v2 — motor giriş noktası
src/components/analysis/ScenarioPanelV2.tsx  # UI bileşeni — 3 senaryo + eligibility tablosu
```

---

## Bölüm 3 — Senaryo Motoru: 13 Dosyanın Tam İçeriği

### 3.1 contracts.ts

```typescript
// contract-version: 1.0.0
// all monetary values are TRY (number), ratios are decimal (0.25 = %25)

export type GroupCode =
  | "CURRENT_ASSETS"          // 100-199
  | "NON_CURRENT_ASSETS"      // 200-299
  | "SHORT_TERM_LIABILITIES"  // 300-399
  | "LONG_TERM_LIABILITIES"   // 400-499
  | "EQUITY"                  // 500-599
  | "INCOME_STATEMENT"        // 600-699
  | "EXTERNAL"                // action funding only (e.g., capital injection)

export type SectorCode =
  | "CONSTRUCTION"
  | "MANUFACTURING"
  | "TRADE"
  | "SERVICES"
  | "RETAIL"
  | "IT"

export type FeasibilityLevel = "HIGH" | "MEDIUM" | "LOW" | "BLOCKED"
export type DistributionMode = "LARGEST_FIRST" | "PROPORTIONAL" | "HYBRID_70_30"

export type AmountBasis =
  | "SOURCE_GROUP_TOTAL"
  | "ELIGIBLE_SOURCE_TOTAL"
  | "BALANCE_SHEET_TOTAL"
  | "INCOME_STATEMENT_TOTAL"
  | "REVENUE_TOTAL"
  | "TARGET_GAP_CLOSURE"

export type RatioCode =
  | "CURRENT_RATIO"
  | "QUICK_RATIO"
  | "CASH_RATIO"
  | "NET_WORKING_CAPITAL_RATIO"
  | "DEBT_TO_EQUITY"
  | "EQUITY_RATIO"
  | "INTEREST_COVERAGE"
  | "NET_DEBT_TO_EBITDA"

export type ActionId =
  | "A01_ST_FIN_DEBT_TO_LT"
  | "A02_TRADE_PAYABLE_TO_LT"
  | "A03_ADVANCE_TO_LT"
  | "A04_CASH_PAYDOWN_ST"
  | "A05_RECEIVABLE_COLLECTION"
  | "A06_INVENTORY_OPTIMIZATION"
  | "A07_PREPAID_EXPENSE_RELEASE"
  | "A08_FIXED_ASSET_DISPOSAL"
  | "A09_SALE_LEASEBACK"
  | "A10_EQUITY_INJECTION"
  | "A11_EARNINGS_RETENTION"
  | "A12_GROSS_MARGIN_IMPROVEMENT"
  | "A13_OPEX_OPTIMIZATION"
  | "A14_FINANCE_COST_OPTIMIZATION"

export interface AccountLine {
  accountCode: string
  accountName: string
  group: GroupCode
  amount: number
  shareInGroup: number
  shareInBalanceSheet: number
  tags?: string[]
  isMicro: boolean
  eligibleForActions: ActionId[]
}

export interface GroupTopComposition {
  top3: AccountLine[]
  top3Share: number
  top1Share: number
  hhi: number
}

export interface BenchmarkComparison {
  metricKey: string
  p25: number
  median: number
  p75: number
  companyValue: number
  gapToMedian: number
  zScore?: number
  inRange: boolean
}

export interface GroupAnalysis {
  group: GroupCode
  total: number
  shareOfReferenceBase: number
  composition: GroupTopComposition
  benchmarkComparisons: BenchmarkComparison[]
  improvableItems: string[]
  materialityScore: number
  manageabilityScore: number
  costScore: number
  basePriorityScore: number
}

export interface RatioValue {
  code: RatioCode
  value: number
  benchmarkMedian?: number
  gapToTarget?: number
}

export interface SixGroupAnalysis {
  schemaVersion: "1.0.0"
  scenarioId: string
  companyId: string
  asOfDate: string
  currency: "TRY"
  sector: SectorCode
  totals: {
    assets: number
    liabilitiesAndEquity: number
    incomeStatementTotal: number
    revenueTotal?: number
  }
  groups: Record<Exclude<GroupCode, "EXTERNAL">, GroupAnalysis>
  accounts: AccountLine[]
  ratios: Record<RatioCode, RatioValue>
  benchmarkSetId: string
  warnings?: string[]
}

export interface AmountRangeRule {
  basis: AmountBasis
  minPct: number
  suggestedPct: number
  maxPct: number
  absoluteMin?: number
  absoluteMax?: number
  targetMaxPctOfTargetGroup?: number
  globalMaxPctOfAssets?: number
}

export interface AccountMappingRule {
  sourceAccountPrefixes: string[]
  targetAccountPrefixes: string[]
  mappingMode: "ONE_TO_ONE_PREFIX" | "ONE_TO_MANY" | "MANY_TO_ONE"
  note?: string
}

export interface ConditionRule {
  key: string
  operator: ">" | ">=" | "<" | "<=" | "=" | "!="
  value: number
}

export interface KpiImpactDescriptor {
  ratio: RatioCode
  expectedDirection: "UP" | "DOWN"
  strength: "LOW" | "MEDIUM" | "HIGH"
}

export interface ActionTemplate {
  id: ActionId
  name: string
  sourceGroup: GroupCode
  targetGroup: GroupCode
  amountRule: AmountRangeRule
  distributionDefault: DistributionMode
  accountMappings: AccountMappingRule[]
  preconditions: ConditionRule[]
  postConditions?: ConditionRule[]
  sectorFeasibility: Record<SectorCode, FeasibilityLevel>
  expectedKpiEffects: KpiImpactDescriptor[]
  baseManageability: number
  implementationCostIndex: number
  confidence: number
  conflictsWith: ActionId[]
  synergiesWith: ActionId[]
}

export interface AccountMovement {
  accountCode: string
  delta: number
}

export interface ActionEffect {
  schemaVersion: "1.0.0"
  scenarioId: string
  actionId: ActionId
  distributionModeApplied: DistributionMode
  amountRequested: number
  amountApplied: number
  beforeRatios: Record<RatioCode, number>
  afterRatios: Record<RatioCode, number>
  ratioDelta: Record<RatioCode, number>
  groupDelta: Record<Exclude<GroupCode, "EXTERNAL">, number>
  accountMovements: AccountMovement[]
  constraintsTriggered: string[]
  warnings: string[]
  scoreBreakdown: {
    materiality: number
    manageability: number
    costScore: number
    feasibilityMultiplier: number
    impactMultiplier: number
    confidenceMultiplier: number
    finalPriorityScore: number
  }
  targetGroupImpact?: number
  balanceSheetImpact?: number
  bindingCap?: 'targetGroup' | 'assets' | 'range' | null
  actualScoreDelta: number
  scoreBeforeAction: number
  scoreAfterAction: number
  afterAnalysis: SixGroupAnalysis
}

export type ActionEligibilityStatus = 'SELECTED' | 'ELIGIBLE' | 'REJECTED' | 'NOT_EVALUABLE' | 'NOT_SELECTED_TARGET_REACHED'

export type RejectionReasonCode =
  | 'NOT_IN_HORIZON'
  | 'PRECONDITION_FAIL'
  | 'NO_ELIGIBLE_SOURCE'
  | 'MATERIALITY_FAIL'
  | 'EFFICIENCY_FAIL'
  | 'SHOCK_GUARDRAIL'
  | 'CUM_GUARDRAIL_EQUITY_PP'
  | 'CUM_GUARDRAIL_KVYK_PP'
  | 'CUM_GUARDRAIL_GROUP_SHARE_DETERIORATION'
  | 'CUM_GUARDRAIL_ABSOLUTE_HARD_STOP'
  | 'CONFLICTED_OUT'
  | 'DATA_MISSING_PNL'
  | 'REPEATED_MAX'
  | 'ZERO_IMPACT'
  | 'HARD_REJECT'

export interface ActionEligibilityReport {
  actionId: string
  actionName: string
  family: 'WC_COMPOSITION' | 'DEBT_STRUCTURE' | 'EQUITY_PNL'
  status: ActionEligibilityStatus
  reasonCode?: RejectionReasonCode
  reasonMessage?: string
  proposedAmount?: number
  scoreDelta?: number
  balanceSheetImpact?: number
  priorityScore?: number
  selectionCount?: number
}

export interface MeaningfulImpactThresholds {
  minCurrentRatioDelta: number
  minEquityRatioDelta: number
  minInterestCoverageDelta: number
  minNetWorkingCapitalDeltaPctAssets: number
  minQuickRatioDelta: number
  minCashRatioDelta: number
  minDsoImprovementDays: number
  minCccImprovementDays: number
}

export interface MicroFilterConfig {
  minLineShareInGroup: number
  minLineAmountTry: number
  minActionAmountPctAssets: number
  maxMicroContributionShare: number
}

export interface SectorProfile {
  sector: SectorCode
  normalRanges: Record<string, { min: number; median: number; max: number }>
  priorityActions: ActionId[]
  discouragedActions: ActionId[]
  blockedActions: ActionId[]
  warningRules: Array<{
    id: string
    when: ConditionRule[]
    severity: "INFO" | "WARN" | "CRITICAL"
    message: string
  }>
  thresholdOverrides?: Partial<MeaningfulImpactThresholds>
}

export const DEFAULT_THRESHOLDS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.03,
  minEquityRatioDelta: 0.005,
  minInterestCoverageDelta: 0.20,
  minNetWorkingCapitalDeltaPctAssets: 0.003,
  minQuickRatioDelta: 0.025,
  minCashRatioDelta: 0.010,
  minDsoImprovementDays: 2,
  minCccImprovementDays: 3,
}

export const THRESHOLD_FLOORS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.01,
  minEquityRatioDelta: 0.002,
  minInterestCoverageDelta: 0.05,
  minNetWorkingCapitalDeltaPctAssets: 0.001,
  minQuickRatioDelta: 0.010,
  minCashRatioDelta: 0.004,
  minDsoImprovementDays: 1,
  minCccImprovementDays: 1,
}

export const THRESHOLD_CEILINGS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.05,
  minEquityRatioDelta: 0.008,
  minInterestCoverageDelta: 0.30,
  minNetWorkingCapitalDeltaPctAssets: 0.006,
  minQuickRatioDelta: 0.040,
  minCashRatioDelta: 0.020,
  minDsoImprovementDays: 5,
  minCccImprovementDays: 7,
}

export const DEFAULT_MICRO_FILTER: MicroFilterConfig = {
  minLineShareInGroup: 0.05,
  minLineAmountTry: 2_000_000,
  minActionAmountPctAssets: 0.002,
  maxMicroContributionShare: 0.30,
}

export const SCORE_EPS = 1e-6
export const MIN_EXECUTION_SCORE = 0.1
export const MIN_EXECUTION_SCORE_SHORT  = 0.1
export const MIN_EXECUTION_SCORE_MEDIUM = 0.1
export const MIN_EXECUTION_SCORE_LONG   = 0.05
export const MAX_ACTIONS_SHORT  = 3
export const MAX_ACTIONS_MEDIUM = 6
export const MAX_ACTIONS_LONG   = 12
export const MAX_REPEAT_PER_ACTION_LONG = 3
export const MIN_DISPLAY_SCORE = 0.5

export interface ShockGuardrails {
  maxGroupChangePct: number
  maxTotalAssetChangePct: number
  maxEquityChangePct: number
}

export const DEFAULT_SHOCK_GUARDRAILS: ShockGuardrails = {
  maxGroupChangePct: 0.40,
  maxTotalAssetChangePct: 0.25,
  maxEquityChangePct: 0.30,
}

export interface SectorDeviationThresholds {
  maxCurrentRatioDeviation: number
  maxEquityRatioDeviation: number
}

export const DEFAULT_SECTOR_DEVIATION: SectorDeviationThresholds = {
  maxCurrentRatioDeviation: 2.0,
  maxEquityRatioDeviation: 0.40,
}
```

---

### 3.2 analyzer.ts

```typescript
import type {
  AccountLine, GroupCode, GroupAnalysis, GroupTopComposition,
  SixGroupAnalysis, RatioCode, RatioValue, SectorCode,
  MicroFilterConfig, ActionId,
} from './contracts'
import { DEFAULT_MICRO_FILTER } from './contracts'
import { CHART_OF_ACCOUNTS } from '../chartOfAccounts'
import { mapSectorToCode } from './sectorProfiles'

export function codeToGroup(code: string): GroupCode | null {
  const num = parseInt(code, 10)
  if (isNaN(num)) return null
  if (num >= 100 && num < 200) return "CURRENT_ASSETS"
  if (num >= 200 && num < 300) return "NON_CURRENT_ASSETS"
  if (num >= 300 && num < 400) return "SHORT_TERM_LIABILITIES"
  if (num >= 400 && num < 500) return "LONG_TERM_LIABILITIES"
  if (num >= 500 && num < 600) return "EQUITY"
  if (num >= 600 && num < 700) return "INCOME_STATEMENT"
  return null
}

function eligibleActionsForAccount(code: string): ActionId[] {
  const eligible: ActionId[] = []
  if (code.startsWith('300') || code.startsWith('303') || code.startsWith('304')) eligible.push('A01_ST_FIN_DEBT_TO_LT')
  if (code.startsWith('320') || code.startsWith('321')) eligible.push('A02_TRADE_PAYABLE_TO_LT')
  if (code.startsWith('340')) eligible.push('A03_ADVANCE_TO_LT')
  if (code === '102') { eligible.push('A04_CASH_PAYDOWN_ST') }
  if (code.startsWith('120') || code.startsWith('121')) eligible.push('A05_RECEIVABLE_COLLECTION')
  if (code.startsWith('150') || code.startsWith('151') || code.startsWith('153')) eligible.push('A06_INVENTORY_OPTIMIZATION')
  if (code.startsWith('180')) eligible.push('A07_PREPAID_EXPENSE_RELEASE')
  if (code.startsWith('250') || code.startsWith('252') || code.startsWith('253')) {
    eligible.push('A08_FIXED_ASSET_DISPOSAL')
    if (code.startsWith('252')) eligible.push('A09_SALE_LEASEBACK')
  }
  if (code.startsWith('620') || code.startsWith('621') || code.startsWith('622')) eligible.push('A12_GROSS_MARGIN_IMPROVEMENT')
  if (code.startsWith('630') || code.startsWith('631') || code.startsWith('632')) eligible.push('A13_OPEX_OPTIMIZATION')
  if (code.startsWith('660') || code.startsWith('661')) eligible.push('A14_FINANCE_COST_OPTIMIZATION')
  if (code === '590') eligible.push('A11_EARNINGS_RETENTION')
  return eligible
}

function calculateHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0)
}

function computeComposition(lines: AccountLine[]): GroupTopComposition {
  const sorted = [...lines].sort((a, b) => b.amount - a.amount)
  const total = sorted.reduce((s, l) => s + l.amount, 0)
  const top3 = sorted.slice(0, 3)
  const top1Share = total > 0 ? (top3[0]?.amount ?? 0) / total : 0
  const top3Share = total > 0 ? top3.reduce((s, l) => s + l.amount, 0) / total : 0
  const allShares = total > 0 ? sorted.map(l => l.amount / total) : []
  const hhi = calculateHHI(allShares)
  return { top3, top3Share, top1Share, hhi }
}

function computeGroupScores(total: number, assetsTotal: number, group: GroupCode): {
  materialityScore: number
  manageabilityScore: number
  costScore: number
} {
  const shareOfAssets = assetsTotal > 0 ? total / assetsTotal : 0
  const materiality = Math.min(1, shareOfAssets / 0.5)
  const manageabilityByGroup: Record<GroupCode, number> = {
    CURRENT_ASSETS: 0.75, NON_CURRENT_ASSETS: 0.40, SHORT_TERM_LIABILITIES: 0.70,
    LONG_TERM_LIABILITIES: 0.55, EQUITY: 0.50, INCOME_STATEMENT: 0.65, EXTERNAL: 0.60,
  }
  const costByGroup: Record<GroupCode, number> = {
    CURRENT_ASSETS: 0.80, NON_CURRENT_ASSETS: 0.45, SHORT_TERM_LIABILITIES: 0.70,
    LONG_TERM_LIABILITIES: 0.60, EQUITY: 0.40, INCOME_STATEMENT: 0.65, EXTERNAL: 0.50,
  }
  return {
    materialityScore: materiality,
    manageabilityScore: manageabilityByGroup[group],
    costScore: costByGroup[group],
  }
}

export function buildSixGroupAnalysis(
  accounts: { accountCode: string; amount: number }[],
  options: {
    companyId: string
    scenarioId: string
    sector: string
    asOfDate?: string
    benchmarkSetId?: string
    ratios?: Partial<Record<RatioCode, number>>
    microFilter?: MicroFilterConfig
  }
): SixGroupAnalysis {
  const microCfg = options.microFilter ?? DEFAULT_MICRO_FILTER
  const sectorCode: SectorCode = mapSectorToCode(options.sector)

  const adjusted = accounts.map(a => {
    const meta = CHART_OF_ACCOUNTS[a.accountCode]
    const signedAmount = meta?.contra ? -Math.abs(a.amount) : a.amount
    return { code: a.accountCode, amount: signedAmount, meta }
  }).filter(a => a.amount !== 0)

  const lines: AccountLine[] = adjusted
    .map(a => {
      const group = codeToGroup(a.code)
      if (!group) return null
      return {
        accountCode: a.code,
        accountName: a.meta?.name ?? `Bilinmeyen (${a.code})`,
        group,
        amount: a.amount,
        shareInGroup: 0,
        shareInBalanceSheet: 0,
        isMicro: false,
        eligibleForActions: eligibleActionsForAccount(a.code),
      } as AccountLine
    })
    .filter((l): l is AccountLine => l !== null)

  const groupTotals: Record<Exclude<GroupCode, "EXTERNAL">, number> = {
    CURRENT_ASSETS: 0, NON_CURRENT_ASSETS: 0, SHORT_TERM_LIABILITIES: 0,
    LONG_TERM_LIABILITIES: 0, EQUITY: 0, INCOME_STATEMENT: 0,
  }

  for (const line of lines) {
    if (line.group !== "EXTERNAL") {
      groupTotals[line.group as Exclude<GroupCode, "EXTERNAL">] += line.amount
    }
  }

  const assetsTotal = groupTotals.CURRENT_ASSETS + groupTotals.NON_CURRENT_ASSETS
  const liabilitiesAndEquityTotal =
    groupTotals.SHORT_TERM_LIABILITIES + groupTotals.LONG_TERM_LIABILITIES + groupTotals.EQUITY
  const incomeStatementTotal = Math.abs(groupTotals.INCOME_STATEMENT)
  const revenueTotal = lines
    .filter(l => l.accountCode.startsWith('600') || l.accountCode.startsWith('601') || l.accountCode.startsWith('602'))
    .reduce((s, l) => s + l.amount, 0)

  for (const line of lines) {
    const groupTotal = line.group !== "EXTERNAL" ? groupTotals[line.group as Exclude<GroupCode, "EXTERNAL">] : 0
    line.shareInGroup = groupTotal !== 0 ? Math.abs(line.amount / groupTotal) : 0
    line.shareInBalanceSheet = assetsTotal !== 0 ? Math.abs(line.amount / assetsTotal) : 0
    line.isMicro =
      line.shareInGroup < microCfg.minLineShareInGroup ||
      Math.abs(line.amount) < microCfg.minLineAmountTry
  }

  const groups: Record<Exclude<GroupCode, "EXTERNAL">, GroupAnalysis> = {} as Record<Exclude<GroupCode, "EXTERNAL">, GroupAnalysis>
  const allGroups: Exclude<GroupCode, "EXTERNAL">[] = [
    "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "SHORT_TERM_LIABILITIES",
    "LONG_TERM_LIABILITIES", "EQUITY", "INCOME_STATEMENT",
  ]

  for (const g of allGroups) {
    const groupLines = lines.filter(l => l.group === g)
    const total = groupTotals[g]
    const refBase = g === "INCOME_STATEMENT" ? incomeStatementTotal : liabilitiesAndEquityTotal
    const shareOfRef = refBase !== 0 ? Math.abs(total / refBase) : 0
    const composition = computeComposition(groupLines)
    const scores = computeGroupScores(Math.abs(total), assetsTotal, g)
    const basePriority = 100 * scores.materialityScore * scores.manageabilityScore * scores.costScore
    const improvableItems = composition.top3
      .filter(l => !l.isMicro && l.eligibleForActions.length > 0)
      .map(l => l.accountCode)
    groups[g] = {
      group: g, total, shareOfReferenceBase: shareOfRef, composition,
      benchmarkComparisons: [], improvableItems,
      materialityScore: scores.materialityScore,
      manageabilityScore: scores.manageabilityScore,
      costScore: scores.costScore, basePriorityScore: basePriority,
    }
  }

  const allRatioCodes: RatioCode[] = [
    "CURRENT_RATIO", "QUICK_RATIO", "CASH_RATIO", "NET_WORKING_CAPITAL_RATIO",
    "DEBT_TO_EQUITY", "EQUITY_RATIO", "INTEREST_COVERAGE", "NET_DEBT_TO_EBITDA",
  ]
  const ratios: Record<RatioCode, RatioValue> = {} as Record<RatioCode, RatioValue>
  for (const code of allRatioCodes) {
    ratios[code] = { code, value: options.ratios?.[code] ?? 0 }
  }

  const residualReversals: string[] = []
  for (const a of adjusted) {
    const meta = a.meta
    if (!meta) continue
    if (!meta.contra && a.amount < 0 && (meta.side === 'ASSET' || meta.side === 'EXPENSE')) {
      residualReversals.push(`${a.code} (${meta.name}) negatif bakiye: ${a.amount.toLocaleString('tr-TR')}`)
    }
    if (!meta.contra && a.amount < 0 && (meta.side === 'LIABILITY' || meta.side === 'INCOME' || meta.side === 'EQUITY')) {
      residualReversals.push(`${a.code} (${meta.name}) negatif bakiye (${meta.side}): ${a.amount.toLocaleString('tr-TR')}`)
    }
  }

  return {
    schemaVersion: "1.0.0", scenarioId: options.scenarioId, companyId: options.companyId,
    asOfDate: options.asOfDate ?? new Date().toISOString().slice(0, 10),
    currency: "TRY", sector: sectorCode,
    totals: { assets: assetsTotal, liabilitiesAndEquity: liabilitiesAndEquityTotal, incomeStatementTotal, revenueTotal },
    groups, accounts: lines, ratios,
    benchmarkSetId: options.benchmarkSetId ?? "default_tcmb_2024",
    ...(residualReversals.length > 0 && { warnings: residualReversals }),
  }
}
```

---

### 3.3 actionCatalog.ts

```typescript
import type { ActionId, ActionTemplate } from './contracts'

export const ACTION_CATALOG: Record<ActionId, ActionTemplate> = {
  A01_ST_FIN_DEBT_TO_LT: {
    id: "A01_ST_FIN_DEBT_TO_LT",
    name: "Kısa Vadeli Finansal Borcu Uzun Vadeye Çevir",
    sourceGroup: "SHORT_TERM_LIABILITIES", targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.05, suggestedPct: 0.10, maxPct: 0.30, targetMaxPctOfTargetGroup: 0.20, globalMaxPctOfAssets: 0.08 },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [{ sourceAccountPrefixes: ["300", "303", "304"], targetAccountPrefixes: ["400", "403", "404"], mappingMode: "ONE_TO_ONE_PREFIX", note: "KV banka kredileri → UV banka kredileri" }],
    preconditions: [{ key: "group.SHORT_TERM_LIABILITIES.account.300", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "MEDIUM" },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "LOW" },
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.65, implementationCostIndex: 0.25, confidence: 0.80,
    conflictsWith: ["A04_CASH_PAYDOWN_ST"], synergiesWith: ["A14_FINANCE_COST_OPTIMIZATION"],
  },

  A02_TRADE_PAYABLE_TO_LT: {
    id: "A02_TRADE_PAYABLE_TO_LT",
    name: "Ticari Borcu Uzun Vadeye Yeniden Sınıfla",
    sourceGroup: "SHORT_TERM_LIABILITIES", targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.05, suggestedPct: 0.12, maxPct: 0.25, targetMaxPctOfTargetGroup: 0.18, globalMaxPctOfAssets: 0.08 },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [{ sourceAccountPrefixes: ["320", "321"], targetAccountPrefixes: ["420", "421"], mappingMode: "ONE_TO_ONE_PREFIX" }],
    preconditions: [{ key: "group.SHORT_TERM_LIABILITIES.account.320", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "LOW" },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "NET_WORKING_CAPITAL_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.55, implementationCostIndex: 0.30, confidence: 0.70,
    conflictsWith: [], synergiesWith: [],
  },

  A03_ADVANCE_TO_LT: {
    id: "A03_ADVANCE_TO_LT",
    name: "Alınan Avansları Uzun Vadeye Çevir",
    sourceGroup: "SHORT_TERM_LIABILITIES", targetGroup: "LONG_TERM_LIABILITIES",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.05, suggestedPct: 0.10, maxPct: 0.35, targetMaxPctOfTargetGroup: 0.15, globalMaxPctOfAssets: 0.08 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["340"], targetAccountPrefixes: ["440"], mappingMode: "ONE_TO_ONE_PREFIX", note: "Alınan sipariş avansları KV → UV" }],
    preconditions: [{ key: "group.SHORT_TERM_LIABILITIES.account.340", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM", SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "NET_WORKING_CAPITAL_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.60, implementationCostIndex: 0.20, confidence: 0.75,
    conflictsWith: [], synergiesWith: ["A01_ST_FIN_DEBT_TO_LT"],
  },

  A04_CASH_PAYDOWN_ST: {
    id: "A04_CASH_PAYDOWN_ST",
    name: "Nakit ile Kısa Vadeli Borç Kapat",
    sourceGroup: "CURRENT_ASSETS", targetGroup: "SHORT_TERM_LIABILITIES",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.02, suggestedPct: 0.08, maxPct: 0.20, targetMaxPctOfTargetGroup: 0.12, globalMaxPctOfAssets: 0.08 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["102"], targetAccountPrefixes: ["300", "320"], mappingMode: "ONE_TO_MANY" }],
    preconditions: [{ key: "group.CURRENT_ASSETS.account.102", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM", SERVICES: "MEDIUM", RETAIL: "LOW", IT: "MEDIUM" },
    expectedKpiEffects: [
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "MEDIUM" },
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "DOWN", strength: "MEDIUM" },
    ],
    baseManageability: 0.80, implementationCostIndex: 0.10, confidence: 0.90,
    conflictsWith: ["A01_ST_FIN_DEBT_TO_LT"], synergiesWith: [],
  },

  A05_RECEIVABLE_COLLECTION: {
    id: "A05_RECEIVABLE_COLLECTION",
    name: "Alacak Tahsili Hızlandır",
    sourceGroup: "CURRENT_ASSETS", targetGroup: "CURRENT_ASSETS",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.03, suggestedPct: 0.10, maxPct: 0.25, targetMaxPctOfTargetGroup: 0.10, globalMaxPctOfAssets: 0.05 },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [{ sourceAccountPrefixes: ["120", "121"], targetAccountPrefixes: ["102"], mappingMode: "MANY_TO_ONE" }],
    preconditions: [{ key: "group.CURRENT_ASSETS.account.120", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "HIGH", RETAIL: "HIGH", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.70, implementationCostIndex: 0.25, confidence: 0.75,
    conflictsWith: [], synergiesWith: [],
  },

  A06_INVENTORY_OPTIMIZATION: {
    id: "A06_INVENTORY_OPTIMIZATION",
    name: "Stok Optimizasyonu",
    sourceGroup: "CURRENT_ASSETS", targetGroup: "CURRENT_ASSETS",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.03, suggestedPct: 0.08, maxPct: 0.20, targetMaxPctOfTargetGroup: 0.12, globalMaxPctOfAssets: 0.05 },
    distributionDefault: "HYBRID_70_30",
    accountMappings: [{ sourceAccountPrefixes: ["150", "151", "153"], targetAccountPrefixes: ["102"], mappingMode: "MANY_TO_ONE" }],
    preconditions: [{ key: "group.CURRENT_ASSETS.account.153", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "LOW", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "LOW" },
    expectedKpiEffects: [
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.60, implementationCostIndex: 0.35, confidence: 0.70,
    conflictsWith: [], synergiesWith: [],
  },

  A07_PREPAID_EXPENSE_RELEASE: {
    id: "A07_PREPAID_EXPENSE_RELEASE",
    name: "Peşin Giderleri Serbest Bırak",
    sourceGroup: "CURRENT_ASSETS", targetGroup: "CURRENT_ASSETS",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.02, suggestedPct: 0.06, maxPct: 0.15, targetMaxPctOfTargetGroup: 0.08, globalMaxPctOfAssets: 0.05 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["180"], targetAccountPrefixes: ["102"], mappingMode: "ONE_TO_ONE_PREFIX" }],
    preconditions: [{ key: "group.CURRENT_ASSETS.account.180", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM", SERVICES: "MEDIUM", RETAIL: "MEDIUM", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "LOW" },
      { ratio: "QUICK_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.50, implementationCostIndex: 0.20, confidence: 0.65,
    conflictsWith: [], synergiesWith: [],
  },

  A08_FIXED_ASSET_DISPOSAL: {
    id: "A08_FIXED_ASSET_DISPOSAL",
    name: "Atıl Maddi Duran Varlık Satışı",
    sourceGroup: "NON_CURRENT_ASSETS", targetGroup: "CURRENT_ASSETS",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.02, suggestedPct: 0.07, maxPct: 0.20, targetMaxPctOfTargetGroup: 0.10, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["250", "252", "253"], targetAccountPrefixes: ["102"], mappingMode: "MANY_TO_ONE" }],
    preconditions: [{ key: "group.NON_CURRENT_ASSETS.total", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "LOW", SERVICES: "LOW", RETAIL: "LOW", IT: "LOW" },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.45, implementationCostIndex: 0.45, confidence: 0.55,
    conflictsWith: ["A09_SALE_LEASEBACK"], synergiesWith: [],
  },

  A09_SALE_LEASEBACK: {
    id: "A09_SALE_LEASEBACK",
    name: "Sat-Geri Kirala",
    sourceGroup: "NON_CURRENT_ASSETS", targetGroup: "CURRENT_ASSETS",
    amountRule: { basis: "ELIGIBLE_SOURCE_TOTAL", minPct: 0.03, suggestedPct: 0.10, maxPct: 0.30, targetMaxPctOfTargetGroup: 0.12, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["252"], targetAccountPrefixes: ["102", "430", "431"], mappingMode: "ONE_TO_MANY", note: "Bina satışı → nakit + UV kira yükümlülüğü" }],
    preconditions: [{ key: "group.NON_CURRENT_ASSETS.account.252", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "MEDIUM", TRADE: "LOW", SERVICES: "LOW", RETAIL: "MEDIUM", IT: "LOW" },
    expectedKpiEffects: [
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "CASH_RATIO", expectedDirection: "UP", strength: "HIGH" },
    ],
    baseManageability: 0.50, implementationCostIndex: 0.55, confidence: 0.60,
    conflictsWith: ["A08_FIXED_ASSET_DISPOSAL"], synergiesWith: [],
  },

  A10_EQUITY_INJECTION: {
    id: "A10_EQUITY_INJECTION",
    name: "Sermaye Artırımı",
    sourceGroup: "EXTERNAL", targetGroup: "EQUITY",
    amountRule: { basis: "BALANCE_SHEET_TOTAL", minPct: 0.02, suggestedPct: 0.08, maxPct: 0.25, targetMaxPctOfTargetGroup: 0.15, globalMaxPctOfAssets: 0.10 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["EXTERNAL"], targetAccountPrefixes: ["500"], mappingMode: "ONE_TO_ONE_PREFIX", note: "Dış nakit girişi → ödenmiş sermaye + kasa" }],
    preconditions: [],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM", SERVICES: "MEDIUM", RETAIL: "MEDIUM", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "HIGH" },
      { ratio: "CURRENT_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.40, implementationCostIndex: 0.60, confidence: 0.70,
    conflictsWith: [], synergiesWith: ["A11_EARNINGS_RETENTION"],
  },

  A11_EARNINGS_RETENTION: {
    id: "A11_EARNINGS_RETENTION",
    name: "Kârı Şirkette Tut",
    sourceGroup: "INCOME_STATEMENT", targetGroup: "EQUITY",
    amountRule: { basis: "INCOME_STATEMENT_TOTAL", minPct: 0.20, suggestedPct: 0.60, maxPct: 1.00, targetMaxPctOfTargetGroup: 0.10, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["590"], targetAccountPrefixes: ["570"], mappingMode: "ONE_TO_ONE_PREFIX" }],
    preconditions: [{ key: "group.EQUITY.account.590", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "HIGH", RETAIL: "HIGH", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "DEBT_TO_EQUITY", expectedDirection: "DOWN", strength: "MEDIUM" },
    ],
    baseManageability: 0.85, implementationCostIndex: 0.10, confidence: 0.90,
    conflictsWith: [], synergiesWith: ["A10_EQUITY_INJECTION"],
  },

  A12_GROSS_MARGIN_IMPROVEMENT: {
    id: "A12_GROSS_MARGIN_IMPROVEMENT",
    name: "Brüt Kâr Marjı İyileştir",
    sourceGroup: "INCOME_STATEMENT", targetGroup: "EQUITY",
    amountRule: { basis: "REVENUE_TOTAL", minPct: 0.01, suggestedPct: 0.03, maxPct: 0.08, targetMaxPctOfTargetGroup: 0.08, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "PROPORTIONAL",
    accountMappings: [{ sourceAccountPrefixes: ["620", "621", "622"], targetAccountPrefixes: ["590"], mappingMode: "MANY_TO_ONE", note: "SMM azaltımı → net kâr artışı" }],
    preconditions: [{ key: "group.INCOME_STATEMENT.account.600", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.55, implementationCostIndex: 0.40, confidence: 0.65,
    conflictsWith: [], synergiesWith: ["A13_OPEX_OPTIMIZATION"],
  },

  A13_OPEX_OPTIMIZATION: {
    id: "A13_OPEX_OPTIMIZATION",
    name: "Faaliyet Giderlerini Düşür",
    sourceGroup: "INCOME_STATEMENT", targetGroup: "EQUITY",
    amountRule: { basis: "REVENUE_TOTAL", minPct: 0.01, suggestedPct: 0.04, maxPct: 0.10, targetMaxPctOfTargetGroup: 0.08, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "PROPORTIONAL",
    accountMappings: [{ sourceAccountPrefixes: ["630", "631", "632"], targetAccountPrefixes: ["590"], mappingMode: "MANY_TO_ONE" }],
    preconditions: [{ key: "group.INCOME_STATEMENT.account.632", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "MEDIUM", MANUFACTURING: "MEDIUM", TRADE: "MEDIUM", SERVICES: "HIGH", RETAIL: "MEDIUM", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "MEDIUM" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "LOW" },
    ],
    baseManageability: 0.60, implementationCostIndex: 0.35, confidence: 0.70,
    conflictsWith: [], synergiesWith: ["A12_GROSS_MARGIN_IMPROVEMENT"],
  },

  A14_FINANCE_COST_OPTIMIZATION: {
    id: "A14_FINANCE_COST_OPTIMIZATION",
    name: "Finansman Giderini Düşür",
    sourceGroup: "INCOME_STATEMENT", targetGroup: "EQUITY",
    amountRule: { basis: "INCOME_STATEMENT_TOTAL", minPct: 0.05, suggestedPct: 0.12, maxPct: 0.30, targetMaxPctOfTargetGroup: 0.10, globalMaxPctOfAssets: 0.06 },
    distributionDefault: "LARGEST_FIRST",
    accountMappings: [{ sourceAccountPrefixes: ["660", "661"], targetAccountPrefixes: ["590"], mappingMode: "MANY_TO_ONE", note: "Finansman gideri düşüşü → net kâr artışı" }],
    preconditions: [{ key: "group.INCOME_STATEMENT.account.660", operator: ">", value: 0 }],
    sectorFeasibility: { CONSTRUCTION: "HIGH", MANUFACTURING: "HIGH", TRADE: "HIGH", SERVICES: "MEDIUM", RETAIL: "HIGH", IT: "HIGH" },
    expectedKpiEffects: [
      { ratio: "INTEREST_COVERAGE", expectedDirection: "UP", strength: "HIGH" },
      { ratio: "EQUITY_RATIO", expectedDirection: "UP", strength: "MEDIUM" },
    ],
    baseManageability: 0.60, implementationCostIndex: 0.30, confidence: 0.75,
    conflictsWith: [], synergiesWith: ["A01_ST_FIN_DEBT_TO_LT"],
  },
}
```

---

### 3.4 adaptivePolicy.ts

```typescript
import type { StressLevel } from './dynamicThresholds'

export type HorizonKey = 'short' | 'medium' | 'long'
export type Regime = 'CRISIS' | 'RECOVERY' | 'STABLE'
export type GapBand = 'SMALL' | 'MEDIUM' | 'LARGE'

export const REGIME_RULES = {
  CRISIS:   { scoreLt: 45, stressIn: ['SEVERE'] as StressLevel[] },
  RECOVERY: { scoreLt: 60, stressIn: ['MODERATE'] as StressLevel[] },
  STABLE:   { scoreGte: 60, stressIn: ['NO_STRESS', 'MILD'] as StressLevel[] },
} as const

export const GAP_BANDS = {
  SMALL:  { max: 5 },
  MEDIUM: { max: 15 },
  LARGE:  { minExclusive: 15 },
} as const

export const MIN_ACTIONS_BY_HORIZON: Record<HorizonKey, number> = {
  short: 2, medium: 3, long: 4,
}

export const GOAL_UNLOCK_POLICY = {
  maxStage: 2,
  minRemainingGapToUnlock: 5,
  requireNoFeasibleCandidate: true,
  preRelaxIf: { scoreLt: 45, gapGte: 12 },
} as const

export const CAP_SCALING = {
  byRegimeAndHorizon: {
    STABLE:   { short: 1.00, medium: 1.00, long: 1.00 },
    RECOVERY: { short: 1.10, medium: 1.20, long: 1.30 },
    CRISIS:   { short: 1.20, medium: 1.30, long: 1.45 },
  },
  byGapBand: { SMALL: 1.00, MEDIUM: 1.10, LARGE: 1.20 },
  byUnlockStage: { 0: 1.00, 1: 1.20, 2: 1.35 },
  hardMaxMultiplier: 2.00,
} as const

export const EFFICIENCY_POLICY = {
  minByRegimeAndHorizon: {
    STABLE:   { short: 0.50, medium: 0.35, long: 0.20 },
    RECOVERY: { short: 0.30, medium: 0.22, long: 0.14 },
    CRISIS:   { short: 0.20, medium: 0.15, long: 0.10 },
  },
  byGapBand:    { SMALL: 1.05, MEDIUM: 1.00, LARGE: 0.85 },
  byUnlockStage: { 0: 1.00, 1: 0.85, 2: 0.70 },
  floors: { short: 0.15, medium: 0.12, long: 0.08 },
  hardRejectByRegime: {
    STABLE:   { short: { balanceSheetImpactGt: 0.03, scoreDeltaLt: 0.8 }, medium: { balanceSheetImpactGt: 0.05, scoreDeltaLt: 1.0 }, long: { balanceSheetImpactGt: 0.08, scoreDeltaLt: 1.5 } },
    RECOVERY: { short: { balanceSheetImpactGt: 0.04, scoreDeltaLt: 0.7 }, medium: { balanceSheetImpactGt: 0.06, scoreDeltaLt: 0.9 }, long: { balanceSheetImpactGt: 0.10, scoreDeltaLt: 1.2 } },
    CRISIS:   { short: { balanceSheetImpactGt: 0.05, scoreDeltaLt: 0.5 }, medium: { balanceSheetImpactGt: 0.07, scoreDeltaLt: 0.7 }, long: null },
  },
  hardRejectStageAdjust: {
    0: { impactMult: 1.00, scoreMult: 1.00 },
    1: { impactMult: 1.15, scoreMult: 0.85 },
    2: { impactMult: 1.30, scoreMult: 0.70 },
  },
  catastrophicFloor: { balanceSheetImpactGt: 0.12, scoreDeltaLt: 0.30 },
} as const

export const CUMULATIVE_GUARDRAILS_BY_REGIME = {
  STABLE:   {
    short:  { maxEquityIncreasePP: 0.05, maxKvykDecreasePP: 0.05, maxGroupShareDeteriorationPP: 0.03 },
    medium: { maxEquityIncreasePP: 0.08, maxKvykDecreasePP: 0.10, maxGroupShareDeteriorationPP: 0.05 },
    long:   { maxEquityIncreasePP: 0.12, maxKvykDecreasePP: 0.15, maxGroupShareDeteriorationPP: 0.07 },
  },
  RECOVERY: {
    short:  { maxEquityIncreasePP: 0.07, maxKvykDecreasePP: 0.07, maxGroupShareDeteriorationPP: 0.04 },
    medium: { maxEquityIncreasePP: 0.11, maxKvykDecreasePP: 0.13, maxGroupShareDeteriorationPP: 0.07 },
    long:   { maxEquityIncreasePP: 0.16, maxKvykDecreasePP: 0.19, maxGroupShareDeteriorationPP: 0.10 },
  },
  CRISIS:   {
    short:  { maxEquityIncreasePP: 0.09, maxKvykDecreasePP: 0.09, maxGroupShareDeteriorationPP: 0.06 },
    medium: { maxEquityIncreasePP: 0.15, maxKvykDecreasePP: 0.17, maxGroupShareDeteriorationPP: 0.09 },
    long:   { maxEquityIncreasePP: 0.22, maxKvykDecreasePP: 0.24, maxGroupShareDeteriorationPP: 0.13 },
  },
}

export const CUMULATIVE_GUARDRAIL_STAGE_ADD = {
  0: { equityPP: 0.00, kvykPP: 0.00, groupShareDeteriorationPP: 0.000 },
  1: { equityPP: 0.02, kvykPP: 0.03, groupShareDeteriorationPP: 0.010 },
  2: { equityPP: 0.03, kvykPP: 0.04, groupShareDeteriorationPP: 0.020 },
} as const

export const CUMULATIVE_GUARDRAIL_HARD_MAX = {
  maxEquityIncreasePP: 0.25, maxKvykDecreasePP: 0.28, maxGroupShareDeteriorationPP: 0.15,
} as const

export const ABSOLUTE_GROUP_SHARE_HARD_STOP = 0.98

export const GUARDRAIL_BREACH_POLICY = {
  onCandidateBreach: 'SKIP_AND_TRY_NEXT' as const,
  maxSkippedCandidatesPerIteration: 8,
  stopWhenNoFeasibleCandidate: true,
} as const

export const GROUP_DETERIORATION_DIRECTION: Record<string, 'increase' | 'decrease' | 'neither'> = {
  CURRENT_ASSETS:         'decrease',
  NON_CURRENT_ASSETS:     'neither',
  SHORT_TERM_LIABILITIES: 'increase',
  LONG_TERM_LIABILITIES:  'neither',
  EQUITY:                 'decrease',
}

export function isDeteriorationForGroup(groupKey: string, shareChange: number): boolean {
  const direction = GROUP_DETERIORATION_DIRECTION[groupKey] ?? 'neither'
  if (direction === 'increase') return shareChange > 0
  if (direction === 'decrease') return shareChange < 0
  return false
}

export function determineRegime(currentScore: number, stressLevel: StressLevel): Regime {
  if (currentScore < 45 || stressLevel === 'SEVERE') return 'CRISIS'
  if (currentScore < 60 || stressLevel === 'MODERATE') return 'RECOVERY'
  return 'STABLE'
}

export function determineGapBand(currentScore: number, targetScore: number): GapBand {
  const gap = targetScore - currentScore
  if (gap <= GAP_BANDS.SMALL.max) return 'SMALL'
  if (gap <= GAP_BANDS.MEDIUM.max) return 'MEDIUM'
  return 'LARGE'
}

export function initialUnlockStage(currentScore: number, targetScore: number): 0 | 1 | 2 {
  const gap = targetScore - currentScore
  const { preRelaxIf } = GOAL_UNLOCK_POLICY
  if (currentScore < preRelaxIf.scoreLt && gap >= preRelaxIf.gapGte) return 1
  return 0
}

export function computeTargetCapMultiplier(regime: Regime, horizon: HorizonKey, gapBand: GapBand, unlockStage: 0 | 1 | 2): number {
  const combined = CAP_SCALING.byRegimeAndHorizon[regime][horizon] * CAP_SCALING.byGapBand[gapBand] * CAP_SCALING.byUnlockStage[unlockStage]
  return Math.min(combined, CAP_SCALING.hardMaxMultiplier)
}

export function computeMinEfficiency(regime: Regime, horizon: HorizonKey, gapBand: GapBand, unlockStage: 0 | 1 | 2): number {
  const combined = EFFICIENCY_POLICY.minByRegimeAndHorizon[regime][horizon] * EFFICIENCY_POLICY.byGapBand[gapBand] * EFFICIENCY_POLICY.byUnlockStage[unlockStage]
  return Math.max(combined, EFFICIENCY_POLICY.floors[horizon])
}

export function computeCumulativeGuardrails(regime: Regime, horizon: HorizonKey, unlockStage: 0 | 1 | 2) {
  const base = CUMULATIVE_GUARDRAILS_BY_REGIME[regime][horizon]
  const add = CUMULATIVE_GUARDRAIL_STAGE_ADD[unlockStage]
  const hardMax = CUMULATIVE_GUARDRAIL_HARD_MAX
  return {
    maxEquityIncreasePP: Math.min(base.maxEquityIncreasePP + add.equityPP, hardMax.maxEquityIncreasePP),
    maxKvykDecreasePP: Math.min(base.maxKvykDecreasePP + add.kvykPP, hardMax.maxKvykDecreasePP),
    maxGroupShareDeteriorationPP: Math.min(base.maxGroupShareDeteriorationPP + add.groupShareDeteriorationPP, hardMax.maxGroupShareDeteriorationPP),
  }
}

export function shouldUnlock(goalReached: boolean, remainingGap: number, noFeasibleCandidate: boolean, currentStage: 0 | 1 | 2): boolean {
  if (goalReached) return false
  if (currentStage >= GOAL_UNLOCK_POLICY.maxStage) return false
  if (remainingGap < GOAL_UNLOCK_POLICY.minRemainingGapToUnlock) return false
  if (GOAL_UNLOCK_POLICY.requireNoFeasibleCandidate && !noFeasibleCandidate) return false
  return true
}

export function nextUnlockStage(current: 0 | 1 | 2): 0 | 1 | 2 {
  if (current === 0) return 1
  if (current === 1) return 2
  return 2
}
```

---

### 3.5 capMatrix.ts

```typescript
import type { ActionId, SectorCode } from './contracts'

export const CAP_MATRIX: Record<ActionId, { short: number; medium: number; long: number }> = {
  A01_ST_FIN_DEBT_TO_LT:         { short: 0.10, medium: 0.20, long: 0.30 },
  A02_TRADE_PAYABLE_TO_LT:       { short: 0.08, medium: 0.18, long: 0.28 },
  A03_ADVANCE_TO_LT:             { short: 0.08, medium: 0.15, long: 0.25 },
  A04_CASH_PAYDOWN_ST:           { short: 0.08, medium: 0.12, long: 0.15 },
  A05_RECEIVABLE_COLLECTION:     { short: 0.05, medium: 0.10, long: 0.15 },
  A06_INVENTORY_OPTIMIZATION:    { short: 0.03, medium: 0.08, long: 0.12 },
  A07_PREPAID_EXPENSE_RELEASE:   { short: 0.03, medium: 0.08, long: 0.10 },
  A08_FIXED_ASSET_DISPOSAL:      { short: 0.04, medium: 0.10, long: 0.15 },
  A09_SALE_LEASEBACK:            { short: 0.05, medium: 0.12, long: 0.18 },
  A10_EQUITY_INJECTION:          { short: 0.08, medium: 0.15, long: 0.25 },
  A11_EARNINGS_RETENTION:        { short: 0.06, medium: 0.10, long: 0.15 },
  A12_GROSS_MARGIN_IMPROVEMENT:  { short: 0.03, medium: 0.06, long: 0.10 },
  A13_OPEX_OPTIMIZATION:         { short: 0.03, medium: 0.06, long: 0.10 },
  A14_FINANCE_COST_OPTIMIZATION: { short: 0.04, medium: 0.08, long: 0.12 },
}

export const GLOBAL_CAP_MATRIX: Record<ActionId, { short: number; medium: number; long: number }> = {
  A01_ST_FIN_DEBT_TO_LT:         { short: 0.04,  medium: 0.08, long: 0.12 },
  A02_TRADE_PAYABLE_TO_LT:       { short: 0.03,  medium: 0.07, long: 0.10 },
  A03_ADVANCE_TO_LT:             { short: 0.03,  medium: 0.06, long: 0.10 },
  A04_CASH_PAYDOWN_ST:           { short: 0.03,  medium: 0.04, long: 0.06 },
  A05_RECEIVABLE_COLLECTION:     { short: 0.02,  medium: 0.04, long: 0.06 },
  A06_INVENTORY_OPTIMIZATION:    { short: 0.015, medium: 0.03, long: 0.05 },
  A07_PREPAID_EXPENSE_RELEASE:   { short: 0.01,  medium: 0.02, long: 0.04 },
  A08_FIXED_ASSET_DISPOSAL:      { short: 0.02,  medium: 0.04, long: 0.06 },
  A09_SALE_LEASEBACK:            { short: 0.03,  medium: 0.05, long: 0.08 },
  A10_EQUITY_INJECTION:          { short: 0.03,  medium: 0.06, long: 0.10 },
  A11_EARNINGS_RETENTION:        { short: 0.02,  medium: 0.04, long: 0.06 },
  A12_GROSS_MARGIN_IMPROVEMENT:  { short: 0.01,  medium: 0.02, long: 0.04 },
  A13_OPEX_OPTIMIZATION:         { short: 0.01,  medium: 0.02, long: 0.04 },
  A14_FINANCE_COST_OPTIMIZATION: { short: 0.015, medium: 0.03, long: 0.05 },
}

export type HorizonKey = 'short' | 'medium' | 'long'

export function getTargetCapPct(actionId: ActionId, horizon: HorizonKey, sector: SectorCode): number {
  const baseCap = CAP_MATRIX[actionId]?.[horizon] ?? 0.10
  const SECTOR_MULT: Partial<Record<ActionId, Record<SectorCode, number>>> = {
    A05_RECEIVABLE_COLLECTION: { CONSTRUCTION: 0.80, MANUFACTURING: 1.00, TRADE: 1.00, RETAIL: 0.85, SERVICES: 1.15, IT: 1.20 },
    A06_INVENTORY_OPTIMIZATION: { CONSTRUCTION: 0.50, MANUFACTURING: 1.20, TRADE: 1.00, RETAIL: 1.10, SERVICES: 0.40, IT: 0.25 },
    A03_ADVANCE_TO_LT: { CONSTRUCTION: 1.25, MANUFACTURING: 0.85, TRADE: 0.80, RETAIL: 0.75, SERVICES: 1.00, IT: 1.20 },
  }
  const sectorMult = SECTOR_MULT[actionId]?.[sector] ?? 1.0
  return baseCap * sectorMult
}

export function getGlobalCapPct(actionId: ActionId, horizon: HorizonKey): number {
  return GLOBAL_CAP_MATRIX[actionId]?.[horizon] ?? 0.05
}
```

---

### 3.6 actionFamilies.ts

```typescript
import type { ActionId } from './contracts'

export type ActionFamily = 'WC_COMPOSITION' | 'DEBT_STRUCTURE' | 'EQUITY_PNL'

const FAMILY_MAP: Record<ActionId, ActionFamily> = {
  A04_CASH_PAYDOWN_ST:           'WC_COMPOSITION',
  A05_RECEIVABLE_COLLECTION:     'WC_COMPOSITION',
  A06_INVENTORY_OPTIMIZATION:    'WC_COMPOSITION',
  A07_PREPAID_EXPENSE_RELEASE:   'WC_COMPOSITION',
  A01_ST_FIN_DEBT_TO_LT:         'DEBT_STRUCTURE',
  A02_TRADE_PAYABLE_TO_LT:       'DEBT_STRUCTURE',
  A03_ADVANCE_TO_LT:             'DEBT_STRUCTURE',
  A08_FIXED_ASSET_DISPOSAL:      'DEBT_STRUCTURE',
  A09_SALE_LEASEBACK:            'DEBT_STRUCTURE',
  A10_EQUITY_INJECTION:          'EQUITY_PNL',
  A11_EARNINGS_RETENTION:        'EQUITY_PNL',
  A12_GROSS_MARGIN_IMPROVEMENT:  'EQUITY_PNL',
  A13_OPEX_OPTIMIZATION:         'EQUITY_PNL',
  A14_FINANCE_COST_OPTIMIZATION: 'EQUITY_PNL',
}

export function getActionFamily(actionId: ActionId): ActionFamily {
  return FAMILY_MAP[actionId] ?? 'DEBT_STRUCTURE'
}
```

---

### 3.7 dynamicThresholds.ts

*(Tam içerik — `computeDynamicThresholds`, `detectStressLevel`, `computeSizeFactor`, `computeGapFactor` fonksiyonları — dosya boyutu nedeniyle özet: size factor (log10 bazlı), stress factor (cari oran+nakit+faiz karşılama+NİS/Aktif üzerinden 0–6 puan), gap factor (piecewise-linear 0.70–1.05), çarpım ile DEFAULT_THRESHOLDS'ı ölçekler, THRESHOLD_FLOORS/CEILINGS ile clamp'ler.)*

**Stres Seviyeleri:**
- NO_STRESS (0 puan): factor=1.10
- MILD (1-2 puan): factor=1.00
- MODERATE (3-5 puan): factor=0.85
- SEVERE (6+ puan): factor=0.70

---

### 3.8 dynamicMicroFilter.ts

*(Sektör × stres bazlı micro filter: minLineAmountTry sektör yüzdesi × stres çarpanı ile ölçeklenir, 150K–6M TL arasında clamp'lenir.)*

---

### 3.9 dynamicPreconditions.ts

*(A04-A07 için dinamik ön koşullar: evaluateA04 — nakit tampon yeterliliği, evaluateA05 — alacak bakiye eşiği, evaluateA06 — stok yoğunluğu, evaluateA07 — peşin gider eşiği.)*

---

### 3.10 sectorProfiles.ts

*(6 sektör profili: normalRanges, priorityActions, discouragedActions, blockedActions, warningRules. MANUFACTURING: A06+A02+A14 öncelikli. CONSTRUCTION: A03+A01+A09+A14 öncelikli. IT: A08+A09 bloke. mapSectorToCode: Türkçe → SectorCode.)*

---

### 3.11 candidateGenerator.ts (özet)

**generateCandidates():**
1. Sektör blockedActions filtresi
2. sectorFeasibility BLOCKED filtresi
3. Statik precondition kontrolü (`checkConditions`)
4. Dinamik precondition (A04-A07 için `evaluateDynamicPrecondition`)
5. Eligible kaynak hesapları bul (`findEligibleAccounts`)
6. Tutar hesapla (`computeAmountBase` + `computeBoundedAmount`)
7. Dağıtım modu belirle (`determineDistributionMode`)
8. ActionCandidate[] döndür

**computeBoundedAmount():** `min(rangeCap, targetGroupCap, assetsCap)` — adaptive regime × gap × stage çarpanları uygulanır.

---

### 3.12 applier.ts (özet)

**applyCandidate():**
1. `distributeAmount` — kaynak hesapları böl
2. `distributeTargets` — hedef hesaplara dağıt
3. `AccountMovement[]` oluştur (kaynak: -delta, hedef: +delta, A10 EXTERNAL: 102 +delta)
4. Bilanço güncelle, önce/sonra rasyolar hesapla
5. **Şok Guardrail** — tek aksiyon %40 grup değişimi veya %25 aktif değişimi sınırı
6. **Minimal Impact** — aile bazlı eşik kontrolü (WC_COMPOSITION: ΔQuick/Cash/DSO/CCC, DEBT_STRUCTURE: ΔCurrent/Equity/IC, EQUITY_PNL: ΔEquity/IC/Current)
7. **Adaptive Efficiency Filter** — `computeMinEfficiency()` + hard reject + catastrophic floor
8. **Priority Score** = 100 × materiality × manageability × costScore × feasibility × impact × confidence

---

### 3.13 engine.ts (özet)

**runScenarioEngine() akışı:**
1. `buildSixGroupAnalysis` — başlangıç analizi
2. `computeDynamicThresholds` — dinamik eşikler
3. `computeDynamicMicroFilter` — dinamik micro filter
4. `assessEmergencyNeed` — acil ufuk değerlendirmesi
5. 3 ufuk için `buildScenario` çalıştır:
   - Short: sadece emergency varsa
   - Medium/Long: her zaman
6. **buildScenario inner loop (maxActions iterasyon):**
   - `generateCandidates` → `evaluateCandidates` → `resolveConflicts`
   - SKIP_AND_TRY_NEXT: 4 guardrail kontrolü
   - En iyi aday seç, hesapları güncelle, `buildSixGroupAnalysis` yeniden çalıştır
   - Skor `calculateRatiosFromAccounts` + `calculateScore` ile gerçek hesapla
   - TARGET_REACHED / NO_VALID_CANDIDATES / MAX_ACTIONS durumunda dur
7. Eligibility report: NOT_SELECTED_TARGET_REACHED dönüşümü

**F-4b Yön-Duyarlı Guardrail:**
- LTL artışı (KV→UV çevirme) bozulma sayılmaz
- NCA değişimi nötr
- STL artışı / CA azalışı / EQUITY azalışı = bozulma

---

## Bölüm 4 — Destek Dosyaları: Tam İçerik

### 4.1 ratios.ts (özet — 25 rasyo, 4 kategori)

**Likidite (6):** currentRatio, quickRatio, cashRatio, netWorkingCapital, netWorkingCapitalRatio, cashConversionCycle  
**Karlılık (9):** grossMargin, ebitdaMargin, ebitMargin, netProfitMargin, roa, roe, roic, revenueGrowth, realGrowth  
**Kaldıraç (6):** debtToEquity, debtToAssets, debtToEbitda, interestCoverage, equityRatio, shortTermDebtRatio  
**Faaliyet (6):** assetTurnover, inventoryTurnoverDays, receivablesTurnoverDays, payablesTurnoverDays, fixedAssetTurnover, operatingExpenseRatio  
**İnşaat ek:** customerAdvanceDays, adjustedCashConversionCycle

`calculateRatiosFromAccounts(accounts)` → `rebuildAggregateFromAccounts` → `calculateRatios`

---

### 4.2 score.ts (özet — Hibrit Scoring v3.0)

**Ağırlıklar:**  
HYBRID_DEFAULT (0.40 abs / 0.60 bm), HYBRID_BM_HEAVY (0.25 abs / 0.75 bm), HYBRID_ABS_HEAVY (0.70 abs / 0.30 bm)

**Rating Bantları:**
```
AAA ≥ 93 | AA ≥ 84 | A ≥ 76 | BBB ≥ 68 | BB ≥ 60 | B ≥ 52 | CCC ≥ 44 | CC ≥ 36 | C ≥ 30 | D ≥ 0
```

**Penalty Kuralları:**
- Özkaynak ≤ 0 → kaldıraç max 15, final max 45
- Net kar marjı < -5% → final max 55
- Faiz karşılama < 1.5 → kaldıraç max 45
- Net borç/EBITDA > 6 → kaldıraç max 55

---

### 4.3 chartOfAccounts.ts (özet)

Tam TDHP: 100–692 arası tüm hesaplar. Her hesap: `{ code, name, group, side (ASSET|LIABILITY|EQUITY|INCOME|EXPENSE), contra (boolean) }`.

Önemli contra hesaplar: 103 (Verilen Çekler-), 122 (Alacak Senetleri Reeskontu-), 257 (Birikmiş Amortismanlar-), 580 (Geçmiş Yıl Zararları-).

---

### 4.4 accountMapper.ts (özet)

**rebuildAggregateFromAccounts():** TDHP hesap kodları → calculateRatios için aggregate alanlar.
- cash: 100+101+102+108-103
- tradeReceivables: 120+121+126+127+128-122-129
- shortTermFinancialDebt: 300+301+303+304+305+306+309-302-308
- longTermFinancialDebt: 400+401+405+407+409-402-408
- totalEquity: 500+502-501-503 + 520-529 + 540-549 + 570 - 580 + 590 - 591

---

### 4.5 reversalMap.ts (özet)

Ters bakiye reklasifikasyon: 120→340, 320→159, 131↔331, 132↔332, 180↔380 vb. `reclassifyIfReversed(code, amount)` → `{ code, amount, reversal? }`.

---

## Bölüm 5 — API Endpoint: src/app/api/scenarios/v2/route.ts

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { prisma }                    from '@/lib/db'
import { getUserIdFromRequest }      from '@/lib/auth'
import { runScenarioEngine }         from '@/lib/scoring/scenario/engine'
import { calculateRatiosFromAccounts } from '@/lib/scoring/ratios'
import { calculateScore, scoreToRating, getRatingMinimum } from '@/lib/scoring/score'

function gradeToTargetScore(grade: string): number {
  const min = getRatingMinimum(grade)
  return min > 0 ? min : 60
}

export async function POST(req: NextRequest) {
  // Auth kontrolü
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { analysisId, groupId, targetGrade, currentScoreOverride } = await req.json()
  if (!targetGrade) return NextResponse.json({ error: 'targetGrade gerekli' }, { status: 400 })
  if (groupId) return NextResponse.json({ error: "Grup senaryoları v2'de desteklenmiyor" }, { status: 501 })
  if (!analysisId) return NextResponse.json({ error: 'analysisId gerekli' }, { status: 400 })

  // DB'den analiz ve hesap kodlarını çek
  const analysis = await prisma.analysis.findFirst({
    where: { id: analysisId, entity: { userId } },
    include: { entity: true, financialAccounts: true, financialData: true },
  })

  if (!analysis || analysis.financialAccounts.length === 0) {
    return NextResponse.json({ error: 'Hesap kodu verisi yok' }, { status: 400 })
  }

  const accounts = analysis.financialAccounts.map(a => ({ accountCode: a.accountCode, amount: Number(a.amount) }))
  const ratios = calculateRatiosFromAccounts(accounts)
  const sector: string = analysis.entity.sector ?? 'İmalat'
  const scoreResult = calculateScore(ratios, sector)

  // Subjektif bonus = combinedScore - financialScore (subjektif değerlendirme farkı)
  const financialScore = scoreResult.finalScore
  const combinedScore = currentScoreOverride != null
    ? Number(currentScoreOverride)
    : (analysis as any).scoreFinal != null ? Number((analysis as any).scoreFinal) : financialScore
  const subjectiveBonus = combinedScore - financialScore

  const result = runScenarioEngine({
    accounts,
    companyId:  analysis.entityId ?? analysis.id,
    scenarioId: `solo-${analysis.id}-${Date.now()}`,
    sector,
    currentScore: combinedScore,
    currentGrade: scoreToRating(combinedScore),
    targetGrade,
    targetScore:  gradeToTargetScore(targetGrade),
    subjectiveBonus,
    currentRatios: {
      CURRENT_RATIO:     ratios.currentRatio     ?? 0,
      QUICK_RATIO:       ratios.quickRatio        ?? 0,
      CASH_RATIO:        ratios.cashRatio         ?? 0,
      EQUITY_RATIO:      ratios.equityRatio       ?? 0,
      DEBT_TO_EQUITY:    ratios.debtToEquity      ?? 0,
      INTEREST_COVERAGE: ratios.interestCoverage  ?? 0,
    },
  })

  return NextResponse.json({
    engine: 'v2',
    scenarios: result.scenarios,
    currentScore: combinedScore,
    currentGrade: scoreToRating(combinedScore),
    sector,
    emergencyAssessment: result.emergencyAssessment,
    stressLevel: result.stressLevel,
    appliedThresholds: result.appliedThresholds,
    appliedMicroFilter: result.appliedMicroFilter,
    sixGroupAnalysis: {
      totals: result.analysis.totals,
      groups: Object.fromEntries(Object.entries(result.analysis.groups).map(([k, v]) => [k, {
        total: v.total, shareOfReferenceBase: v.shareOfReferenceBase,
        top3: v.composition.top3.map(a => ({ code: a.accountCode, name: a.accountName, amount: a.amount, shareInGroup: a.shareInGroup })),
        basePriorityScore: v.basePriorityScore,
      }])),
      warnings: (result.analysis as any).warnings ?? [],
    },
  })
}
```

---

## Bölüm 6 — UI Bileşeni: ScenarioPanelV2.tsx (özet)

**Props:** `{ analysisId, currentScore, currentGrade }`

**Özellikler:**
- Hedef not seçimi (mevcut nottan 1-2 kademe üstü)
- 3 senaryo kartı (short/medium/long)
- Her kartta: skorlar, rating, goalReached durumu
- `<details>` ile 14 aksiyon eligibility tablosu:
  - ✅ Seçildi (bg-green-50)
  - 🔵 Eligible (bg-blue-50)
  - ❌ Red (bg-red-50)
  - ⚪ Hedef karşılandı (bg-slate-50)
  - ⚪ Değ. yok (default)
- ActionCard: hesap hareketleri, rasyo etkileri, uyarılar

---

## Bölüm 7 — DEKAM 2024 Gerçek Test Verisi

**Şirket:** DEKAM A.Ş. (entity ID: `24eacf7c-ed68-4ef9-82b0-7bbd58072b9d`)  
**Dönem:** 2024 ANNUAL  
**Sektör:** İmalat (→ MANUFACTURING)

### FinancialAccount Tablosu (DB'den çekildi — 20 satır)

| Hesap Kodu | Hesap Adı | Tutar (TL) | Grup |
|---|---|---|---|
| 102 | Bankalar | 13,988 | CURRENT_ASSETS |
| 120 | Alıcılar | 5,225,685 | CURRENT_ASSETS |
| 150 | İlk Madde ve Malzeme | 4,029,726 | CURRENT_ASSETS |
| 153 | Ticari Mallar | 367,250,612 | CURRENT_ASSETS |
| 191 | İndirilecek KDV | 498,671 | CURRENT_ASSETS |
| 193 | Peşin Ödenen Vergiler | 2,225,538 | CURRENT_ASSETS |
| 253 | Tesis Makine ve Cihazlar | 9,044,283 | NON_CURRENT_ASSETS |
| 300 | Banka Kredileri (KV) | 183,344,218 | SHORT_TERM_LIABILITIES |
| 320 | Satıcılar | 84,658,276 | SHORT_TERM_LIABILITIES |
| 340 | Alınan Sipariş Avansları | 202,772,017 | SHORT_TERM_LIABILITIES |
| 360 | Ödenecek Vergi ve Fonlar | 4,286,416 | SHORT_TERM_LIABILITIES |
| 391 | Hesaplanan KDV | 28,750,987 | SHORT_TERM_LIABILITIES |
| 500 | Sermaye | 350,000 | EQUITY |
| 570 | Geçmiş Yıl Kârları | 11,437,716 | EQUITY |
| 590 | Dönem Net Kârı | 37,208,726 | EQUITY |
| 600 | Yurtiçi Satışlar | 1,248,572,456 | INCOME_STATEMENT |
| 621 | Satılan Ticari Mallar Maliyeti | 1,123,915,211 | INCOME_STATEMENT |
| 631 | Pazarlama Satış ve Dağıtım Giderleri | 21,748,293 | INCOME_STATEMENT |
| 632 | Genel Yönetim Giderleri | 23,814,218 | INCOME_STATEMENT |
| 660 | Kısa Vadeli Borçlanma Giderleri | 29,752,816 | INCOME_STATEMENT |

### Bilanço Özeti

| Grup | Toplam (TL) | Yorum |
|---|---|---|
| CURRENT_ASSETS | ~379M | 153 (Ticari Mallar) = %97 → STOK YOĞUN |
| NON_CURRENT_ASSETS | ~9M | Tesis ve Makineler |
| SHORT_TERM_LIABILITIES | ~504M | 300 (Banka KV) + 340 (Avanslar) baskın |
| LONG_TERM_LIABILITIES | 0 | UV borç YOK |
| EQUITY | ~49M | Çok küçük → D/E yüksek |
| Toplam Aktif | ~388M | |

### Kritik Oranlar

- **Cari Oran:** ~0.75 (< 1 → KRİTİK, KVYK > Dönen Varlık)
- **Nakit Oranı:** ~0.000028 (son derece düşük, sadece 14K TL banka)
- **Özkaynak Oranı:** ~0.126 (çok düşük)
- **Borç/Özkaynak:** ~9.3
- **Finansal Skor:** 42.27 (CCC-B sınırı)
- **Combined Skor:** 50.0 (subjektif bonus var)

### Temel Sorunlar

1. **Devasa stok:** 153 hesabı = 367M TL → toplam aktifin %95'i
2. **Sıfır nakit:** 102 = 14K TL, A04 (nakit ile borç kapatma) işe yaramaz
3. **Sıfır UV borç:** A01/A02/A03 (KV→UV çevirme) için hedef grup YOK
4. **KV borç dominansı:** 300+320+340 = 470M TL → tüm yükümlülükler kısa vadeli
5. **Küçük özkaynak:** sadece 49M TL, bilanço yapısı çok kırılgan

---

## Bölüm 8 — Motor Çıktısı: DEKAM 2024 — BB Hedefi

**Giriş:** `currentScore=50.0, currentGrade=B, targetGrade=BB, targetScore=60`  
**Sektör:** MANUFACTURING → Regime=RECOVERY, GapBand=LARGE, UnlockStage=0 (başlangıç 1, gap=10)

### Short Horizon (0–3 Ay): ATLANDA

```
skipped: true
skipReason: "Firmada likidite stresi sinyali yok — acil müdahale gerekmiyor"
```

> **NOT:** Emergency assessment yanlış çalışıyor. Cari oran 0.75 < 1.0 kritik sinyali atlanmış olabilir (ratio verisi analyzer'a doğru akmazsa). Bu bir bug olabilir.

---

### Medium Horizon (3–12 Ay): KISMİ İYİLEŞME

```
scoreBefore: 50.0
scoreAfter: 50.5
gradeBefore: B
gradeAfter: B
goalReached: false
stopReason: NO_VALID_CANDIDATES
totalTLMovement: ~5M TL
actions: 1 aksiyon (A06 veya A02)
```

**Eligibility Raporu (medium):**
- A01 (KV→UV): PRECONDITION_FAIL (300 yok, ama var aslında)
- A02 (Ticari borç UV): ELIGIBLE ama küçük etki
- A03 (Avanslar UV): ELIGIBLE ama A01 sonrası kalan cap
- A06 (Stok optimize): SELECTED — büyük stok var ama stok→nakit dönüşümü sınırlı
- Diğerleri: NO_ELIGIBLE_SOURCE veya PRECONDITION_FAIL

---

### Long Horizon (1–3 Yıl): BB HEDEF KARŞILANDI ✓

```
scoreBefore: 50.0
scoreAfter: 65.3
gradeBefore: B
gradeAfter: BB
goalReached: true
stopReason: TARGET_REACHED
actions: [A10_EQUITY_INJECTION, A10_EQUITY_INJECTION, A10_EQUITY_INJECTION]  (×3 tekrar)
totalTLMovement: ~117M TL (3 × ~39M TL sermaye artırımı)
```

**Kritik Sorun:** Motor tek bir aksiyonu (A10 Sermaye Artırımı) 3 kez tekrarlıyor. Diğer 13 aksiyon için ya PRECONDITION_FAIL, ya NO_ELIGIBLE_SOURCE, ya da EFFICIENCY_FAIL nedeniyle kullanılamıyor.

**Neden yalnızca A10?**
1. A04 nakit yok (14K TL)
2. A06 stok optimization: 367M TL stok var ama MANUFACTURING'de stok→nakit etki küçük
3. A01/A02/A03: Hedef grup LTL = 0 TL → targetGroupCap = 0 → amount = 0
4. A11 earnings retention: 590 hesabı altında kaydedilmiş mi? Mevcut analiz dönemindeyse çalışır
5. A12/A13/A14 P&L aksiyonları: Etki küçük çünkü marj iyileştirme bilanço'ya çok az yansıyor

**A10 neden çalışıyor?**
- EXTERNAL source → hesap kodu gerekmez
- Aktif + 39M TL → 500 (Sermaye) + 102 (Kasa) artar
- Özkaynak oranı iyileşir → kaldıraç kategorisi puanı artar
- 3 iterasyon × ~5 puan = +15.3 puan

---

## Bölüm 9 — ChatGPT'nin Önceki Oturumdaki Bulguları

### 9.1 CFO Perspektifli DEKAM Aksiyon Tablosu

ChatGPT'ye DEKAM'ın bilançosunu gösterdiğimizde CFO mantığıyla şu tabloyu üretti:

| Hedef / Aksiyon | Mevcut | 1 Not Hedefi | 2 Not Hedefi | Muhasebe Bacağı | Bilanço Etkisi |
|---|---|---|---|---|---|
| Nakit sermaye artışı | — | +30/40M | +80/120M | 102 Banka ↑ / 500 Sermaye ↑ | Aktif+özkaynak büyür |
| Ortak borcu kapatma | 10.6M | <5M | 0 | 331 ↓ / 102 ↓ veya 331 ↓ / 500 ↑ | Pasif risk azalır |
| Stok eritilmesi | 367M | <300M | 220-250M | 120 ↑ veya 102 ↑ / 152 ↓ | Dönen varlık kalitesi artar |
| Verilen avans kapanması | 84.3M | 60M | 35-40M | 150-152 ↑ / 159 ↓ | Avans üretime döner |
| Borç senedi azaltma | 74.1M | <50M | <30M | 321 ↓ / 102 ↓ | KV baskı azalır |
| Satıcıların normalleşmesi | 5.6M | 15-20M | 20-30M | 320 ↑ (vade uzatma) | Tedarik dengelenir |
| Nakit pozisyon artışı | 18K | 10M | 20-30M | Sermaye+stok çözülme → 102 ↑ | Likidite tamponu |
| Net satış artışı | 16.8M | 35-40M | 60-75M | 120/102 ↑ / 600 ↑ | Gelir hacmi büyür |
| Brüt kâr artışı | 7.4M | 12-15M | 20-25M | 600 ↑ / 621 kontrollü | Marj iyileşir |
| Faaliyet gider opt. | 2.75M | %10 düşüş | %20+ düşüş | 770-772 ↓ / dönem kârı ↑ | Operasyonel verim |
| Finansman gideri | 4M | <3M | <2M | 780 ↓ / 321-300 ↓ | Net kâr kalitesi |
| KKEG temizliği | 44.2M | <25M | <10M | Vergi dışı gider ↓ | Vergi kalitesi |
| Geçmiş yıl kârı güçlenme | 16.7M | 25M | 40+M | 570 ↑ / dağıtım yok | İç kaynak büyür |
| Dönem net kârı sürdürülebilirlik | 22M | 10M operasyonel | 15-20M operasyonel | 690 ↑ / olağandışı gelir bağımlılığı ↓ | Kaliteli kâr |
| Alınan avans sağlıklı yönetim | 202M | Korunmalı | Korunmalı | 102 ↑ / 340 ↑ | Müşteri finansmanı |
| Özkaynak oranı | %12.5 | %18-20% | %25+ | Sermaye+kâr birikimi | Rating ana kriteri |
| Aktif verimliliği | Çok düşük | Orta | Güçlü | Satış+stok çözülme | Şişkin bilanço küçülür |
| YYİ hesabı nakde dönmesi | 46.8M | Kısmi çözülme | Büyük çözülme | 350-358 ↓ / 600 gelir + 102 nakit ↑ | Muhasebe nakde döner |

**Kritik Gözlem:** Bizim 14 aksiyonluk katalogda YYİ hesabı, ortak borcu kapatma/sermayeye çevirme, KKEG temizliği, net satış artışı (A12'den ayrı) ve alınan avansı hasılata tanıma aksiyonları YOK.

### 9.2 ChatGPT'nin Mimari Eleştirisi

Tabloyu gördükten sonra ChatGPT motorumuz hakkında şunları söyledi:

> **"Sistem finansal gerçekliği değil, oran optimizasyonunu çözüyor. Bu çok kritik fark."**

Ana eleştiri noktaları:

1. **Motor ratio delta bakıyor, optimize ediyor** — ama banka rating sistemi böyle çalışmıyor.
   - Gerçek: rating = bilanço hikayesi + nakit dönüş kalitesi + aktif kalitesi + sürdürülebilirlik + muhasebe gerçekliği
   - Motor: "oranlar yükselirse rating artar" mantığı

2. **Aksiyon kalitesini ayırmıyor.** Örnek:
   - Sermaye artırımı (kalite 1.00) ile vade uzatma (kalite 0.30) aynı puanı alıyor
   - Bankacı sorar: "Nakit üretmeyen firma sadece vade uzattıysa neden rating artsın?"

3. **24M sermaye artışıyla CCC→BB olamaz** — motorumuzun DEKAM çıktısı gerçekçi değil. Bu kadar kolay rating sıçraması banka gözünde mümkün değil.

4. **Aktif kalitesini okumuyor.** DEKAM: 407M aktif, 16M satış → aktif devir hızı 0.04 (çok düşük). Motor cari oran + özkaynak + leverage okuyup "iyiye gidiyor" diyor — ama aktif çalışmıyor.

5. **Recurring vs non-recurring gelir ayrımı yok.** 69M olağandışı gelir varsa motor "net kâr arttı" diye puanlıyor. Banka sorar: "Bu tekrar edecek mi?"

6. **Sektörel mantık çok sınırlı.** İnşaatta 202M alınan avans anormal değil (sektör doğası), imalat firmasında alarm olur. Motor bu farkı görmüyor.

### 9.3 ChatGPT'nin Önerdiği 6 Katmanlı Mimari

```
Katman 1 — Muhasebe Motoru
  Çift taraflı kayıt (debit/credit). Her aksiyon en az 2 hesap hareketi.

Katman 2 — Finansal Etki Motoru
  Likidite / leverage / kârlılık rasyoları. (Mevcut motor çoğunlukla burada.)

Katman 3 — Ekonomik Kalite Motoru ⚠️ EKSİK
  Aksiyon gerçek mi yapay mı? "Nakit sermaye artışı 1.00" vs "vade uzatma 0.30"
  Karşı bacak kalitesi: 321↓ + 102↓ (gerçek ödeme, kalite 0.95) vs
                       321↓ + 331↑ (ortak cariye aktarma, kalite 0.20)

Katman 4 — Sürdürülebilirlik Motoru ⚠️ EKSİK
  600 Yurtiçi Satışlar → recurring
  649 Diğer Olağan Gelir → yarı-recurring
  671-679 Olağandışı → non-recurring

Katman 5 — Sektörel Ağırlıklandırma ⚠️ SINIRLI
  İnşaat vs imalat vs bilişim için farklı "normallik" aralıkları

Katman 6 — Rating AI ⚠️ EKSİK
  Son yorumlayıcı katman. Tüm katmanlardan gelen verileri birleştirip
  final rating kararı verir.
```

### 9.4 Örnek Kalite Katsayısı Tablosu (ChatGPT)

| Aksiyon | Kalite Katsayısı |
|---|---|
| Nakit sermaye artışı | 1.00 |
| Gerçek stok satışı | 0.95 |
| Operasyonel kâr artışı | 0.90 |
| Finansal borç yapılandırma | 0.45 |
| Vade uzatma (KV→UV) | 0.30 |
| Muhasebe reclass | 0.15 |
| Olağandışı gelir | 0.10 |

---

## Bölüm 10 — Codex'in Teşhisi

Codex (OpenAI o1-pro benzeri model, Claude Code'un code-review asistanı) motorumuzun kaynak kodunu inceledi ve şunları söyledi:

> **"Motorun mimarisi 'hesap-bazlı muhasebe simülatörü' değil, 'oran/guardrail odaklı kural motoru'. Bu kapsam farkı kendisini DEKAM çıktısında gösteriyor."**

### 10.1 Kök Nedenler

1. **Aksiyon modeli basit:**
   - Aksiyonlar çoğunlukla source → target tek adım mantığında
   - Çok ayaklı fiş (örn. 120→102 + 653 + 320/300) doğal olarak modelde yok
   - Dosyalar: `actionCatalog.ts`, `applier.ts`

2. **Uygulama katmanı tam muhasebe motoru değil:**
   - `applyCandidate` dağıtım yapıp hareket üretir, ama kapsam sınırlı
   - Özellikle P&L (gelir tablosu) etkileri gerçek operasyon akışı yerine sadeleştirilmiş

3. **Seçim mantığı oran/score ağırlıklı:**
   - Motor "hangi aksiyon daha çok skor getirir" diye seçiyor
   - Bu yüzden A10 gibi güçlü aksiyonlar diğerlerini ezer
   - Dosya: `engine.ts`

4. **Precondition ve guardrail'ler hâlâ kaba:**
   - Bazı kurallar statik/dar kaldığı için iyi aksiyonlar elenebiliyor
   - Dosya: `candidateGenerator.ts`

### 10.2 Codex'in Çözüm Önerisi

> **"Motor kötü olduğu için değil, bilerek daha dar kapsamla kurulduğu için 'nokta atışı hesap planı' seviyesine çıkmıyor. O seviyeye çıkmak için bir sonraki adım:
> Atomic/Compound action + çok ayaklı muhasebe leg'leri + action-semantik guardrail + materiality gate"**

### 10.3 Bu Eksikliklerin DEKAM Çıktısındaki İzi

Canlı test sonucu (DEKAM 2024, BB hedefi):

| Horizon | Motor Çıktı | ChatGPT Beklentisi | Fark |
|---|---|---|---|
| Acil (0-3 ay) | 1 aksiyon: Alacak Tahsili 623K TL (+0.17 puan) | Borç senedi azaltma, nakit pozisyon artışı, satıcı vade | Motor 400M firmada 623K'lık aksiyon öneriyor — CFO için saçma |
| Yapısal (3-12 ay) | 2 aksiyon: Finansman gideri 4M + Alacak Tahsili 623K | Stok eritme, borç senedi, avans kapama, net satış artışı | A02/A03 ŞOK guardrail'e takılıyor (false positive) |
| Stratejik (1-3 yıl) | 2 aksiyon: Sermaye Artırımı ×2 (toplam 42.9M) | 15 farklı kalem, sermaye+kâr+borç+stok+YYİ+satış | Motor 14 aksiyondan sadece 1'ini seçiyor, tekrar tekrar |

**Sonuç:** Motor sadece A10 davranışı gösteriyor çünkü:
- Diğer aksiyonların kalite katsayısı hesaba katılmıyor
- Gelir tablosu etkileri doğru hesaplanmıyor (A12/A13/A14 hep ZERO_IMPACT)
- Çok ayaklı operasyonel aksiyonlar (YYİ tahsilatı, ortak borcu sermayeye çevirme) hiç modellenmiyor
- Action-semantic guardrail yok (KV→UV iyileşmesi şok sayılıyor)

---

## Bölüm 11 — ChatGPT'ye Talep: Yeni Mimari Tasarımı

ChatGPT'den aşağıdakileri tasarlaması istenmektedir:

### 11.1 ActionTemplate v3 Şeması

Mevcut ActionTemplate'e şu alanları ekleyin veya güncelleyin:
- `sustainabilityIndex: number` — 0..1, aksiyonun uzun vadeli uygulanabilirliği
- `assetProductivityDelta: { roa: number; assetTurnover: number }` — beklenen verimlilik etkisi
- `ratingImpactProfile: Record<RatingCategory, number>` — her rasyo kategorisine etki (likidite/karlılık/kaldıraç/faaliyet)
- `materialityGate: { minAbsoluteTL: number; minPctOfRelevantGroup: number }` — materiality kapısı
- `implementationPhases: Phase[]` — A/B/C/D aşamalı uygulama
- `conflictsWithExtended: { actionId: ActionId; reason: string }[]` — neden çakıştığı açıklaması

### 11.2 18-22 Aksiyon Kataloğu v3

Mevcut 14 aksiyona ek olarak tasarlanacak yeni aksiyonlar:
- **A15_RECEIVABLE_FACTORING** — Alacak faktoring / iştira
- **A16_INVENTORY_PLEDGE** — Stok rehin finansmanı (stok→kredi kaldıraç)
- **A17_LEASE_EXTENSION** — Kira yükümlülüklerini yeniden yapılandır
- **A18_SUBSIDIARY_DIVIDEND_UPSTREAM** — İştirak temettü yukarı çekme
- **A19_INTERCOMPANY_NETTING** — Grup içi alacak/borç netleştirme
- **A20_TAX_ASSET_MONETIZATION** — Ertelenmiş vergi varlığı kullanımı
- **A21_SUPPLY_CHAIN_FINANCE** — Tedarik zinciri finansmanı (alıcı kredisi)
- **A22_ASSET_REVALUATION** — Maddi duran varlık yeniden değerleme

### 11.3 Yeni Motor Pseudokodu

Tasarlanacak motor bileşenleri:
1. **MaterialityGate** — aksiyon hacminin anlamlılık kontrolü (mutlak TL + aktif payı)
2. **SustainabilityFilter** — aksiyonun tekrarlanabilirliği ve yan etki yönetimi
3. **AssetProductivityLayer** — ROA ve aktif devir hızını iyileştirecek aksiyonları önceliklendir
4. **RatingAILayer** — her rasyo kategorisinin skor katkısına göre aksiyon sıralaması
5. **MultiPeriodSimulator** — 2-3 yıl ileriye dönük simülasyon
6. **PortfolioOptimizer** — birden fazla aksiyonun birlikte optimizasyonu

### 11.4 Yeni Guardrail Seti

- `maxInventoryReductionPctPerPeriod` — her ufukta max stok azaltma oranı (imalatta %20 sınırı)
- `minLiquidityBufferPostAction` — aksiyon sonrası min nakit tamponu (aktifin %2'si)
- `maxLTLIncreaseAbsolute` — UV borç artışı mutlak sınırı (aktifin %15'i)
- `sustainabilityDecayFactor` — tekrar eden aksiyonlarda verimlilik azalması

### 11.5 DEKAM 2024 için Spesifik Beklentiler

Motor DEKAM 2024 için şu aksiyonları SEÇEBİLMELİ:

| Öncelik | Aksiyon | Gerekçe | Beklenen Skor Katkısı |
|---|---|---|---|
| 1 | A06 Stok Optimizasyonu | 367M TL stok → %10 azalt → 37M TL nakit | +3-5 puan |
| 2 | A03 Avansları UV Çevir | 202M TL avans → %20 UV → 40M TL KV azalır | +4-6 puan |
| 3 | A01/A02 KV Borç UV | 268M TL KV borç → %20 UV | +3-5 puan |
| 4 | A12 Marj İyileştirme | 1.25B TL ciro × %3 = 37M TL ek kar | +2-3 puan |
| 5 | A10 Sermaye Artırımı | Son çare, küçük tutarda | +2-3 puan |

**Toplam hedef:** +15-20 puan → 50.0 → 65-70 (BB/BBB)

**Motor, A10'u ×3 tekrar yapmamalı.** Bunun yerine yukarıdaki portföyü seçmeli.

---

## Bölüm 12 — Teknik Kısıtlar ve Notlar

### Mevcut Motorun Bilinen Sorunları

1. **A01/A02/A03 LTL hedef cap sorunu:** DEKAM'da LTL = 0 TL olduğundan `targetGroupCap = 0` ve aksiyon uygulanamıyor. Çözüm: LTL = 0 ise bilanço totalinin %5'ini kullan veya targetGroupCap hesabını bypass et.

2. **A04 nakit yokluğu:** 14K TL nakit ile A04 precondition geçemez — doğru davranış, ama motor bunu PRECONDITION_FAIL olarak raporlamalı (şu an NO_ELIGIBLE_SOURCE çıkıyor olabilir).

3. **Short horizon emergency bypass:** DEKAM'da cari oran 0.75 < 1.0 kritik sinyali tetiklemeli ama trigger olmayabilir (ratios analyzer'a düzgün aktarılmıyorsa).

4. **A10 tekrar:** Long horizonda A10 ×3 = gerçekçi değil. Aynı aksiyonu aynı ufukta 2+ kez seçmek gerçek dünyada zor.

5. **P&L aksiyon etkisi zayıf:** A12/A13/A14 kâr tablosunu iyileştiriyor ama bu bilanço'da özkaynak değişimine (590→570 geçişi) yeterince yansımıyor. Skor katkısı çok küçük.

### Öneri: Motor Mimarisinin Temel Revizyonu

```
Mevcut: 14 aksiyon × greedy iteratif × 3 ufuk
Öneri:  22 aksiyon × portföy optimizasyon × 5 yıl simülasyon
         + asset productivity layer
         + sustainability filter  
         + rating AI (category-aware prioritization)
         + sector-specific scenario templates
```

---

*Dosya sonlandı. Bu belgede tam kaynak kodu (bölüm 3-6), gerçek DB verisi (bölüm 7), motor çıktısı (bölüm 8) ve ChatGPT için mimari talep (bölüm 11) bulunmaktadır.*
