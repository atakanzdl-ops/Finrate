/**
 * Finrate — FinancialData Aggregate → TDHP Hesap Kodu Eşleme
 *
 * mapFinancialDataToAccounts():
 *   Mevcut aggregate FinancialData alanlarını Türk Tek Düzen Hesap Planı
 *   hesap kodlarına dağıtır. Dağıtım oranları ortalama bilanço yapılarına
 *   göre belirlenmiştir.
 *
 * rebuildAggregateFromAccounts():
 *   FinancialAccount tablosundan aggregate FinancialData-benzeri nesneyi
 *   yeniden kurar. calculateRatios() backward compatibility için gerekli.
 */

import { Prisma } from '@prisma/client'

// ─── TİPLER ──────────────────────────────────────────────────────────────────

export interface AccountEntry {
  code:   string
  amount: number
}

// ─── AGGREGATE → HESAP KODU ──────────────────────────────────────────────────

/**
 * FinancialData aggregate alanlarını hesap kodlarına dağıtır.
 * Tam hesap kodu verisi mevcut değilse bu dağıtım kullanılır.
 */
export function mapFinancialDataToAccounts(fd: Record<string, unknown>): AccountEntry[] {
  const entries: AccountEntry[] = []
  const add = (code: string, amount: number | null | undefined) => {
    if (amount != null && amount !== 0) entries.push({ code, amount: Number(amount) })
  }

  // ── DÖNEN VARLIKLAR ────────────────────────────────────────────────────────

  // cash → 102 Bankalar (muhafazakâr varsayım)
  add('102', fd.cash as number)

  // tradeReceivables → 120 Alıcılar
  add('120', fd.tradeReceivables as number)

  // otherReceivables → 136 Diğer Çeşitli Alacaklar
  add('136', fd.otherReceivables as number)

  // inventory → 153 Ticari Mallar (tür bilinmiyorsa)
  add('153', fd.inventory as number)

  // prepaidSuppliers / advancesPaid → 159 Verilen Sipariş Avansları
  add('159', (fd.prepaidSuppliers ?? fd.advancesPaid) as number)

  // otherCurrentAssets → 190 Devreden KDV varsayımı
  add('190', fd.otherCurrentAssets as number)

  // ── DURAN VARLIKLAR ────────────────────────────────────────────────────────

  // tangibleAssets → 252 Binalar (en yaygın kalem)
  add('252', fd.tangibleAssets as number)

  // intangibleAssets → 260 Haklar
  add('260', fd.intangibleAssets as number)

  // otherNonCurrentAssets → 280 Gelecek Yıllara Ait Giderler
  add('280', fd.otherNonCurrentAssets as number)

  // ── KISA VADELİ YABANCI KAYNAKLAR ─────────────────────────────────────────

  // shortTermFinancialDebt → 300 Banka Kredileri
  add('300', (fd.shortTermFinancialDebt ?? fd.shortTermLoans) as number)

  // tradePayables → 320 Satıcılar
  add('320', fd.tradePayables as number)

  // otherShortTermPayables / otherCurrentLiabilities → 336 Diğer Çeşitli Borçlar
  add('336', (fd.otherShortTermPayables ?? fd.otherShortTermLiabilities) as number)

  // advancesReceived → 340 Alınan Sipariş Avansları
  add('340', fd.advancesReceived as number)

  // taxPayables → 360 Ödenecek Vergi ve Fonlar
  add('360', fd.taxPayables as number)

  // ── UZUN VADELİ YABANCI KAYNAKLAR ─────────────────────────────────────────

  // longTermFinancialDebt → 400 Banka Kredileri (UV)
  add('400', (fd.longTermFinancialDebt ?? fd.longTermLoans) as number)

  // otherNonCurrentLiabilities → 436 Diğer Çeşitli Borçlar (UV)
  add('436', (fd.otherNonCurrentLiabilities ?? fd.otherLongTermLiabilities) as number)

  // ── ÖZKAYNAKLAR ────────────────────────────────────────────────────────────

  // paidInCapital → 500 Sermaye
  add('500', fd.paidInCapital as number)

  // retainedEarnings / retainedLosses → 570 Geçmiş Yıl Kârları / 580 Zararları
  const retainedNet = ((fd.retainedEarnings as number) ?? 0) - ((fd.retainedLosses as number) ?? 0)
  if (retainedNet > 0) add('570', retainedNet)
  if (retainedNet < 0) add('580', Math.abs(retainedNet))

  // netProfit → 590 Dönem Net Kârı veya 591 Dönem Net Zararı
  const np = (fd.netProfitCurrentYear ?? fd.netProfit) as number | null
  if (np != null && np > 0) add('590', np)
  if (np != null && np < 0) add('591', Math.abs(np))

  // ── GELİR TABLOSU ─────────────────────────────────────────────────────────

  // revenue → 600 Yurtiçi Satışlar (yurt dışı bilinmiyorsa tamamı)
  add('600', fd.revenue as number)

  // costOfSales / cogs → 621 Satılan Ticari Mallar Maliyeti
  add('621', (fd.costOfSales ?? fd.cogs) as number)

  // operatingExpenses → 632 Genel Yönetim Giderleri
  add('632', fd.operatingExpenses as number)

  // interestExpense → 660 Kısa Vadeli Borçlanma Giderleri
  add('660', fd.interestExpense as number)

  return entries
}

