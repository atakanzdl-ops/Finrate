/**
 * Excel / CSV parser — mizan, dikey ve yatay format destekler.
 * Türkçe karakter sorununu önlemek için tüm karşılaştırmalar norm() ile yapılır.
 */

import * as XLSX from 'xlsx'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface ParseMeta {
  path: 'mizan' | 'vertical' | 'horizontal'
  totalRows: number
  matchedRows: number
  ignoredRows: number
  zeroBalanceRows: number
  unmappedRows: number
  reverseBalanceWarnings: string[]
  parseWarnings: string[]
  confidence: number
  sources?: Record<string, string[]>
  mizanTypeUsed?: string
}

export interface ParsedRow {
  year?: number | null
  period?: string
  fields: Record<string, number | null>
  unmapped: string[]
  meta?: ParseMeta
  docType?: string
  beyanType?: string
  rawAccounts?: Array<{ code: string; amount: number }>
  reversals?: import('@/lib/scoring/reversalMap').ReversalEntry[]
}

// ─── norm: Türkçe → ASCII, küçük harf ────────────────────────────────────────

function norm(s: unknown): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
}

// ─── Sayı çözümleme ───────────────────────────────────────────────────────────

export function parseExcelNumber(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  const s = String(raw).trim()
  if (!s) return null
  const upper = s.toUpperCase()
  if (['#SAYI0!', '#DIV/0!', '#NUM!', '#DEGER!', '#VALUE!'].includes(upper)) return null

  const negParen = /^\(.*\)$/.test(s)
  let c = s.replace(/^\((.*)\)$/, '$1').replace(/[^\d,.\-]/g, '')

  const commas = (c.match(/,/g) ?? []).length
  const dots   = (c.match(/\./g) ?? []).length
  const lastComma = c.lastIndexOf(',')
  const lastDot   = c.lastIndexOf('.')

  if (commas > 0 && dots > 0) {
    c = lastComma > lastDot
      ? c.replace(/\./g, '').replace(/,/g, '.')
      : c.replace(/,/g, '')
  } else if (commas > 0) {
    if (commas > 1) c = c.replace(/,/g, '')
    else {
      const fl = c.length - lastComma - 1
      c = fl === 3 ? c.replace(/,/g, '') : c.replace(',', '.')
    }
  } else if (dots > 1) {
    const parts = c.split('.')
    if (parts.slice(1).every(p => p.length === 3)) c = parts.join('')
  } else if (dots === 1) {
    const fl = c.length - lastDot - 1
    if (fl === 3) c = c.replace('.', '')
  }

  if (negParen) c = `-${c}`
  const n = parseFloat(c)
  return isNaN(n) ? null : n
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function calcConfidence(meta: Omit<ParseMeta, 'confidence'>): number {
  const d = Math.max(meta.totalRows, 1)
  const p =
    meta.ignoredRows * 0.2 +
    meta.unmappedRows * 0.3 +
    meta.zeroBalanceRows * 0.1 +
    meta.reverseBalanceWarnings.length * 0.15 +
    meta.parseWarnings.length * 0.15
  return Math.max(0, Math.min(1, Number((1 - p / d).toFixed(2))))
}

// ─── Yatay format sütun haritası (norm edilmiş anahtarlar) ───────────────────

const COLUMN_MAP: Record<string, string> = {
  'net satislar': 'revenue', 'ciro': 'revenue', 'revenue': 'revenue', 'net sales': 'revenue',
  'smm': 'cogs', 'satislarin maliyeti': 'cogs', 'cogs': 'cogs',
  'brut kar': 'grossProfit', 'gross profit': 'grossProfit',
  'faaliyet giderleri': 'operatingExpenses', 'opex': 'operatingExpenses', 'operating expenses': 'operatingExpenses',
  'fvok': 'ebit', 'ebit': 'ebit', 'faaliyet kari': 'ebit',
  'amortisman': 'depreciation', 'depreciation': 'depreciation', 'amortization': 'depreciation',
  'favok': 'ebitda', 'ebitda': 'ebitda',
  'finansman gideri': 'interestExpense', 'faiz gideri': 'interestExpense', 'interest expense': 'interestExpense',
  'diger gelirler': 'otherIncome', 'other income': 'otherIncome',
  'diger giderler': 'otherExpense', 'other expense': 'otherExpense',
  'vergi oncesi kar': 'ebt', 'ebt': 'ebt',
  'vergi gideri': 'taxExpense', 'tax expense': 'taxExpense',
  'net kar': 'netProfit', 'net profit': 'netProfit', 'net income': 'netProfit',
  'nakit': 'cash', 'cash': 'cash', 'nakit ve nakit benzerleri': 'cash',
  'kv yatirimlar': 'shortTermInvestments', 'short term investments': 'shortTermInvestments',
  'ticari alacaklar': 'tradeReceivables', 'trade receivables': 'tradeReceivables', 'alacaklar': 'tradeReceivables',
  'stoklar': 'inventory', 'inventory': 'inventory',
  'diger donen varliklar': 'otherCurrentAssets',
  'donen varliklar': 'totalCurrentAssets', 'total current assets': 'totalCurrentAssets',
  'maddi duran varliklar': 'tangibleAssets', 'mdv': 'tangibleAssets', 'tangible assets': 'tangibleAssets',
  'maddi olmayan duran varliklar': 'intangibleAssets', 'modv': 'intangibleAssets',
  'uv yatirimlar': 'longTermInvestments',
  'duran varliklar': 'totalNonCurrentAssets', 'total non current assets': 'totalNonCurrentAssets',
  'toplam aktif': 'totalAssets', 'total assets': 'totalAssets',
  'kv finansal borclar': 'shortTermFinancialDebt', 'kv borclar': 'shortTermFinancialDebt', 'short term debt': 'shortTermFinancialDebt',
  'ticari borclar': 'tradePayables', 'trade payables': 'tradePayables', 'borclar': 'tradePayables',
  'diger kv borclar': 'otherCurrentLiabilities',
  'kv borclar toplami': 'totalCurrentLiabilities', 'total current liabilities': 'totalCurrentLiabilities',
  'uv finansal borclar': 'longTermFinancialDebt', 'long term debt': 'longTermFinancialDebt', 'uv borclar': 'longTermFinancialDebt',
  'diger uv borclar': 'otherNonCurrentLiabilities',
  'uv borclar toplami': 'totalNonCurrentLiabilities', 'total non current liabilities': 'totalNonCurrentLiabilities',
  'odenmis sermaye': 'paidInCapital', 'paid in capital': 'paidInCapital',
  'gecmis yil karlari': 'retainedEarnings', 'retained earnings': 'retainedEarnings',
  'donem net kari': 'netProfitCurrentYear',
  'toplam oz kaynak': 'totalEquity', 'total equity': 'totalEquity', 'oz kaynak': 'totalEquity',
  'pasif toplami': 'totalLiabilitiesAndEquity', 'total liabilities and equity': 'totalLiabilitiesAndEquity',
  'satin alimlar': 'purchases', 'purchases': 'purchases',
}

// ─── Dikey format ─────────────────────────────────────────────────────────────

function parseYearHeaderCell(raw: unknown): { year: number; period: string } | null {
  if (raw == null) return null
  const s = String(raw).trim().toUpperCase()
  if (!s) return null
  const m = s.match(/^(20[12]\d)(?:\s*[-./]?\s*(?:Q)?([1-4]))?$/)
  if (!m) return null
  const year = parseInt(m[1], 10)
  const q = m[2] ? parseInt(m[2], 10) : null
  return { year, period: q ? `Q${q}` : 'ANNUAL' }
}

function isCodeHeaderCell(raw: unknown): boolean {
  const n = norm(raw)
  return n.includes('hesap kod') || n === 'kod' || n.includes('hesap kodu')
}

function findVerticalYearHeader(
  rows: unknown[][]
): { headerIdx: number; yearCols: { colIdx: number; year: number; period: string }[] } | null {
  const scan = Math.min(15, rows.length)
  for (let i = 0; i < scan; i++) {
    const row = rows[i] as (string | number | null)[]
    const yearCols: { colIdx: number; year: number; period: string }[] = []
    const hasCodeCol = row.some((c) => isCodeHeaderCell(c))
    for (let j = 0; j < row.length; j++) {
      const parsed = parseYearHeaderCell(row[j])
      if (parsed) yearCols.push({ colIdx: j, year: parsed.year, period: parsed.period })
    }
    if (yearCols.length >= 2 || (hasCodeCol && yearCols.length >= 1)) {
      return { headerIdx: i, yearCols }
    }
  }
  return null
}

function detectVerticalFormat(rows: unknown[][]): boolean {
  if (rows.length < 3) return false
  return findVerticalYearHeader(rows) != null
}

// Norm edilmiş arama kalıpları: [norm'd pattern, field, negate?]
const VROW: [string, string, boolean?][] = [
  ['net satislar', 'revenue'],
  ['brut satislar', 'revenue'],
  ['satis hasilati', 'revenue'],
  ['satislarin maliyeti', 'cogs', true],
  ['brut satis kari', 'grossProfit'],
  ['faaliyet giderleri', 'operatingExpenses', true],
  ['faaliyet kari', 'ebit'],
  ['fvok', 'ebit'],
  ['amortisman', 'depreciation'],
  ['favok', 'ebitda'],
  ['finansman gider', 'interestExpense', true],
  ['faiz gider', 'interestExpense', true],
  ['diger olagan gelir', 'otherIncome'],
  ['diger olagan gider', 'otherExpense', true],
  ['olagan kar', 'ebt'],
  ['vergi oncesi kar', 'ebt'],
  ['donem net kari', 'netProfit'],
  ['donem net zarari', 'netProfit', true],
  ['net kar', 'netProfit'],
  ['vergi gideri', 'taxExpense', true],
  ['hazir degerler', 'cash'],
  ['nakit ve nakit', 'cash'],
  ['ticari alacak', 'tradeReceivables'],
  ['stoklar', 'inventory'],
  ['donen varlik', 'totalCurrentAssets'],
  ['maddi duran varlik', 'tangibleAssets'],
  ['duran varlik', 'totalNonCurrentAssets'],
  ['toplam aktif', 'totalAssets'],
  ['aktif toplam', 'totalAssets'],
  ['mali borclar', 'shortTermFinancialDebt'],
  ['ticari borclar', 'tradePayables'],
  ['kisa vadeli', 'totalCurrentLiabilities'],
  ['uzun vadeli borclar', 'totalNonCurrentLiabilities'],
  ['odenmis sermaye', 'paidInCapital'],
  ['oz kaynak', 'totalEquity'],
  ['pasif toplam', 'totalLiabilitiesAndEquity'],
]

const CODED_STATEMENT_MAP: Record<string, { field: string; negate?: boolean }> = {
  // Balance sheet (10-59)
  '10': { field: 'cash' },
  '11': { field: 'shortTermInvestments' },
  '12': { field: 'tradeReceivables' },
  '13': { field: 'otherReceivables' },
  '15': { field: 'inventory' },
  '17': { field: 'constructionCosts' },
  '18': { field: 'prepaidExpenses' },
  '19': { field: 'otherCurrentAssets' },
  '22': { field: 'longTermTradeReceivables' },
  '23': { field: 'longTermOtherReceivables' },
  '24': { field: 'longTermInvestments' },
  '25': { field: 'tangibleAssets' },
  '26': { field: 'intangibleAssets' },
  '27': { field: 'depletableAssets' },
  '28': { field: 'longTermPrepaidExpenses' },
  '29': { field: 'otherNonCurrentAssets' },
  '30': { field: 'shortTermFinancialDebt' },
  '32': { field: 'tradePayables' },
  '33': { field: 'otherShortTermPayables' },
  '34': { field: 'advancesReceived' },
  '35': { field: 'constructionProgress' },
  '36': { field: 'taxPayables' },
  '37': { field: 'shortTermProvisions' },
  '38': { field: 'deferredRevenue' },
  '39': { field: 'otherCurrentLiabilities' },
  '40': { field: 'longTermFinancialDebt' },
  '42': { field: 'longTermTradePayables' },
  '43': { field: 'longTermOtherPayables' },
  '44': { field: 'longTermAdvancesReceived' },
  '47': { field: 'longTermProvisions' },
  '49': { field: 'otherNonCurrentLiabilities' },
  '50': { field: 'paidInCapital' },
  '52': { field: 'capitalReserves' },
  '54': { field: 'profitReserves' },
  '57': { field: 'retainedEarnings' },
  '58': { field: 'retainedLosses' },
  '59': { field: 'netProfitCurrentYear' },
  // Income statement (60-69)
  '60': { field: 'grossSales' },
  '61': { field: 'salesDiscounts' },
  '62': { field: 'cogs' },
  '63': { field: 'operatingExpenses' },
  '64': { field: 'otherIncome' },
  '65': { field: 'otherExpense' },
  '66': { field: 'interestExpense' },
  '67': { field: 'extraordinaryIncome' },
  '68': { field: 'extraordinaryExpense' },
  '69': { field: 'taxExpense' },
}

function matchVRow(label: string): { field: string; negate: boolean } | null {
  const n = norm(label)
  for (const [pat, field, negate] of VROW) {
    if (n.includes(pat)) return { field, negate: !!negate }
  }
  return null
}

function parseVerticalExcel(rows: unknown[][]): ParsedRow[] {
  const header = findVerticalYearHeader(rows)
  if (!header) return []
  const { headerIdx, yearCols } = header

  const resultMap: Record<string, ParsedRow> = {}
  for (const yc of yearCols) {
    resultMap[`${yc.year}_${yc.period}`] = { year: yc.year, period: yc.period, fields: {}, unmapped: [] }
  }

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[]
    const label = String(row[0] ?? row[1] ?? '').trim()
    if (!label || label.length < 2) continue

    const rawCode = String(row[0] ?? '').trim()
    const code = rawCode.replace(/\D/g, '')
    const codeMapped = CODED_STATEMENT_MAP[code]
    const labelMatch = matchVRow(label)
    const mappedField = codeMapped?.field ?? labelMatch?.field
    const negate = codeMapped?.negate ?? labelMatch?.negate ?? false
    if (!mappedField) continue

    for (const yc of yearCols) {
      const v = parseExcelNumber(row[yc.colIdx])
      if (v == null) continue
      const pr = resultMap[`${yc.year}_${yc.period}`]
      if (!(mappedField in pr.fields)) {
        // negate=true olan kalemler (cogs, operatingExpenses vb.) pozitif saklanmalı
        pr.fields[mappedField] = negate ? Math.abs(v) : v
      }
    }
  }

  return Object.values(resultMap).filter(pr => Object.keys(pr.fields).length > 0)
}

