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

  const dso = revenue != null && revenue > 0 && avgReceivables != null
    ? (avgReceivables / revenue) * 365
    : null

  const dpo = costBase != null && costBase > 0 && avgPayables != null
    ? (avgPayables / costBase) * 365
    : null

  const dio = avgInventory != null && costBase != null && costBase > 0
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

// ─── HESAP KODU BAZLI FONKSIYONLAR ───────────────────────────────────────────

import { rebuildAggregateFromAccounts } from './accountMapper'
import { Prisma } from '@prisma/client'

/**
 * FinancialAccount[] tablosundan rasyoları hesaplar.
 * Hesap kodu bazlı yeni motor — accountMapper ile aggregate'e çevirip mevcut calculateRatios'a verir.
 * İleride tamamen hesap kodu bazlı hesaplama yapılacaksa bu fonksiyon direkt implemente edilebilir.
 */
export function calculateRatiosFromAccounts(
  accounts:          { accountCode: string; amount: Prisma.Decimal | number }[],
  previousAccounts?: { accountCode: string; amount: Prisma.Decimal | number }[],
): RatioResult {
  const aggregate = rebuildAggregateFromAccounts(accounts) as FinancialInput

  // Önceki dönem verisi varsa prevRevenue / prevInventory vb. alanlarını doldur
  if (previousAccounts) {
    const prev = rebuildAggregateFromAccounts(previousAccounts)
    aggregate.prevRevenue          = prev.revenue          ?? undefined
    aggregate.prevInventory        = prev.inventory        ?? undefined
    aggregate.prevTradeReceivables = prev.tradeReceivables ?? undefined
    aggregate.prevTradePayables    = prev.tradePayables    ?? undefined
  }

  return calculateRatios(aggregate)
}

/**
 * Hesap kodu bazlı bilanço ve gelir tablosu toplamları.
 * Doğrudan hesap kodu aralıklarından hesaplanır — aggregate'e bağımlı değil.
 */
export function getAccountTotals(
  accounts: { accountCode: string; amount: Prisma.Decimal | number }[],
): {
  currentAssets:        number
  nonCurrentAssets:     number
  totalAssets:          number
  currentLiabilities:   number
  nonCurrentLiabilities: number
  totalLiabilities:     number
  totalEquity:          number
  revenue:              number
  costOfSales:          number
  grossProfit:          number
  operatingExpenses:    number
  operatingProfit:      number
  interestExpense:      number
  netProfit:            number
} {
  const sum = (codes: string[]): number =>
    accounts
      .filter(a => codes.includes(a.accountCode))
      .reduce((s, a) => s + Number(a.amount), 0)

  // Dönen varlıklar (10–19 aralığı, karşılık ve (-) kalemler düşülür)
  const currentAssets =
    sum(['100', '101', '102', '108'])   - sum(['103']) +
    sum(['110', '111', '112', '118'])   - sum(['119']) +
    sum(['120', '121', '126', '127', '128']) - sum(['122', '129']) +
    sum(['131', '132', '133', '135', '136', '138']) - sum(['137', '139']) +
    sum(['150', '151', '152', '153', '157', '159']) - sum(['158']) +
    sum(['170', '178']) +
    sum(['180', '181', '190', '191', '193', '195', '196', '197', '198'])

  // Duran varlıklar (20–29 aralığı)
  const nonCurrentAssets =
    sum(['220', '221', '226']) +
    sum(['240', '242', '245']) +
    sum(['250', '251', '252', '253', '254', '255', '256', '258', '259']) - sum(['257']) +
    sum(['260', '261', '262', '263', '264', '267', '269']) - sum(['268']) +
    sum(['280', '281']) +
    sum(['294', '295'])

  const totalAssets = currentAssets + nonCurrentAssets

  // KV yabancı kaynaklar (30–39)
  const currentLiabilities =
    sum(['300', '301', '303', '304', '305', '306', '309']) - sum(['302', '308']) +
    sum(['320', '321', '326', '329'])   - sum(['322']) +
    sum(['331', '332', '333', '335', '336']) - sum(['337']) +
    sum(['340', '349']) +
    sum(['350', '358']) +
    sum(['360', '361', '368', '369']) +
    sum(['370', '372', '373', '379'])   - sum(['371']) +
    sum(['380', '381']) +
    sum(['391', '392', '393', '397', '399'])

  // UV yabancı kaynaklar (40–49)
  const nonCurrentLiabilities =
    sum(['400', '401', '405', '407', '409']) - sum(['402', '408']) +
    sum(['420', '421', '426', '429'])   - sum(['422']) +
    sum(['431', '432', '433', '436'])   - sum(['437']) +
    sum(['440', '449']) +
    sum(['472', '479']) +
    sum(['480', '481']) +
    sum(['492'])

  const totalLiabilities = currentLiabilities + nonCurrentLiabilities

  // Özkaynaklar (50–59)
  const totalEquity =
    sum(['500', '502']) - sum(['501', '503']) +
    sum(['520', '521', '522', '523', '524', '529']) +
    sum(['540', '541', '542', '548', '549']) +
    sum(['570']) - sum(['580']) +
    sum(['590']) - sum(['591'])

  // Gelir tablosu (60–69)
  const revenue          = sum(['600', '601', '602']) - sum(['610', '611', '612'])
  const costOfSales      = sum(['620', '621', '622', '623'])
  const grossProfit      = revenue - costOfSales
  const operatingExpenses = sum(['630', '631', '632'])

  const otherOperatingIncome  = sum(['640', '641', '642', '643', '644', '645', '646', '647', '648', '649'])
  const otherOperatingExpense = sum(['653', '654', '655', '656', '657', '658', '659'])
  const operatingProfit = grossProfit - operatingExpenses + otherOperatingIncome - otherOperatingExpense

  const interestExpense   = sum(['660', '661'])
  const extraordinaryIncome  = sum(['671', '679'])
  const extraordinaryExpense = sum(['680', '681', '689'])
  const taxExpense        = sum(['691'])
  const netProfit         = operatingProfit - interestExpense + extraordinaryIncome - extraordinaryExpense - taxExpense

  return {
    currentAssets,
    nonCurrentAssets,
    totalAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilities,
    totalEquity,
    revenue,
    costOfSales,
    grossProfit,
    operatingExpenses,
    operatingProfit,
    interestExpense,
    netProfit,
  }
}
