// ─── FİNRATE V2 RAPOR VERİ DÖNÜŞTÜRÜCÜSÜ ─────────────────────────────────────
// GET /api/analyses/[id] yanıtını ReportData tipine dönüştürür.
// Saf fonksiyon — yan etki yok, DB çağrısı yok.

import { SECTOR_BENCHMARKS, SECTOR_WEIGHTS, type SectorBenchmark, getSectorBenchmark, getSectorWeights } from '@/lib/scoring/benchmarks'
import { sortPeriods } from '@/lib/periods'
import { computeSectorCategoryScores } from '@/lib/scoring/score'
import { calcSubjectiveScore } from '@/lib/scoring/subjective'
import type { ReportData, RatioRow, BalanceSheetItem, IncomeStatementItem, GrowthTableRow, TrendBar, WaterfallBar, ActionPlanItem, SubjectiveCard, SubjectiveRow, RiskClassification, RiskOverallLevel, RiskMetricStatus } from '@/types/report'
import { getNaceCode } from './naceMap'
import {
  fmtCurrency, fmtPct, fmtPctSigned, fmtRatio, fmtDays,
  fmtDate, fmtPeriod, fmtScore, addYears,
  toBarFill, ratioStatus, BAR_COLOR,
  getScaleLabel, getEntityTypeLabel,
} from './formatters'
import {
  buildStrengths, buildWatchAreas, buildConclusion,
  buildCollateralNote, buildScenarioNote,
  buildKkbSummary, buildBankSummary, buildCorpSummary, buildComplianceSummary,
  getSubjectiveStatus,
} from './templates'

// ─── API YANIT TİPİ ──────────────────────────────────────────────────────────

// GET /api/analyses/[id] yanıtının tipi
export interface AnalysisApiResponse {
  id: string
  year: number
  period: string
  finalScore: number | null
  finalRating: string | null
  liquidityScore: number | null
  profitabilityScore: number | null
  leverageScore: number | null
  activityScore: number | null
  reportedAt: string | null
  ratios: Record<string, number | null> | null  // RatioResult + __financialScore + __subjectiveTotal
  optimizerSnapshot: OptimizerSnapshotRaw | null
  entity: { id: string; name: string; sector: string | null; taxNumber: string | null; entityType: string | null } | null
  financialData: FinancialDataRaw | null
  subjectiveInput: SubjectiveInputRaw | null
  trendAnalyses: TrendAnalysisRaw[]
}

interface FinancialDataRaw {
  // Mevcut alanlar — ZORUNLU (number | null) — DOKUNMA
  revenue: number | null
  cogs: number | null
  grossProfit: number | null
  operatingExpenses: number | null
  ebit: number | null
  ebitda: number | null
  interestExpense: number | null
  ebt: number | null
  netProfit: number | null
  depreciation: number | null
  taxExpense: number | null
  cash: number | null
  tradeReceivables: number | null
  inventory: number | null
  totalCurrentAssets: number | null
  tangibleAssets: number | null
  totalNonCurrentAssets: number | null
  totalAssets: number | null
  shortTermFinancialDebt: number | null
  tradePayables: number | null
  totalCurrentLiabilities: number | null
  longTermFinancialDebt: number | null
  totalNonCurrentLiabilities: number | null
  totalEquity: number | null
  totalLiabilitiesAndEquity: number | null
  intangibleAssets: number | null
  paidInCapital: number | null
  retainedEarnings: number | null
  retainedLosses: number | null
  // BUG-4 yeni alanlar — OPSİYONEL (geriye uyumlu)
  otherCurrentAssets?: number | null
  advancesReceived?: number | null
  taxPayables?: number | null
  shortTermProvisions?: number | null
  deferredRevenue?: number | null
  otherShortTermPayables?: number | null
  otherCurrentLiabilities?: number | null
  otherNonCurrentLiabilities?: number | null
}

interface SubjectiveInputRaw {
  kkbCategory: string
  activeDelayDays: number
  checkProtest: boolean
  enforcementFile: boolean
  creditLimitUtilPct: number
  hasMultipleBanks: boolean
  avgMaturityMonths: number
  companyAgeYears: number
  auditLevel: string
  ownershipClarity: boolean
  hasTaxDebt: boolean
  hasSgkDebt: boolean
  activeLawsuitCount: number
}

interface OptimizerSnapshotRaw {
  currentScore: number
  currentRating: string
  targets: OptimizerTargetRaw[]
}

interface OptimizerTargetRaw {
  targetRating: string
  totalGain: number
  minimumPlan: ActionPlanRaw
  idealPlan: ActionPlanRaw
}

interface ActionPlanRaw {
  label: string
  projectedScore: number
  projectedRating: string
  achievable: boolean
  suggestions: RatioSuggestionRaw[]
}

interface RatioSuggestionRaw {
  key: string
  label: string
  category: string
  currentValue: number | null
  targetValue: number
  unit: 'pct' | 'x' | 'day' | 'ratio'
  scoreGain: number
  actionText: string
  difficulty: string
  timeHorizon: string
  actionFamily: string
}

interface TrendAnalysisRaw {
  id: string
  year: number
  period: string
  finalScore: number | null
  finalRating: string | null
  liquidityScore: number | null
  profitabilityScore: number | null
  leverageScore: number | null
  activityScore: number | null
  ratios: Record<string, number | null> | null
  financialData: {
    revenue: number | null
    netProfit: number | null
    ebitda: number | null
    totalAssets: number | null
    totalEquity: number | null
    totalCurrentAssets: number | null
    totalCurrentLiabilities: number | null
    shortTermFinancialDebt: number | null
    longTermFinancialDebt: number | null
    tradeReceivables: number | null
    inventory: number | null
    tradePayables: number | null
  } | null
}

// ─── ANA DÖNÜŞTÜRÜCÜ ──────────────────────────────────────────────────────────

