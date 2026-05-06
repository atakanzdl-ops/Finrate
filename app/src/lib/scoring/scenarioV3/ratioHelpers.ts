/**
 * SCENARIO ENGINE V3 — Ratio Helpers
 *
 * computeAmount altyapısı için yardımcı fonksiyonlar.
 */

import type {
  FirmContext,
  ActionTemplateV3,
  RatioTransparency,
  BalanceRatioTransparency,
  MarginRatioTransparency,
  TurnoverRatioTransparency,
  AttributionSource,
} from './contracts'
import { getSectorBenchmark } from '../benchmarks'
import type { SectorBenchmark } from '../benchmarks'

// ─── buildRatioTransparency ──────────────────────────────────────────────────

/**
 * UI transparency bloku için metadata üretir.
 * Backend source of truth — UI sadece render eder.
 *
 * INTENTIONALLY GENERIC: Şu an A05 için. A06 (DIO), A12 (marj),
 * A14 (finansman gideri) vb. aksiyonlar aynı pipeline'a bağlanacak.
 * getCurrentBalanceForAction switch'i genişletilerek eklenir.
 */
export function buildRatioTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  capped: number
): RatioTransparency | null {
  if (!action.targetRatio) return null

  const tr = action.targetRatio
  const benchmark = getBenchmarkValue(ctx.sector, tr.benchmarkField)
  const targetDays = benchmark?.value ?? tr.fallback ?? 90

  const period = getPeriodDays({ period: (ctx as any).period ?? 'ANNUAL' })
  const periodDays = period.days

  const basisValue = getBasisValueForTransparency(ctx, tr.basis)
  if (!basisValue || basisValue <= 0) return null

  const currentBalance = getCurrentBalanceForAction(action, ctx)
  if (currentBalance <= 0) return null

  const sectorMedian = (basisValue * targetDays) / periodDays

  // Math.max ile sıfıra clamp — realisticTarget asla negatif olmaz
  const realisticTarget = Math.max(currentBalance - capped, 0)

  const sourceType: AttributionSource = !benchmark
    ? 'FALLBACK'
    : (benchmark.reliability as AttributionSource)

  return {
    currentBalance,
    realisticTarget,
    sectorMedian,
    capPercent: 0.25,
    formula: {
      targetLabel: getTargetLabelForAction(action, tr),
      basisLabel: getBasisLabel(tr.basis),
      basisValue,
      targetDays,
      periodDays,
    },
    attribution: {
      sourceType,
      sectorLabel: getSectorLabel(ctx.sector),
      year: 2024,
    },
    method: 'period-end-balance',
  }
}

function getBasisValueForTransparency(
  ctx: FirmContext,
  basis: 'netSales' | 'cogs' | 'totalAssets'
): number | null {
  if (basis === 'netSales') return (ctx as any).netSales ?? ctx.totalRevenue ?? null
  if (basis === 'cogs') return getCogs(ctx)
  if (basis === 'totalAssets') return ctx.totalAssets ?? null
  return null
}

function getBasisLabel(basis: 'netSales' | 'cogs' | 'totalAssets'): string {
  if (basis === 'netSales') return 'Net Satış'
  if (basis === 'cogs') return 'Satılan Mal Maliyeti'
  if (basis === 'totalAssets') return 'Toplam Aktif'
  return basis
}

