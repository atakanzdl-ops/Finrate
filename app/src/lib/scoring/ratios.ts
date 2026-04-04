/**
 * Finrate — 25 Finansal Oran Hesaplama Modülü
 * 4 kategori: Likidite (6), Karlılık (7), Kaldıraç (6), Faaliyet (6)
 */

export interface FinancialInput {
  // Büyüme hesabı için
  prevRevenue?: number | null   // Önceki yıl cirosu (reel büyüme için)
  ppiRate?: number | null       // ÜFE oranı (0.43 = %43)

  // Dönen Varlıklar
  cash?: number | null
  shortTermInvestments?: number | null
  tradeReceivables?: number | null
  inventory?: number | null
  otherCurrentAssets?: number | null
  totalCurrentAssets?: number | null

  // Duran Varlıklar
  tangibleAssets?: number | null
  intangibleAssets?: number | null
  longTermInvestments?: number | null
  otherNonCurrentAssets?: number | null
  totalNonCurrentAssets?: number | null
  totalAssets?: number | null

  // Kısa Vadeli Borçlar
  shortTermFinancialDebt?: number | null
  tradePayables?: number | null
  otherCurrentLiabilities?: number | null
  totalCurrentLiabilities?: number | null

  // Uzun Vadeli Borçlar
  longTermFinancialDebt?: number | null
  otherNonCurrentLiabilities?: number | null
  totalNonCurrentLiabilities?: number | null

  // Öz Kaynak
  paidInCapital?: number | null
  retainedEarnings?: number | null
  netProfitCurrentYear?: number | null
  totalEquity?: number | null
  totalLiabilitiesAndEquity?: number | null

  // Gelir Tablosu
  revenue?: number | null
  cogs?: number | null
  grossProfit?: number | null
  operatingExpenses?: number | null
  ebit?: number | null
  depreciation?: number | null
  ebitda?: number | null
  interestExpense?: number | null
  otherIncome?: number | null
  otherExpense?: number | null
  ebt?: number | null
  taxExpense?: number | null
  netProfit?: number | null
  purchases?: number | null
}

export interface RatioResult {
  // LİKİDİTE (6)
  currentRatio: number | null          // Cari Oran
  quickRatio: number | null            // Asit-Test Oranı
  cashRatio: number | null             // Nakit Oranı
  netWorkingCapital: number | null     // Net Çalışma Sermayesi
  netWorkingCapitalRatio: number | null // NÇS / Toplam Varlık
  cashConversionCycle: number | null   // Nakit Dönüşüm Süresi (gün)

  // KARLILIK (9)
  grossMargin: number | null           // Brüt Kar Marjı
  ebitdaMargin: number | null          // FAVÖK Marjı
  ebitMargin: number | null            // FVÖK Marjı (EBIT Marjı)
  netProfitMargin: number | null       // Net Kar Marjı
  roa: number | null                   // Aktif Karlılığı (ROA)
  roe: number | null                   // Öz Kaynak Karlılığı (ROE)
  roic: number | null                  // Yatırım Getirisi (ROIC)
  revenueGrowth: number | null         // Nominal Gelir Büyümesi
  realGrowth: number | null            // Reel Büyüme (ÜFE Arındırılmış)

  // KALDIRAC (6)
  debtToEquity: number | null          // Borç / Öz Kaynak
  debtToAssets: number | null          // Borç / Varlık
  debtToEbitda: number | null          // Net Finansal Borç / FAVÖK
  interestCoverage: number | null      // Faiz Karşılama Oranı
  equityRatio: number | null           // Öz Kaynak Oranı
  shortTermDebtRatio: number | null    // KV Borç / Toplam Borç

  // FAALİYET (6)
  assetTurnover: number | null         // Varlık Devir Hızı
  inventoryTurnoverDays: number | null // Stok Devir Süresi (gün)
  receivablesTurnoverDays: number | null // Alacak Tahsil Süresi (gün)
  payablesTurnoverDays: number | null  // Borç Ödeme Süresi (gün)
  fixedAssetTurnover: number | null    // Duran Varlık Devir Hızı
  operatingExpenseRatio: number | null // Faaliyet Gideri / Gelir
}

function safe(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null
  return a / b
}

function n(v: number | null | undefined): number | null {
  return v == null ? null : Number(v)
}

// Türkiye ÜFE (Üretici Fiyat Endeksi) yıllık oranları — TCMB verisine dayalı
export const TURKEY_PPI: Record<number, number> = {
  2025: 0.30,
  2024: 0.43,
  2023: 0.74,
  2022: 1.30,
  2021: 0.44,
  2020: 0.25,
  2019: 0.10,
  2018: 0.33,
}