// ─── YARDIMCI: Güvenli tarih parse ───────────────────────────────────────────
// jsonUtf8 Date guard'ından önce oluşturulan kayıtlarda reportedAt
// API'den "{}" ya da bozuk string gelebilirdi. Bu helper ikinci bir bariyer sağlar.
function safeParseDate(value: string | null | undefined): Date | null {
  if (!value || typeof value !== 'string') return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export function mapToReportData(api: AnalysisApiResponse): ReportData {
  const ratios = api.ratios ?? {}
  const fd     = api.financialData
  const entity = api.entity
  const sector = entity?.sector ?? null
  // M1: getSectorBenchmark fuzzy mapping — Üretim→İmalat, Ticaret→Toptan Ticaret (geçici),
  //     Teknoloji→Bilişim vb. Eşleşme yoksa Genel döner (null asla dönmez).
  const bm      = getSectorBenchmark(sector)
  const weights = getSectorWeights(sector)

  // T8: Sektör kategori skorları — benchmark sanal firma gibi calculateScore'dan geçer.
  //     Sayfa 2 ve 4'te "Ref:X" olarak gösterilir (50 sabit değil, gerçek hesaplama).
  const sectorScores = computeSectorCategoryScores(bm, sector)

  // ── Temel skorlar ──────────────────────────────────────────────────────────
  const rawFinancialScore = (ratios.__financialScore as number | undefined) ?? api.finalScore ?? 0
  const subjectiveTotal   = (ratios.__subjectiveTotal as number | undefined) ?? 0
  const financialScore    = Math.round(rawFinancialScore * 0.70)   // 0-70 katkı
  const totalScore        = Math.round(api.finalScore ?? (financialScore + subjectiveTotal))
  const rating            = api.finalRating ?? 'N/A'

  // ── Tarihler ──────────────────────────────────────────────────────────────
  // api.reportedAt: Analysis kaydının oluşturulma tarihi — yoksa bugün fallback
  // safeParseDate: JSON'dan "{}" ya da bozuk değer gelmesini engeller (N1 guard)
  const reportedAtDate = safeParseDate(api.reportedAt) ?? new Date()
  const reportDate     = fmtDate(reportedAtDate)
  const validUntil     = fmtDate(addYears(reportedAtDate, 1))

  // ── Rapor no — A3: FNR-YIL-FRM-XXXXXX (6 char hash, Türkçe transliterasyon)
  const reportNo = generateReportNumber(entity?.name, api.id ?? '', api.year)

  // ── Tüm yıl serisi (trend + mevcut, kronolojik sıralı) ───────────────────
  const allYearsRaw: YearEntry[] = [
    ...api.trendAnalyses.map(t => ({
      id: t.id,
      year: t.year,
      period: t.period,
      fd: t.financialData as FinancialDataRaw | null,
      ratios: t.ratios,
      score: t.finalScore,   // CODEX D3: t.finalScore (t.score değil)
      rating: t.finalRating, // CODEX D3: t.finalRating (t.rating değil)
    })),
    {
      id: api.id,
      year: api.year,
      period: api.period,
      fd,
      ratios,
      score: totalScore,
      rating,
    },
  ]

  // Kronolojik sırala — mevcut analiz hangi yıl/dönemde olursa olsun doğru yerde
  const allYears: YearEntry[] = sortPeriods(allYearsRaw)

  // Bilanço/Gelir tablosu için son 6 yıl (en fazla)
  const tableYears = allYears.slice(-6)

  // ── Senaryo + Aksiyon ──────────────────────────────────────────────────────
  const snap       = api.optimizerSnapshot
  const target1Raw = snap?.targets?.[0] ?? null
  const target2Raw = snap?.targets?.[1] ?? null

  // ── Subjektif ─────────────────────────────────────────────────────────────
  const subj = api.subjectiveInput
  const breakdown = subj
    ? calcSubjectiveScore(subj)
    : { kkbScore: 0, bankScore: 0, corpScore: 0, complianceScore: 0, total: subjectiveTotal, percentage: (subjectiveTotal / 30) * 100, subjectiveDataMissing: true }

  // ══════════════════════════════════════════════════════════════════════════
  return {
    // ── Temel ────────────────────────────────────────────────────────────────
    reportNo,
    companyName: entity?.name ?? 'Firma Adı Girilmemiş',
    vkn: entity?.taxNumber ?? '—',
    rating,
    totalScore,
    financialScore,
    subjectiveScore: subjectiveTotal,
    analysisPeriod: fmtPeriod(api.year, api.period),
    reportDate,
    validUntil,

    // ── Sayfa 2: Yönetici Özeti ───────────────────────────────────────────────
    executive: buildExecutiveSummary(api, ratios, fd, bm, weights, rating, totalScore, rawFinancialScore, sector, sectorScores),

    // ── Sayfa 3: Firma & Sektör ───────────────────────────────────────────────
    companyInfo: buildCompanyInfo(entity, sector, bm, weights, subj, api.year, api.financialData),  // A2: fd eklendi

    // ── Sayfa 4: Finansal Skor Detayı ────────────────────────────────────────
    financialDetail: buildFinancialDetail(api, ratios, fd, bm, sector, rating, totalScore, sectorScores),

    // ── Sayfa 5: Likidite & Borçlanma Oranları ────────────────────────────────
    liquidityRatios: buildLiquidityRatioRows(ratios, bm),

    // ── Sayfa 6: Kârlılık & Faaliyet Oranları ─────────────────────────────────
    profitabilityRatios: buildProfitabilityRatioRows(ratios, bm),

    // ── Sayfa 7: Trend Analizi ────────────────────────────────────────────────
    trends: buildTrendData(allYears, api.id, sector, bm),

    // ── Sayfa 8: Bilanço Analizi ──────────────────────────────────────────────
    balanceSheet: buildBalanceSheet(tableYears, api.id),

    // ── Sayfa 9: Gelir Tablosu ────────────────────────────────────────────────
    incomeStatement: buildIncomeStatement(tableYears, api.id),

    // ── Sayfa 10: Nakit Akış & Çalışma Sermayesi ─────────────────────────────
    cashFlow: buildCashFlow(ratios, fd, tableYears, bm, api.id),

    // ── Sayfa 11: Senaryo Analizi ─────────────────────────────────────────────
    scenario: buildScenarioData(snap, target1Raw, target2Raw, rating, totalScore),

    // ── Sayfa 12: Detaylı Aksiyon Planı ──────────────────────────────────────
    actionPlan: buildActionPlan(target1Raw, target2Raw),

    // ── Sayfa 13: Subjektif Faktörler ─────────────────────────────────────────
    subjective: buildSubjectiveData(subj, breakdown, subjectiveTotal),
  }
}

// ─── HELPER: RAPOR NUMARASI (A3) ─────────────────────────────────────────────
// FNR-{YIL}-{FRM}-{XXXXXX} — Türkçe transliterasyon + 6 char hash

function generateReportNumber(entityName: string | undefined, analysisId: string, year: number): string {
  const tm: Record<string, string> = {
    'ı': 'i', 'İ': 'I', 'ş': 's', 'Ş': 'S', 'ç': 'c', 'Ç': 'C',
    'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ö': 'o', 'Ö': 'O',
  }
  const clean = (entityName || '').split('').map(ch => tm[ch] ?? ch).join('').replace(/[^A-Za-z\s]/g, '').trim()
  let prefix = 'XXX'
  if (clean) {
    const words = clean.split(/\s+/).filter(w => w.length > 0)
    if (words.length >= 3)      prefix = words.slice(0, 3).map(w => w.charAt(0)).join('').toUpperCase()
    else if (words.length === 2) prefix = (words[0].substring(0, 2) + words[1].charAt(0)).toUpperCase()
    else                         prefix = words[0].substring(0, 3).toUpperCase()
  }
  prefix = prefix.padEnd(3, 'X').substring(0, 3)
  const hash = analysisId.replace(/-/g, '').substring(0, 6).toUpperCase()
  return `FNR-${year}-${prefix}-${hash}`
}

// ─── HELPER: RİSK KLASMANI (Ö9) ──────────────────────────────────────────────

function buildRiskClassification(
  totalScore: number,
  liquidityScore: number,
  profitabilityScore: number,
  leverageScore: number,
  rawFinancialScore: number,
): RiskClassification {
  let overallLevel: RiskOverallLevel
  let overallColor: string
  if (totalScore >= 70)      { overallLevel = 'Düşük';      overallColor = '#16a34a' }
  else if (totalScore >= 50) { overallLevel = 'Orta';       overallColor = '#f97316' }
  else if (totalScore >= 30) { overallLevel = 'Yüksek';     overallColor = '#dc2626' }
  else                       { overallLevel = 'Çok Yüksek'; overallColor = '#991b1b' }

  const toStatus = (score: number): { status: RiskMetricStatus; color: string } => {
    if (score >= 70) return { status: 'Güçlü', color: '#16a34a' }
    if (score >= 40) return { status: 'Orta',  color: '#f97316' }
    return { status: 'Zayıf', color: '#dc2626' }
  }

  return {
    overallLevel,
    overallColor,
    metrics: [
      { label: 'Finansal Sağlamlık', ...toStatus(rawFinancialScore)    },
      { label: 'Nakit Yönetimi',     ...toStatus(liquidityScore)       },
      { label: 'Borç Yapısı',        ...toStatus(leverageScore)        },
      { label: 'Kârlılık Trendi',    ...toStatus(profitabilityScore)   },
    ],
  }
}

// ─── HELPER: EKSİK ALAN TESPİTİ (Ö8) ────────────────────────────────────────
// Sadece null/undefined kontrolü — 0 geçerli finansal değer

function getMissingFields(fd: FinancialDataRaw | null | undefined): string[] {
  if (!fd) return ['Tüm finansal veriler']
  const missing: string[] = []
  if (fd.tradeReceivables == null)       missing.push('Ticari Alacaklar')
  if (fd.inventory == null)              missing.push('Stoklar')
  if (fd.shortTermFinancialDebt == null) missing.push('Kısa Vadeli Finansal Borçlar')
  if (fd.longTermFinancialDebt == null)  missing.push('Uzun Vadeli Finansal Borçlar')
  if (fd.interestExpense == null)        missing.push('Faiz Giderleri')
  if (fd.depreciation == null)           missing.push('Amortisman')
  return missing
}

// ─── SAYFA 2: YÖNETİCİ ÖZETİ ────────────────────────────────────────────────

// T8: safeReference — Number.isFinite kontrolü, fallback 50
function safeReference(value: number | null | undefined): number {
  return Number.isFinite(value) ? (value as number) : 50
}

function buildExecutiveSummary(
  api: AnalysisApiResponse,
  ratios: Record<string, number | null>,
  fd: FinancialDataRaw | null,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
  weights: typeof SECTOR_WEIGHTS[string],
  rating: string,
  totalScore: number,
  rawFinancialScore: number,   // Ö9: Risk Klasmanı için ham finansal skor
  sector: string | null,
  sectorScores: { liquidity: number; profitability: number; leverage: number; activity: number },
) {
  const defaultBm: SectorBenchmark = bm ?? (SECTOR_BENCHMARKS['Genel'] as SectorBenchmark)

  // Kategori skorları — Analysis tablosundan, yok ise 50
  const liqScore  = api.liquidityScore    ?? 50
  const profScore = api.profitabilityScore ?? 50
  const levScore  = api.leverageScore     ?? 50
  const actScore  = api.activityScore     ?? 50

  // KPI değerleri
  const prevFd = api.trendAnalyses.length > 0
    ? api.trendAnalyses[api.trendAnalyses.length - 1].financialData
    : null

  const netSalesYoY = (fd?.revenue != null && prevFd?.revenue != null && prevFd.revenue !== 0)
    ? (fd.revenue - prevFd.revenue) / prevFd.revenue
    : null

  const equityYoY = (fd?.totalEquity != null && prevFd?.totalEquity != null && prevFd.totalEquity !== 0)
    ? (fd.totalEquity - prevFd.totalEquity) / prevFd.totalEquity
    : null

  return {
    categories: {
      liquidity:     { score: liqScore,  referenceScore: safeReference(sectorScores.liquidity),     weight: weights.liquidity },
      profitability: { score: profScore, referenceScore: safeReference(sectorScores.profitability), weight: weights.profitability },
      leverage:      { score: levScore,  referenceScore: safeReference(sectorScores.leverage),      weight: weights.leverage },
      activity:      { score: actScore,  referenceScore: safeReference(sectorScores.activity),      weight: weights.activity },
    },
    kpis: {
      netSales:               fd?.revenue ?? 0,
      netSalesYoY,
      ebitda:                 fd?.ebitda  ?? 0,
      ebitdaMargin:           (ratios.ebitdaMargin as number | null) ?? 0,
      currentRatio:           (ratios.currentRatio as number | null) ?? 0,
      sectorCurrentRatio:     defaultBm.currentRatio,
      debtToEquity:           (ratios.debtToEquity as number | null) ?? 0,
      sectorDebtToEquity:     defaultBm.debtToEquity,
      interestCoverage:       (ratios.interestCoverage as number | null) ?? 0,
      sectorInterestCoverage: defaultBm.interestCoverage,
      equity:                 fd?.totalEquity ?? 0,
      equityYoY,
    },
    strengths:  buildStrengths(ratios, defaultBm, sector),
    watchAreas: buildWatchAreas(ratios, defaultBm),
    conclusion: buildConclusion(rating, totalScore, sector, api.entity?.name ?? 'Firma'),
    riskClassification: buildRiskClassification(totalScore, liqScore, profScore, levScore, rawFinancialScore),
    missingFields: getMissingFields(fd),
  }
}

// ─── SAYFA 3: FİRMA & SEKTÖR ──────────────────────────────────────────────────

function buildCompanyInfo(
  entity: AnalysisApiResponse['entity'],
  sector: string | null,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
  weights: typeof SECTOR_WEIGHTS[string],
  subj: SubjectiveInputRaw | null,
  analysisYear: number,
  fd?: FinancialDataRaw | null,   // A2: firma ölçeği için gelir + aktif bilgisi
) {
  const defaultBm = bm ?? SECTOR_BENCHMARKS['Genel'] ?? {
    currentRatio: 1.6, debtToEquity: 1.2, interestCoverage: 3.5,
    roa: 0.02, revenueGrowth: 0.40, label: 'Genel',
  }

  const companyAgeYears = subj?.companyAgeYears ?? null
  const foundedYear = companyAgeYears != null ? analysisYear - companyAgeYears : null

  // Sektör kıyaslama satırları (13 adet — Atlas sırası)
  const _bm = defaultBm as typeof SECTOR_BENCHMARKS[string]
  const sectorBenchmarks: Array<{ label: string; companyValue: string; sectorValue: string }> = [
    { label: 'Cari Oran',                  companyValue: '—', sectorValue: fmtRatio(_bm.currentRatio) },
    { label: 'Hızlı Oran',                 companyValue: '—', sectorValue: fmtRatio(_bm.quickRatio) },
    { label: 'Borç/Özkaynak',              companyValue: '—', sectorValue: fmtRatio(_bm.debtToEquity) },
    { label: 'Borç/Aktif',                 companyValue: '—', sectorValue: fmtRatio(_bm.debtToAssets) },
    { label: 'FAVÖK Marjı',                companyValue: '—', sectorValue: fmtPct(_bm.ebitdaMargin) },
    { label: 'Net Kâr Marjı',              companyValue: '—', sectorValue: fmtPct(_bm.netProfitMargin) },
    { label: 'Brüt Kâr Marjı',             companyValue: '—', sectorValue: fmtPct(_bm.grossMargin) },
    { label: 'ROA',                         companyValue: '—', sectorValue: fmtPct(_bm.roa) },
    { label: 'ROE',                         companyValue: '—', sectorValue: fmtPct(_bm.roe) },
    { label: 'Faiz Karşılama',             companyValue: '—', sectorValue: fmtRatio(_bm.interestCoverage) },
    { label: 'Aktif Devir',                companyValue: '—', sectorValue: fmtRatio(_bm.assetTurnover) },
    { label: 'Alacak Tahsil Süresi (DSO)', companyValue: '—', sectorValue: fmtDays(_bm.receivablesDays) },
    { label: 'Stok Devir Süresi (DIO)',    companyValue: '—', sectorValue: fmtDays(_bm.inventoryDays) },
  ]

  return {
    vkn:         entity?.taxNumber ?? '—',
    sector:      sector ?? '—',
    naceCode:    getNaceCode(sector),
    entityType:  getEntityTypeLabel(entity?.entityType),
    foundedYear,
    activityYears: companyAgeYears,
    scale:       getScaleLabel(fd?.revenue, fd?.totalAssets),  // A2: KOSGEB KOBİ sınıflandırması
    sectorBenchmarks,
    sectorWeightProfile: {
      liquidity:     weights.liquidity,
      profitability: weights.profitability,
      leverage:      weights.leverage,
      activity:      weights.activity,
    },
  }
}

// ─── SAYFA 4: FİNANSAL SKOR DETAYI ───────────────────────────────────────────

function buildFinancialDetail(
  api: AnalysisApiResponse,
  ratios: Record<string, number | null>,
  fd: FinancialDataRaw | null,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
  sector: string | null,
  rating: string,
  totalScore: number,
  sectorScores: { liquidity: number; profitability: number; leverage: number; activity: number },
) {
  const defaultBm: SectorBenchmark = bm ?? (SECTOR_BENCHMARKS['Genel'] as SectorBenchmark)
  const liqScore  = api.liquidityScore    ?? 50
  const profScore = api.profitabilityScore ?? 50
  const levScore  = api.leverageScore     ?? 50
  const actScore  = api.activityScore     ?? 50
  const weights   = getSectorWeights(sector)   // M1: fuzzy mapping helper

  const prevFd = api.trendAnalyses.length > 0
    ? api.trendAnalyses[api.trendAnalyses.length - 1].financialData
    : null

  const netSalesYoY = (fd?.revenue != null && prevFd?.revenue != null && prevFd.revenue !== 0)
    ? (fd.revenue - prevFd.revenue) / prevFd.revenue
    : null

  return {
    kpis: [
      { label: 'Net Satışlar',   value: fmtCurrency(fd?.revenue),    sub: netSalesYoY != null ? `${fmtPctSigned(netSalesYoY)} (Yıllık)` : '—' },
      { label: 'Net Kâr',        value: fmtCurrency(fd?.netProfit),  sub: fmtPct(ratios.netProfitMargin as number | null) + ' marj' },
      { label: 'FAVÖK',          value: fmtCurrency(fd?.ebitda),     sub: fmtPct(ratios.ebitdaMargin as number | null) + ' marj' },
      { label: 'Cari Oran',      value: fmtRatio(ratios.currentRatio as number | null), sub: `Sektör: ${fmtRatio(defaultBm.currentRatio)}` },
      { label: 'Borç/Özkaynak', value: fmtRatio(ratios.debtToEquity as number | null), sub: `Sektör: ${fmtRatio(defaultBm.debtToEquity)}` },
    ],
    categoryBars: [
      {
        name: 'Likidite',
        score: liqScore,
        referenceScore: safeReference(sectorScores.liquidity),
        weight: weights.liquidity,
        fillColor: 'linear-gradient(90deg,#0ea5e9,#2dd4bf)',
        subMetrics: 'Cari · Hızlı · Nakit Oranı · NÇS/Aktif · CCC',
      },
      {
        name: 'Kârlılık',
        score: profScore,
        referenceScore: safeReference(sectorScores.profitability),
        weight: weights.profitability,
        fillColor: 'linear-gradient(90deg,#10b981,#2dd4bf)',
        subMetrics: 'Brüt · FAVÖK · FVÖK · Net Marj · ROA · ROE · ROIC · Büyüme',
      },
      {
        name: 'Kaldıraç',
        score: levScore,
        referenceScore: safeReference(sectorScores.leverage),
        weight: weights.leverage,
        fillColor: 'linear-gradient(90deg,#8b5cf6,#6366f1)',
        subMetrics: 'Borç/ÖzK · Borç/Aktif · Faiz Karşılama · Net Borç/FAVÖK',
      },
      {
        name: 'Faaliyet',
        score: actScore,
        referenceScore: safeReference(sectorScores.activity),
        weight: weights.activity,
        fillColor: 'linear-gradient(90deg,#f59e0b,#fb923c)',
        subMetrics: 'Aktif Devir · DSO · DIO · DPO · Sabit Varlık Deviri',
      },
    ],
    strengths:  buildStrengths(ratios, defaultBm, sector),
    watchAreas: buildWatchAreas(ratios, defaultBm),
    conclusion: buildConclusion(rating, totalScore, sector, api.entity?.name ?? 'Firma'),
  }
}

// ─── SAYFA 5: LİKİDİTE & BORÇLANMA ORANLARI ─────────────────────────────────

function buildLiquidityRatioRows(
  ratios: Record<string, number | null>,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
): RatioRow[] {
  const b = bm ?? {} as typeof SECTOR_BENCHMARKS[string]

  // helper: oran satırı oluştur
  function ratioRow(
    group: RatioRow['group'],
    name: string,
    value: number | null,
    sectorValue: number | null,
    maxVal: number,
    dir: 'up' | 'down',
    fmtFn: (v: number | null) => string,
  ): RatioRow {
    const fill    = toBarFill(value, maxVal, dir)
    const secFill = toBarFill(sectorValue, maxVal, dir)
    const st      = ratioStatus(value, sectorValue, dir)
    return {
      group, name,
      companyValue: fmtFn(value),
      sectorValue:  sectorValue != null ? fmtFn(sectorValue) : '—',
      barFill:      fill,
      sectorMark:   sectorValue != null ? secFill : null,
      barColor:     BAR_COLOR[st],
      status:       st,
    }
  }

  return [
    // ── Likidite ─────────────────────────────────────────────────────────────
    ratioRow('Likidite', 'Cari Oran',
      ratios.currentRatio as number | null, b.currentRatio ?? null, 3, 'up', v => fmtRatio(v)),
    ratioRow('Likidite', 'Hızlı Oran (Asit-Test)',
      ratios.quickRatio as number | null, b.quickRatio ?? null, 2.5, 'up', v => fmtRatio(v)),
    ratioRow('Likidite', 'Nakit Oranı',
      ratios.cashRatio as number | null, b.cashRatio ?? null, 1, 'up', v => fmtRatio(v)),
    ratioRow('Likidite', 'NÇS / Toplam Aktif',
      ratios.netWorkingCapitalRatio as number | null, b.netWorkingCapitalRatio ?? null, 0.5, 'up', v => fmtPct(v)),
    ratioRow('Likidite', 'Nakit Dönüşüm Çevrimi',
      ratios.cashConversionCycle as number | null, b.cashConversionCycle ?? null, 180, 'down', v => fmtDays(v)),

    // ── Borçlanma ──────────────────────────────────────────────────────────
    ratioRow('Borçlanma', 'Borç / Özkaynak',
      ratios.debtToEquity as number | null, b.debtToEquity ?? null, 4, 'down', v => fmtRatio(v)),
    ratioRow('Borçlanma', 'Borç / Toplam Aktif',
      ratios.debtToAssets as number | null, b.debtToAssets ?? null, 1, 'down', v => fmtPct(v)),
    ratioRow('Borçlanma', 'Özkaynak Oranı',
      ratios.equityRatio as number | null, b.debtToAssets != null ? (1 - b.debtToAssets) : null, 1, 'up', v => fmtPct(v)),
    ratioRow('Borçlanma', 'Faiz Karşılama Oranı',
      ratios.interestCoverage as number | null, b.interestCoverage ?? null, 10, 'up', v => fmtRatio(v)),
    ratioRow('Borçlanma', 'Net Borç / FAVÖK',
      ratios.debtToEbitda as number | null, b.debtToEbitda ?? null, 8, 'down', v => fmtRatio(v)),
    ratioRow('Borçlanma', 'KV Borç / Toplam Borç',
      ratios.shortTermDebtRatio as number | null, b.shortTermDebtRatio ?? null, 1, 'down', v => fmtPct(v)),
  ]
}

// ─── SAYFA 6: KÂRLILIK & FAALİYET ORANLARI ───────────────────────────────────

function buildProfitabilityRatioRows(
  ratios: Record<string, number | null>,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
): RatioRow[] {
  const b = bm ?? {} as typeof SECTOR_BENCHMARKS[string]

  function ratioRow(
    group: RatioRow['group'],
    name: string,
    value: number | null,
    sectorValue: number | null,
    maxVal: number,
    dir: 'up' | 'down',
    fmtFn: (v: number | null) => string,
  ): RatioRow {
    const fill    = toBarFill(value, maxVal, dir)
    const secFill = toBarFill(sectorValue, maxVal, dir)
    const st      = ratioStatus(value, sectorValue, dir)
    return {
      group, name,
      companyValue: fmtFn(value),
      sectorValue:  sectorValue != null ? fmtFn(sectorValue) : '—',
      barFill:      fill,
      sectorMark:   sectorValue != null ? secFill : null,
      barColor:     BAR_COLOR[st],
      status:       st,
    }
  }

  return [
    // ── Kârlılık ─────────────────────────────────────────────────────────────
    ratioRow('Kârlılık', 'Brüt Kâr Marjı',
      ratios.grossMargin as number | null, b.grossMargin ?? null, 0.6, 'up', fmtPct),
    ratioRow('Kârlılık', 'FAVÖK Marjı',
      ratios.ebitdaMargin as number | null, b.ebitdaMargin ?? null, 0.35, 'up', fmtPct),
    ratioRow('Kârlılık', 'FVÖK Marjı',
      ratios.ebitMargin as number | null, b.ebitMargin ?? null, 0.30, 'up', fmtPct),
    ratioRow('Kârlılık', 'Net Kâr Marjı',
      ratios.netProfitMargin as number | null, b.netProfitMargin ?? null, 0.30, 'up', fmtPct),
    ratioRow('Kârlılık', 'Aktif Kârlılığı (ROA)',
      ratios.roa as number | null, b.roa ?? null, 0.2, 'up', fmtPct),
    ratioRow('Kârlılık', 'Özkaynak Kârlılığı (ROE)',
      ratios.roe as number | null, b.roe ?? null, 0.3, 'up', fmtPct),
    ratioRow('Kârlılık', 'Gelir Büyümesi (Yıllık)',
      ratios.revenueGrowth as number | null, b.revenueGrowth ?? null, 1.0, 'up', fmtPct),

    // ── Faaliyet ──────────────────────────────────────────────────────────────
    ratioRow('Faaliyet', 'Aktif Devir Hızı',
      ratios.assetTurnover as number | null, b.assetTurnover ?? null, 3, 'up', v => fmtRatio(v)),
    ratioRow('Faaliyet', 'Alacak Tahsil Süresi (DSO)',
      ratios.receivablesTurnoverDays as number | null, b.receivablesDays ?? null, 120, 'down', fmtDays),
    ratioRow('Faaliyet', 'Stok Devir Süresi (DIO)',
      ratios.inventoryTurnoverDays as number | null, b.inventoryDays ?? null, 150, 'down', fmtDays),
    ratioRow('Faaliyet', 'Ticari Borç Ödeme Süresi (DPO)',
      ratios.payablesTurnoverDays as number | null, b.payablesTurnoverDays ?? null, 90, 'up', fmtDays),
    ratioRow('Faaliyet', 'Faaliyet Gideri Oranı',
      ratios.operatingExpenseRatio as number | null, b.operatingExpenseRatio ?? null, 0.4, 'down', fmtPct),
  ]
}

// ─── SAYFA 7: TREND ANALİZİ ──────────────────────────────────────────────────

type YearEntry = {
  id: string
  year: number
  period: string
  fd: FinancialDataRaw | null
  ratios: Record<string, number | null> | null
  score: number | null
  rating: string | null
}

function buildTrendData(
  allYears: YearEntry[],
  currentId: string,
  sector: string | null,
  bm: typeof SECTOR_BENCHMARKS[string] | null,
) {
  const b = bm

  // ── 4 Mini Bar Chart ──────────────────────────────────────────────────────
  // 1. Cari Oran  2. Net Kâr Marjı  3. Borç/ÖzK  4. Satış Büyümesi

  function buildChart(
    title: string,
    subtitle: string,
    extractor: (y: YearEntry) => number | null,
    sectorValue: number | null,
    maxVal: number,
    colorMain: string,
    colorSector: string,
    labelFn: (v: number) => string,
  ) {
    const bars: TrendBar[] = allYears.map(y => {
      const val = extractor(y)
      const secVal = sectorValue
      const isCurrent = y.id === currentId
      return {
        year: y.year,
        period: y.period,
        isCurrent,
        columns: [
          {
            value: val != null ? Math.min(val / maxVal * 100, 100) : 0,
            color: colorMain,
            label: val != null ? labelFn(val) : '—',
            isMain: true,
          },
          ...(secVal != null ? [{
            value: Math.min(secVal / maxVal * 100, 100),
            color: colorSector,
            label: labelFn(secVal),
            isMain: false,
          }] : []),
        ],
      }
    })

    return {
      title,
      subtitle: `Firma${sectorValue != null ? ' vs Sektör' : ''} · ${allYears.map(y => y.year).join('–')}`,
      maxValue: maxVal,
      bars,
      legendItems: [
        { label: 'Firma', color: colorMain },
        ...(sectorValue != null ? [{ label: 'Sektör', color: colorSector }] : []),
      ],
    }
  }

  const charts = [
    buildChart(
      'Cari Oran Trendi', '',
      y => (y.ratios?.currentRatio as number | null) ?? null,
      b?.currentRatio ?? null, 3,
      '#2dd4bf', '#94a3b8',
      v => v.toFixed(2),
    ),
    buildChart(
      'Net Kâr Marjı Trendi', '',
      y => (y.ratios?.netProfitMargin as number | null) ?? null,
      b?.netProfitMargin ?? null, 0.3,
      '#0ea5e9', '#94a3b8',
      v => `%${(v * 100).toFixed(1)}`,
    ),
    buildChart(
      'Borç/Özkaynak Trendi', '',
      y => (y.ratios?.debtToEquity as number | null) ?? null,
      b?.debtToEquity ?? null, 4,
      '#8b5cf6', '#94a3b8',
      v => `${v.toFixed(2)}x`,
    ),
    buildChart(
      'Satış Büyümesi Trendi', '',
      y => y.fd?.revenue != null ? y.fd.revenue : null,
      null, Math.max(...allYears.map(y => y.fd?.revenue ?? 0), 1),
      '#f59e0b', '#94a3b8',
      v => fmtCurrency(v),
    ),
  ]

  // ── Büyüme Tablosu ────────────────────────────────────────────────────────
  const growthTableRows: GrowthTableRow[] = []

  const metricDefs: Array<{ label: string; extractor: (y: YearEntry) => number | null; fmtFn: (v: number) => string }> = [
    { label: 'Net Satışlar', extractor: y => y.fd?.revenue ?? null, fmtFn: fmtCurrency },
    { label: 'FAVÖK',        extractor: y => y.fd?.ebitda ?? null,  fmtFn: fmtCurrency },
    { label: 'Net Kâr',      extractor: y => y.fd?.netProfit ?? null, fmtFn: fmtCurrency },
    { label: 'Toplam Aktif', extractor: y => y.fd?.totalAssets ?? null, fmtFn: fmtCurrency },
    { label: 'Özkaynak',     extractor: y => y.fd?.totalEquity ?? null, fmtFn: fmtCurrency },
  ]

  for (const { label, extractor, fmtFn } of metricDefs) {
    const years          = allYears.map(y => y.year)
    const periods        = allYears.map(y => y.period)
    const isCurrentFlags = allYears.map(y => y.id === currentId)
    const values  = allYears.map(y => extractor(y))
    const firstV  = values.find(v => v != null)
    const lastV   = values[values.length - 1]
    const growth4y = firstV != null && lastV != null && firstV !== 0 && firstV !== lastV
      ? fmtPctSigned((lastV - firstV) / Math.abs(firstV))
      : null
    const growthColor = growth4y?.startsWith('+') ? '#2dd4bf' : growth4y ? '#ef4444' : undefined

    growthTableRows.push({
      label,
      years,
      periods,
      isCurrentFlags,
      values: values.map(v => v != null ? fmtFn(v) : '—'),
      growth4y,
      growthColor,
    })
  }

  return { charts, growthTable: growthTableRows }
}

// ─── SAYFA 8: BİLANÇO ANALİZİ ───────────────────────────────────────────────

// Görünür satırlara göre "Diğer" residual hesapla — toplam ile her zaman matematiksel tutarlı
function residualOther(
  total: number | null,
  visibleItems: (number | null)[],
): number | null {
  if (total == null) return null
  const sum = visibleItems.reduce<number>((acc, v) => acc + (v ?? 0), 0)
  const diff = total - sum
  if (Math.abs(diff) < 0.5) return null  // Yuvarlama toleransı
  return diff
}

function buildBalanceSheet(tableYears: YearEntry[], currentId: string) {
  const years  = tableYears.map(y => ({ year: y.year, period: y.period, isCurrent: y.id === currentId }))
  const valArr = (fn: (fd: FinancialDataRaw) => number | null) =>
    tableYears.map(y => (y.fd ? fn(y.fd) : null))

  // residual per-year mapper
  const residualArr = (
    totalFn: (fd: FinancialDataRaw) => number | null,
    visibleFns: Array<(fd: FinancialDataRaw) => number | null>,
  ) => tableYears.map(y => {
    if (!y.fd) return null
    return residualOther(totalFn(y.fd), visibleFns.map(fn => fn(y.fd!)))
  })

  const items: BalanceSheetItem[] = [
    // AKTİF
    { label: 'DÖNEN VARLIKLAR', values: valArr(f => f.totalCurrentAssets), isMain: true },
    { label: 'Nakit ve Nakit Benzerleri',   values: valArr(f => f.cash) },
    { label: 'Ticari Alacaklar',            values: valArr(f => f.tradeReceivables) },
    { label: 'Stoklar',                     values: valArr(f => f.inventory) },
    // Diğer = totalCurrentAssets - (cash + tradeReceivables + inventory)
    { label: 'Diğer Dönen Varlıklar', values: residualArr(
        f => f.totalCurrentAssets,
        [f => f.cash, f => f.tradeReceivables, f => f.inventory],
      ) },
    { label: 'TOPLAM DÖNEN VARLIKLAR',      values: valArr(f => f.totalCurrentAssets), isTotal: true },

    { label: 'DURAN VARLIKLAR', values: valArr(f => f.totalNonCurrentAssets), isMain: true },
    { label: 'Maddi Duran Varlıklar',            values: valArr(f => f.tangibleAssets) },
    { label: 'Maddi Olmayan Duran Varlıklar',    values: valArr(f => f.intangibleAssets ?? null) },
    // Diğer = totalNonCurrentAssets - (tangibleAssets + intangibleAssets)
    { label: 'Diğer Duran Varlıklar', values: residualArr(
        f => f.totalNonCurrentAssets,
        [f => f.tangibleAssets, f => f.intangibleAssets ?? null],
      ) },
    { label: 'TOPLAM DURAN VARLIKLAR',           values: valArr(f => f.totalNonCurrentAssets), isTotal: true },

    { label: 'TOPLAM AKTİF', values: valArr(f => f.totalAssets), isTotal: true },

    // PASİF
    { label: 'KISA VADELİ YÜKÜMLÜLÜKLER', values: valArr(f => f.totalCurrentLiabilities), isMain: true },
    { label: 'Finansal Borçlar (KV)',       values: valArr(f => f.shortTermFinancialDebt) },
    { label: 'Ticari Borçlar',              values: valArr(f => f.tradePayables) },
    // Diğer = totalCurrentLiabilities - (shortTermFinancialDebt + tradePayables)
    { label: 'Diğer KV Yükümlülükler', values: residualArr(
        f => f.totalCurrentLiabilities,
        [f => f.shortTermFinancialDebt, f => f.tradePayables],
      ) },
    { label: 'TOPLAM KISA VADELİ YÜK.',    values: valArr(f => f.totalCurrentLiabilities), isTotal: true },

    { label: 'UZUN VADELİ YÜKÜMLÜLÜKLER', values: valArr(f => f.totalNonCurrentLiabilities), isMain: true },
    { label: 'Finansal Borçlar (UV)',       values: valArr(f => f.longTermFinancialDebt) },
    // Diğer = totalNonCurrentLiabilities - longTermFinancialDebt
    { label: 'Diğer UV Yükümlülükler', values: residualArr(
        f => f.totalNonCurrentLiabilities,
        [f => f.longTermFinancialDebt],
      ) },
    { label: 'TOPLAM UZUN VADELİ YÜK.',    values: valArr(f => f.totalNonCurrentLiabilities), isTotal: true },

    { label: 'ÖZKAYNAKLAR', values: valArr(f => f.totalEquity), isMain: true },
    { label: 'Ödenmiş Sermaye',               values: valArr(f => f.paidInCapital ?? null) },
    { label: 'Geçmiş Yıllar Kâr/Zararı',     values: valArr(f => (f.retainedEarnings ?? 0) - (f.retainedLosses ?? 0)) },
    { label: 'TOPLAM ÖZKAYNAK',               values: valArr(f => f.totalEquity), isTotal: true },

    { label: 'TOPLAM PASİF', values: valArr(f => f.totalLiabilitiesAndEquity ?? f.totalAssets), isTotal: true },
  ]

  const lastFd  = tableYears[tableYears.length - 1]?.fd
  const totalAssets     = lastFd?.totalAssets ?? 0
  const totalEquity     = lastFd?.totalEquity ?? 0
  const totalLiabilities = totalAssets - totalEquity
  const equityRatio      = totalAssets > 0 ? totalEquity / totalAssets : 0

  // 3-part dynamic commentary (null-safe — boş parçalar filter ile atlanır)

  // PARÇA 1 — Dönen/Duran Varlık
  let part1 = ''
  if (lastFd?.totalAssets != null && lastFd.totalAssets > 0 && lastFd?.totalCurrentAssets != null) {
    const currentAssetRatio = (lastFd.totalCurrentAssets / lastFd.totalAssets) * 100
    const pct = Math.round(currentAssetRatio)
    if (currentAssetRatio > 70) {
      part1 = `Dönen varlıklar toplam varlıkların %${pct}'sini oluşturuyor. Yüksek likidite konumu nakit yönetimi için olumlu, ancak duran varlık yatırımının düşük olması uzun vadeli büyüme kapasitesini sorgulatır.`
    } else if (currentAssetRatio > 40) {
      part1 = `Dönen varlıklar toplam varlıkların %${pct}'sini oluşturuyor. Dönen/duran varlık dengesi makul seviyede.`
    } else {
      part1 = `Dönen varlıklar toplam varlıkların %${pct}'sini oluşturuyor. Duran varlık ağırlıklı yapı uzun vadeli yatırım kapasitesini gösteriyor ancak kısa vadeli ödeme gücünü sorgulatır.`
    }
  }

  // PARÇA 2 — Kaldıraç (Borç/Özkaynak)
  let part2 = ''
  if (lastFd?.totalEquity != null && lastFd.totalEquity > 0) {
    const totalLiab = (lastFd.totalCurrentLiabilities ?? 0) + (lastFd.totalNonCurrentLiabilities ?? 0)
    const debtEquityRatio = totalLiab / lastFd.totalEquity
    const dr = debtEquityRatio.toFixed(2)
    if (debtEquityRatio < 0.5) {
      part2 = `Borç/Özkaynak oranı ${dr} ile düşük kaldıraç gösteriyor. Finansal sağlamlık yüksek.`
    } else if (debtEquityRatio < 1.5) {
      part2 = `Borç/Özkaynak oranı ${dr} ile sağlıklı kaldıraç seviyesinde.`
    } else {
      part2 = `Borç/Özkaynak oranı ${dr} ile yüksek kaldıraç. Borç yapısının vadelendirilmesi kritik öneme sahip.`
    }
  }

  // PARÇA 3 — Stok Yoğunluğu
  let part3 = ''
  if (lastFd?.totalCurrentAssets != null && lastFd.totalCurrentAssets > 0 && lastFd?.inventory != null) {
    const inventoryShare = (lastFd.inventory / lastFd.totalCurrentAssets) * 100
    const pct = Math.round(inventoryShare)
    if (inventoryShare > 60) {
      part3 = `Stoklar dönen varlıkların %${pct}'ini oluşturuyor. Yüksek stok yoğunluğu nakde dönüşüm hızını yavaşlatabilir.`
    } else if (inventoryShare > 30) {
      part3 = `Stoklar dönen varlıkların %${pct}'ini oluşturuyor. Sektör için makul seviyede.`
    } else if (inventoryShare > 0) {
      part3 = `Stoklar dönen varlıkların %${pct}'ini oluşturuyor. Düşük stok yoğunluğu hızlı nakit dönüşümü sağlıyor.`
    }
  }

  // Boş parçaları filtrele, boşlukla birleştir
  const comment = [part1, part2, part3].filter(p => p.length > 0).join(' ')

  return {
    years,
    items,
    totalAssets,
    totalLiabilities,
    equityRatio,
    comment,
  }
}

// ─── SAYFA 9: GELİR TABLOSU ──────────────────────────────────────────────────

function buildIncomeStatement(tableYears: YearEntry[], currentId: string) {
  const years  = tableYears.map(y => ({ year: y.year, period: y.period, isCurrent: y.id === currentId }))
  const valArr = (fn: (fd: FinancialDataRaw) => number | null) =>
    tableYears.map(y => (y.fd ? fn(y.fd) : null))

  const lastFd  = tableYears[tableYears.length - 1]?.fd
  const revenue = lastFd?.revenue
  const marginFn = (v: number | null) =>
    (v != null && revenue != null && revenue > 0) ? v / revenue : null

  const items: IncomeStatementItem[] = [
    { label: 'Net Satışlar',             values: valArr(f => f.revenue),            isMain: true },
    { label: 'Satışların Maliyeti (-)',  values: valArr(f => f.cogs != null ? -f.cogs : null) },
    { label: 'BRÜT KÂR',                values: valArr(f => f.grossProfit),         isTotal: true,
      margin2024: marginFn(lastFd?.grossProfit ?? null) },

    { label: 'Faaliyet Giderleri (-)',   values: valArr(f => f.operatingExpenses != null ? -f.operatingExpenses : null) },
    { label: 'FVÖK (EBIT)',              values: valArr(f => f.ebit),                isTotal: true,
      margin2024: marginFn(lastFd?.ebit ?? null) },
    { label: 'FAVÖK (EBITDA)',           values: valArr(f => f.ebitda),              isTotal: true,
      margin2024: marginFn(lastFd?.ebitda ?? null) },

    { label: 'Faiz Gideri (-)',          values: valArr(f => f.interestExpense != null ? -f.interestExpense : null) },
    { label: 'VÖK (EBT)',                values: valArr(f => f.ebt),                 isTotal: true },
    { label: 'Kurumlar Vergisi (-)',     values: valArr(f => f.taxExpense != null ? -f.taxExpense : null) },
    { label: 'DÖNEM NET KÂRI',          values: valArr(f => f.netProfit),            isMain: true,
      margin2024: marginFn(lastFd?.netProfit ?? null) },
  ]

  return { years, items }
}

// ─── SAYFA 10: NAKİT AKIŞ & ÇALIŞMA SERMAYESİ ───────────────────────────────

function buildCashFlow(
  ratios: Record<string, number | null>,
  fd: FinancialDataRaw | null,
  tableYears: YearEntry[],
  bm: typeof SECTOR_BENCHMARKS[string] | null,
  currentId: string,
) {
  const dso = (ratios.receivablesTurnoverDays as number | null) ?? 0
  const dio = (ratios.inventoryTurnoverDays as number | null) ?? 0
  const dpo = (ratios.payablesTurnoverDays as number | null) ?? 0
  const ccc = dso + dio - dpo

  const b = bm

  // Çalışma sermayesi tablosu (son 2 yıl)
  const lastTwo = tableYears.slice(-2)
  const wcYears = lastTwo.map(y => ({
    year: y.year,
    period: y.period,
    isCurrent: y.id === currentId,
  }))
  const workingCapitalTable = [
    { label: 'Ticari Alacaklar',      values: lastTwo.map(y => y.fd?.tradeReceivables ?? null), years: wcYears },
    { label: 'Stoklar',               values: lastTwo.map(y => y.fd?.inventory ?? null),         years: wcYears },
    { label: 'Ticari Borçlar',        values: lastTwo.map(y => y.fd?.tradePayables ?? null),     years: wcYears },
    { label: 'Dönen Varlıklar',       values: lastTwo.map(y => y.fd?.totalCurrentAssets ?? null), years: wcYears },
    { label: 'KV Yükümlülükler',      values: lastTwo.map(y => y.fd?.totalCurrentLiabilities ?? null), years: wcYears },
    {
      label: 'Net Çalışma Sermayesi',
      values: lastTwo.map(y => {
        const ca = y.fd?.totalCurrentAssets ?? null
        const cl = y.fd?.totalCurrentLiabilities ?? null
        return ca != null && cl != null ? ca - cl : null
      }),
      years: wcYears,
    },
  ]

  const positives: string[] = []
  const improvements: string[] = []

  if (dso > 0 && dpo > 0 && dso < dpo) positives.push(`Alacak tahsil süresi (${Math.round(dso)} gün), borç ödeme süresinden (${Math.round(dpo)} gün) kısa — finansman döngüsü olumlu.`)
  if (b && dio > 0 && dio < b.inventoryDays * 1.10) positives.push(`Stok devir süresi ${Math.round(dio)} gün ile sektör (${Math.round(b.inventoryDays)} gün) düzeyinde — stok yönetimi verimli.`)

  if (ccc > 60) improvements.push(`Nakit dönüşüm çevrimi ${Math.round(ccc)} gün — iyileştirme aksiyonlarıyla ${Math.round(ccc * 0.75)} güne indirgenebilir.`)
  if (dso > 0 && b && dso > b.receivablesDays * 1.20) improvements.push(`Alacak tahsil süresi (${Math.round(dso)} gün) sektör (${Math.round(b.receivablesDays)} gün) üzerinde; tahsilat sürecinin hızlandırılması nakit akışını iyileştirir.`)
  if (dio > 0 && b && dio > b.inventoryDays * 1.20) improvements.push(`Stok devir süresi (${Math.round(dio)} gün) optimizasyonu çalışma sermayesini serbest bırakır.`)

  return {
    ccc: {
      dso: Math.round(dso),
      dio: Math.round(dio),
      dpo: Math.round(dpo),
      ccc: Math.round(ccc),
      sectorDso: b ? Math.round(b.receivablesDays) : null,
      sectorDio: b ? Math.round(b.inventoryDays) : null,
      sectorDpo: b ? Math.round(b.payablesTurnoverDays) : null,
      sectorCcc: b ? Math.round(b.cashConversionCycle) : null,
      comment: `CCC = ${Math.round(dso)} + ${Math.round(dio)} − ${Math.round(dpo)} = ${Math.round(ccc)} gün${b ? ` · Sektör CCC: ${Math.round(b.cashConversionCycle)} gün` : ''}`,
    },
    workingCapitalTable,
    positives:    (() => {
      // Eğer spesifik pozitif bulunamadıysa, net çalışma sermayesi durumuna bak
      if (positives.length > 0) return positives
      const lastY = tableYears[tableYears.length - 1]
      const ca = lastY?.fd?.totalCurrentAssets ?? null
      const cl = lastY?.fd?.totalCurrentLiabilities ?? null
      const nwc = ca != null && cl != null ? ca - cl : null
      if (nwc != null && nwc > 0) {
        return [`Net çalışma sermayesi pozitif (${fmtCurrency(nwc)}), kısa vadeli yükümlülükler güvenle karşılanabiliyor.`]
      }
      // nwc negatif veya null ise bu olumlu değil — boş bırak (component map eder, sorun olmaz)
      return []
    })(),
    improvements: improvements.length > 0 ? improvements : ['Nakit dönüşüm döngüsü izlenmesi önerilir.'],
    conclusion: `Nakit dönüşüm çevrimi ${Math.round(ccc)} gün olarak hesaplanmıştır. ${ccc <= 45 ? 'Sektör ortalamasına göre verimli bir nakit döngüsü.' : 'Döngünün optimize edilmesi finansman maliyetini düşürür ve banka kredi değerlendirmesini olumlu etkiler.'}`,
  }
}

// ─── SAYFA 11: SENARYO ANALİZİ ───────────────────────────────────────────────

function buildScenarioData(
  snap: OptimizerSnapshotRaw | null,
  t1: OptimizerTargetRaw | null,
  t2: OptimizerTargetRaw | null,
  rating: string,
  totalScore: number,
) {
  const currentNote = buildScenarioNote(rating, totalScore)

  const target1 = t1 ? {
    rating:   t1.targetRating,
    score:    Math.round(t1.idealPlan.projectedScore),
    delta:    Math.round(t1.totalGain),                                    // N2: totalGain (optimizer'ın hesapladığı net kazanç)
    timeline: t1.minimumPlan.suggestions[0]?.timeHorizon ?? '3-12 Ay',
    actions:  t1.minimumPlan.suggestions.slice(0, 4).map(s => {
      if (s.label) return s.label
      const txt = s.actionText || ''
      const match = txt.match(/^(.+?[.!?])(?:\s|$)/)  // F3: ilk gerçek cümle sonu (sayıdaki nokta değil)
      if (match) return match[1]
      return txt.length > 60 ? txt.substring(0, 60) + '…' : txt
    }),
    planNote: buildCollateralNote(t1.targetRating, Math.round(t1.idealPlan.projectedScore)),
  } : {
    rating: '—', score: totalScore + 3, delta: 3,
    timeline: '3-12 Ay', actions: ['Senaryo verisi hesaplanmadı.'],
    planNote: '—',
  }

  const target2 = t2 ? {
    rating:   t2.targetRating,
    score:    Math.round(t2.idealPlan.projectedScore),
    delta:    Math.round(t2.totalGain),                                    // N2: totalGain
    timeline: '6-18 Ay',
    actions:  t2.minimumPlan.suggestions.slice(0, 4).map(s => {
      if (s.label) return s.label
      const txt = s.actionText || ''
      const match = txt.match(/^(.+?[.!?])(?:\s|$)/)
      if (match) return match[1]
      return txt.length > 60 ? txt.substring(0, 60) + '…' : txt
    }),
    planNote: buildCollateralNote(t2.targetRating, Math.round(t2.idealPlan.projectedScore)),
  } : {
    rating: '—', score: totalScore + 6, delta: 6,
    timeline: '6-18 Ay', actions: ['Senaryo verisi hesaplanmadı.'],
    planNote: '—',
  }

  // Waterfall barlar
  const waterfall: WaterfallBar[] = [
    { label: 'Mevcut', value: totalScore, type: 'base', color: '#0a192f' },
  ]

  if (t1) {
    const sug1 = t1.minimumPlan.suggestions[0]
    const sug2 = t1.minimumPlan.suggestions[1]
    if (sug1) waterfall.push({ label: sug1.label.replace(/ /g, '\n'), value: Math.round(sug1.scoreGain), type: 'delta', color: '#2dd4bf' })
    if (sug2) waterfall.push({ label: sug2.label.replace(/ /g, '\n'), value: Math.round(sug2.scoreGain), type: 'delta', color: '#2dd4bf' })
    waterfall.push({ label: '1. Hedef', value: Math.round(t1.idealPlan.projectedScore), type: 'target', color: '#22c55e' })
  }

  if (t2) {
    const sug = t2.minimumPlan.suggestions.find(s => !t1?.minimumPlan.suggestions.find(s2 => s2.key === s.key))
    if (sug) waterfall.push({ label: sug.label.replace(/ /g, '\n'), value: Math.round(sug.scoreGain), type: 'delta', color: '#2dd4bf' })
    waterfall.push({ label: '2. Hedef', value: Math.round(t2.idealPlan.projectedScore), type: 'target', color: '#f59e0b' })
  }

  return {
    current: { rating, score: totalScore, note: currentNote },  // F2: tek kaynak = finalScore (kapak ile tutarlı)
    target1,
    target2,
    waterfall,
  }
}

// ─── SAYFA 12: AKSİYON PLANI ─────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { category: string; categoryColor: string; categoryBg: string; categoryBorder: string }> = {
  liquidity:       { category: 'Likidite',  categoryColor: '#0284c7', categoryBg: '#eff6ff', categoryBorder: '#bfdbfe' },
  profitability:   { category: 'Kârlılık',  categoryColor: '#0f766e', categoryBg: '#f0fdfa', categoryBorder: '#99f6e4' },
  leverage:        { category: 'Kaldıraç',  categoryColor: '#7c3aed', categoryBg: '#f5f3ff', categoryBorder: '#ddd6fe' },
  'working-capital': { category: 'Faaliyet', categoryColor: '#b45309', categoryBg: '#fffbeb', categoryBorder: '#fde68a' },
}