function getSectorLabel(sector: string): string {
  const label = (SECTOR_CODE_TO_TR as Record<string, string>)[sector] ?? 'Genel'
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getTargetLabelForAction(
  action: ActionTemplateV3,
  tr: NonNullable<ActionTemplateV3['targetRatio']>
): string {
  const id = action.id
  if (id.includes('A05') || tr.metric === 'DSO') return 'Hedef Alacak'
  if (tr.metric === 'DIO') return 'Hedef Stok'
  if (tr.metric === 'GROSS_MARGIN') return 'Hedef Brüt Kâr'
  return 'Hedef Tutar'
}

/**
 * Aksiyon için "current balance" çeker.
 * INTENTIONALLY GENERIC — A06/A12 için switch genişletilecek.
 */
function getCurrentBalanceForAction(action: ActionTemplateV3, ctx: FirmContext): number {
  const id = action.id
  if (id.includes('A05')) {
    return (ctx.accountBalances?.['120'] ?? 0) + (ctx.accountBalances?.['121'] ?? 0)
  }
  return 0
}

// ─── getCogs ────────────────────────────────────────────────────────────────

/**
 * FirmContext'ten satılan mal maliyeti türetir.
 * cogs alanı varsa kullanır, yoksa netSales - grossProfit.
 */
export function getCogs(ctx: FirmContext): number | null {
  if ('cogs' in ctx && typeof (ctx as any).cogs === 'number' && (ctx as any).cogs > 0) {
    return (ctx as any).cogs
  }
  if (ctx.netSales > 0 && typeof ctx.grossProfit === 'number') {
    const derived = ctx.netSales - ctx.grossProfit
    return derived > 0 ? derived : null
  }
  return null
}

// ─── getPeriodDays ───────────────────────────────────────────────────────────

/**
 * FinancialData'dan dönem gün sayısını döner.
 * FinancialData.period alanı: 'ANNUAL' | 'Q1' | 'Q2' | 'Q3' | 'Q4' | string
 * periodStart + periodEnd varsa hesapla.
 * Period source unknown ise 365 + console.warn.
 * Sessiz varsayım yapılmaz.
 */
export function getPeriodDays(fd: any): { days: number; source: 'explicit' | 'derived' | 'unknown' } {
  // periodStart + periodEnd mevcutsa hesapla
  if (fd && fd.periodStart && fd.periodEnd) {
    const start = new Date(fd.periodStart)
    const end   = new Date(fd.periodEnd)
    const ms    = end.getTime() - start.getTime()
    if (!isNaN(ms) && ms > 0) {
      const days = Math.round(ms / (1000 * 60 * 60 * 24))
      return { days, source: 'explicit' }
    }
  }

  // FinancialData.period string alanından türet
  if (fd && typeof fd.period === 'string') {
    const p = fd.period.toUpperCase()
    if (p === 'ANNUAL' || p === 'FULL_YEAR') {
      return { days: 365, source: 'derived' }
    }
    if (p === 'Q1' || p === 'Q2' || p === 'Q3' || p === 'Q4') {
      return { days: 90, source: 'derived' }
    }
    if (p === 'H1' || p === 'H2') {
      return { days: 182, source: 'derived' }
    }
    if (p === '9M') {
      return { days: 273, source: 'derived' }
    }
  }

  // Fallback: 365 + warn
  console.warn(
    '[ratioHelpers] getPeriodDays: period belirlenemedi, 365 gün varsayıldı.',
    { period: fd?.period, periodStart: fd?.periodStart, periodEnd: fd?.periodEnd }
  )
  return { days: 365, source: 'unknown' }
}

// ─── getBenchmarkValue ───────────────────────────────────────────────────────

/**
 * TCMB_DIRECT olarak doğrudan yayınlanan SectorBenchmark alanları.
 * Diğerleri FINRATE_ESTIMATE (model tahmini).
 */
const TCMB_DIRECT_FIELDS: ReadonlySet<keyof SectorBenchmark> = new Set([
  'currentRatio',
  'quickRatio',
  'grossMargin',
  'netProfitMargin',
  'roa',
  'roe',
  'debtToEquity',
  'debtToAssets',
  'interestCoverage',
  'assetTurnover',
  'receivablesDays',
  'inventoryDays',
])

/**
 * SectorCode (İngilizce enum) → getSectorBenchmark için Türkçe keyword eşleştirmesi.
 * getSectorBenchmark Türkçe string arar; SectorCode doğrudan geçilirse 'Genel' dönüyor.
 */
const SECTOR_CODE_TO_TR: Record<string, string> = {
  CONSTRUCTION:  'inşaat',
  MANUFACTURING: 'imalat',
  TRADE:         'ticaret',
  RETAIL:        'perakende',
  SERVICES:      'hizmet',
  IT:            'bilişim',
}

/**
 * Sektör + alan için TCMB benchmark değerini döner.
 * Bulunamazsa null — caller targetRatio.fallback kullanır.
 * sector: SectorCode (İngilizce) veya Türkçe sektör string'i
 */
export function getBenchmarkValue(
  sector: string,
  field: keyof SectorBenchmark
): { value: number; reliability: 'TCMB_DIRECT' | 'FINRATE_ESTIMATE' } | null {
  // SectorCode → Türkçe çevir (getSectorBenchmark keyword match için gerekli)
  const lookupSector = SECTOR_CODE_TO_TR[sector.toUpperCase()] ?? sector
  const bm = getSectorBenchmark(lookupSector)
  if (!bm) return null
  const value = bm[field]
  if (typeof value !== 'number') return null
  const reliability = TCMB_DIRECT_FIELDS.has(field) ? 'TCMB_DIRECT' : 'FINRATE_ESTIMATE'
  return { value, reliability }
}

// ─── applyFeasibilityCap ─────────────────────────────────────────────────────

/**
 * Feasibility cap uygular. Negatif dönmez.
 * Sonuç 0 olabilir — caller bunu null'a çevirip fallback'e geçer.
 *
 * @param currentBalance  Mevcut bakiye (TL)
 * @param targetBalance   Hedef bakiye (TL)
 * @param capPercent      Maksimum hareket oranı (varsayılan: %25)
 */
export function applyFeasibilityCap(
  currentBalance: number,
  targetBalance:  number,
  capPercent:     number = 0.25
): number {
  const maxMovement    = currentBalance * capPercent
  const desiredMovement = Math.max(currentBalance - targetBalance, 0)
  return Math.min(desiredMovement, maxMovement)
}

// ─── Metrik bazlı üreticiler (B3b-3) ─────────────────────────────────────────

/**
 * A06 — DIO (Stok Çevrimi Günü) transparency.
 * currentBalance:  toplam stok (150-153)
 * realisticTarget: aksiyonun panel tutarı kadar stok azalışı → max(stok - amount, 0)
 * sectorMedian:    TCMB benchmark hedef stok düzeyi (cogs × targetDays / 365)
 */
function buildDIORatioTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): BalanceRatioTransparency | null {
  const stockBalance =
    (ctx.accountBalances['150'] ?? 0) +
    (ctx.accountBalances['151'] ?? 0) +
    (ctx.accountBalances['152'] ?? 0) +
    (ctx.accountBalances['153'] ?? 0)

  if (stockBalance <= 0) return null

  // COGS: önce doğrudan hesap bakiyeleri, yoksa netSales - grossProfit
  const rawCogs =
    (ctx.accountBalances['620'] ?? 0) +
    (ctx.accountBalances['621'] ?? 0) +
    (ctx.accountBalances['622'] ?? 0) +
    (ctx.accountBalances['623'] ?? 0)
  const cogs = rawCogs > 0 ? rawCogs : (getCogs(ctx) ?? 0)
  if (cogs <= 0) return null

  const benchmarkField = (action.targetRatio?.benchmarkField ?? 'inventoryDays') as keyof import('../benchmarks').SectorBenchmark
  const bm = getBenchmarkValue(ctx.sector, benchmarkField)
  const targetDays  = bm?.value ?? action.targetRatio?.fallback ?? 90
  const periodDays  = 365

  // realisticTarget: panel aksiyonunun stoka etkisi (sıfıra clamp)
  const realisticTarget = Math.max(stockBalance - amount, 0)
  // sectorMedian: TCMB benchmark referansı (DIO formülü)
  const sectorMedian = (cogs * targetDays) / periodDays

  const sourceType: AttributionSource = bm
    ? (bm.reliability as AttributionSource)
    : 'FALLBACK'

  return {
    kind: 'balance',
    currentBalance: stockBalance,
    realisticTarget,
    sectorMedian,
    capPercent: 0.25,
    formula: {
      targetLabel: 'Hedef Stok',
      basisLabel:  'Satılan Mal Maliyeti',
      basisValue:  cogs,
      targetDays,
      periodDays,
    },
    attribution: {
      sourceType,
      sectorLabel: getSectorLabel(ctx.sector),
      year: new Date().getFullYear(),
    },
    method: 'period-end-balance',
  }
}

