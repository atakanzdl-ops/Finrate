import type { SixGroupAnalysis, SectorCode, MicroFilterConfig, ActionId } from './contracts'
import type { StressLevel } from './dynamicThresholds'
import { SECTOR_PROFILES } from './sectorProfiles'

function sumAccounts(analysis: SixGroupAnalysis, codes: string[]): number {
  return analysis.accounts
    .filter(a => codes.includes(a.accountCode))
    .reduce((sum, a) => sum + Math.abs(a.amount), 0)
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

const STRESS_ADJ_A04: Record<StressLevel, number> = {
  NO_STRESS: 1.10,
  MILD: 1.00,
  MODERATE: 0.90,
  SEVERE: 0.80,
}

/**
 * A04 — Nakit ile KV Borç Kapat
 * Koşullar: cashPool >= minActionAmt && xMaxBuffer >= minActionAmt
 */
export interface A04Result {
  pass: boolean
  cashPool: number
  rMin: number
  xMaxBuffer: number
  minActionAmt: number
  reasons: string[]
}

export function evaluateA04(
  analysis: SixGroupAnalysis,
  stressLevel: StressLevel,
  microFilter: MicroFilterConfig,
  sectorP25CashRatio: number = 0.08
): A04Result {
  const reasons: string[] = []
  const cashPool = sumAccounts(analysis, ['101', '102', '108'])
  const kvyk = Math.abs(analysis.groups.SHORT_TERM_LIABILITIES.total)
  const assets = Math.max(analysis.totals.assets, 1)

  const stressAdj = STRESS_ADJ_A04[stressLevel]
  const rMin = clamp(Math.max(0.03, sectorP25CashRatio * 0.90) * stressAdj, 0.02, 0.12)

  const xMaxBuffer = kvyk > 0 && rMin < 1
    ? Math.max(0, (cashPool - rMin * kvyk) / (1 - rMin))
    : 0

  const minActionAmt = Math.max(
    microFilter.minLineAmountTry,
    assets * microFilter.minActionAmountPctAssets
  )

  if (cashPool < minActionAmt) {
    reasons.push(`Nakit havuzu yetersiz: ${cashPool.toLocaleString('tr-TR')} < ${minActionAmt.toLocaleString('tr-TR')}`)
  }
  if (xMaxBuffer < minActionAmt) {
    reasons.push(`Post-action nakit tampon yetersiz: xMaxBuffer=${xMaxBuffer.toLocaleString('tr-TR')}`)
  }

  return {
    pass: cashPool >= minActionAmt && xMaxBuffer >= minActionAmt,
    cashPool,
    rMin,
    xMaxBuffer,
    minActionAmt,
    reasons,
  }
}

/**
 * A05 — Alacak Tahsili
 */
export interface A05Result {
  pass: boolean
  tradeRec: number
  minRecAmt: number
  minRecPctAssets: number
  actualPct: number
  reasons: string[]
}

export function evaluateA05(
  analysis: SixGroupAnalysis,
  microFilter: MicroFilterConfig,
  sectorMedianRecShareAssets?: number
): A05Result {
  const reasons: string[] = []
  const tradeRec = sumAccounts(analysis, ['120', '121', '126', '127'])
  const assets = Math.max(analysis.totals.assets, 1)

  const median = sectorMedianRecShareAssets ?? 0.02
  const minRecPctAssets = clamp(0.35 * median, 0.015, 0.05)
  const minRecAmt = Math.max(microFilter.minLineAmountTry, assets * minRecPctAssets)
  const actualPct = tradeRec / assets

  if (tradeRec < minRecAmt) {
    reasons.push(`Alacak bakiyesi yetersiz: ${tradeRec.toLocaleString('tr-TR')} < ${minRecAmt.toLocaleString('tr-TR')}`)
  }
  if (actualPct < minRecPctAssets) {
    reasons.push(`Alacak/Aktif oranı düşük: ${(actualPct * 100).toFixed(2)}% < ${(minRecPctAssets * 100).toFixed(2)}%`)
  }

  return {
    pass: tradeRec >= minRecAmt && actualPct >= minRecPctAssets,
    tradeRec,
    minRecAmt,
    minRecPctAssets,
    actualPct,
    reasons,
  }
}

/**
 * A06 — Stok Optimizasyonu
 */
export interface A06Result {
  pass: boolean
  inventory: number
  invShareCA: number
  minInvShareCA: number
  minInvAmt: number
  reasons: string[]
}

const SECTOR_INV_FLOOR: Record<SectorCode, number> = {
  MANUFACTURING: 0.08,
  TRADE: 0.08,
  RETAIL: 0.08,
  CONSTRUCTION: 0.06,
  SERVICES: 0.12,
  IT: 0.12,
}

export function evaluateA06(
  analysis: SixGroupAnalysis,
  microFilter: MicroFilterConfig
): A06Result {
  const reasons: string[] = []
  const inventory = sumAccounts(analysis, ['150', '151', '152', '153', '157'])
  const currentAssets = Math.abs(analysis.groups.CURRENT_ASSETS.total)
  const assets = Math.max(analysis.totals.assets, 1)

  const invShareCA = currentAssets > 0 ? inventory / currentAssets : 0
  const sectorProfile = SECTOR_PROFILES[analysis.sector]
  const sectorMedInvCA = sectorProfile.normalRanges.inventoryShareOfCurrentAssets?.median ?? 0.15
  const sectorFloor = SECTOR_INV_FLOOR[analysis.sector] ?? 0.08
  const minInvShareCA = clamp(sectorMedInvCA * 0.65, sectorFloor, 0.45)

  const inventoryHeavy = ['MANUFACTURING', 'TRADE', 'RETAIL'].includes(analysis.sector)
  const pctBase = inventoryHeavy ? 0.01 : 0.004
  const minInvAmt = Math.max(microFilter.minLineAmountTry, assets * pctBase)

  if (inventory < minInvAmt) {
    reasons.push(`Stok bakiyesi yetersiz: ${inventory.toLocaleString('tr-TR')} < ${minInvAmt.toLocaleString('tr-TR')}`)
  }
  if (invShareCA < minInvShareCA) {
    reasons.push(`Stok/Dönen Varlık oranı düşük: ${(invShareCA * 100).toFixed(2)}% < ${(minInvShareCA * 100).toFixed(2)}%`)
  }

  return {
    pass: inventory >= minInvAmt && invShareCA >= minInvShareCA,
    inventory,
    invShareCA,
    minInvShareCA,
    minInvAmt,
    reasons,
  }
}

/**
 * A07 — Peşin Gider Çözme
 */
export interface A07Result {
  pass: boolean
  prepaid: number
  minPrepaidAmt: number
  minPrepaidPctAssets: number
  actualPct: number
  reasons: string[]
}

export function evaluateA07(
  analysis: SixGroupAnalysis,
  microFilter: MicroFilterConfig,
  sectorMedianPrepaidShareAssets?: number
): A07Result {
  const reasons: string[] = []
  const prepaid = sumAccounts(analysis, ['180', '181'])
  const assets = Math.max(analysis.totals.assets, 1)

  const median = sectorMedianPrepaidShareAssets ?? 0.004
  const minPrepaidPctAssets = clamp(0.25 * median, 0.003, 0.012)
  const minPrepaidAmt = Math.max(microFilter.minLineAmountTry * 0.60, assets * minPrepaidPctAssets)
  const actualPct = prepaid / assets

  if (prepaid < minPrepaidAmt) {
    reasons.push(`Peşin gider yetersiz: ${prepaid.toLocaleString('tr-TR')} < ${minPrepaidAmt.toLocaleString('tr-TR')}`)
  }
  if (actualPct < minPrepaidPctAssets) {
    reasons.push(`Peşin gider/Aktif düşük: ${(actualPct * 100).toFixed(3)}% < ${(minPrepaidPctAssets * 100).toFixed(3)}%`)
  }

  return {
    pass: prepaid >= minPrepaidAmt && actualPct >= minPrepaidPctAssets,
    prepaid,
    minPrepaidAmt,
    minPrepaidPctAssets,
    actualPct,
    reasons,
  }
}

/**
 * Tüm dinamik precondition'ları değerlendirir.
 * actionId için geçerlilik döndürür.
 */
export function evaluateDynamicPrecondition(
  actionId: ActionId,
  analysis: SixGroupAnalysis,
  context: {
    stressLevel: StressLevel
    microFilter: MicroFilterConfig
  }
): { pass: boolean; reasons: string[] } {
  switch (actionId) {
    case 'A04_CASH_PAYDOWN_ST': {
      const r = evaluateA04(analysis, context.stressLevel, context.microFilter)
      return { pass: r.pass, reasons: r.reasons }
    }
    case 'A05_RECEIVABLE_COLLECTION': {
      const r = evaluateA05(analysis, context.microFilter)
      return { pass: r.pass, reasons: r.reasons }
    }
    case 'A06_INVENTORY_OPTIMIZATION': {
      const r = evaluateA06(analysis, context.microFilter)
      return { pass: r.pass, reasons: r.reasons }
    }
    case 'A07_PREPAID_EXPENSE_RELEASE': {
      const r = evaluateA07(analysis, context.microFilter)
      return { pass: r.pass, reasons: r.reasons }
    }
    default:
      // Diğer aksiyonlar için dinamik kural yok
      return { pass: true, reasons: [] }
  }
}
