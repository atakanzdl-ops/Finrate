import type {
  AccountLine, GroupCode, GroupAnalysis, GroupTopComposition,
  SixGroupAnalysis, RatioCode, RatioValue, SectorCode,
  MicroFilterConfig, ActionId,
} from './contracts'
import { DEFAULT_MICRO_FILTER } from './contracts'
import { CHART_OF_ACCOUNTS } from '../chartOfAccounts'
import { mapSectorToCode } from './sectorProfiles'

/**
 * Hesap kodu aralığına göre GroupCode belirler.
 * 100-199 → CURRENT_ASSETS, 200-299 → NON_CURRENT_ASSETS, vb.
 */
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

/**
 * Hesap koduna bakıp hangi aksiyonlarda kaynak olabileceğini döndürür.
 * actionCatalog.ts'deki sourceAccountPrefixes ile eşleştirme yapar.
 */
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

/**
 * Herfindahl-Hirschman Index — konsantrasyon ölçümü (0..1)
 */
function calculateHHI(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0)
}

/**
 * Bir grup için en büyük 3 kalemi bulur ve konsantrasyon metrikleri üretir.
 */
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

/**
 * AccountLine'lardan materiality/manageability skorları hesaplar.
 */
function computeGroupScores(total: number, assetsTotal: number, group: GroupCode): {
  materialityScore: number
  manageabilityScore: number
  costScore: number
} {
  const shareOfAssets = assetsTotal > 0 ? total / assetsTotal : 0
  const materiality = Math.min(1, shareOfAssets / 0.5)

  const manageabilityByGroup: Record<GroupCode, number> = {
    CURRENT_ASSETS: 0.75,
    NON_CURRENT_ASSETS: 0.40,
    SHORT_TERM_LIABILITIES: 0.70,
    LONG_TERM_LIABILITIES: 0.55,
    EQUITY: 0.50,
    INCOME_STATEMENT: 0.65,
    EXTERNAL: 0.60,
  }

  const costByGroup: Record<GroupCode, number> = {
    CURRENT_ASSETS: 0.80,
    NON_CURRENT_ASSETS: 0.45,
    SHORT_TERM_LIABILITIES: 0.70,
    LONG_TERM_LIABILITIES: 0.60,
    EQUITY: 0.40,
    INCOME_STATEMENT: 0.65,
    EXTERNAL: 0.50,
  }

  return {
    materialityScore: materiality,
    manageabilityScore: manageabilityByGroup[group],
    costScore: costByGroup[group],
  }
}