/**
 * A12 — Brüt Kâr Marjı transparency.
 * current: mevcut brüt marj
 * realisticTarget: aksiyon sonrası beklenen marj (sektör medyanı ile sınırlı)
 */
function buildMarginRatioTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): MarginRatioTransparency | null {
  const netSales    = ctx.netSales    ?? 0
  const grossProfit = ctx.grossProfit ?? 0

  if (netSales <= 0 || grossProfit < 0) return null

  const current = grossProfit / netSales

  const benchmarkField = (action.targetRatio?.benchmarkField ?? 'grossMargin') as keyof import('../benchmarks').SectorBenchmark
  const bm = getBenchmarkValue(ctx.sector, benchmarkField)
  const sectorMedian = bm?.value ?? action.targetRatio?.fallback ?? 0.30

  // Aksiyon sonrası gerçekçi marj — sektör medyanını aşmaz.
  // Faz 7.3.43D-pre: mevcut marj zaten sektör medyanı üstündeyse
  // realisticTarget = current (aşağı yön gösterme).
  const realisticTarget = current >= sectorMedian
    ? current
    : Math.min(current + amount / netSales, sectorMedian)

  return {
    kind: 'margin',
    metricLabel: 'Brüt Kâr Marjı',
    current,
    realisticTarget,
    sectorMedian,
    formula: {
      description: 'Brüt Kâr Marjı = (Net Satış − Maliyet) / Net Satış',
      netSales,
      costToReduce: amount,
      accounts: [
        { code: '320', name: 'Satıcılar',              delta: -amount, description: 'Tedarikçi iskonto'  },
        { code: '621', name: 'Satılan Mal Maliyeti',   delta: -amount, description: 'Maliyet azalışı'    },
      ],
    },
  }
}