// ─── Mizan header tespiti ─────────────────────────────────────────────────────

function detectMizanFormat(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const row = rows[i] as unknown[]
    if (row.some(c => isCodeHeaderCell(c))) return true
  }
  return false
}

function findMizanHeader(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(12, rows.length); i++) {
    const row = rows[i] as (unknown)[]
    if (!row.some(c => isCodeHeaderCell(c))) continue

    const cols: Record<string, number> = {}
    row.forEach((cell, idx) => {
      const n = norm(cell)
      if (isCodeHeaderCell(cell)) { cols['code'] = idx; return }
      // bakBorc: hücre hem "bak" hem "bor" içeriyorsa
      if (n.includes('bak') && n.includes('bor'))     { cols['bakBorc'] = idx;   return }
      if (n.includes('bak') && n.includes('alacak'))  { cols['bakAlacak'] = idx; return }
      // sadece bor veya alacak (bakiyesiz sütunlar)
      if (n.includes('bor') && cols['borc'] === undefined)         { cols['borc'] = idx }
      if (n.includes('alacak') && cols['alacak'] === undefined)    { cols['alacak'] = idx }
    })

    console.log('[HEADER] row', i, JSON.stringify(cols))
    if ('code' in cols && ('borc' in cols || 'bakBorc' in cols)) return { headerIdx: i, cols }
  }
  return null
}