// ─── HESAP KODU → AGGREGATE ──────────────────────────────────────────────────

/**
 * FinancialAccount tablosundan aggregate FinancialData-benzeri nesneyi yeniden kurar.
 * calculateRatios() mevcut aggregate alanları beklediği için backward compatibility.
 */
export function rebuildAggregateFromAccounts(
  accounts: { accountCode: string; amount: Prisma.Decimal | number }[],
): Record<string, number> {
  const get = (codes: string[]): number =>
    accounts
      .filter(a => codes.includes(a.accountCode))
      .reduce((sum, a) => sum + Number(a.amount), 0)

  // Alt bileşenler — tüm TDHP kodlarından hesaplanır
  const r = {
    // Hazır değerler (net)
    cash: get(['100', '101', '102', '108']) - get(['103']),

    // Ticari alacaklar (net)
    tradeReceivables:
      get(['120', '121', '126', '127', '128']) - get(['122', '129']),

    // Diğer alacaklar (net)
    otherReceivables:
      get(['131', '132', '133', '135', '136', '138']) - get(['137', '139']),

    // Stoklar (net)
    inventory:
      get(['150', '151', '152', '153', '157']) - get(['158']),

    // Verilen sipariş avansları
    prepaidSuppliers: get(['159']),

    // Diğer dönen varlıklar
    otherCurrentAssets:
      get(['180', '181', '190', '191', '193', '195', '196', '197', '198']),

    // Maddi duran varlıklar (net)
    tangibleAssets:
      get(['250', '251', '252', '253', '254', '255', '256', '258', '259']) - get(['257']),

    // Maddi olmayan duran varlıklar (net)
    intangibleAssets:
      get(['260', '261', '262', '263', '264', '267', '269']) - get(['268']),

    // Diğer duran varlıklar
    otherNonCurrentAssets:
      get(['220', '221', '226', '240', '242', '245', '280', '281', '294', '295']),

    // KV finansal borçlar (net)
    shortTermFinancialDebt:
      get(['300', '301', '303', '304', '305', '306', '309']) - get(['302', '308']),

    // Ticari borçlar (net)
    tradePayables:
      get(['320', '321', '326', '329']) - get(['322']),

    // Diğer KV borçlar
    otherShortTermPayables:
      get(['331', '332', '333', '335', '336', '380', '381', '391', '392', '393', '397', '399'])
      - get(['337']),

    // Alınan avanslar
    advancesReceived: get(['340', '349']),

    // Vergi yükümlülükleri
    taxPayables:
      get(['360', '361', '368', '369', '370', '372', '373', '379']) - get(['371']),

    // UV finansal borçlar (net)
    longTermFinancialDebt:
      get(['400', '401', '405', '407', '409']) - get(['402', '408']),

    // Diğer UV borçlar
    otherNonCurrentLiabilities:
      get(['420', '421', '426', '429', '431', '432', '433', '436', '472', '479', '480', '481', '492'])
      - get(['422', '437']),

    // Özkaynak bileşenleri
    paidInCapital:      get(['500', '502']) - get(['501', '503']),
    capitalReserves:    get(['520', '521', '522', '523', '524', '529']),
    profitReserves:     get(['540', '541', '542', '548', '549']),
    retainedEarnings:   get(['570']),
    retainedLosses:     get(['580']),
    netProfitCurrentYear: get(['590']) - get(['591']),

    // Gelir tablosu
    revenue:            get(['600', '601', '602']) - get(['610', '611', '612']),
    costOfSales:        get(['620', '621', '622', '623']),
    operatingExpenses:  get(['630', '631', '632']),
    interestExpense:    get(['660', '661']),
  }

  // ── calculateRatios için gerekli toplam alanlar ───────────────────────────────
  // calculateRatios(d: FinancialInput) d.totalCurrentAssets, d.totalAssets gibi
  // aggregate alanları doğrudan okur — alt bileşenlerden fallback hesaplama yapmaz.
  // rebuildAggregateFromAccounts yalnızca alt bileşenleri döndürdüğü için tüm
  // likidite ve kaldıraç rasyoları null çıkıyordu; skor sabit 50 kalıyordu.

  const tca  = r.cash + r.tradeReceivables + r.otherReceivables
             + r.inventory + r.prepaidSuppliers + r.otherCurrentAssets
  const tnca = r.tangibleAssets + r.intangibleAssets + r.otherNonCurrentAssets
  const tcl  = r.shortTermFinancialDebt + r.tradePayables + r.otherShortTermPayables
             + r.advancesReceived + r.taxPayables
  const tncl = r.longTermFinancialDebt + r.otherNonCurrentLiabilities
  const teq  = r.paidInCapital + r.capitalReserves + r.profitReserves
             + r.retainedEarnings - r.retainedLosses + r.netProfitCurrentYear

  return {
    ...r,
    // Aggregate toplamlar
    totalCurrentAssets:         tca,
    totalNonCurrentAssets:      tnca,
    totalAssets:                tca + tnca,
    totalCurrentLiabilities:    tcl,
    totalNonCurrentLiabilities: tncl,
    totalEquity:                teq,
    // calculateRatios farklı alan adları bekliyor
    netProfit:                  r.netProfitCurrentYear,
    cogs:                       r.costOfSales,
  }
}