export function calculateRatios(d: FinancialInput): RatioResult {
  // Türetilmiş değerler
  const totalFinancialDebt =
    (n(d.shortTermFinancialDebt) ?? 0) + (n(d.longTermFinancialDebt) ?? 0)

  const netFinancialDebt = totalFinancialDebt - (n(d.cash) ?? 0) - (n(d.shortTermInvestments) ?? 0)

  const totalDebt =
    (n(d.totalCurrentLiabilities) ?? 0) + (n(d.totalNonCurrentLiabilities) ?? 0)

  // Hesaplanan ama schema'da olmayan alanlar için fallback
  const grossProfit = n(d.grossProfit) ?? (
    d.revenue != null && d.cogs != null ? n(d.revenue)! - n(d.cogs)! : null
  )
  const ebitda = n(d.ebitda) ?? (
    d.ebit != null && d.depreciation != null ? n(d.ebit)! + n(d.depreciation)! : null
  )
  const totalEquity = n(d.totalEquity)
  const revenue = n(d.revenue)
  const totalAssets = n(d.totalAssets)
  const totalCurrentAssets = n(d.totalCurrentAssets)
  const totalCurrentLiabilities = n(d.totalCurrentLiabilities)
  const inventory = n(d.inventory)
  const cash = n(d.cash)
  const shortTermInvestments = n(d.shortTermInvestments)
  const ebit = n(d.ebit)
  const netProfit = n(d.netProfit)
  const interestExpense = n(d.interestExpense)
  const tangibleAssets = n(d.tangibleAssets)
  const tradeReceivables = n(d.tradeReceivables)
  const tradePayables = n(d.tradePayables)
  const purchases = n(d.purchases)
  const operatingExpenses = n(d.operatingExpenses)
  const longTermFinancialDebt = n(d.longTermFinancialDebt)

  // ─── LİKİDİTE ───────────────────────────────────────────
  const currentRatio = safe(totalCurrentAssets, totalCurrentLiabilities)

  const quickAssets =
    totalCurrentAssets != null && inventory != null ? totalCurrentAssets - inventory : null
  const quickRatio = safe(quickAssets, totalCurrentLiabilities)

  const liquidAssets =
    cash != null && shortTermInvestments != null ? cash + shortTermInvestments : cash
  const cashRatio = safe(liquidAssets, totalCurrentLiabilities)

  const netWorkingCapital =
    totalCurrentAssets != null && totalCurrentLiabilities != null
      ? totalCurrentAssets - totalCurrentLiabilities
      : null

  const netWorkingCapitalRatio = safe(netWorkingCapital, totalAssets)

  // NDS = Stok Devir + Alacak Tahsil - Borç Ödeme (gün)
  const dso = revenue != null && tradeReceivables != null ? (tradeReceivables / revenue) * 365 : null
  const dpo =
    purchases != null && tradePayables != null
      ? (tradePayables / purchases) * 365
      : revenue != null && tradePayables != null
      ? (tradePayables / revenue) * 365
      : null
  const dio =
    inventory != null
      ? purchases != null
        ? (inventory / purchases) * 365
        : revenue != null
        ? (inventory / revenue) * 365
        : null
      : null
  const cashConversionCycle =
    dio != null && dso != null && dpo != null ? dio + dso - dpo : null

  // ─── KARLILIK ─────────────────────────────────────────────
  const grossMargin = safe(grossProfit, revenue)
  const ebitdaMargin = safe(ebitda, revenue)
  const ebitMargin = safe(ebit, revenue)
  const netProfitMargin = safe(netProfit, revenue)
  const roa = safe(netProfit, totalAssets)

  const roe = safe(netProfit, totalEquity)

  // ROIC: EBIT*(1-0.22) / (Toplam Varlık - KV Borçlar)
  const investedCapital =
    totalAssets != null && totalCurrentLiabilities != null
      ? totalAssets - totalCurrentLiabilities
      : null
  const nopat = ebit != null ? ebit * (1 - 0.22) : null
  const roic = safe(nopat, investedCapital)

  // Büyüme rasyoları
  const prevRevenue = n(d.prevRevenue)
  const revenueGrowth =
    prevRevenue != null && prevRevenue !== 0 && revenue != null
      ? (revenue - prevRevenue) / prevRevenue
      : null

  const ppiRate = n(d.ppiRate)
  const realGrowth =
    revenueGrowth != null && ppiRate != null
      ? (1 + revenueGrowth) / (1 + ppiRate) - 1
      : null

  // ─── KALDIRAC ─────────────────────────────────────────────
  const debtToEquity = safe(totalDebt || null, totalEquity)
  const debtToAssets = safe(totalDebt || null, totalAssets)
  const debtToEbitda = ebitda != null && ebitda !== 0 ? netFinancialDebt / ebitda : null
  const interestCoverage = safe(ebit, interestExpense)
  const equityRatio = safe(totalEquity, totalAssets)

  const shortTermDebtRatio =
    totalFinancialDebt > 0 && d.shortTermFinancialDebt != null
      ? (n(d.shortTermFinancialDebt)! / totalFinancialDebt)
      : null

  // ─── FAALİYET ─────────────────────────────────────────────
  const assetTurnover = safe(revenue, totalAssets)
  const inventoryTurnoverDays = dio
  const receivablesTurnoverDays = dso
  const payablesTurnoverDays = dpo
  const fixedAssetTurnover = safe(revenue, tangibleAssets)
  const operatingExpenseRatio = safe(operatingExpenses, revenue)

  return {
    currentRatio,
    quickRatio,
    cashRatio,
    netWorkingCapital,
    netWorkingCapitalRatio,
    cashConversionCycle,

    grossMargin,
    ebitdaMargin,
    ebitMargin,
    netProfitMargin,
    roa,
    roe,
    roic,
    revenueGrowth,
    realGrowth,

    debtToEquity,
    debtToAssets,
    debtToEbitda,
    interestCoverage,
    equityRatio,
    shortTermDebtRatio,

    assetTurnover,
    inventoryTurnoverDays,
    receivablesTurnoverDays,
    payablesTurnoverDays,
    fixedAssetTurnover,
    operatingExpenseRatio,
  }
}
