/**
 * Finrate — 25 Finansal Oran Hesaplama Modülü
 * 4 kategori: Likidite (6), Karlılık (9), Kaldıraç (6), Faaliyet (6)
 * İnşaat/Taahhüt sektörü için otomatik özel metodoloji.
 */

export const CORPORATE_TAX_RATE = 0.25

export interface FinancialInput {
  // Sektör — İnşaat/Taahhüt için özel metodoloji otomatik devreye girer
  sector?: string | null

  // Büyüme hesabı için
  prevRevenue?: number | null          // Önceki yıl cirosu
  ppiRate?: number | null              // ÜFE oranı (0.43 = %43)

  // Önceki dönem karşılaştırma kalemleri (ortalama hesabı için)
  prevInventory?: number | null        // Önceki yıl stok
  prevTradeReceivables?: number | null // Önceki yıl ticari alacak
  prevTradePayables?: number | null    // Önceki yıl ticari borç
  prevAdvancesReceived?: number | null // Önceki yıl alınan avanslar (340)

  // Dönen Varlıklar
  cash?: number | null
  shortTermInvestments?: number | null
  tradeReceivables?: number | null
  inventory?: number | null
  prepaidSuppliers?: number | null     // 159 Verilen Sipariş Avansları (Stoklar alt hesabı)
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
  advancesReceived?: number | null     // 340 Alınan Sipariş/Müşteri Avansları
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
  currentRatio: number | null
  quickRatio: number | null
  cashRatio: number | null
  netWorkingCapital: number | null
  netWorkingCapitalRatio: number | null
  cashConversionCycle: number | null       // Nakit İhtiyaç Süresi — Standart (gün)

  // KARLILIK (9)
  grossMargin: number | null
  ebitdaMargin: number | null
  ebitMargin: number | null
  netProfitMargin: number | null
  roa: number | null
  roe: number | null
  roic: number | null
  revenueGrowth: number | null
  realGrowth: number | null

  // KALDIRAC (6)
  debtToEquity: number | null
  debtToAssets: number | null
  debtToEbitda: number | null
  interestCoverage: number | null
  equityRatio: number | null
  shortTermDebtRatio: number | null

  // FAALİYET (6)
  assetTurnover: number | null
  inventoryTurnoverDays: number | null     // Stok Taşıma Süresi (gün)
  receivablesTurnoverDays: number | null   // Alacak Tahsil Süresi (gün)
  payablesTurnoverDays: number | null      // Ticari Borç Ödeme Süresi (gün)
  fixedAssetTurnover: number | null
  operatingExpenseRatio: number | null

  // İNŞAAT SEKTÖRÜ EK RASYOLAR
  customerAdvanceDays: number | null       // Alınan Avans Süresi — 340 / (Net Satışlar/365)
  adjustedCashConversionCycle: number | null // Düzeltilmiş NDS = Stok + Alacak - Borç - Avans
}

function safe(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null
  return a / b
}