function extractMizanYear(rows: unknown[][]): { year: number | null; period: string } {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    for (const cell of rows[i] as (unknown)[]) {
      if (!cell) continue
      const m = String(cell).match(
        /(\d{2})[.\/-](\d{2})[.\/-](20\d{2})(?:\s*[-–—]\s*|\s+)(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/
      )
      if (m) {
        const endMonth = parseInt(m[5])
        const endYear  = parseInt(m[6])
        const period   = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'ANNUAL'
        return { year: endYear, period }
      }
    }
  }
  return { year: null, period: 'ANNUAL' }
}

// ─── Mizan satır eşlemesi ─────────────────────────────────────────────────────

const MIZAN_IGNORE = new Set([
  '590','591','592','697',
  '710','711','720','721','730','731',
  '900','901',
])

// SPLIT: bakBorç → bb, bakAlacak → ba
const MIZAN_SPLIT: Record<string, { bb: string; ba: string }> = {
  '120': { bb: 'tradeReceivables',  ba: 'advancesReceived' },
  '131': { bb: 'otherReceivables',  ba: 'otherShortTermPayables' },
  '320': { bb: 'prepaidSuppliers',  ba: 'tradePayables' },
  '329': { bb: 'prepaidSuppliers',  ba: 'otherShortTermPayables' },
  '331': { bb: 'otherReceivables',  ba: 'otherShortTermPayables' },
}

