/**
 * Excel / CSV → FinancialInput dönüştürücü
 * Desteklenen format: tek satır başlıklar, her satır bir dönem
 */

import * as XLSX from 'xlsx'

// Olası sütun başlığı eşlemeleri (Türkçe + İngilizce kısaltmalar)
const COLUMN_MAP: Record<string, string> = {
  // Gelir tablosu
  'net satışlar':             'revenue',
  'ciro':                     'revenue',
  'revenue':                  'revenue',
  'net sales':                'revenue',
  'smm':                      'cogs',
  'satışların maliyeti':      'cogs',
  'cogs':                     'cogs',
  'brüt kar':                 'grossProfit',
  'gross profit':             'grossProfit',
  'faaliyet giderleri':       'operatingExpenses',
  'opex':                     'operatingExpenses',
  'operating expenses':       'operatingExpenses',
  'fvök':                     'ebit',
  'ebit':                     'ebit',
  'faaliyet karı':            'ebit',
  'amortisman':               'depreciation',
  'depreciation':             'depreciation',
  'amortization':             'depreciation',
  'favök':                    'ebitda',
  'ebitda':                   'ebitda',
  'finansman gideri':         'interestExpense',
  'faiz gideri':              'interestExpense',
  'interest expense':         'interestExpense',
  'diğer gelirler':           'otherIncome',
  'other income':             'otherIncome',
  'diğer giderler':           'otherExpense',
  'other expense':            'otherExpense',
  'vergi öncesi kar':         'ebt',
  'ebt':                      'ebt',
  'vergi gideri':             'taxExpense',
  'tax expense':              'taxExpense',
  'net kar':                  'netProfit',
  'net profit':               'netProfit',
  'net income':               'netProfit',
  // Dönen varlıklar
  'nakit':                    'cash',
  'cash':                     'cash',
  'nakit ve nakit benzerleri':'cash',
  'kv yatırımlar':            'shortTermInvestments',
  'short term investments':   'shortTermInvestments',
  'ticari alacaklar':         'tradeReceivables',
  'trade receivables':        'tradeReceivables',
  'alacaklar':                'tradeReceivables',
  'stoklar':                  'inventory',
  'inventory':                'inventory',
  'diğer dönen varlıklar':    'otherCurrentAssets',
  'dönen varlıklar':          'totalCurrentAssets',
  'total current assets':     'totalCurrentAssets',
  // Duran varlıklar
  'maddi duran varlıklar':    'tangibleAssets',
  'mdv':                      'tangibleAssets',
  'tangible assets':          'tangibleAssets',
  'maddi olmayan duran varlıklar': 'intangibleAssets',
  'modv':                     'intangibleAssets',
  'uv yatırımlar':            'longTermInvestments',
  'duran varlıklar':          'totalNonCurrentAssets',
  'total non current assets': 'totalNonCurrentAssets',
  'toplam aktif':             'totalAssets',
  'total assets':             'totalAssets',
  // Borçlar
  'kv finansal borçlar':      'shortTermFinancialDebt',
  'kv borçlar':               'shortTermFinancialDebt',
  'short term debt':          'shortTermFinancialDebt',
  'ticari borçlar':           'tradePayables',
  'trade payables':           'tradePayables',
  'borçlar':                  'tradePayables',
  'diğer kv borçlar':         'otherCurrentLiabilities',
  'kv borçlar toplamı':       'totalCurrentLiabilities',
  'total current liabilities':'totalCurrentLiabilities',
  'uv finansal borçlar':      'longTermFinancialDebt',
  'long term debt':           'longTermFinancialDebt',
  'uv borçlar':               'longTermFinancialDebt',
  'diğer uv borçlar':         'otherNonCurrentLiabilities',
  'uv borçlar toplamı':       'totalNonCurrentLiabilities',
  'total non current liabilities': 'totalNonCurrentLiabilities',
  // Öz kaynak
  'ödenmiş sermaye':          'paidInCapital',
  'paid in capital':          'paidInCapital',
  'geçmiş yıl karları':       'retainedEarnings',
  'retained earnings':        'retainedEarnings',
  'dönem net karı':           'netProfitCurrentYear',
  'toplam öz kaynak':         'totalEquity',
  'total equity':             'totalEquity',
  'öz kaynak':                'totalEquity',
  'pasif toplamı':            'totalLiabilitiesAndEquity',
  'total liabilities and equity': 'totalLiabilitiesAndEquity',
  // DPO
  'satın alımlar':            'purchases',
  'purchases':                'purchases',
}