/**
 * A10 — Özkaynak / Aktif (Equity Ratio) transparency.
 *
 * Hem pay hem payda aynı anda artar: ortak nakit koyduğunda 102 Bankalar
 * (aktif) ve 500 Sermaye (özkaynak) eş miktarda artar.
 *   current          = totalEquity / totalAssets
 *   realisticTarget  = (totalEquity + amount) / (totalAssets + amount)
 *   sectorMedian     = 1 − benchmark.debtToAssets    (TCMB kaynağı)
 *
 * MarginRatioTransparency yeniden kullanılır (kind: 'margin') — format
 * zaten yüzde, UI renderMarginBlock + formatPercent ile gösterir.
 * contracts.ts ve RatioTransparencyBlock.tsx değişmez.
 */
function buildEquityRatioTransparency(
  _action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): MarginRatioTransparency | null {
  if (amount <= 0) return null

  const totalAssets = ctx.totalAssets ?? 0
  // runtime guard: FirmContext.totalEquity: number ama JS'de undefined gelebilir
  const totalEquity = (ctx as any).totalEquity as number | undefined | null
  if (totalAssets <= 0) return null
  if (totalEquity === undefined || totalEquity === null || isNaN(totalEquity)) return null

  const current         = totalEquity / totalAssets
  const realisticTarget = (totalEquity + amount) / (totalAssets + amount)

  // TCMB sektör kıyası: 1 − debtToAssets
  const bm              = getBenchmarkValue(ctx.sector, 'debtToAssets')
  const sectorDebtToAssets = bm?.value ?? 0.66
  const sectorMedian    = 1 - sectorDebtToAssets

  return {
    kind: 'margin',
    metricLabel: 'Özkaynak / Aktif',
    current,
    realisticTarget,
    sectorMedian,
    formula: {
      description:
        'Özkaynak / Aktif = Özkaynaklar / Toplam Aktif ' +
        '→ A10 sonrası: (Özkaynak + Tutar) / (Aktif + Tutar)',
    },
  }
}