function buildBankImpact(actionFamily: string, actionText: string): string {
  const texts: Record<string, string> = {
    liquidity:         'Likidite iyileşmesi cari oran üzerinden kredi limitini doğrudan etkiler. Bankaların kısa vadeli kredi taleplerinde öncelikli değerlendirme kriteridir.',
    profitability:     'Kârlılık artışı geri ödeme kapasitesini güçlendirir. Nakit akış projeksiyonlarında iyileşme ile kredi faiz oranı müzakeresini kolaylaştırır.',
    leverage:          'Kaldıraç azalması borç servisi rasyolarını iyileştirir. Özkaynak güçlenmesi banka teminat hesaplamalarında olumlu etki yaratır.',
    'working-capital': 'Çalışma sermayesi verimliliği nakit akışını iyileştirir. Kısa vadeli finansman ihtiyacının azalması revolver kredi maliyetini düşürür.',
  }
  return texts[actionFamily] ?? 'Bu aksiyon finansal sağlamlığı güçlendirerek banka değerlendirmesini olumlu etkiler.'
}

function formatSuggestionValue(value: number | null, unit: RatioSuggestionRaw['unit']): string {
  if (value == null) return '—'
  if (unit === 'pct') return fmtPct(value)
  if (unit === 'x') return fmtRatio(value)
  if (unit === 'day') return fmtDays(value)
  return value.toFixed(2)
}