// MAP: suffix yok = bakBorç, _A = bakAlacak, _CA = -bakAlacak (contra), _CB = -bakBorç (contra)
const MIZAN_MAP: Record<string, string> = {
  // Aktif – bakBorç
  '100': 'cash',             '101': 'cash',             '102': 'cash',             '108': 'cash',
  '121': 'tradeReceivables', '126': 'tradeReceivables',
  '136': 'otherReceivables',
  '150': 'inventory',        '151': 'inventory',        '152': 'inventory',  '153': 'inventory',
  '159': 'prepaidSuppliers',
  '180': 'prepaidExpenses',
  '190': 'otherCurrentAssets', '191': 'otherCurrentAssets', '193': 'otherCurrentAssets',
  '195': 'otherCurrentAssets', '196': 'otherCurrentAssets', '197': 'otherCurrentAssets', '198': 'otherCurrentAssets',
  '250': 'tangibleAssets',   '252': 'tangibleAssets',   '253': 'tangibleAssets',   '254': 'tangibleAssets', '255': 'tangibleAssets',
  '260': 'intangibleAssets', '261': 'intangibleAssets', '264': 'intangibleAssets',
  '280': 'longTermPrepaidExpenses',
  '580': 'retainedLosses',
  // Gelir tablosu – 64x/65x/67x/68x (mizan'da görünebilir)
  // 64x: Diğer Olağan Gelir ve Karlar → bakAlacak (_A)
  '640': 'otherIncome_A', '641': 'otherIncome_A', '642': 'otherIncome_A',
  '643': 'otherIncome_A', '644': 'otherIncome_A', '645': 'otherIncome_A',
  '646': 'otherIncome_A', '647': 'otherIncome_A', '648': 'otherIncome_A',
  '649': 'otherIncome_A',
  // 65x: Diğer Olağan Gider ve Zararlar → bakBorc
  '650': 'otherExpense',  '651': 'otherExpense',  '652': 'otherExpense',
  '653': 'otherExpense',  '654': 'otherExpense',  '655': 'otherExpense',
  '656': 'otherExpense',  '657': 'otherExpense',  '658': 'otherExpense',
  '659': 'otherExpense',
  // 67x: Olağandışı Gelir ve Karlar → bakAlacak (_A)
  '670': 'extraordinaryIncome_A', '671': 'extraordinaryIncome_A', '672': 'extraordinaryIncome_A',
  '673': 'extraordinaryIncome_A', '674': 'extraordinaryIncome_A', '675': 'extraordinaryIncome_A',
  '676': 'extraordinaryIncome_A', '677': 'extraordinaryIncome_A', '678': 'extraordinaryIncome_A',
  '679': 'extraordinaryIncome_A',
  // 68x: Olağandışı Gider ve Zararlar → bakBorc
  '680': 'extraordinaryExpense',  '681': 'extraordinaryExpense',  '682': 'extraordinaryExpense',
  '683': 'extraordinaryExpense',  '684': 'extraordinaryExpense',  '685': 'extraordinaryExpense',
  '686': 'extraordinaryExpense',  '687': 'extraordinaryExpense',  '688': 'extraordinaryExpense',
  '689': 'extraordinaryExpense',
  // Pasif – bakAlacak (_A)
  '103': 'cash_CA',
  '300': 'shortTermFinancialDebt_A', '301': 'shortTermFinancialDebt_A', '309': 'shortTermFinancialDebt_A',
  '321': 'tradePayables_A',          '326': 'tradePayables_A',
  '335': 'otherShortTermPayables_A', '336': 'otherShortTermPayables_A',
  '340': 'advancesReceived_A',
  '358': 'constructionProgress_A',
  '360': 'taxPayables_A',            '361': 'taxPayables_A',            '368': 'taxPayables_A',
  '381': 'deferredRevenue_A',
  '400': 'longTermFinancialDebt_A',  '401': 'longTermFinancialDebt_A',
  // 42x — UV Ticari Borçlar → longTermTradePayables_A
  '420': 'longTermTradePayables_A',  '421': 'longTermTradePayables_A',
  '426': 'longTermTradePayables_A',  '429': 'longTermTradePayables_A',
  // 43x — UV Diğer Borçlar → otherNonCurrentLiabilities_A
  '431': 'otherNonCurrentLiabilities_A', '432': 'otherNonCurrentLiabilities_A',
  '433': 'otherNonCurrentLiabilities_A', '436': 'otherNonCurrentLiabilities_A',
  '500': 'paidInCapital_A',
  '502': 'capitalReserves_A',        // Sermaye Düzeltmesi → capitalReserves (NOT paidInCapital)
  // 52x — Sermaye Yedekleri alt kodlar → capitalReserves_A
  '520': 'capitalReserves_A', '521': 'capitalReserves_A', '522': 'capitalReserves_A',
  '523': 'capitalReserves_A', '524': 'capitalReserves_A', '529': 'capitalReserves_A',
  // 54x — Kâr Yedekleri → profitReserves_A
  '540': 'profitReserves_A', '541': 'profitReserves_A', '542': 'profitReserves_A',
  '548': 'profitReserves_A', '549': 'profitReserves_A',
  '570': 'retainedEarnings_A',
  '590': 'netProfitCurrentYear_A',   // Dönem Net Karı (bakAlacak = pozitif)
  '591': 'netProfitCurrentYear_CB',  // Dönem Net Zararı (bakBorç = zarar → negatif)
  // Contra – bakAlacak çıkarılır (_CA), bakBorç çıkarılır (_CB)
  '257': 'tangibleAssets_CA',
  '268': 'intangibleAssets_CA',
  '302': 'shortTermFinancialDebt_CB',
  '402': 'longTermFinancialDebt_CB',
  '422': 'longTermTradePayables_CB',           // UV Alacak Senetleri Reeskontu (kontra)
  '437': 'otherNonCurrentLiabilities_CB',      // UV Borç Senetleri Reeskontu (kontra)
}

