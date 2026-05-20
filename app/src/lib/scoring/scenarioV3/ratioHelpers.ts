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
  SectorCode,
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

// ─── sumByCodesPrefix ────────────────────────────────────────────────────────

/**
 * Hesap kodlarını prefix bazlı topla.
 * "150" prefix'i şunları yakalar:
 *   - "150" (exact)
 *   - "150.01" (alt hesap nokta)
 *   - "150-01" (alt hesap tire)
 *   - "150/01" (alt hesap slash)
 * Yakalamaz:
 *   - "1500" (farklı hesap)
 *   - "15000" (farklı hesap)
 *   - "" (boş string)
 */
export function sumByCodesPrefix(
  balances: Record<string, number>,
  prefixes: string[]
): number {
  if (!balances) return 0
  let sum = 0
  for (const [code, balance] of Object.entries(balances)) {
    if (balance == null) continue
    const normalizedCode = code.trim()
    if (!normalizedCode) continue
    const isMatch = prefixes.some(prefix =>
      normalizedCode === prefix ||
      normalizedCode.startsWith(`${prefix}.`) ||
      normalizedCode.startsWith(`${prefix}-`) ||
      normalizedCode.startsWith(`${prefix}/`)
    )
    if (isMatch) {
      sum += Math.abs(balance)
    }
  }
  return sum
}

// ─── getInventoryBalance ──────────────────────────────────────────────────────

/**
 * Stok bakiyesi (150-153 hesapları, alt hesaplar dahil)
 * 159 (Verilen Sipariş Avansları) HARİÇ — gerçek stok değil.
 */
export function getInventoryBalance(ctx: FirmContext): number {
  return sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['150', '151', '152', '153']
  )
}

// ─── computeDIO ───────────────────────────────────────────────────────────────

/**
 * Days Inventory Outstanding (Stok devir gün)
 * DIO = (inventory / cogs) * periodDays
 */
export function computeDIO(
  inventory: number,
  cogs: number,
  periodDays: number
): number | null {
  if (inventory <= 0 || cogs <= 0 || periodDays <= 0) return null
  return (inventory / cogs) * periodDays
}

// ─── getCogs ────────────────────────────────────────────────────────────────

/**
 * FirmContext'ten satılan mal maliyeti türetir.
 * cogs alanı varsa kullanır, yoksa netSales - grossProfit.
 */
export function getCogs(ctx: FirmContext): number | null {
  // 1. Direkt costOfGoodsSold field
  if (ctx.costOfGoodsSold != null && ctx.costOfGoodsSold > 0) {
    return ctx.costOfGoodsSold
  }

  // 2. 620-623 hesap kodlarından topla (TDHP)
  // 620 Satılan Mamuller Maliyeti
  // 621 Satılan Ticari Mallar Maliyeti
  // 622 Satılan Hizmet Maliyeti
  // 623 Diğer Satışların Maliyeti
  const cogsFromAccounts = sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['620', '621', '622', '623']
  )
  if (cogsFromAccounts > 0) return cogsFromAccounts

  // 3. netSales - grossProfit derive
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
    // Türk muhasebe kümülatif dönem mantığı
    if (p === 'Q4') return { days: 365, source: 'derived' }
    if (p === 'Q3' || p === '9M') return { days: 273, source: 'derived' }
    if (p === 'Q2' || p === 'H1') return { days: 182, source: 'derived' }
    if (p === 'Q1') return { days: 90, source: 'derived' }
    if (p === 'H2') return { days: 182, source: 'derived' }
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
  const stockBalance = getInventoryBalance(ctx)
  if (stockBalance <= 0) return null

  const cogs = getCogs(ctx)
  if (cogs == null || cogs <= 0) return null

  const benchmarkField = (action.targetRatio?.benchmarkField ?? 'inventoryDays') as keyof import('../benchmarks').SectorBenchmark
  const bm = getBenchmarkValue(ctx.sector, benchmarkField)
  const targetDays  = bm?.value ?? action.targetRatio?.fallback ?? 90
  const periodDays  = getPeriodDays({ period: ctx.period ?? 'ANNUAL' }).days

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

  // ── A08 — MDV Atıl Varlık Disposal ──
  if (action.id === 'A08_FIXED_ASSET_DISPOSAL') {
    return buildFixedAssetDisposalTransparency(action, ctx, amount)
  }

  // ── Faz 7.3.50A.11: A20 — GROSS_MARGIN nakit kanal (102/621, 320 gerektirmez) ──
  if (action.id === 'A20_GROSS_MARGIN_REFORM') {
    return buildMarginRatioTransparency(action, ctx, amount)
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

// ═══════════════════════════════════════════════════════════════════════════
// A08 MDV (Maddi Duran Varlık) Helpers — Refactor 2
// ═══════════════════════════════════════════════════════════════════════════

// ─── sumByCodesPrefixNet ─────────────────────────────────────────────────────

/**
 * Net bakiye: pozitif hesaplar toplamı − negatif (kontra) hesaplar toplamı.
 * Örnek: getNetFixedAssets için
 *   positivePrefixes = ['250','251','252','253','254','255']
 *   negativePrefixes = ['257','258'] (birikmiş amortisman)
 */
export function sumByCodesPrefixNet(
  balances: Record<string, number>,
  positivePrefixes: string[],
  negativePrefixes: string[]
): number {
  const gross = sumByCodesPrefix(balances, positivePrefixes)
  const contra = sumByCodesPrefix(balances, negativePrefixes)
  return Math.max(gross - contra, 0)
}

// ─── getGrossFixedAssets ─────────────────────────────────────────────────────

/**
 * Brüt Maddi Duran Varlık — amortisman düşülmemiş.
 *
 * Engine ana formülü ile birebir uyumlu:
 *   250 Arazi + 251 Yeraltı + 252 Binalar + 253 Tesis/Makine + 254 Taşıtlar
 *   + 255 Diğer + 256 Diğer MDV + 258 Yapılmakta Olan Yatırım + 259 Verilen Avans
 *
 * Guard 2 (Yeni Yatırım): 257 / brütMDV < 0.15 kontrolü için kullanılır.
 */
export function getGrossFixedAssets(ctx: FirmContext): number {
  return sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['250', '251', '252', '253', '254', '255', '256', '258', '259']
  )
}