function buildActionPlan(
  t1: OptimizerTargetRaw | null,
  t2: OptimizerTargetRaw | null,
): ActionPlanItem[] {
  const suggestions = [
    ...(t1?.minimumPlan.suggestions ?? []),
    ...(t2?.minimumPlan.suggestions ?? []),
  ]

  // Benzersiz key'lere göre deduplicate, scoreGain'e göre sırala
  const seen = new Set<string>()
  const unique = suggestions.filter(s => {
    if (seen.has(s.key)) return false
    seen.add(s.key)
    return true
  }).sort((a, b) => b.scoreGain - a.scoreGain)
    .slice(0, 4)

  return unique.map((s, i) => {
    const style = CATEGORY_STYLE[s.actionFamily] ?? CATEGORY_STYLE['working-capital']
    const currentFmt = formatSuggestionValue(s.currentValue, s.unit)
    const targetFmt  = formatSuggestionValue(s.targetValue, s.unit)

    return {
      number:            i + 1,
      title:             s.label,
      category:          style.category,
      categoryColor:     style.categoryColor,
      categoryBg:        style.categoryBg,
      categoryBorder:    style.categoryBorder,
      description:       s.actionText,
      bankImpact:        buildBankImpact(s.actionFamily, s.actionText),
      currentValue:      currentFmt,
      targetValue:       targetFmt,
      currentToTarget:   `${currentFmt} → ${targetFmt}`,
      scoreContribution: Math.round(s.scoreGain * 10) / 10,
      duration:          s.timeHorizon,
      difficulty:        s.difficulty === 'ZOR' ? 'Yüksek' : 'Orta',
    }
  })
}