// Dikey mizan formatı satır etiketleri → alan eşlemesi
// (satır = finansal kalem, sütun = yıl)
// 3. eleman true: değer negatife çevrilmeli (zarar kalemi)
const VERTICAL_ROW_MAP: [RegExp, string, boolean?][] = [
  // Gelir tablosu
  [/net\s*sat[iıİ][sşŞ]lar/i,              'revenue'],
  [/br[uüÜ]t\s*sat[iıİ][sşŞ]lar/i,        'revenue'],
  [/sat[iıİ][sşŞ]\s*has[iıİ]lat/i,         'revenue'],
  [/toplam\s*net\s*sat/i,                   'revenue'],
  [/sat[iıİ][sşŞ]lar[iıİ]n\s*maliyeti/i,   'cogs',   true],
  [/br[uüÜ]t\s*sat[iıİ][sşŞ]\s*k[aâÂ]r/i, 'grossProfit'],
  [/faaliyet\s*gider/i,                      'operatingExpenses', true],
  [/faaliyet\s*k[aâÂ]r/i,                   'ebit'],
  [/fv[oöÖ]k/i,                             'ebit'],
  [/amortisman/i,                            'depreciation'],
  [/fav[oöÖ]k/i,                            'ebitda'],
  [/finansman\s*gider/i,                     'interestExpense', true],
  [/faiz\s*gider/i,                          'interestExpense', true],
  [/vergi\s*[oöÖ]ncesi\s*k[aâÂ]r/i,        'ebt'],
  [/vergi\s*sonras[iıİ]\s*k[aâÂ]r/i,       'netProfit'],
  [/vergi\s*sonras[iıİ]\s*zarar/i,          'netProfit', true],
  [/net\s*k[aâÂ]r/i,                        'netProfit'],
  [/d[oöÖ]nem\s*k[aâÂ]r[iıİ]\s*[\/\-]/i,  'netProfit'],
  [/d[oöÖ]nem\s*net\s*kar/i,               'netProfit'],
  // Bilanço — dönen varlıklar
  [/para\s*mevcudu/i,                        'cash'],
  [/haz[iıİ]r\s*de[gğĞ]erler/i,            'cash'],
  [/nakit\s*ve\s*nakit/i,                    'cash'],
  [/ticari\s*alacak/i,                       'tradeReceivables'],
  [/^alacaklar$/i,                           'tradeReceivables'],
  [/stoklar/i,                               'inventory'],
  [/toplam\s*cari\s*aktif/i,                 'totalCurrentAssets'],
  [/d[oöÖ]nen\s*varl[iıİ]k/i,              'totalCurrentAssets'],
  // Bilanço — duran varlıklar
  [/maddi\s*duran\s*varl/i,                  'tangibleAssets'],
  [/toplam\s*ba[gğĞ]l[iıİ]\s*varl/i,       'totalNonCurrentAssets'],
  [/duran\s*varl[iıİ]k/i,                   'totalNonCurrentAssets'],
  [/toplam\s*aktif/i,                        'totalAssets'],
  [/aktif\s*toplam/i,                        'totalAssets'],
  // Borçlar
  [/k\.?v\.?\s*banka\s*bor/i,               'shortTermFinancialDebt'],
  [/kv\s*finansal\s*bor/i,                   'shortTermFinancialDebt'],
  [/mali\s*bor[cçÇ]/i,                       'shortTermFinancialDebt'],
  [/ticari\s*bor[cçÇ]/i,                     'tradePayables'],
  [/toplam\s*k[iıİ]sa\s*vadeli\s*bor/i,    'totalCurrentLiabilities'],
  [/k[iıİ]sa\s*vadeli\s*yabanc/i,          'totalCurrentLiabilities'],
  [/u\.?v\.?\s*banka\s*bor/i,               'longTermFinancialDebt'],
  [/uv\s*finansal\s*bor/i,                   'longTermFinancialDebt'],
  [/toplam\s*uzun\s*vadeli\s*bor/i,         'totalNonCurrentLiabilities'],
  // Öz kaynak
  [/[oöÖ]denmi[sşŞ]\s*sermaye/i,            'paidInCapital'],
  [/toplam\s*[oöÖ]z\s*serma/i,             'totalEquity'],
  [/[oöÖ]z\s*serma[vy]e\s*toplam/i,        'totalEquity'],
  [/pasif\s*toplam/i,                        'totalLiabilitiesAndEquity'],
  [/toplam\s*pasif/i,                        'totalLiabilitiesAndEquity'],
]