// ─── getNetFixedAssets ───────────────────────────────────────────────────────

/**
 * Net Maddi Duran Varlık — birikmiş amortisman (257) düşülmüş.
 *
 * Engine ana formülü ile birebir uyumlu:
 *   Pozitif: 250+251+252+253+254+255+256+258+259
 *   Negatif: 257 (Birikmiş Amortisman)
 *
 * NOT: 256 (Diğer MDV), 258 (Yapılmakta Olan Yatırım), 259 (Verilen Avans) DAHİL.
 *      258/259 satılabilir havuzuna (selectIdleAssetAccount) dahil edilmez.
 */
export function getNetFixedAssets(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['250', '251', '252', '253', '254', '255', '256', '258', '259'],
    ['257']
  )
}

// ─── getConstructionSafeFixedAssets ──────────────────────────────────────────

/**
 * İnşaat sektörü güvenli MDV:
 * 250 (Arazi), 253 (Tesis/Makine — operasyonel), 254 (Taşıtlar — proje) HARİÇ.
 * Sadece: 251 (Yeraltı/Yerüstü Düzenleri), 252 (Binalar), 255 (Diğer MDV).
 */
export function getConstructionSafeFixedAssets(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['251', '252', '255'],
    ['257', '258']
  )
}

// ─── computeFixedAssetRatio ──────────────────────────────────────────────────

/**
 * MDV / Toplam Aktif oranı.
 * null döner: totalAssets 0 veya negatif ise.
 */
export function computeFixedAssetRatio(
  netMDV: number,
  totalAssets: number
): number | null {
  if (totalAssets <= 0) return null
  return netMDV / totalAssets
}

// ─── getFixedAssetRatioBenchmark ─────────────────────────────────────────────

/**
 * Sektör bazlı MDV/Aktif üst eşiği (FINRATE_ESTIMATE).
 * Bu oran aşıldığında (×1.20 tolerans ile) MDV fazlası sinyali verilir.
 *
 * Değerler: Codex 5 tur audit + TCMB sektör bilançoları referanslı tahmin.
 */
const FIXED_ASSET_RATIO_BENCHMARKS: Record<string, number> = {
  MANUFACTURING: 0.50,  // İmalat: makine ağırlıklı, %50 normal
  CONSTRUCTION:  0.35,  // İnşaat: proje stoku yüksek, MDV %35 sınır
  TRADE:         0.30,  // Ticaret: hafif, %30 üstü fazla
  RETAIL:        0.25,  // Perakende: çok hafif
  SERVICES:      0.40,  // Hizmet: ofis/ekipman, %40
  IT:            0.20,  // BT: en hafif
}