/**
 * A18/A19 — Aktif Devir Hızı transparency.
 * current: mevcut satış/aktif oranı
 * realisticTarget: ek gelir sonrası beklenen devir hızı
 */
function buildTurnoverRatioTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): TurnoverRatioTransparency | null {
  const netSales    = ctx.netSales    ?? 0
  const totalAssets = ctx.totalAssets ?? 0

  if (netSales <= 0 || totalAssets <= 0) return null

  const current = netSales / totalAssets

  const benchmarkField = (action.targetRatio?.benchmarkField ?? 'assetTurnover') as keyof import('../benchmarks').SectorBenchmark
  const bm = getBenchmarkValue(ctx.sector, benchmarkField)
  const sectorMedian = bm?.value ?? action.targetRatio?.fallback ?? 1.0

  const realisticTarget = (netSales + amount) / totalAssets

  return {
    kind: 'turnover',
    metricLabel: 'Aktif Devir Hızı',
    current,
    realisticTarget,
    sectorMedian,
    formula: {
      description: 'Aktif Devir Hızı = Net Satış / Toplam Aktif',
      netSales,
      totalAssets,
    },
  }
}

/**
 * Aksiyon metriğine göre doğru transparency üreticisini çalıştırır.
 * A05 ve targetRatio.metric'siz aksiyonlar → mevcut buildRatioTransparency.
 * Faz 7.3.6B3b-3 / Faz 7.3.11.
 */
export function buildActionRatioTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): RatioTransparency | null {
  // ── Faz 7.3.11: A10 — Özkaynak/Aktif (ID-tabanlı; katalogda targetRatio yok) ──
  if (action.id === 'A10_CASH_EQUITY_INJECTION') {
    return buildEquityRatioTransparency(action, ctx, amount)
  }

  switch (action.targetRatio?.metric) {
    case 'DIO':
      return buildDIORatioTransparency(action, ctx, amount)
    case 'GROSS_MARGIN':
      return buildMarginRatioTransparency(action, ctx, amount)
    case 'ASSET_TURNOVER':
      return buildTurnoverRatioTransparency(action, ctx, amount)
    default:
      // A05 ve diğerleri: mevcut balance/DSO helper
      return buildRatioTransparency(action, ctx, amount)
  }
}

// ─── detectExtremeDeviation ──────────────────────────────────────────────────

/**
 * Firma değerinin sektör benchmark'ından sapma şiddetini tespit eder.
 * Divide-by-zero ve negatif koruması zorunlu.
 *
 * isExtreme: ratio > 5× veya < 0.2× (yani 5x sapma her iki yönde)
 * severity:  max(ratio, 1/ratio) — 1 = tam eşit, yüksek = daha aşırı sapma
 */
export function detectExtremeDeviation(
  currentValue:   number,
  benchmarkValue: number
): { isExtreme: boolean; severity: number } {
  if (benchmarkValue <= 0) return { isExtreme: false, severity: 0 }
  if (currentValue  <= 0) return { isExtreme: false, severity: 0 }
  const ratio    = currentValue / benchmarkValue
  const severity = Math.max(ratio, 1 / ratio)
  return {
    isExtreme: ratio > 5 || ratio < 0.2,
    severity,
  }
}