export interface ParsedRow {
  year?: number
  period?: string
  fields: Record<string, number | null>
  unmapped: string[]
  meta?: ParseMeta
}

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
}

/**
 * Dikey format tespiti: ilk satırda birden fazla yıl değeri varsa dikey formattır.
 * Örnek başlık satırı: ["", "2022", "%", "2023", "%", "2024", "%", "2025-2", "%", ...]
 */
function detectVerticalFormat(rows: unknown[][]): boolean {
  if (rows.length < 3) return false
  const firstRow = rows[0] as (string | number | null)[]
  let yearCount = 0
  for (const cell of firstRow) {
    if (cell == null) continue
    const s = String(cell).trim()
    if (/^20[12]\d(-\d+)?$/.test(s)) yearCount++
  }
  return yearCount >= 2
}

/**
 * Sayı çözümleme: Türk formatı (1.234.567,89) veya standart (1234567.89)
 */
export function parseExcelNumber(raw: unknown): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return isNaN(raw) ? null : raw
  const s = String(raw).trim()
  if (!s || s === '#SAYI0!' || s === '#DIV/0!' || s === '#NUM!' || s === '#DEĞER!' || s === '#VALUE!') return null
  // Türk formatı: nokta = binlik ayırıcı, virgül = ondalık
  let cleaned = s
  if (cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    cleaned = cleaned.replace(/,/g, '')
  }
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function calcConfidence(meta: Omit<ParseMeta, 'confidence'>): number {
  const denominator = Math.max(meta.totalRows, 1)
  const penalty =
    meta.ignoredRows * 0.2 +
    meta.unmappedRows * 0.3 +
    meta.zeroBalanceRows * 0.1 +
    meta.reverseBalanceWarnings.length * 0.15 +
    meta.parseWarnings.length * 0.15
  return Math.max(0, Math.min(1, Number((1 - penalty / denominator).toFixed(2))))
}

/**
 * Dikey mizan formatı parser:
 * - Satır 0: başlıklar (yıl değerleri, % sütunları, trend sütunları)
 * - Satır 1+: finansal kalemler (ilk sütun = etiket, geri kalanlar = değerler)
 */