export function getFixedAssetRatioBenchmark(sector: string): number {
  return FIXED_ASSET_RATIO_BENCHMARKS[sector.toUpperCase()] ?? 0.40
}

// ─── isFixedAssetHeavy ───────────────────────────────────────────────────────

/**
 * Firma MDV/Aktif oranı sektör benchmark'ının %20 üstünde mi?
 * Eşik 1: MDV fazlası tespiti.
 */
export function isFixedAssetHeavy(ctx: FirmContext): boolean {
  const netMDV = getNetFixedAssets(ctx)
  if (netMDV <= 0) return false
  const ratio = computeFixedAssetRatio(netMDV, ctx.totalAssets)
  if (ratio == null) return false
  const benchmark = getFixedAssetRatioBenchmark(ctx.sector)
  return ratio > benchmark * 1.20  // %20 tolerans
}

// ─── computeCurrentAssetTurnover ─────────────────────────────────────────────

/**
 * Aktif devir hızı = Net Satış / Toplam Aktif.
 * null: totalAssets 0 ise.
 */
export function computeCurrentAssetTurnover(ctx: FirmContext): number | null {
  if (ctx.totalAssets <= 0) return null
  return ctx.netSales / ctx.totalAssets
}

// ─── isLowAssetTurnover ───────────────────────────────────────────────────────

/**
 * Aktif devir hızı sektör benchmark'ının %80 altında mı?
 * Eşik 2: Düşük aktif verimliliği tespiti.
 */
export function isLowAssetTurnover(ctx: FirmContext): boolean {
  const turnover = computeCurrentAssetTurnover(ctx)
  if (turnover == null) return false
  const bm = getBenchmarkValue(ctx.sector, 'assetTurnover')
  if (bm == null) return false
  return turnover < bm.value * 0.80  // benchmark'ın %80 altı
}

// ─── isIdleAssetCandidate ─────────────────────────────────────────────────────

/**
 * Atıl varlık satışı için uygun mu?
 * GEREKLI: MDV fazlası (Eşik 1) VE düşük aktif devir (Eşik 2) — her ikisi.
 * Tek başına düşük aktif devir yetmez (A06 ile çakışır).
 */
export function isIdleAssetCandidate(ctx: FirmContext): boolean {
  return isFixedAssetHeavy(ctx) && isLowAssetTurnover(ctx)
}

// ─── isConstructionExcludedAccount ───────────────────────────────────────────

/**
 * İnşaat sektöründe hariç tutulan MDV hesabı mı?
 * 250: Arazi/Arsalar (proje arazisi)
 * 253: Tesis, Makine ve Cihazlar (operasyonel ekipman)
 * 254: Taşıtlar (proje taşıtı)
 */
export function isConstructionExcludedAccount(accountCode: string): boolean {
  const code = accountCode.trim()
  return ['250', '253', '254'].some(prefix =>
    code === prefix ||
    code.startsWith(`${prefix}.`) ||
    code.startsWith(`${prefix}-`) ||
    code.startsWith(`${prefix}/`)
  )
}

// ─── selectIdleAssetAccount ───────────────────────────────────────────────────

export interface IdleAssetAccountResult {
  /** Yeni alanlar */
  code:         string
  name:         string
  balance:      number
  usableAmount: number   // balance × 0.90 veya capped amount — senkronizasyon için
  /** Geri uyum alanları (eski çağrıcılar için) */
  accountCode:  string
  accountName:  string
}

/**
 * Atıl varlık satışı için akıllı hesap seçimi.
 *
 * Öncelik (253 Tesis/Makine HARIÇ — operasyonel):
 *   1. 256 Diğer MDV
 *   2. 250 Arazi ve Arsalar
 *   3. 252 Binalar
 *   4. 255 Demirbaşlar
 *   5. 254 Taşıtlar
 *
 * CONSTRUCTION: 250 hariç (proje arazisi) → 256, 252, 255, 254
 * isIpotekli:   250 ve 252 rehin altında → 256, 255, 254
 *
 * Güvenlik tamponu: bakiye × %90 satılabilir
 *
 * KRİTİK BUG FIX: Aday yoksa NULL döner (eskiden 253 dönerdi!).
 * Fallback tutarı 1M altında kalırsa da NULL döner.
 */