// Ana hesap → kanonik alt hesap eşlemesi (2 haneli → 3 haneli)
// parseMizanRows'da 2 haneli kod gelirse ve grubun alt kodu yoksa,
// bu tablo üzerinden kanonik 3 haneli koda dönüştürülür.
const MAIN_ACCOUNT_CANONICAL: Record<string, string> = {
  '10': '100', '12': '121', '13': '136', '15': '153', '18': '180', '19': '190',
  '25': '252', '26': '260', '28': '280',
  '30': '300', '32': '321', '33': '336', '34': '340', '36': '360', '38': '381',
  '40': '400', '42': '429', '43': '436',
  '50': '500', '52': '529', '54': '549', '57': '570', '58': '580',
}

export async function parseMizanRows(rows: unknown[][]): Promise<ParsedRow[]> {
  const header = findMizanHeader(rows)
  if (!header) return []
  const { headerIdx, cols } = header
  const { year, period } = extractMizanYear(rows)

  const fields: Record<string, number> = {}
  const add = (f: string, v: number) => { if (v) fields[f] = (fields[f] ?? 0) + v }

  const rawAccounts: Array<{ code: string; amount: number }> = []

  // Geçiş 1: 3 haneli alt kodu olan grup prefixlerini tespit et
  // (örn. satırda "431" varsa "43" grubu alt kod içeriyor demektir)
  const groupHasSubcode = new Set<string>()
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number | null)[]
    const rawCode = row[cols['code'] ?? 0]
    if (!rawCode) continue
    const nc = String(rawCode).replace(/\./g, '').trim().replace(/\D/g, '')
    if (nc.length === 3) groupHasSubcode.add(nc.substring(0, 2))
  }

  // Geçiş 2: asıl eşleme
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number | null)[]
    const rawCode = row[cols['code'] ?? 0]
    if (!rawCode) continue

    // Noktalı gösterim kaldır: "100.01" → "10001"; sadece 2-3 haneli kodları al
    const code = String(rawCode).replace(/\./g, '').trim()
    let nc   = code.replace(/\D/g, '')
    if (!nc || nc.length > 3 || nc.length < 2) continue

    // 2 haneli ana hesap kodu:
    //   - grubun alt kodu varsa atla (alt kodlar zaten işleyecek)
    //   - yoksa kanonik 3 haneli koda dönüştür
    if (nc.length === 2) {
      if (groupHasSubcode.has(nc)) continue
      const canonical = MAIN_ACCOUNT_CANONICAL[nc]
      if (!canonical) continue
      nc = canonical
    }

    const getNum = (key: string, fallback?: string): number => {
      const idx =
        cols[key] !== undefined
          ? cols[key]
          : fallback !== undefined && cols[fallback] !== undefined
            ? cols[fallback]
            : -1
      if (idx < 0) return 0
      const parsed = parseExcelNumber(row[idx])
      return parsed ?? 0
    }

    const bb = getNum('bakBorc',   'borc')
    const ba = getNum('bakAlacak', 'alacak')

    // ── Ham hesap kodu verisi (MIZAN_IGNORE dahil tüm MIZAN_MAP kodları) ────────
    // rebuildAggregateFromAccounts() için 3-haneli kodların doğal bakiyeleri:
    //   _A / _CA → bakAlacak (alacak bakiyeli hesaplar)
    //   _CB / suffix yok → bakBorç (borç bakiyeli hesaplar)
    //   MIZAN_SPLIT → bakBorç (ağırlıklı borç tarafı)
    if (nc.length === 3) {
      let rawAmount = 0
      if (MIZAN_SPLIT[nc]) {
        rawAmount = bb
      } else {
        const mapped = MIZAN_MAP[nc]
        if (mapped) {
          if (mapped.endsWith('_A') || mapped.endsWith('_CA')) rawAmount = ba
          else rawAmount = bb
        }
      }
      if (rawAmount !== 0) rawAccounts.push({ code: nc, amount: rawAmount })
    }

    if (MIZAN_IGNORE.has(nc)) continue

    if (MIZAN_SPLIT[nc]) {
      if (bb > 0) add(MIZAN_SPLIT[nc].bb, bb)
      if (ba > 0) add(MIZAN_SPLIT[nc].ba, ba)
      continue
    }

    const mapped = MIZAN_MAP[nc]
    if (!mapped) continue

    if      (mapped.endsWith('_CA')) add(mapped.replace('_CA', ''), -ba)
    else if (mapped.endsWith('_CB')) add(mapped.replace('_CB', ''), -bb)
    else if (mapped.endsWith('_A'))  add(mapped.replace('_A',  ''), ba)
    else                             add(mapped, bb)
  }

  console.log('[MIZAN] fields:', JSON.stringify(fields))

  if (Object.keys(fields).length < 3) return []

  const matchedRows = Object.keys(fields).length

  // Ters bakiye reklasifikasyonu — parser katmanı (birinci katman)
  const { reclassifyAccounts } = await import('@/lib/scoring/reversalMap')
  const reclass = reclassifyAccounts(rawAccounts)
  const finalRawAccounts = reclass.accounts
  const reversals = reclass.reversals

  if (reversals.length > 0) {
    console.log(`[parser] ${reversals.length} ters bakiye reklasifiye edildi:`)
    for (const r of reversals) {
      console.log(`  ${r.originalCode} (${r.originalAmount.toLocaleString('tr-TR')}) → ${r.reclassifiedCode} (+${r.amount.toLocaleString('tr-TR')}) [${r.ruleId}]`)
    }
  }

  const metaBase = {
    path: 'mizan' as const,
    totalRows: Math.max(rows.length - (headerIdx + 1), 0),
    matchedRows,
    ignoredRows: 0, zeroBalanceRows: 0, unmappedRows: 0,
    reverseBalanceWarnings: reversals.map(r => `${r.originalCode} → ${r.reclassifiedCode} [${r.ruleId}]`),
    parseWarnings: [] as string[],
  }
  return [{
    year,
    period,
    fields: fields as Record<string, number | null>,
    unmapped: [],
    docType: 'MIZAN',
    meta: { ...metaBase, confidence: calcConfidence(metaBase) },
    rawAccounts: finalRawAccounts.length > 0 ? finalRawAccounts : undefined,
    reversals: reversals.length > 0 ? reversals : undefined,
  }]
}

