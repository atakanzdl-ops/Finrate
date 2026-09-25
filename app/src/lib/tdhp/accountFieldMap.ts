// 3 haneli TDHP hesabı → FinancialData toplu alanı (+ işaret).
// Elle hesap düzenlemesinde SADECE bu alan ve onun üst toplamları fark kadar
// güncellenir; parser'ın türettiği diğer alanlara dokunulmaz.
// Kontra hesaplar (257, 129, 501…) sign = -1.

export interface AccountFieldTarget { field: string; sign: 1 | -1 }

const P = (field: string): AccountFieldTarget => ({ field, sign: 1 })
const N = (field: string): AccountFieldTarget => ({ field, sign: -1 })

export const ACCOUNT_FIELD: Record<string, AccountFieldTarget> = {
  // 10 Hazır Değerler
  '100': P('cash'), '101': P('cash'), '102': P('cash'), '103': N('cash'), '108': P('cash'),
  // 11 Menkul Kıymetler
  '110': P('shortTermInvestments'), '111': P('shortTermInvestments'), '112': P('shortTermInvestments'),
  '118': P('shortTermInvestments'), '119': N('shortTermInvestments'),
  // 12 Ticari Alacaklar
  '120': P('tradeReceivables'), '121': P('tradeReceivables'), '122': N('tradeReceivables'), '124': N('tradeReceivables'),
  '126': P('tradeReceivables'), '127': P('tradeReceivables'), '128': P('tradeReceivables'), '129': N('tradeReceivables'),
  // 13 Diğer Alacaklar
  '131': P('otherReceivables'), '132': P('otherReceivables'), '133': P('otherReceivables'), '135': P('otherReceivables'),
  '136': P('otherReceivables'), '137': N('otherReceivables'), '138': P('otherReceivables'), '139': N('otherReceivables'),
  // 15 Stoklar (159 ayrı alan: prepaidSuppliers)
  '150': P('inventory'), '151': P('inventory'), '152': P('inventory'), '153': P('inventory'), '157': P('inventory'),
  '158': N('inventory'), '159': P('prepaidSuppliers'),
  // 17 YİYY Maliyetleri
  '170': P('constructionCosts'), '178': P('constructionCosts'), '179': P('constructionCosts'),
  // 18
  '180': P('prepaidExpenses'), '181': P('prepaidExpenses'),
  // 19
  '190': P('otherCurrentAssets'), '191': P('otherCurrentAssets'), '192': P('otherCurrentAssets'), '193': P('otherCurrentAssets'),
  '195': P('otherCurrentAssets'), '196': P('otherCurrentAssets'), '197': P('otherCurrentAssets'), '198': P('otherCurrentAssets'),
  '199': N('otherCurrentAssets'),
  // 22 UV Ticari Alacaklar
  '220': P('longTermTradeReceivables'), '221': P('longTermTradeReceivables'), '222': N('longTermTradeReceivables'),
  '224': N('longTermTradeReceivables'), '226': P('longTermTradeReceivables'), '229': N('longTermTradeReceivables'),
  // 23 UV Diğer Alacaklar
  '231': P('longTermOtherReceivables'), '232': P('longTermOtherReceivables'), '233': P('longTermOtherReceivables'),
  '235': P('longTermOtherReceivables'), '236': P('longTermOtherReceivables'), '237': N('longTermOtherReceivables'),
  '239': N('longTermOtherReceivables'),
  // 24 Mali Duran Varlıklar
  '240': P('longTermInvestments'), '241': N('longTermInvestments'), '242': P('longTermInvestments'), '243': N('longTermInvestments'),
  '244': N('longTermInvestments'), '245': P('longTermInvestments'), '246': N('longTermInvestments'), '247': N('longTermInvestments'),
  '248': P('longTermInvestments'), '249': N('longTermInvestments'),
  // 25 MDV
  '250': P('tangibleAssets'), '251': P('tangibleAssets'), '252': P('tangibleAssets'), '253': P('tangibleAssets'),
  '254': P('tangibleAssets'), '255': P('tangibleAssets'), '256': P('tangibleAssets'), '257': N('tangibleAssets'),
  '258': P('tangibleAssets'), '259': P('tangibleAssets'),
  // 26 MODV
  '260': P('intangibleAssets'), '261': P('intangibleAssets'), '262': P('intangibleAssets'), '263': P('intangibleAssets'),
  '264': P('intangibleAssets'), '267': P('intangibleAssets'), '268': N('intangibleAssets'), '269': P('intangibleAssets'),
  // 27
  '271': P('depletableAssets'), '272': P('depletableAssets'), '277': P('depletableAssets'), '278': N('depletableAssets'),
  '279': P('depletableAssets'),
  // 28
  '280': P('longTermPrepaidExpenses'), '281': P('longTermPrepaidExpenses'),
  // 29
  '291': P('otherNonCurrentAssets'), '292': P('otherNonCurrentAssets'), '293': P('otherNonCurrentAssets'),
  '294': P('otherNonCurrentAssets'), '295': P('otherNonCurrentAssets'), '297': P('otherNonCurrentAssets'),
  '298': N('otherNonCurrentAssets'), '299': N('otherNonCurrentAssets'),
  // 30 KV Mali Borçlar
  '300': P('shortTermFinancialDebt'), '301': P('shortTermFinancialDebt'), '302': N('shortTermFinancialDebt'),
  '303': P('shortTermFinancialDebt'), '304': P('shortTermFinancialDebt'), '305': P('shortTermFinancialDebt'),
  '306': P('shortTermFinancialDebt'), '308': N('shortTermFinancialDebt'), '309': P('shortTermFinancialDebt'),
  // 32
  '320': P('tradePayables'), '321': P('tradePayables'), '322': N('tradePayables'), '326': P('tradePayables'), '329': P('tradePayables'),
  // 33
  '331': P('otherShortTermPayables'), '332': P('otherShortTermPayables'), '333': P('otherShortTermPayables'),
  '335': P('otherShortTermPayables'), '336': P('otherShortTermPayables'), '337': N('otherShortTermPayables'),
  // 34
  '340': P('advancesReceived'), '349': P('advancesReceived'),
  // 35
  '350': P('constructionProgress'), '358': P('constructionProgress'),
  // 36
  '360': P('taxPayables'), '361': P('taxPayables'), '368': P('taxPayables'), '369': P('taxPayables'),
  // 37
  '370': P('shortTermProvisions'), '371': N('shortTermProvisions'), '372': P('shortTermProvisions'),
  '373': P('shortTermProvisions'), '379': P('shortTermProvisions'),
  // 38
  '380': P('deferredRevenue'), '381': P('deferredRevenue'),
  // 39
  '391': P('otherCurrentLiabilities'), '392': P('otherCurrentLiabilities'), '393': P('otherCurrentLiabilities'),
  '397': P('otherCurrentLiabilities'), '399': P('otherCurrentLiabilities'),
  // 40 UV Mali Borçlar
  '400': P('longTermFinancialDebt'), '401': P('longTermFinancialDebt'), '402': N('longTermFinancialDebt'),
  '405': P('longTermFinancialDebt'), '407': P('longTermFinancialDebt'), '408': N('longTermFinancialDebt'),
  '409': P('longTermFinancialDebt'),
  // 42
  '420': P('longTermTradePayables'), '421': P('longTermTradePayables'), '422': N('longTermTradePayables'),
  '426': P('longTermTradePayables'), '429': P('longTermTradePayables'),
  // 43
  '431': P('longTermOtherPayables'), '432': P('longTermOtherPayables'), '433': P('longTermOtherPayables'),
  '436': P('longTermOtherPayables'), '437': N('longTermOtherPayables'), '438': P('longTermOtherPayables'),
  // 44
  '440': P('longTermAdvancesReceived'), '449': P('longTermAdvancesReceived'),
  // 47
  '472': P('longTermProvisions'), '479': P('longTermProvisions'),
  // 48 / 49
  '480': P('otherNonCurrentLiabilities'), '481': P('otherNonCurrentLiabilities'),
  '492': P('otherNonCurrentLiabilities'), '493': P('otherNonCurrentLiabilities'), '499': P('otherNonCurrentLiabilities'),
  // 50
  '500': P('paidInCapital'), '501': N('paidInCapital'), '502': P('paidInCapital'), '503': N('paidInCapital'),
  // 52
  '520': P('capitalReserves'), '521': P('capitalReserves'), '522': P('capitalReserves'), '523': P('capitalReserves'),
  '524': P('capitalReserves'), '529': P('capitalReserves'),
  // 54
  '540': P('profitReserves'), '541': P('profitReserves'), '542': P('profitReserves'), '548': P('profitReserves'), '549': P('profitReserves'),
  // 57 / 58 / 59  (retainedLosses pozitif tutulur, toplamda düşülür)
  '570': P('retainedEarnings'), '580': P('retainedLosses'),
  '590': P('netProfitCurrentYear'), '591': N('netProfitCurrentYear'),
  // 60 / 61 (salesDiscounts pozitif tutulur, net satışta düşülür)
  '600': P('grossSales'), '601': P('grossSales'), '602': P('grossSales'),
  '610': P('salesDiscounts'), '611': P('salesDiscounts'), '612': P('salesDiscounts'),
  // 62 / 63 (giderler pozitif tutulur)
  '620': P('cogs'), '621': P('cogs'), '622': P('cogs'), '623': P('cogs'),
  '630': P('operatingExpenses'), '631': P('operatingExpenses'), '632': P('operatingExpenses'),
  // 64 / 65 / 66
  '640': P('otherIncome'), '641': P('otherIncome'), '642': P('otherIncome'), '643': P('otherIncome'), '644': P('otherIncome'),
  '645': P('otherIncome'), '646': P('otherIncome'), '647': P('otherIncome'), '648': P('otherIncome'), '649': P('otherIncome'),
  '653': P('otherExpense'), '654': P('otherExpense'), '655': P('otherExpense'), '656': P('otherExpense'),
  '657': P('otherExpense'), '658': P('otherExpense'), '659': P('otherExpense'),
  '660': P('interestExpense'), '661': P('interestExpense'),
  // 67 / 68
  '671': P('extraordinaryIncome'), '679': P('extraordinaryIncome'),
  '680': P('extraordinaryExpense'), '681': P('extraordinaryExpense'), '689': P('extraordinaryExpense'),
  // 69
  '691': P('taxExpense'),
  // 690 / 692 türetilmiş (dönem karı / net kar) — doğrudan alan yok, tabloda hesaplanır
}