// ─── SAYFA 13: SUBJEKTİF FAKTÖRLER ───────────────────────────────────────────

function buildSubjectiveData(
  subj: SubjectiveInputRaw | null,
  breakdown: ReturnType<typeof calcSubjectiveScore>,
  subjectiveTotal: number,
) {
  const isEmpty = subj == null

  // KKB Kartı
  const kkbRows: SubjectiveRow[] = subj ? [
    { label: 'KKB Kategorisi',  value: kkbLabel(subj.kkbCategory), color: kkbColor(subj.kkbCategory) },
    { label: 'Gecikme/Takip',   value: delayLabel(subj.activeDelayDays), color: delayColor(subj.activeDelayDays) },
    { label: 'Çek Protestosu',  value: subj.checkProtest ? 'Mevcut' : 'Yok', color: subj.checkProtest ? '#ef4444' : '#22c55e' },
    { label: 'İcra Dosyası',    value: subj.enforcementFile ? 'Mevcut' : 'Yok', color: subj.enforcementFile ? '#ef4444' : '#22c55e' },
  ] : []

  // Banka İlişkileri Kartı
  const bankRows: SubjectiveRow[] = subj ? [
    { label: 'Limit Kullanım',    value: `%${subj.creditLimitUtilPct}`, color: utilColor(subj.creditLimitUtilPct) },
    { label: 'Çok Bankacılık',    value: subj.hasMultipleBanks ? 'Evet' : 'Hayır', color: subj.hasMultipleBanks ? '#22c55e' : '#94a3b8' },
    { label: 'Ortalama Vade',     value: `${subj.avgMaturityMonths} Ay`, color: maturityColor(subj.avgMaturityMonths) },
  ] : []

  // Kurumsal Yapı Kartı
  const corpRows: SubjectiveRow[] = subj ? [
    { label: 'Şirket Yaşı',       value: `${subj.companyAgeYears} Yıl`, color: subj.companyAgeYears >= 10 ? '#22c55e' : subj.companyAgeYears >= 5 ? '#2dd4bf' : '#f59e0b' },
    { label: 'Denetim Düzeyi',    value: auditLabel(subj.auditLevel), color: auditColor(subj.auditLevel) },
    { label: 'Ortaklık Yapısı',   value: subj.ownershipClarity ? 'Net' : 'Karmaşık', color: subj.ownershipClarity ? '#22c55e' : '#f59e0b' },
  ] : []

  // Uyum & Risk Kartı
  const complianceRows: SubjectiveRow[] = subj ? [
    { label: 'Vergi Borcu',       value: subj.hasTaxDebt ? 'Mevcut' : 'Yok', color: subj.hasTaxDebt ? '#ef4444' : '#22c55e' },
    { label: 'SGK Borcu',         value: subj.hasSgkDebt ? 'Mevcut' : 'Yok', color: subj.hasSgkDebt ? '#ef4444' : '#22c55e' },
    { label: 'Aktif Dava',        value: subj.activeLawsuitCount > 0 ? `${subj.activeLawsuitCount} Dava` : 'Yok', color: subj.activeLawsuitCount > 0 ? '#f59e0b' : '#22c55e' },
  ] : []

  function buildCard(
    title: string,
    subtitle: string,
    score: number,
    maxScore: number,
    rows: SubjectiveRow[],
    summaryFn: (score: number, max: number, empty: boolean) => string,
  ): SubjectiveCard {
    const pct = Math.round(score / maxScore * 100)
    const style = getSubjectiveStatus(score, maxScore)
    return {
      title, subtitle, score, maxScore, percent: pct,
      status: style.status, statusColor: style.statusColor, barColor: style.barColor,
      rows, isEmpty,
      summary:      summaryFn(score, maxScore, isEmpty),
      summaryBg:    style.summaryBg,
      summaryColor: style.summaryColor,
    }
  }

  return {
    totalScore: subjectiveTotal,
    maxScore:   30,
    kkb: buildCard('Kredi Sicili (KKB)', 'Kredi Kayıt Bürosu verisi',
      breakdown.kkbScore, 10, kkbRows, buildKkbSummary),
    bank: buildCard('Banka İlişkileri', 'Limit kullanımı ve vade yapısı',
      breakdown.bankScore, 10, bankRows, buildBankSummary),
    corporate: buildCard('Kurumsal Yapı', 'Denetim düzeyi ve şirket profili',
      breakdown.corpScore, 5, corpRows, buildCorpSummary),
    compliance: buildCard('Uyum & Risk', 'Vergi, SGK ve hukuki durum',
      breakdown.complianceScore, 5, complianceRows, buildComplianceSummary),
  }
}

