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
  accountCode: string              // e.g., "340"
  accountName: string              // e.g., "Alınan Sipariş Avansları"
  group: GroupCode
  amount: number
  shareInGroup: number             // 0..1
  shareInBalanceSheet: number      // 0..1
  tags?: string[]                  // e.g., ["financial_debt", "trade_payable", "advance"]
  isMicro: boolean
  eligibleForActions: ActionId[]
}

export interface GroupTopComposition {
  top3: AccountLine[]              // max 3 lines
  top3Share: number                // 0..1
  top1Share: number                // 0..1
  hhi: number                      // concentration index 0..1
}

export interface BenchmarkComparison {
  metricKey: string                // e.g. "customerAdvancesShareOfSTL"
  p25: number
  median: number
  p75: number
  companyValue: number
  gapToMedian: number              // company - median
  zScore?: number
  inRange: boolean
}

export interface GroupAnalysis {
  group: GroupCode
  total: number
  shareOfReferenceBase: number     // 0..1 (assets/liabilities base, IS for income)
  composition: GroupTopComposition
  benchmarkComparisons: BenchmarkComparison[]
  improvableItems: string[]        // account codes suggested for action
  materialityScore: number         // 0..1
  manageabilityScore: number       // 0..1
  costScore: number                // 0..1 (higher is cheaper)
  basePriorityScore: number        // 0..100 = materiality * manageability * cost * 100
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
  asOfDate: string                 // ISO date
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
}

export interface AmountRangeRule {
  basis: AmountBasis
  minPct: number                   // 0..1
  suggestedPct: number             // 0..1
  maxPct: number                   // 0..1
  absoluteMin?: number             // TRY
  absoluteMax?: number             // TRY
}

export interface AccountMappingRule {
  sourceAccountPrefixes: string[]  // e.g. ["300", "303"]
  targetAccountPrefixes: string[]  // e.g. ["400", "403"]
  mappingMode: "ONE_TO_ONE_PREFIX" | "ONE_TO_MANY" | "MANY_TO_ONE"
  note?: string
}

export interface ConditionRule {
  key: string                      // e.g. "ratio.CURRENT_RATIO", "group.SHORT_TERM_LIABILITIES.share"
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
  baseManageability: number        // 0..1
  implementationCostIndex: number  // 0..1 (higher = more expensive)
  confidence: number               // 0..1
  conflictsWith: ActionId[]
  synergiesWith: ActionId[]
}

export interface AccountMovement {
  accountCode: string
  delta: number                    // + increase / - decrease
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
    materiality: number            // 0..1
    manageability: number          // 0..1
    costScore: number              // 0..1
    feasibilityMultiplier: number  // 0..1
    impactMultiplier: number       // 0..1
    confidenceMultiplier: number   // 0..1
    finalPriorityScore: number     // 0..100
  }
}

export interface MeaningfulImpactThresholds {
  minCurrentRatioDelta: number                 // default +0.03
  minEquityRatioDelta: number                  // default +0.005 (0.5pp)
  minInterestCoverageDelta: number             // default +0.20x
  minNetWorkingCapitalDeltaPctAssets: number   // default +0.003
}

export interface MicroFilterConfig {
  minLineShareInGroup: number                  // default 0.05
  minLineAmountTry: number                     // default 2_000_000
  minActionAmountPctAssets: number             // default 0.002
  maxMicroContributionShare: number            // default 0.30
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

// Default config değerleri
export const DEFAULT_THRESHOLDS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.03,
  minEquityRatioDelta: 0.005,
  minInterestCoverageDelta: 0.20,
  minNetWorkingCapitalDeltaPctAssets: 0.003,
}

// Dinamik eşik sınırları — Codex 5a-3 spesifikasyonu
export const THRESHOLD_FLOORS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.01,
  minEquityRatioDelta: 0.002,
  minInterestCoverageDelta: 0.05,
  minNetWorkingCapitalDeltaPctAssets: 0.001,
}

export const THRESHOLD_CEILINGS: MeaningfulImpactThresholds = {
  minCurrentRatioDelta: 0.05,
  minEquityRatioDelta: 0.008,
  minInterestCoverageDelta: 0.30,
  minNetWorkingCapitalDeltaPctAssets: 0.006,
}

export const DEFAULT_MICRO_FILTER: MicroFilterConfig = {
  minLineShareInGroup: 0.05,
  minLineAmountTry: 2_000_000,
  minActionAmountPctAssets: 0.002,
  maxMicroContributionShare: 0.30,
}