function n(v: number | null | undefined): number | null {
  return v == null ? null : Number(v)
}

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
  // ─── Sektör tespiti ─────────────────────────────────────────
  const isConstruction = typeof d.sector === 'string' &&
    (d.sector.includes('İnşaat') || d.sector.includes('Insaat') || d.sector.includes('Taahhüt'))

  // ─── Türetilmiş değerler ─────────────────────────────────────
  const totalFinancialDebt =
    (n(d.shortTermFinancialDebt) ?? 0) + (n(d.longTermFinancialDebt) ?? 0)

  const netFinancialDebt = totalFinancialDebt - (n(d.cash) ?? 0) - (n(d.shortTermInvestments) ?? 0)

  const totalDebt =
    (n(d.totalCurrentLiabilities) ?? 0) + (n(d.totalNonCurrentLiabilities) ?? 0)

  const grossProfit = n(d.grossProfit) ?? (
    d.revenue != null && d.cogs != null ? n(d.revenue)! - n(d.cogs)! : null
  )
  const ebitda = n(d.ebitda) ?? (
    d.ebit != null && d.depreciation != null ? n(d.ebit)! + n(d.depreciation)! : null
  )

  const totalEquity            = n(d.totalEquity)
  const revenue                = n(d.revenue)
  const totalAssets            = n(d.totalAssets)
  const totalCurrentAssets     = n(d.totalCurrentAssets)
  const totalCurrentLiabilities= n(d.totalCurrentLiabilities)
  const cash                   = n(d.cash)
  const shortTermInvestments   = n(d.shortTermInvestments)
  const ebit                   = n(d.ebit)
  const netProfit              = n(d.netProfit)
  const interestExpense        = n(d.interestExpense)
  const tangibleAssets         = n(d.tangibleAssets)
  const tradeReceivables       = n(d.tradeReceivables)
  const tradePayables          = n(d.tradePayables)
  const purchases              = n(d.purchases)
  const operatingExpenses      = n(d.operatingExpenses)
  const longTermFinancialDebt  = n(d.longTermFinancialDebt)
  const cogs                   = n(d.cogs)

  // ─── Stok hesabı ─────────────────────────────────────────────
  // Tüm sektörler: 151+153+159 birlikte DIO hesabına girer.
  // (İnşaat dahil — verilen sipariş avansları/159 stokların parçasıdır.)
  // İnşaata özgü ek metrikler: customerAdvanceDays & adjustedCashConversionCycle
  const _inv = n(d.inventory)
  const _ps  = n(d.prepaidSuppliers)
  const inventory = (_inv != null || _ps != null) ? ((_inv ?? 0) + (_ps ?? 0)) : null

  // ─── LİKİDİTE ────────────────────────────────────────────────
  const currentRatio = safe(totalCurrentAssets, totalCurrentLiabilities)

  // Hızlı Oran: Dönen Varlıklar - Stok (merged ya da ham inventory)
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

  // ─── FAALİYET — Ortalama bakiye hesabı ───────────────────────
  const costBase = purchases ?? cogs

  const prevInventory         = n(d.prevInventory)
  const prevTradeReceivables  = n(d.prevTradeReceivables)
  const prevTradePayables     = n(d.prevTradePayables)
  const advancesReceived      = n(d.advancesReceived)
  const prevAdvancesReceived  = n(d.prevAdvancesReceived)

  const avgInventory =
    inventory != null && prevInventory != null
      ? (inventory + prevInventory) / 2
      : inventory

  const avgReceivables =
    tradeReceivables != null && prevTradeReceivables != null
      ? (tradeReceivables + prevTradeReceivables) / 2
      : tradeReceivables

  const avgPayables =
    tradePayables != null && prevTradePayables != null
      ? (tradePayables + prevTradePayables) / 2
      : tradePayables

  // Alınan avanslar ortalaması (340)
  const avgAdvancesReceived =
    advancesReceived != null && prevAdvancesReceived != null
      ? (advancesReceived + prevAdvancesReceived) / 2
      : advancesReceived

  // ─── DIO / DSO / DPO ─────────────────────────────────────────
  // İnşaat metodolojisi:
  //   DIO: Ortalama Stok (151+153) / (Ortalama SMM / 365)
  //   DSO: Ortalama Alacak (120+121) / (Net Satışlar / 365)
  //   DPO: Ortalama Borç (320+321+329≈tradePayables) / (Ortalama SMM / 365)
  // Diğer sektörler: aynı formüller, inventory+prepaidSuppliers dahil

  const dso = revenue != null && avgReceivables != null
    ? (avgReceivables / revenue) * 365
    : null

  const dpo = costBase != null && avgPayables != null
    ? (avgPayables / costBase) * 365
    : null

  const dio = avgInventory != null && costBase != null
    ? (avgInventory / costBase) * 365
    : null

  const cashConversionCycle =
    dio != null && dso != null && dpo != null ? dio + dso - dpo : null

  // ─── İnşaat — Alınan Avans Süresi & Düzeltilmiş NDS ─────────
  // Alınan Avans Süresi = Ortalama 340 / (Net Satışlar / 365)
  const customerAdvanceDays =
    isConstruction && avgAdvancesReceived != null && revenue != null && revenue > 0
      ? (avgAdvancesReceived / revenue) * 365
      : null

  // Düzeltilmiş NDS = Standart NDS - Alınan Avans Süresi
  const adjustedCashConversionCycle =
    cashConversionCycle != null && customerAdvanceDays != null
      ? cashConversionCycle - customerAdvanceDays
      : null

  // ─── KARLILIK ─────────────────────────────────────────────────
  const grossMargin      = safe(grossProfit, revenue)
  const ebitdaMargin     = safe(ebitda, revenue)
  const ebitMargin       = safe(ebit, revenue)
  const netProfitMargin  = safe(netProfit, revenue)
  const roa              = safe(netProfit, totalAssets)
  const roe              = totalEquity == null || totalEquity === 0
    ? null
    : totalEquity > 0
      ? safe(netProfit, totalEquity)
      : netProfit == null
        ? null
        : netProfit > 0 ? -1 : null   // özkaynak < 0 && kar > 0 → teknik iflas; zarar → null

  // Standart ROIC = NOPAT / (Özkaynak + Net Finansal Borç)
  // netFinancialDebt yukarıda hesaplandı: totalFinancialDebt − nakit − kısa vadeli yatırımlar
  const investedCapital2 = (totalEquity ?? 0) + netFinancialDebt
  const nopat  = ebit != null ? ebit * (1 - CORPORATE_TAX_RATE) : null
  const roic   = nopat != null && investedCapital2 !== 0 ? nopat / investedCapital2 : null

  const prevRevenue = n(d.prevRevenue)
  const revenueGrowth =
    prevRevenue != null && prevRevenue !== 0 && revenue != null
      ? (revenue - prevRevenue) / prevRevenue : null

  const ppiRate   = n(d.ppiRate)
  const realGrowth =
    revenueGrowth != null && ppiRate != null
      ? (1 + revenueGrowth) / (1 + ppiRate) - 1 : null

  // ─── KALDIRAC ─────────────────────────────────────────────────
  const debtToEquity   = safe(totalDebt, totalEquity)
  const debtToAssets   = safe(totalDebt, totalAssets)
  const debtToEbitda   = ebitda != null && ebitda !== 0 ? netFinancialDebt / ebitda : null
  const equityRatio    = safe(totalEquity, totalAssets)

  const interestExpenseVal = n(d.interestExpense)
  const interestCoverage: number | null =
    interestExpenseVal == null ? null
    : interestExpenseVal === 0
      ? (ebit == null || ebit < 0 ? null : 9999)   // EBIT negatif + faiz sıfır → null
      : ebit != null ? ebit / interestExpenseVal
      : null

  const shortTermDebtRatio =
    totalFinancialDebt > 0 && d.shortTermFinancialDebt != null
      ? (n(d.shortTermFinancialDebt)! / totalFinancialDebt) : null

  // ─── FAALİYET ─────────────────────────────────────────────────
  const assetTurnover          = safe(revenue, totalAssets)
  const inventoryTurnoverDays  = dio
  const receivablesTurnoverDays= dso
  const payablesTurnoverDays   = dpo
  const fixedAssetTurnover     = safe(revenue, tangibleAssets)
  const operatingExpenseRatio  = safe(operatingExpenses, revenue)

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

    customerAdvanceDays,
    adjustedCashConversionCycle,
  }
}