// Bir alan değişince fark kadar güncellenecek üst toplamlar (yalnızca DB'de dolu olanlar).
// Her giriş: [alan, işaret] — retainedLosses ve salesDiscounts gibi "pozitif tutulan eksi kalemler" -1.
const CURRENT_ASSET_FIELDS = ['cash', 'shortTermInvestments', 'tradeReceivables', 'otherReceivables', 'inventory',
  'constructionCosts', 'prepaidExpenses', 'prepaidSuppliers', 'otherCurrentAssets']
const NON_CURRENT_ASSET_FIELDS = ['longTermTradeReceivables', 'longTermOtherReceivables', 'longTermInvestments',
  'tangibleAssets', 'intangibleAssets', 'depletableAssets', 'longTermPrepaidExpenses', 'otherNonCurrentAssets']
const CURRENT_LIAB_FIELDS = ['shortTermFinancialDebt', 'tradePayables', 'otherShortTermPayables', 'advancesReceived',
  'constructionProgress', 'taxPayables', 'shortTermProvisions', 'deferredRevenue', 'otherCurrentLiabilities']
const NON_CURRENT_LIAB_FIELDS = ['longTermFinancialDebt', 'longTermTradePayables', 'longTermOtherPayables',
  'longTermAdvancesReceived', 'longTermProvisions', 'otherNonCurrentLiabilities']