function parseVerticalExcel(rows: unknown[][]): ParsedRow[] {
  const headerRow = rows[0] as (string | number | null)[]

  // Yıl sütunlarını tespit et: "2024" veya "2025-2" (2025 Q2) biçiminde
  const yearCols: { colIdx: number; year: number; period: string }[] = []
  for (let i = 1; i < headerRow.length; i++) {
    const cell = headerRow[i]
    if (cell == null) continue
    const s = String(cell).trim()
    const m = s.match(/^(20[12]\d)(?:[.\-](\d+))?$/)
    if (m) {
      const year = parseInt(m[1])
      const qNum = m[2] ? parseInt(m[2]) : null
      const period = qNum ? `Q${qNum}` : 'ANNUAL'
      yearCols.push({ colIdx: i, year, period })
    }
  }

  if (yearCols.length === 0) return []

  // Her yıl-dönem için boş sonuç
  const resultMap: Record<string, ParsedRow> = {}
  let matchedRows = 0
  let ignoredRows = 0
  let unmappedRows = 0
  const parseWarnings: string[] = []
  for (const yc of yearCols) {
    const key = `${yc.year}_${yc.period}`
    resultMap[key] = { year: yc.year, period: yc.period, fields: {}, unmapped: [] }
  }

  // Her satırı işle
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[]

    const col0 = row[0] != null ? String(row[0]).trim() : ''
    const col1 = row[1] != null ? String(row[1]).trim() : ''
    const col2 = row[2] != null ? String(row[2]).trim() : ''
    const accountCode = col0.split('.')[0].trim()
    const isAccountCode = /^\d+$/.test(accountCode)

    let label = ''
    if (!isAccountCode) {
      for (const candidate of [col0, col1, col2]) {
        if (candidate && candidate.length > 1) {
          label = candidate
          break
        }
      }
    }

    if (!label && !isAccountCode && !col1) continue

    let rowMatched = false

    if (isAccountCode) {
      // Önce MIZAN_ACCOUNT_MAP ile hesap koduna göre eşleştir
      const mapping = MIZAN_ACCOUNT_MAP[accountCode]
      if (mapping && mapping.field !== '_salesDeductions' && mapping.field !== '_netLoss') {
        rowMatched = true
        for (const yc of yearCols) {
          const key = `${yc.year}_${yc.period}`
          const rawVal = row[yc.colIdx]
          const val = parseExcelNumber(rawVal)
          if (val == null) continue
          const existingVal = resultMap[key].fields[mapping.field]
          resultMap[key].fields[mapping.field] =
            typeof existingVal === 'number' ? existingVal + val : val
        }
      }

      // Kod eşleşmezse hesap adı kolonunu regex ile dene
      if (!rowMatched && col1) {
        for (const [pattern, fieldName, negateIfPositive] of VERTICAL_ROW_MAP) {
          if (pattern.test(col1)) {
            rowMatched = true
            for (const yc of yearCols) {
              const key = `${yc.year}_${yc.period}`
              const rawVal = row[yc.colIdx]
              let val = parseExcelNumber(rawVal)
              if (val == null) continue
              if (negateIfPositive && val > 0) val = -val
              const existingVal = resultMap[key].fields[fieldName]
              resultMap[key].fields[fieldName] =
                typeof existingVal === 'number' ? existingVal + val : val
            }
            break
          }
        }
      }

      if (!rowMatched) {
        ignoredRows++
        unmappedRows++
        parseWarnings.push(`Dikey formatta eşleşmeyen satır: ${col1 || col0} (kod: ${col0}, neden: kod map'te yok ve hesap adı eşleşmedi)`)
      }
    } else {
      // VERTICAL_ROW_MAP ile metin regex eşleştirmesi
      for (const [pattern, fieldName, negateIfPositive] of VERTICAL_ROW_MAP) {
        if (pattern.test(label)) {
          rowMatched = true
          for (const yc of yearCols) {
            const key = `${yc.year}_${yc.period}`
            const rawVal = row[yc.colIdx]
            let val = parseExcelNumber(rawVal)
            if (val == null) continue
            if (negateIfPositive && val > 0) val = -val
            const existingVal = resultMap[key].fields[fieldName]
            resultMap[key].fields[fieldName] =
              typeof existingVal === 'number' ? existingVal + val : val
          }
          break
        }
      }
      if (!rowMatched) {
        ignoredRows++
        unmappedRows++
        parseWarnings.push(`Dikey formatta eşleşmeyen satır: ${label} (neden: metin eşleşmesi bulunamadı)`)
      }
    }

    if (rowMatched) matchedRows++
  }

  const baseMeta = {
    path: 'vertical' as const,
    totalRows: Math.max(rows.length - 1, 0),
    matchedRows,
    ignoredRows,
    zeroBalanceRows: 0,
    unmappedRows,
    reverseBalanceWarnings: [],
    parseWarnings,
  }

  return Object.values(resultMap)
    .filter(r => Object.keys(r.fields).length > 0)
    .map(r => ({
      ...r,
      meta: {
        ...baseMeta,
        confidence: calcConfidence(baseMeta),
      },
    }))
}

// ─── Mizan (Tek Düzen Hesap Planı) Parser ────────────────────────────────────