// ─── Sheet seçimi ─────────────────────────────────────────────────────────────

function selectMizanSheet(wb: ReturnType<typeof XLSX.read>): { sheetName: string; ws: XLSX.WorkSheet } {
  const names = wb.SheetNames
  const exact   = names.find(n => norm(n) === 'mizan')
  if (exact)   return { sheetName: exact,   ws: wb.Sheets[exact] }
  const partial = names.find(n => norm(n).includes('mizan'))
  if (partial) return { sheetName: partial, ws: wb.Sheets[partial] }
  return { sheetName: names[0], ws: wb.Sheets[names[0]] }
}

// ─── Ana export: parseExcelBuffer ─────────────────────────────────────────────

export async function parseExcelBuffer(buffer: Buffer, _fileName?: string): Promise<ParsedRow[]> {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const { sheetName, ws } = selectMizanSheet(wb)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  if (rows.length < 2) {
    console.warn('[excel] empty/short sheet', { sheetName })
    return []
  }

  // 1) Dikey format (çok yıllı, başlık satırında yıllar)
  if (detectVerticalFormat(rows)) {
    console.info('[excel] parse path: vertical', { sheetName, rowCount: rows.length })
    const result = parseVerticalExcel(rows)
    if (!result.length) console.warn('[excel] vertical empty', { sheetName })
    return result
  }

  // 2) Mizan (DETAY MİZAN)
  if (detectMizanFormat(rows)) {
    console.info('[excel] parse path: mizan', { sheetName, rowCount: rows.length })
    const result = await parseMizanRows(rows)
    const meta = result[0]?.meta
    console.info('[excel:mizan] summary', {
      sheetName, rowCount: rows.length, parsedRows: result.length,
      matchedRows: meta?.matchedRows ?? null, confidence: meta?.confidence ?? null,
      otherIncome: result[0]?.fields?.otherIncome ?? null,
    })
    if (!result.length) console.warn('[excel] mizan parse empty', { sheetName, rowCount: rows.length })
    return result
  }

  // 3) Yatay format (tek satır = bir dönem)
  console.info('[excel] parse path: horizontal', { sheetName, rowCount: rows.length })
  const headerRow = rows[0] as (string | null)[]
  const results: ParsedRow[] = []

  for (const row of rows.slice(1)) {
    if (!row || row.every(c => c == null || c === '')) continue
    const fields: Record<string, number | null> = {}
    const unmapped: string[] = []
    let year: number | undefined
    let period: string | undefined

    headerRow.forEach((header, i) => {
      if (!header) return
      const n = norm(header).trim()
      if (/^(yil|year)$/.test(n))       { year   = row[i] ? Number(row[i])      : undefined; return }
      if (/^(donem|period)$/.test(n))    { period = row[i] ? String(row[i]).toUpperCase() : undefined; return }
      const mapped = COLUMN_MAP[n]
      if (mapped) fields[mapped] = parseExcelNumber(row[i])
      else if (row[i] != null && n) unmapped.push(n)
    })

    if (Object.keys(fields).length > 0) results.push({ year, period: period ?? 'ANNUAL', fields, unmapped })
  }

  if (!results.length) console.warn('[excel] horizontal empty', { sheetName })
  return results
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

export async function parseCsvText(text: string): Promise<ParsedRow[]> {
  const wb = XLSX.read(text, { type: 'string' })
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  return parseExcelBuffer(Buffer.from(buf))
}