// ─── BİLANÇO DENGE KONTROLÜ ──────────────────────────────────────────────────

/**
 * Bilanço denkliği kontrolü — Aktif = Pasif + Özkaynak
 */
export function checkBalance(
  accounts: { accountCode: string; amount: Prisma.Decimal | number }[],
): {
  totalAssets:              number
  totalLiabilitiesAndEquity: number
  difference:               number
  balanced:                 boolean
} {
  const r = rebuildAggregateFromAccounts(accounts)

  const totalAssets =
    r.cash + r.tradeReceivables + r.otherReceivables +
    r.inventory + r.prepaidSuppliers + r.otherCurrentAssets +
    r.tangibleAssets + r.intangibleAssets + r.otherNonCurrentAssets

  const totalLiabilities =
    r.shortTermFinancialDebt + r.tradePayables + r.otherShortTermPayables +
    r.advancesReceived + r.taxPayables +
    r.longTermFinancialDebt + r.otherNonCurrentLiabilities

  const totalEquity =
    r.paidInCapital + r.capitalReserves + r.profitReserves +
    r.retainedEarnings - r.retainedLosses + r.netProfitCurrentYear

  const totalLiabilitiesAndEquity = totalLiabilities + totalEquity

  return {
    totalAssets,
    totalLiabilitiesAndEquity,
    difference:  totalAssets - totalLiabilitiesAndEquity,
    balanced:    Math.abs(totalAssets - totalLiabilitiesAndEquity) < 1,   // 1 TL tolerans
  }
}