export const MIZAN_ACCOUNT_MAP: Record<string, { field: string; src: 'bakBorç' | 'bakAlacak' | 'anyBorç' | 'anyAlacak' }> = {
  // ── Dönen Varlıklar ──────────────────────────────────────────
  '1':   { field: 'totalCurrentAssets',          src: 'bakBorç' },
  '10':  { field: 'cash',                        src: 'bakBorç' },
  '11':  { field: 'shortTermInvestments',        src: 'bakBorç' },
  '12':  { field: 'tradeReceivables',            src: 'bakBorç' },
  '13':  { field: 'otherReceivables',            src: 'bakBorç' },
  '15':  { field: 'inventory',                   src: 'bakBorç' },
  '17':  { field: 'constructionCosts',           src: 'bakBorç' },
  '18':  { field: 'prepaidExpenses',             src: 'bakBorç' },
  '19':  { field: 'otherCurrentAssets',          src: 'bakBorç' },
  // ── Duran Varlıklar ──────────────────────────────────────────
  '2':   { field: 'totalNonCurrentAssets',       src: 'bakBorç' },
  '22':  { field: 'longTermTradeReceivables',    src: 'bakBorç' },
  '23':  { field: 'longTermOtherReceivables',    src: 'bakBorç' },
  '24':  { field: 'longTermInvestments',         src: 'bakBorç' },
  '25':  { field: 'tangibleAssets',              src: 'bakBorç' },
  '26':  { field: 'intangibleAssets',            src: 'bakBorç' },
  '27':  { field: 'depletableAssets',            src: 'bakBorç' },
  '28':  { field: 'longTermPrepaidExpenses',     src: 'bakBorç' },
  '29':  { field: 'otherNonCurrentAssets',       src: 'bakBorç' },
  // ── Kısa Vadeli Yabancı Kaynaklar ────────────────────────────
  '3':   { field: 'totalCurrentLiabilities',    src: 'bakAlacak' },
  '30':  { field: 'shortTermFinancialDebt',      src: 'bakAlacak' },
  '32':  { field: 'tradePayables',              src: 'bakAlacak' },
  '33':  { field: 'otherShortTermPayables',     src: 'bakAlacak' },
  '34':  { field: 'advancesReceived',           src: 'bakAlacak' },
  '35':  { field: 'constructionProgress',       src: 'bakAlacak' },
  '36':  { field: 'taxPayables',                src: 'bakAlacak' },
  '37':  { field: 'shortTermProvisions',        src: 'bakAlacak' },
  '38':  { field: 'deferredRevenue',            src: 'bakAlacak' },
  '39':  { field: 'otherCurrentLiabilities',   src: 'bakAlacak' },
  // ── Uzun Vadeli Yabancı Kaynaklar ────────────────────────────
  '4':   { field: 'totalNonCurrentLiabilities', src: 'bakAlacak' },
  '40':  { field: 'longTermFinancialDebt',       src: 'bakAlacak' },
  '42':  { field: 'longTermTradePayables',       src: 'bakAlacak' },
  '43':  { field: 'longTermOtherPayables',       src: 'bakAlacak' },
  '44':  { field: 'longTermAdvancesReceived',    src: 'bakAlacak' },
  '47':  { field: 'longTermProvisions',          src: 'bakAlacak' },
  '49':  { field: 'otherNonCurrentLiabilities', src: 'bakAlacak' },
  // ── Öz Kaynaklar ─────────────────────────────────────────────
  '5':   { field: 'totalEquity',                src: 'bakAlacak' },
  '50':  { field: 'paidInCapital',              src: 'bakAlacak' },
  '52':  { field: 'capitalReserves',            src: 'bakAlacak' },
  '54':  { field: 'profitReserves',             src: 'bakAlacak' },
  '57':  { field: 'retainedEarnings',           src: 'bakAlacak' },
  '58':  { field: 'retainedLosses',             src: 'bakBorç'  },
  '590': { field: 'netProfitCurrentYear',        src: 'bakAlacak' },
  '591': { field: '_netLoss',                    src: 'bakBorç'  },
  // ── Gelir Tablosu ─────────────────────────────────────────────
  '60':  { field: 'grossSales',                 src: 'anyAlacak' },
  '61':  { field: '_salesDeductions',           src: 'anyBorç'  },
  '62':  { field: 'cogs',                       src: 'anyBorç'  },
  '63':  { field: 'operatingExpenses',          src: 'anyBorç'  },
  '64':  { field: 'otherIncome',                src: 'anyAlacak' },
  '65':  { field: 'otherExpense',               src: 'anyBorç'  },
  '66':  { field: 'interestExpense',            src: 'anyBorç'  },
  '67':  { field: 'extraordinaryIncome',        src: 'anyAlacak' },
  '68':  { field: 'extraordinaryExpense',       src: 'anyBorç'  },
  '69':  { field: 'taxExpense',                 src: 'anyBorç'  },
  '691': { field: 'taxExpense',                 src: 'anyBorç'  },
}

function detectMizanFormat(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(8, rows.length); i++) {
    const row = rows[i] as (string | null)[]
    for (const cell of row) {
      if (!cell) continue
      const s = String(cell)
      if (/miz[ae]n/i.test(s) || /hesap\s*kodu/i.test(s)) return true
    }
  }
  return false
}