/**
 * Ham FinancialAccount kayıtlarını SixGroupAnalysis'e dönüştürür.
 * Motorun giriş noktası.
 */
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

  // Kontra hesapları işle (amount -)
  const adjusted = accounts.map(a => {
    const meta = CHART_OF_ACCOUNTS[a.accountCode]
    const signedAmount = meta?.contra ? -Math.abs(a.amount) : a.amount
    return { code: a.accountCode, amount: signedAmount, meta }
  }).filter(a => a.amount !== 0)

  // Her hesap için grup belirle
  const lines: AccountLine[] = adjusted
    .map(a => {
      const group = codeToGroup(a.code)
      if (!group) return null
      return {
        accountCode: a.code,
        accountName: a.meta?.name ?? `Bilinmeyen (${a.code})`,
        group,
        amount: a.amount,
        shareInGroup: 0,  // sonradan hesaplanacak
        shareInBalanceSheet: 0,
        isMicro: false,
        eligibleForActions: eligibleActionsForAccount(a.code),
      } as AccountLine
    })
    .filter((l): l is AccountLine => l !== null)

  // Grup toplamları
  const groupTotals: Record<Exclude<GroupCode, "EXTERNAL">, number> = {
    CURRENT_ASSETS: 0,
    NON_CURRENT_ASSETS: 0,
    SHORT_TERM_LIABILITIES: 0,
    LONG_TERM_LIABILITIES: 0,
    EQUITY: 0,
    INCOME_STATEMENT: 0,
  }

  for (const line of lines) {
    if (line.group !== "EXTERNAL") {
      groupTotals[line.group as Exclude<GroupCode, "EXTERNAL">] += line.amount
    }
  }

  const assetsTotal = groupTotals.CURRENT_ASSETS + groupTotals.NON_CURRENT_ASSETS
  const liabilitiesAndEquityTotal =
    groupTotals.SHORT_TERM_LIABILITIES +
    groupTotals.LONG_TERM_LIABILITIES +
    groupTotals.EQUITY
  const incomeStatementTotal = Math.abs(groupTotals.INCOME_STATEMENT)
  const revenueTotal = lines
    .filter(l => l.accountCode.startsWith('600') || l.accountCode.startsWith('601') || l.accountCode.startsWith('602'))
    .reduce((s, l) => s + l.amount, 0)

  // Her line için share hesapla
  for (const line of lines) {
    const groupTotal = line.group !== "EXTERNAL" ? groupTotals[line.group as Exclude<GroupCode, "EXTERNAL">] : 0
    line.shareInGroup = groupTotal !== 0 ? Math.abs(line.amount / groupTotal) : 0
    line.shareInBalanceSheet = assetsTotal !== 0 ? Math.abs(line.amount / assetsTotal) : 0
    line.isMicro =
      line.shareInGroup < microCfg.minLineShareInGroup ||
      Math.abs(line.amount) < microCfg.minLineAmountTry
  }

  // Her grup için GroupAnalysis üret
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
      group: g,
      total,
      shareOfReferenceBase: shareOfRef,
      composition,
      benchmarkComparisons: [],  // Aşama 4b'de doldurulacak
      improvableItems,
      materialityScore: scores.materialityScore,
      manageabilityScore: scores.manageabilityScore,
      costScore: scores.costScore,
      basePriorityScore: basePriority,
    }
  }

  // Ratios — eksik olanları 0 yap
  const allRatioCodes: RatioCode[] = [
    "CURRENT_RATIO", "QUICK_RATIO", "CASH_RATIO", "NET_WORKING_CAPITAL_RATIO",
    "DEBT_TO_EQUITY", "EQUITY_RATIO", "INTEREST_COVERAGE", "NET_DEBT_TO_EBITDA",
  ]
  const ratios: Record<RatioCode, RatioValue> = {} as Record<RatioCode, RatioValue>
  for (const code of allRatioCodes) {
    ratios[code] = {
      code,
      value: options.ratios?.[code] ?? 0,
    }
  }

  // Parser'dan kaçmış ters bakiyeler için emniyet ağı (ikinci katman)
  const residualReversals: string[] = []

  for (const a of adjusted) {
    const meta = a.meta
    if (!meta) continue

    // Varlık/gider hesabı negatif bakiye veriyorsa (contra olmayan)
    if (!meta.contra && a.amount < 0 && (meta.side === 'ASSET' || meta.side === 'EXPENSE')) {
      residualReversals.push(
        `${a.code} (${meta.name}) negatif bakiye: ${a.amount.toLocaleString('tr-TR')}`
      )
    }

    // Pasif/gelir/özkaynak hesabı pozitif büyüklükte negatif bakiye veriyorsa — anormal
    if (!meta.contra && a.amount < 0 && (meta.side === 'LIABILITY' || meta.side === 'INCOME' || meta.side === 'EQUITY')) {
      residualReversals.push(
        `${a.code} (${meta.name}) negatif bakiye (${meta.side}): ${a.amount.toLocaleString('tr-TR')}`
      )
    }
  }

  return {
    schemaVersion: "1.0.0",
    scenarioId: options.scenarioId,
    companyId: options.companyId,
    asOfDate: options.asOfDate ?? new Date().toISOString().slice(0, 10),
    currency: "TRY",
    sector: sectorCode,
    totals: {
      assets: assetsTotal,
      liabilitiesAndEquity: liabilitiesAndEquityTotal,
      incomeStatementTotal,
      revenueTotal,
    },
    groups,
    accounts: lines,
    ratios,
    benchmarkSetId: options.benchmarkSetId ?? "default_tcmb_2024",
    ...(residualReversals.length > 0 && { warnings: residualReversals }),
  }
}
