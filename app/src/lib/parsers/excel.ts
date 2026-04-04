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
function parseExcelNumber(raw: unknown): number | null {
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
  for (const yc of yearCols) {
    const key = `${yc.year}_${yc.period}`
    resultMap[key] = { year: yc.year, period: yc.period, fields: {}, unmapped: [] }
  }

  // Her satırı işle
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[]
    // Etiket: genellikle ilk dolu sütun
    let label = ''
    for (let c = 0; c < Math.min(3, row.length); c++) {
      if (row[c] != null && String(row[c]).trim().length > 1) {
        label = String(row[c]).trim()
        break
      }
    }
    if (!label) continue

    for (const [pattern, fieldName, negateIfPositive] of VERTICAL_ROW_MAP) {
      if (pattern.test(label)) {
        for (const yc of yearCols) {
          const key = `${yc.year}_${yc.period}`
          if (resultMap[key].fields[fieldName] != null) continue // ilk eşleşmeyi koru
          const rawVal = row[yc.colIdx]
          let val = parseExcelNumber(rawVal)
          if (val == null) continue
          if (negateIfPositive && val > 0) val = -val
          resultMap[key].fields[fieldName] = val
        }
        break
      }
    }
  }

  return Object.values(resultMap).filter(r => Object.keys(r.fields).length > 0)
}

// ─── Mizan (Tek Düzen Hesap Planı) Parser ────────────────────────────────────

export const MIZAN_ACCOUNT_MAP: Record<string, { field: string; src: 'bakBorç' | 'bakAlacak' | 'anyBorç' | 'anyAlacak' }> = {
  '1':   { field: 'totalCurrentAssets',          src: 'bakBorç' },
  '10':  { field: 'cash',                         src: 'bakBorç' },
  '12':  { field: 'tradeReceivables',             src: 'bakBorç' },
  '15':  { field: 'inventory',                    src: 'bakBorç' },
  '2':   { field: 'totalNonCurrentAssets',        src: 'bakBorç' },
  '25':  { field: 'tangibleAssets',               src: 'bakBorç' },
  '26':  { field: 'intangibleAssets',             src: 'bakBorç' },
  '3':   { field: 'totalCurrentLiabilities',     src: 'bakAlacak' },
  '30':  { field: 'shortTermFinancialDebt',       src: 'bakAlacak' },
  '32':  { field: 'tradePayables',               src: 'bakAlacak' },
  '4':   { field: 'totalNonCurrentLiabilities',  src: 'bakAlacak' },
  '40':  { field: 'longTermFinancialDebt',        src: 'bakAlacak' },
  '5':   { field: 'totalEquity',                 src: 'bakAlacak' },
  '50':  { field: 'paidInCapital',               src: 'bakAlacak' },
  '590': { field: 'netProfitCurrentYear',         src: 'bakAlacak' },
  '591': { field: '_netLoss',                     src: 'bakBorç' },
  '60':  { field: 'revenue',                     src: 'anyAlacak' },
  '61':  { field: '_salesDeductions',            src: 'anyBorç' },
  '62':  { field: 'cogs',                        src: 'anyBorç' },
  '63':  { field: 'operatingExpenses',           src: 'anyBorç' },
  '66':  { field: 'interestExpense',             src: 'anyBorç' },
  '691': { field: 'taxExpense',                  src: 'anyBorç' },
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

  const n = (v: unknown): number | null => {
    if (v == null) return null
    const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/[.,\s]/g, m => m === ',' ? '.' : ''))
    return isNaN(num) || num === 0 ? null : num
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number | null)[]
    const rawCode = row[cols['code'] ?? 0]
    if (!rawCode) continue
    const code = String(rawCode).trim()
    if (!/^\d+$/.test(code)) continue  // sadece tam sayı kodlar (alt hesap noktaları yok)

    const mapping = MIZAN_ACCOUNT_MAP[code]
    if (!mapping) continue

    const borç    = n(cols['borç']    !== undefined ? row[cols['borç']]    : null)
    const alacak  = n(cols['alacak']  !== undefined ? row[cols['alacak']]  : null)
    const bakBorç  = n(cols['bakBorç']  !== undefined ? row[cols['bakBorç']]  : null)
    const bakAlacak = n(cols['bakAlacak'] !== undefined ? row[cols['bakAlacak']] : null)

    let val: number | null = null
    switch (mapping.src) {
      case 'bakBorç':   val = bakBorç ?? borç; break
      case 'bakAlacak': val = bakAlacak ?? alacak; break
      case 'anyBorç':   val = bakBorç ?? borç ?? alacak; break
      case 'anyAlacak': val = bakAlacak ?? alacak ?? borç; break
    }
    if (!val) continue

    if (mapping.field === '_salesDeductions') salesDeductions = val
    else if (mapping.field === '_netLoss') netLoss = val
    else fields[mapping.field] = val
  }

  // Post-processing
  if (salesDeductions && fields['revenue']) {
    fields['revenue'] = (fields['revenue'] as number) - salesDeductions
  }
  if (netLoss && !fields['netProfitCurrentYear']) {
    fields['netProfitCurrentYear'] = -netLoss
  }
  if (fields['netProfitCurrentYear'] && !fields['netProfit']) {
    fields['netProfit'] = fields['netProfitCurrentYear']
  }
  if (!fields['totalAssets'] && fields['totalCurrentAssets'] && fields['totalNonCurrentAssets']) {
    fields['totalAssets'] = (fields['totalCurrentAssets'] as number) + (fields['totalNonCurrentAssets'] as number)
  }

  if (Object.keys(fields).length < 3) return []
  return [{ year, period, fields, unmapped: [] }]
}

// ─── parseExcelBuffer ─────────────────────────────────────────────────────────

export function parseExcelBuffer(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  if (rows.length < 2) return []

  // Mizan tespiti (Tek Düzen Hesap Planı)
  if (detectMizanFormat(rows)) {
    return parseMizanRows(rows)
  }

  // Dikey format tespiti (özet finansal tablo — sütun = yıl)
  if (detectVerticalFormat(rows)) {
    return parseVerticalExcel(rows)
  }

  // Yatay format: satır = dönem, sütun = alan
  const headerRow = rows[0] as (string | null)[]
  const dataRows  = rows.slice(1)

  const results: ParsedRow[] = []

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
        const num = value != null ? parseFloat(String(value).replace(/[.,\s]/g, (m) => m === '.' ? '.' : '')) : null
        fields[mapped] = isNaN(num as number) ? null : num
      } else if (value != null && normalised) {
        unmapped.push(normalised)
      }
    })

    results.push({ year, period: period ?? 'ANNUAL', fields, unmapped })
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