function findMizanHeader(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] as (string | null)[]
    if (!row.some(c => c && /hesap\s*kodu/i.test(String(c)))) continue
    const cols: Record<string, number> = {}
    row.forEach((cell, idx) => {
      const s = String(cell || '').toLowerCase().trim()
      if (/hesap\s*kod/.test(s)) cols['code'] = idx
      if (s === 'borç' || s === 'borc') cols['borç'] = idx
      if (s === 'alacak') cols['alacak'] = idx
      if (/bak.*borç|borç.*bak|borç\s*baki/i.test(String(cell || ''))) cols['bakBorç'] = idx
      if (/bak.*alacak|alacak.*bak|alacak\s*baki/i.test(String(cell || ''))) cols['bakAlacak'] = idx
    })
    if ('borç' in cols) return { headerIdx: i, cols }
  }
  return null
}

function extractMizanYear(rows: unknown[][]): { year: number | null; period: string } {
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    for (const cell of rows[i] as (string | null)[]) {
      if (!cell) continue
      const s = String(cell)
      const m = s.match(/(\d{2})[.\/-](\d{2})[.\/-](20\d{2})\s*[-–]\s*(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/)
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

export function parseMizanRows(rows: unknown[][]): ParsedRow[] {
  const header = findMizanHeader(rows)
  if (!header) return []
  const { headerIdx, cols } = header
  const { year, period } = extractMizanYear(rows)
  if (!year) return []

  const fields: Record<string, number | null> = {}
  let salesDeductions = 0
  let netLoss = 0
  let matchedRows = 0
  let ignoredRows = 0
  let zeroBalanceRows = 0
  let unmappedRows = 0
  const reverseBalanceWarnings: string[] = []
  const parseWarnings: string[] = []
  const exactParentMatched = new Set<string>()

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number | null)[]
    const rawCode = row[cols['code'] ?? 0]
    if (!rawCode) continue
    const code = String(rawCode).trim()
    const normalizedCode = code.replace(/[^\d]/g, '')
    if (!normalizedCode) continue

    let mappedCode: string | null = null
    let mapping = MIZAN_ACCOUNT_MAP[normalizedCode]
    let matchedByPrefix = false

    if (mapping) {
      mappedCode = normalizedCode
      if (normalizedCode.length <= 3) exactParentMatched.add(normalizedCode)
    } else {
      const prefixCandidates = [
        normalizedCode.slice(0, 3),
        normalizedCode.slice(0, 2),
        normalizedCode.slice(0, 1),
      ].filter(Boolean)

      for (const candidate of prefixCandidates) {
        if (exactParentMatched.has(candidate)) continue
        const prefixMapping = MIZAN_ACCOUNT_MAP[candidate]
        if (prefixMapping) {
          mapping = prefixMapping
          mappedCode = candidate
          matchedByPrefix = true
          break
        }
      }
    }

    if (!mapping) {
      ignoredRows++
      unmappedRows++
      continue
    }

    const borç      = parseExcelNumber(cols['borç']      !== undefined ? row[cols['borç']]      : null)
    const alacak    = parseExcelNumber(cols['alacak']    !== undefined ? row[cols['alacak']]    : null)
    const bakBorç   = parseExcelNumber(cols['bakBorç']   !== undefined ? row[cols['bakBorç']]   : null)
    const bakAlacak = parseExcelNumber(cols['bakAlacak'] !== undefined ? row[cols['bakAlacak']] : null)

    const hasExplicitBalanceCols = cols['bakBorç'] !== undefined || cols['bakAlacak'] !== undefined
    // Sadece TÜM kolonlar sıfırsa atla (bakiye=0 ama hareket var olan hesapları atlama)
    if (hasExplicitBalanceCols && (bakBorç ?? 0) === 0 && (bakAlacak ?? 0) === 0
        && (borç ?? 0) === 0 && (alacak ?? 0) === 0) {
      zeroBalanceRows++
      continue
    }

    if ((bakBorç != null && bakBorç !== 0) && (bakAlacak != null && bakAlacak !== 0)) {
      parseWarnings.push(`Belirsiz bakiye: hesap ${code} hem borç hem alacak bakiyesi içeriyor`)
    }

    let val: number | null = null
    switch (mapping.src) {
      // Bilanço hesapları: SADECE bakiye kolonunu kullan (??)
      // bakBorç=0 gerçek sıfır bakiye demektir — hareket kolonuna düşme
      case 'bakBorç':
        if ((bakAlacak != null && bakAlacak !== 0) && (bakBorç == null || bakBorç === 0)) {
          reverseBalanceWarnings.push(`Ters bakiye: hesap ${normalizedCode} alacak bakiyesi veriyor`)
        }
        val = bakBorç ?? bakAlacak ?? null
        break
      case 'bakAlacak':
        if ((bakBorç != null && bakBorç !== 0) && (bakAlacak == null || bakAlacak === 0)) {
          reverseBalanceWarnings.push(`Ters bakiye: hesap ${normalizedCode} borç bakiyesi veriyor`)
        }
        val = bakAlacak ?? bakBorç ?? null
        break
      // Gelir tablosu hesapları: bakiye=0 (kesin beyan kapanışı) → hareket kolonuna düş (||)
      case 'anyBorç':
        if ((bakAlacak != null && bakAlacak !== 0) && (bakBorç == null || bakBorç === 0)) {
          reverseBalanceWarnings.push(`Ters bakiye: hesap ${normalizedCode} alacak tarafında kapanıyor`)
        }
        val = bakBorç || bakAlacak || borç || alacak || null
        break
      case 'anyAlacak':
        if ((bakBorç != null && bakBorç !== 0) && (bakAlacak == null || bakAlacak === 0)) {
          reverseBalanceWarnings.push(`Ters bakiye: hesap ${normalizedCode} borç tarafında kapanıyor`)
        }
        val = bakAlacak || bakBorç || alacak || borç || null
        break
    }
    if (val == null) {
      ignoredRows++
      continue
    }
    if (val === 0) {
      zeroBalanceRows++
      continue
    }

    if (mapping.field === '_salesDeductions') {
      salesDeductions = matchedByPrefix ? salesDeductions + val : val
    } else if (mapping.field === '_netLoss') {
      netLoss = matchedByPrefix ? netLoss + val : val
    } else if (matchedByPrefix) {
      const prev = fields[mapping.field]
      fields[mapping.field] = typeof prev === 'number' ? prev + val : val
    } else {
      fields[mapping.field] = val
      if (mappedCode && mappedCode.length <= 3) exactParentMatched.add(mappedCode)
    }
    matchedRows++
  }

  // Post-processing
  // Net satışlar = Brüt satışlar - İndirimler
  if (fields['grossSales']) {
    fields['revenue'] = (fields['grossSales'] as number) - salesDeductions
  } else if (salesDeductions && fields['revenue']) {
    fields['revenue'] = (fields['revenue'] as number) - salesDeductions
  }
  if (netLoss && !fields['netProfitCurrentYear']) {
    fields['netProfitCurrentYear'] = -netLoss
  }

  // Net kar: gelir tablosu hesapları varsa her zaman ondan hesapla (geçici dönem de dahil)
  // Account 590 geçici dönemde önceki yıl kapanışını taşıyabilir — güvenilmez
  const rev      = fields['revenue']           as number | null
  const cogs     = fields['cogs']              as number | null
  const opex     = fields['operatingExpenses'] as number | null
  const otherInc = fields['otherIncome']       as number | null
  const otherExp = fields['otherExpense']      as number | null
  const interest = fields['interestExpense']   as number | null
  const extInc   = fields['extraordinaryIncome']  as number | null
  const extExp   = fields['extraordinaryExpense'] as number | null
  const tax      = fields['taxExpense']        as number | null
  if (rev != null) {
    const grossProfit = rev - (cogs ?? 0)
    const ebit        = grossProfit - (opex ?? 0)
    const ebt         = ebit + (otherInc ?? 0) - (otherExp ?? 0) - (interest ?? 0) + (extInc ?? 0) - (extExp ?? 0)
    const netIS       = ebt - (tax ?? 0)
    if (!fields['grossProfit']) fields['grossProfit'] = grossProfit
    if (!fields['ebit'])        fields['ebit']        = ebit
    if (!fields['ebitda'])      fields['ebitda']      = ebit  // depreciation bilinmiyorsa
    if (!fields['ebt'])         fields['ebt']         = ebt
    // Gelir tablosu hesabından gelen netProfit her zaman 590'ın önüne geçer
    fields['netProfit']            = netIS
    fields['netProfitCurrentYear'] = netIS
  } else if (fields['netProfitCurrentYear'] && !fields['netProfit']) {
    // Gelir tablosu yoksa 590 hesabını kullan (son çare)
    fields['netProfit'] = fields['netProfitCurrentYear']
  }

  if (!fields['totalAssets'] && fields['totalCurrentAssets'] && fields['totalNonCurrentAssets']) {
    fields['totalAssets'] = (fields['totalCurrentAssets'] as number) + (fields['totalNonCurrentAssets'] as number)
  }

  if (Object.keys(fields).length < 3) return []
  const metaBase = {
    path: 'mizan' as const,
    totalRows: Math.max(rows.length - (headerIdx + 1), 0),
    matchedRows,
    ignoredRows,
    zeroBalanceRows,
    unmappedRows,
    reverseBalanceWarnings,
    parseWarnings,
  }
  return [{
    year,
    period,
    fields,
    unmapped: [],
    meta: {
      ...metaBase,
      confidence: calcConfidence(metaBase),
    },
  }]
}

// ─── parseExcelBuffer ─────────────────────────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  if (rows.length < 2) return []

  // Dikey format tespiti ÖNCE: başlık satırında birden fazla yıl sütunu varsa dikey formattır.
  // Mizan tespitinden önce yapılmalı — çünkü çok yıllı tablolar "HESAP KODU" içerse de
  // mizan değil dikey tablodur.
  if (detectVerticalFormat(rows)) {
    console.info('[excel] parse path: vertical', { sheetName, rowCount: rows.length })
    const result = parseVerticalExcel(rows)
    if (result.length === 0) console.warn('[excel] vertical parse boş sonuç üretti', { sheetName, rowCount: rows.length })
    return result
  }

  // Mizan tespiti (tek dönem, Tek Düzen Hesap Planı)
  if (detectMizanFormat(rows)) {
    console.info('[excel] parse path: mizan', { sheetName, rowCount: rows.length })
    const result = parseMizanRows(rows)
    if (result.length === 0) console.warn('[excel] mizan parse boş sonuç üretti', { sheetName, rowCount: rows.length })
    return result
  }

  // Yatay format: satır = dönem, sütun = alan
  console.info('[excel] parse path: horizontal', { sheetName, rowCount: rows.length })
  const headerRow = rows[0] as (string | null)[]
  const dataRows  = rows.slice(1)

  const results: ParsedRow[] = []
  let matchedRows = 0
  let ignoredRows = 0
  let unmappedRows = 0
  const parseWarnings: string[] = []

  for (const row of dataRows) {
    if (!row || row.every((c) => c == null || c === '')) continue

    const fields: Record<string, number | null> = {}
    const unmapped: string[] = []
    let year: number | undefined
    let period: string | undefined

    headerRow.forEach((header, i) => {
      if (!header) return
      const normalised = String(header).trim().toLowerCase()
      const value      = row[i]

      if (normalised === 'yıl' || normalised === 'year') {
        year = value ? Number(value) : undefined
        return
      }
      if (normalised === 'dönem' || normalised === 'period') {
        period = value ? String(value).toUpperCase() : undefined
        return
      }

      const mapped = COLUMN_MAP[normalised]
      if (mapped) {
        fields[mapped] = parseExcelNumber(value)
      } else if (value != null && normalised) {
        unmapped.push(normalised)
      }
    })

    if (Object.keys(fields).length > 0) matchedRows++
    else ignoredRows++
    if (unmapped.length > 0) {
      unmappedRows += unmapped.length
      parseWarnings.push(`Yatay formatta eşleşmeyen başlıklar: ${unmapped.join(', ')}`)
    }
    if (!year) {
      parseWarnings.push('Yatay format satırında yıl bulunamadı')
    }

    const metaBase = {
      path: 'horizontal' as const,
      totalRows: dataRows.length,
      matchedRows,
      ignoredRows,
      zeroBalanceRows: 0,
      unmappedRows,
      reverseBalanceWarnings: [],
      parseWarnings: [...parseWarnings],
    }

    results.push({
      year,
      period: period ?? 'ANNUAL',
      fields,
      unmapped,
      meta: {
        ...metaBase,
        confidence: calcConfidence(metaBase),
      },
    })
  }

  if (results.length === 0) {
    console.warn('[excel] horizontal parse boş sonuç üretti', { sheetName, rowCount: rows.length })
  }
  return results
}

export function parseCsvText(text: string): ParsedRow[] {
  // CSV → XLSX formatına çevir ve aynı parser'ı kullan
  const workbook = XLSX.read(text, { type: 'string' })
  const ws = workbook.Sheets[workbook.SheetNames[0]]
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  return parseExcelBuffer(Buffer.from(buffer))
}