const EQUITY_FIELDS: Array<[string, 1 | -1]> = [['paidInCapital', 1], ['capitalReserves', 1], ['profitReserves', 1],
  ['retainedEarnings', 1], ['retainedLosses', -1], ['netProfitCurrentYear', 1]]

export function parentTotals(field: string): Array<[string, 1 | -1]> {
  if (CURRENT_ASSET_FIELDS.includes(field))     return [['totalCurrentAssets', 1], ['totalAssets', 1]]
  if (NON_CURRENT_ASSET_FIELDS.includes(field)) return [['totalNonCurrentAssets', 1], ['totalAssets', 1]]
  if (CURRENT_LIAB_FIELDS.includes(field))      return [['totalCurrentLiabilities', 1], ['totalLiabilitiesAndEquity', 1]]
  if (NON_CURRENT_LIAB_FIELDS.includes(field))  return [['totalNonCurrentLiabilities', 1], ['totalLiabilitiesAndEquity', 1]]
  const eq = EQUITY_FIELDS.find(([f]) => f === field)
  if (eq) return [['totalEquity', eq[1]], ['totalLiabilitiesAndEquity', eq[1]]]
  // Gelir tablosu zinciri: değişen kalem hangi ara toplamları etkiler
  switch (field) {
    case 'grossSales':           return [['revenue', 1], ['grossProfit', 1], ['ebit', 1], ['ebt', 1], ['netProfit', 1]]
    case 'salesDiscounts':       return [['revenue', -1], ['grossProfit', -1], ['ebit', -1], ['ebt', -1], ['netProfit', -1]]
    case 'cogs':                 return [['grossProfit', -1], ['ebit', -1], ['ebt', -1], ['netProfit', -1]]
    case 'operatingExpenses':    return [['ebit', -1], ['ebt', -1], ['netProfit', -1]]
    case 'otherIncome':          return [['ebt', 1], ['netProfit', 1]]
    case 'otherExpense':         return [['ebt', -1], ['netProfit', -1]]
    case 'interestExpense':      return [['ebt', -1], ['netProfit', -1]]
    case 'extraordinaryIncome':  return [['ebt', 1], ['netProfit', 1]]
    case 'extraordinaryExpense': return [['ebt', -1], ['netProfit', -1]]
    case 'taxExpense':           return [['netProfit', -1]]
    default: return []
  }
}

/**
 * Hesap bakiyesi `delta` kadar değişti → ilgili alan ve DOLU olan üst toplamlar
 * aynı fark kadar güncellenir. Boş (null) toplamlar boş kalır (tabloda anlık hesaplanır).
 */
export function applyAccountDelta(
  fields: Record<string, number | null | undefined>,
  code: string,
  delta: number,
): Record<string, number> {
  const target = ACCOUNT_FIELD[code]
  if (!target || delta === 0) return {}
  const changed: Record<string, number> = {}
  const signed = delta * target.sign
  changed[target.field] = (fields[target.field] ?? 0) + signed
  for (const [total, sign] of parentTotals(target.field)) {
    const cur = fields[total]
    if (cur != null) changed[total] = cur + signed * sign
  }
  return changed
}