export function selectIdleAssetAccount(
  ctx: { sector: SectorCode | string; accountBalances?: Record<string, number> },
  amount: number,
  isIpotekli?: boolean
): IdleAssetAccountResult | null {
  const MDV_PRIORITY = [
    { code: '256', name: 'Diğer Maddi Duran Varlıklar' },
    { code: '250', name: 'Arazi ve Arsalar'             },
    { code: '252', name: 'Binalar'                      },
    { code: '255', name: 'Demirbaşlar'                  },
    { code: '254', name: 'Taşıtlar'                     },
  ]

  // Sektör ve ipotek filtresi
  let priorityList = MDV_PRIORITY
  if (ctx.sector === 'CONSTRUCTION') {
    priorityList = MDV_PRIORITY.filter(p => p.code !== '250')
  }
  if (isIpotekli) {
    priorityList = priorityList.filter(p => p.code !== '250' && p.code !== '252')
  }

  const balances = ctx.accountBalances ?? {}
  const candidates = priorityList
    .map(item => ({
      code:    item.code,
      name:    item.name,
      balance: sumByCodesPrefix(balances, [item.code]),
    }))
    .filter(c => c.balance > 0)

  // KRİTİK: Aday yoksa NULL — 253 default DÖNMEZ (eski BUG fix)
  if (candidates.length === 0) return null

  // Öncelik sırasında %90 tamponu karşılayan ilk hesap
  for (const c of candidates) {
    if (c.balance * 0.90 >= amount) {
      return {
        code:        c.code,
        name:        c.name,
        balance:     c.balance,
        usableAmount: amount,        // tam talep karşılandı
        accountCode: c.code,         // geri uyum
        accountName: c.name,         // geri uyum
      }
    }
  }

  // Hiçbiri tam kapsamıyorsa: en büyük bakiyeli, %90 cap
  const largest = candidates.reduce((max, c) => c.balance > max.balance ? c : max, candidates[0])
  const cappedAmount = largest.balance * 0.90

  // Cap sonrası 1M altında → null (küçük hareket anlamsız)
  if (cappedAmount < 1_000_000) return null

  return {
    code:        largest.code,
    name:        largest.name,
    balance:     largest.balance,
    usableAmount: cappedAmount,
    accountCode: largest.code,       // geri uyum
    accountName: largest.name,       // geri uyum
  }
}

// ─── buildFixedAssetDisposalTransparency ──────────────────────────────────────

/**
 * A08 MDV disposal için ratio transparency.
 * currentBalance:  net MDV (güvenli hesaplar)
 * realisticTarget: aksiyon sonrası MDV (MDV - amount)
 * sectorMedian:    sektör benchmark MDV hedefi (totalAssets × benchmarkRatio)
 * formula:         targetDays/periodDays = benchmarkRatio (örn: 50/100 = %50)
 */
function buildFixedAssetDisposalTransparency(
  action: ActionTemplateV3,
  ctx: FirmContext,
  amount: number
): BalanceRatioTransparency | null {
  const netMDV = ctx.sector === 'CONSTRUCTION'
    ? getConstructionSafeFixedAssets(ctx)
    : getNetFixedAssets(ctx)

  if (netMDV <= 0) return null

  const benchmarkRatio = getFixedAssetRatioBenchmark(ctx.sector)
  const targetMDV      = ctx.totalAssets * benchmarkRatio
  const realisticTarget = Math.max(netMDV - amount, 0)

  return {
    kind:             'balance',
    currentBalance:   netMDV,
    realisticTarget,
    sectorMedian:     targetMDV,
    capPercent:       0.25,
    formula: {
      targetLabel: 'Hedef Net MDV',
      basisLabel:  'Toplam Aktif',
      basisValue:  ctx.totalAssets,
      targetDays:  Math.round(benchmarkRatio * 100),   // % olarak (örn. 50)
      periodDays:  100,                                 // bölen (% normalizer)
    },
    attribution: {
      sourceType:  'FINRATE_ESTIMATE',
      sectorLabel: getSectorLabel(ctx.sector),
      year:        new Date().getFullYear(),
    },
    method: 'period-end-balance',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// A08 Likidite & Bilanço Helpers — Refactor 2 Tamamlama
// ═══════════════════════════════════════════════════════════════════════════

// ─── getCashBalance ───────────────────────────────────────────────────────────

/**
 * Hazır Değerler — 100+101+102+108 eksi 103 (alınan çekler)
 */
export function getCashBalance(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['100', '101', '102', '108'],
    ['103']
  )
}

// ─── getShortTermFinancialDebt ────────────────────────────────────────────────

/**
 * KV Mali Borç — 300-309 arasından 302 (alınan çekler) ve 308 hariç
 */
export function getShortTermFinancialDebt(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['300', '301', '303', '304', '305', '306', '309'],
    ['302', '308']
  )
}

