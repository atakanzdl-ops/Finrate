import { prisma } from '@/lib/db'
import { TURKEY_PPI } from '@/lib/scoring/ratios'
import { PERIOD_MONTHS } from '@/lib/periods'

// Ara dönem (Q1/Q2/Q3) verilerinde akış kalemleri oran hesabına YILLIKLANDIRILMIŞ girer
// (3 aylık ×4, 6 aylık ×2, 9 aylık ×12/9). Bilanço kalemleri dönem sonu değeridir, çarpılmaz.
// Tek kural, tek yer: upload, recalculate ve elle düzenleme (rescore) hepsi buradan geçer.

export const FLOW_FIELDS = [
  'grossSales', 'salesDiscounts', 'revenue', 'cogs', 'grossProfit', 'operatingExpenses',
  'ebit', 'ebitda', 'depreciation', 'otherIncome', 'otherExpense', 'interestExpense',
  'extraordinaryIncome', 'extraordinaryExpense', 'ebt', 'taxExpense', 'netProfit', 'purchases',
] as const

export function annualizationFactor(period: string): number {
  const months = PERIOD_MONTHS[period] ?? 12
  return months >= 12 ? 1 : 12 / months
}

export function annualizeFlows<T extends Record<string, unknown>>(fields: T, period: string): T {
  const k = annualizationFactor(period)
  if (k === 1) return fields
  const out: Record<string, unknown> = { ...fields }
  for (const f of FLOW_FIELDS) {
    const v = out[f]
    if (typeof v === 'number' && Number.isFinite(v)) out[f] = v * k
  }
  return out as T
}

export interface PrevYearData {
  revenue: number | null
  inventory: number | null
  tradeReceivables: number | null
  tradePayables: number | null
  advancesReceived: number | null
}

/** Önceki yıl: önce aynı dönem, yoksa yıllık (Q4/ANNUAL). Ciro yıllıklandırılmış döner. */
export async function findPrevYearData(entityId: string, year: number, period: string): Promise<PrevYearData | null> {
  const select = { period: true, revenue: true, inventory: true, tradeReceivables: true, tradePayables: true, advancesReceived: true }
  let prev = await prisma.financialData.findFirst({ where: { entityId, year: year - 1, period }, select })
  if (!prev) prev = await prisma.financialData.findFirst({ where: { entityId, year: year - 1, period: { in: ['ANNUAL', 'Q4'] } }, orderBy: { period: 'asc' }, select })
  if (!prev) return null
  const k = annualizationFactor(prev.period)
  return {
    revenue: prev.revenue != null ? prev.revenue * k : null,
    inventory: prev.inventory, tradeReceivables: prev.tradeReceivables,
    tradePayables: prev.tradePayables, advancesReceived: prev.advancesReceived,
  }
}

/** calculateRatios girdisi: yıllıklandırılmış akışlar + sektör + önceki yıl + ÜFE. */
export async function buildRatioInput(
  fields: Record<string, unknown>,
  ctx: { entityId: string; year: number; period: string; sector: string | null },
) {
  const prev = await findPrevYearData(ctx.entityId, ctx.year, ctx.period)
  return {
    ...annualizeFlows(fields, ctx.period),
    sector:               ctx.sector,
    prevRevenue:          prev?.revenue          ?? null,
    prevInventory:        prev?.inventory        ?? null,
    prevTradeReceivables: prev?.tradeReceivables ?? null,
    prevTradePayables:    prev?.tradePayables    ?? null,
    prevAdvancesReceived: prev?.advancesReceived ?? null,
    ppiRate:              TURKEY_PPI[ctx.year] ?? TURKEY_PPI[2024],
  }
}