// ─── YARDIMCI ETİKET FONKSİYONLARI ──────────────────────────────────────────

function kkbLabel(cat: string): string {
  return { iyi: 'İyi', orta: 'Orta', kotu: 'Kötü', cok_kotu: 'Çok Kötü' }[cat] ?? cat
}
function kkbColor(cat: string): string {
  return { iyi: '#22c55e', orta: '#f59e0b', kotu: '#ef4444', cok_kotu: '#dc2626' }[cat] ?? '#94a3b8'
}
function delayLabel(days: number): string {
  if (days === 0) return 'Yok'
  if (days <= 30) return '1–30 Gün'
  if (days <= 90) return '31–90 Gün'
  return '90+ Gün'
}
function delayColor(days: number): string {
  if (days === 0) return '#22c55e'
  if (days <= 30) return '#f59e0b'
  return '#ef4444'
}
function utilColor(pct: number): string {
  if (pct < 30) return '#22c55e'
  if (pct < 70) return '#f59e0b'
  return '#ef4444'
}
function maturityColor(months: number): string {
  if (months >= 36) return '#22c55e'
  if (months >= 12) return '#2dd4bf'
  return '#f59e0b'
}
function auditLabel(level: string): string {
  return {
    yok: 'Yok', smmm: 'SMMM', ymm: 'YMM',
    tam_tasdik: 'Tam Tasdik', bagimsiz: 'Bağımsız Denetim',
  }[level] ?? level
}
function auditColor(level: string): string {
  return {
    yok: '#ef4444', smmm: '#f59e0b', ymm: '#2dd4bf',
    tam_tasdik: '#22c55e', bagimsiz: '#22c55e',
  }[level] ?? '#94a3b8'
}
