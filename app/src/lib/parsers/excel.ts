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

export interface ParsedRow {
  year?: number
  period?: string
  fields: Record<string, number | null>
  unmapped: string[]
}

export function parseExcelBuffer(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  if (rows.length < 2) return []

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