// ─── getShortTermTradeDebt ────────────────────────────────────────────────────

/**
 * KV Ticari Borç — 320, 321, 326, 329 eksi 322 (alınan çekler)
 */
export function getShortTermTradeDebt(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['320', '321', '326', '329'],
    ['322']
  )
}

// ─── getLongTermFinancialDebt ─────────────────────────────────────────────────

/**
 * UV Mali Borç — 400, 401, 405, 407, 409 eksi 402, 408
 */
export function getLongTermFinancialDebt(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['400', '401', '405', '407', '409'],
    ['402', '408']
  )
}

// ─── getTradeReceivables ──────────────────────────────────────────────────────

/**
 * Ticari Alacaklar — 120, 121, 126, 127, 128 eksi 122 (şüpheli) ve 129
 */
export function getTradeReceivables(ctx: FirmContext): number {
  return sumByCodesPrefixNet(
    ctx.accountBalances ?? {},
    ['120', '121', '126', '127', '128'],
    ['122', '129']
  )
}

// ─── getAccumulatedDepreciation ───────────────────────────────────────────────

/**
 * Birikmiş Amortisman (257) — pozitif değer
 */
export function getAccumulatedDepreciation(ctx: FirmContext): number {
  return sumByCodesPrefix(ctx.accountBalances ?? {}, ['257'])
}

// ─── getRevaluationReserve ────────────────────────────────────────────────────

/**
 * MDV Yeniden Değerleme Fonu (522)
 */
export function getRevaluationReserve(ctx: FirmContext): number {
  return sumByCodesPrefix(ctx.accountBalances ?? {}, ['522'])
}

// ─── getCurrentRatio ──────────────────────────────────────────────────────────

/**
 * Cari Oran — Dönen Varlık / KV Yükümlülük
 * Dönen varlık: nakit + ticari alacak + stok (150-159)
 * KV yükümlülük: KV mali borç + KV ticari borç + diğer KV
 */
export function getCurrentRatio(ctx: FirmContext): number | null {
  const cash        = getCashBalance(ctx)
  const receivables = getTradeReceivables(ctx)
  const inventory   = sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['150', '151', '152', '153', '157', '158', '159']
  )
  const currentAssets = cash + receivables + inventory

  const stDebt  = getShortTermFinancialDebt(ctx)
  const stTrade = getShortTermTradeDebt(ctx)
  const otherSt = sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['340', '349', '360', '361', '368', '369', '370', '371', '372', '373', '379']
  )
  const currentLiabilities = stDebt + stTrade + otherSt

  if (currentLiabilities <= 0) return null
  return currentAssets / currentLiabilities
}

// ─── getNetWorkingCapital ─────────────────────────────────────────────────────

/**
 * Net İşletme Sermayesi — Dönen Varlık − KV Yükümlülük
 */
export function getNetWorkingCapital(ctx: FirmContext): number {
  const cash        = getCashBalance(ctx)
  const receivables = getTradeReceivables(ctx)
  const inventory   = sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['150', '151', '152', '153', '157', '158', '159']
  )
  const currentAssets = cash + receivables + inventory

  const stDebt  = getShortTermFinancialDebt(ctx)
  const stTrade = getShortTermTradeDebt(ctx)
  const otherSt = sumByCodesPrefix(
    ctx.accountBalances ?? {},
    ['340', '349', '360', '361', '368', '369']
  )
  const currentLiabilities = stDebt + stTrade + otherSt

  return currentAssets - currentLiabilities
}

// ─── getIdleAssetPoolBalance ──────────────────────────────────────────────────

/**
 * Atıl varlık pool — sektör ve ipotek duyarlı.
 *
 * Varsayılan: 256, 250, 252, 255
 * CONSTRUCTION: 250 hariç (proje arazisi) → 256, 252, 255
 * isIpotekli:   250 ve 252 rehin altında → sadece 256, 255
 */
export function getIdleAssetPoolBalance(
  ctx: FirmContext,
  options?: { isIpotekli?: boolean }
): number {
  let codes = ['256', '250', '252', '255']

  if (ctx.sector === 'CONSTRUCTION') {
    codes = ['256', '252', '255']
  }

  if (options?.isIpotekli) {
    codes = codes.filter(c => c !== '250' && c !== '252')
  }

  return sumByCodesPrefix(ctx.accountBalances ?? {}, codes)
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
