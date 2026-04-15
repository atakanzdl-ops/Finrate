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

export type DocType =
  | 'excel'        // yatay/dikey Excel (genel)
  | 'excel-gt'     // Excel GELİRTABLOSU sheet — gelir tablosu birincil kaynak
  | 'excel-mizan'  // Excel mizan 6xx hesapları — gelir tablosu fallback
  | 'csv'
  | 'kvb' | 'ygvb'
  | 'gvb-q1' | 'gvb-q2' | 'gvb-q3' | 'gvb-q4'

/** Gelir tablosu alanları kümesi — kaynak önceliği ve GELİRTABLOSU sheet filtrelemesi için */
export const INCOME_FIELDS = new Set([
  'revenue', 'grossSales', 'cogs', 'grossProfit', 'operatingExpenses',
  'ebit', 'ebitda', 'otherIncome', 'otherExpense', 'interestExpense',
  'extraordinaryIncome', 'extraordinaryExpense', 'ebt', 'taxExpense',
  'netProfit', 'netProfitCurrentYear', 'depreciation',
])

export interface UploadWarning {
  code: 'BALANCE_MISMATCH' | 'INCOME_FROM_EXCEL' | 'GVB_NO_BALANCE' | 'INCOME_NET_MISMATCH'
  message: string
}

export interface ParsedRow {
  year?: number
  period?: string
  fields: Record<string, number | null>
  unmapped: string[]
  meta?: ParseMeta
  docType?: DocType
  warnings?: UploadWarning[]
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
  mizanTypeUsed?: 'DETAY' | 'STANDART'
  sources?: {
    incomeStatement: string | null
    balanceSheet: string | null
  }
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
      // Önce tam eşleşme, yoksa prefix matching (3→2→1 hane)
      let mapping = MIZAN_ACCOUNT_MAP[accountCode]
      if (!mapping) {
        for (const prefix of [accountCode.slice(0, 3), accountCode.slice(0, 2), accountCode.slice(0, 1)]) {
          if (MIZAN_ACCOUNT_MAP[prefix]) { mapping = MIZAN_ACCOUNT_MAP[prefix]; break }
        }
      }
      if (mapping && mapping.field !== '_salesDeductions' && mapping.field !== '_netLoss' && mapping.field !== '_ignore') {
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
      } else if (mapping?.field === '_ignore') {
        rowMatched = true // ignore ama unmapped sayma
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
      docType: 'excel' as DocType,
      meta: {
        ...baseMeta,
        confidence: calcConfidence(baseMeta),
      },
    }))
}

// ─── Mizan (Tek Düzen Hesap Planı) Parser ────────────────────────────────────

export const MIZAN_ACCOUNT_MAP: Record<string, { field: string; src: 'bakBorç' | 'bakAlacak' | 'anyBorç' | 'anyAlacak' | 'netBorç' | 'netAlacak'; negative?: boolean }> = {
  // ── Aktif ───────────────────────────────────
  '100': { field: 'cash',                      src: 'bakBorç' },
  '101': { field: 'cash',                      src: 'bakBorç' },
  '102': { field: 'cash',                      src: 'bakBorç' },
  '103': { field: 'tradePayables',             src: 'bakAlacak' }, // Verilen Çekler → Ticari Borçlar
  '106': { field: 'cash',                      src: 'bakBorç' },   // Döviz Kasası
  '107': { field: 'cash',                      src: 'bakBorç' },   // Banka Dışı Diğer Para Değerleri
  '108': { field: 'cash',                      src: 'bakAlacak', negative: true }, // Verilen Çekler ve Ödeme Emirleri (-)
  '110': { field: 'shortTermInvestments',      src: 'bakBorç' },   // Hisse Senetleri
  '111': { field: 'shortTermInvestments',      src: 'bakBorç' },   // Özel Kesim Tahvil/Bono
  '118': { field: 'shortTermInvestments',      src: 'bakAlacak', negative: true }, // Menkul Kıymet Değer Düşüklüğü (-)
  '121': { field: 'tradeReceivables',          src: 'bakBorç'  }, // Alacak Senetleri → Ticari Alacaklar
  '126': { field: 'tradeReceivables',          src: 'bakBorç' },
  '136': { field: 'otherReceivables',          src: 'bakBorç' },
  '15':  { field: 'inventory',                 src: 'bakBorç' },   // Genel Stok Grubu (150-158)
  '220': { field: 'longTermTradeReceivables',  src: 'bakBorç' },   // Alıcılar (Uzun Vadeli)
  '221': { field: 'longTermTradeReceivables',  src: 'bakBorç' },   // Alacak Senetleri (Uzun Vadeli)
  '226': { field: 'longTermOtherReceivables',  src: 'bakBorç' },   // Verilen Depozito ve Teminatlar
  '231': { field: 'longTermOtherReceivables',  src: 'bakBorç' },   // Ortaklardan Alacaklar (Uzun Vadeli)
  '236': { field: 'longTermOtherReceivables',  src: 'bakBorç' },   // Diğer Çeşitli Alacaklar (Uzun Vadeli)
  '242': { field: 'longTermInvestments',       src: 'bakBorç' },   // İştirakler
  '243': { field: 'longTermInvestments',       src: 'bakBorç' },   // İştiraklere Sermaye Taahhütleri
  '245': { field: 'longTermInvestments',       src: 'bakBorç' },   // Bağlı Ortaklıklar
  '248': { field: 'longTermInvestments',       src: 'bakBorç' },   // Diğer Mali Duran Varlıklar
  '250': { field: 'tangibleAssets',            src: 'bakBorç' },   // Arazi ve Arsalar
  '252': { field: 'tangibleAssets',            src: 'bakBorç' },
  '253': { field: 'tangibleAssets',            src: 'bakBorç' },
  '254': { field: 'tangibleAssets',            src: 'bakBorç' },
  '255': { field: 'tangibleAssets',            src: 'bakBorç' },
  '260': { field: 'intangibleAssets',          src: 'bakBorç' },
  '261': { field: 'intangibleAssets',          src: 'bakBorç' },   // Şerefiye
  '264': { field: 'intangibleAssets',          src: 'bakBorç' },   // Özel Maliyetler
  '271': { field: 'intangibleAssets',          src: 'bakBorç' },   // Arama Giderleri
  '272': { field: 'intangibleAssets',          src: 'bakBorç' },   // Hazırlık ve Geliştirme Giderleri
  '280': { field: 'longTermPrepaidExpenses',   src: 'bakBorç' },

  // ── Pasif / Özkaynak ──────────────────────────
  '300': { field: 'shortTermFinancialDebt',    src: 'bakAlacak' },
  '301': { field: 'shortTermFinancialDebt',    src: 'bakAlacak' },
  '302': { field: 'shortTermFinancialDebt',    src: 'bakBorç', negative: true }, // Borç bakiye -> Debt'den düş (-)
  '309': { field: 'shortTermFinancialDebt',    src: 'bakAlacak' },
  '321': { field: 'tradePayables',             src: 'bakAlacak' },
  '326': { field: 'tradePayables',             src: 'bakAlacak' },
  '335': { field: 'otherShortTermPayables',    src: 'bakAlacak' },
  '336': { field: 'otherShortTermPayables',    src: 'bakAlacak' },
  '340': { field: 'advancesReceived',          src: 'bakAlacak' },
  '358': { field: 'constructionProgress',      src: 'bakAlacak' },
  '360': { field: 'taxPayables',               src: 'bakAlacak' },
  '361': { field: 'taxPayables',               src: 'bakAlacak' },
  '381': { field: 'deferredRevenue',           src: 'bakAlacak' },
  '400': { field: 'longTermFinancialDebt',     src: 'bakAlacak' },
  '401': { field: 'longTermFinancialDebt',     src: 'bakAlacak' },
  '402': { field: 'longTermFinancialDebt',     src: 'bakBorç', negative: true }, // Borç bakiye -> Long Term Debt'den düş (-)
  '420': { field: 'longTermFinancialDebt',     src: 'bakAlacak' },   // Çıkarılmış Tahviller
  '431': { field: 'longTermFinancialDebt',     src: 'bakAlacak' },   // Uzun Vadeli Diğer Finansal Borçlar
  '500': { field: 'paidInCapital',             src: 'bakAlacak' },
  '502': { field: 'paidInCapital',             src: 'bakAlacak' },
  '504': { field: 'paidInCapital',             src: 'bakBorç', negative: true }, // Ödenmemiş Sermaye (-)
  '540': { field: 'profitReserves',            src: 'bakAlacak' },   // Yasal Yedekler
  '541': { field: 'profitReserves',            src: 'bakAlacak' },   // Statü Yedekleri
  '542': { field: 'profitReserves',            src: 'bakAlacak' },   // Olağanüstü Yedekler
  '570': { field: 'retainedEarnings',          src: 'bakAlacak' },
  '580': { field: 'retainedLosses',            src: 'bakBorç' },     // Zarar kalemleri toplama eklenecek (UI eksi gösterir)

  // ── İhmal Edilecekler / Beyannameden Gelenler ──
  '159': { field: 'prepaidSuppliers',   src: 'bakBorç' }, // Verilen Sipariş Avansları → aktif
  '180': { field: 'prepaidExpenses',    src: 'bakBorç' },
  '190': { field: 'otherCurrentAssets', src: 'bakBorç' },
  '193': { field: 'otherCurrentAssets', src: 'bakBorç' },
  '191': { field: '_ignore', src: 'anyBorç' },
  '370': { field: '_ignore', src: 'anyAlacak' },
  '391': { field: '_ignore', src: 'anyAlacak' },
  '529': { field: 'capitalReserves', src: 'bakAlacak' }, // Sermaye Yedekleri (Dashboard Row 52)
  '590': { field: '_ignore', src: 'anyAlacak' },
  '591': { field: '_ignore', src: 'anyBorç' },
  '592': { field: '_ignore', src: 'anyBorç' },
  '6':   { field: '_ignore', src: 'anyBorç' }, // 600 ve sonrası beyannameden okunuyor
  '7':   { field: '_ignore', src: 'anyBorç' },
  '8':   { field: '_ignore', src: 'anyBorç' },
  '9':   { field: '_ignore', src: 'anyBorç' },
}

function detectMizanFormat(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i] as (string | null)[]
    for (const cell of row) {
      if (!cell) continue
      const s = String(cell)
      // findMizanHeader ile tutarlı: "mizan", "hesap kodu/no", bare "kod"/"no" sütunları
      if (
        /miz[ae]n/i.test(s) ||
        /hesap\s*kod/i.test(s) ||
        /hesap\s*no/i.test(s) ||
        /^kod$/i.test(s.trim()) ||
        /^no$/i.test(s.trim())
      ) return true
    }
  }
  return false
}

function findMizanHeader(rows: unknown[][]): { headerIdx: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] as (string | null)[]
    const rowStr = row.map(c => String(c || '').toLowerCase())
    // "hesap kodu" veya "kod" veya "no" içeren satırı başlık say
    const hasCodeCol = rowStr.some(s => /hesap\s*kod|^kod$|^no$|^hesap\s*no/i.test(s))
    if (!hasCodeCol) continue

    const cols: Record<string, number> = {}
    row.forEach((cell, idx) => {
      const s = String(cell || '').toLowerCase().trim()
      const orig = String(cell || '').trim()
      
      // Daha katı eşleşme kuralları
      if (/hesap\s*kod|^kod$|^no$|^hesap\s*no/i.test(s)) cols['code'] = idx
      
      // Hareket kolonları (Tam kelime eşleşmesi)
      if (/^borç$|^borc$|^debit$/i.test(s)) cols['borç'] = idx
      if (/^alacak$|^credit$/i.test(s)) cols['alacak'] = idx
      
      // Bakiye kolonları (İçinde bakiye/bak kelimesi geçmeli)
      if (/(bakiye|bak).*borç|borç.*(bakiye|bak)/i.test(s)) {
        cols['bakBorç'] = idx
      } else if (/^borç\s*bak/i.test(s)) {
        cols['bakBorç'] = idx
      }
      
      if (/(bakiye|bak).*alacak|alacak.*(bakiye|bak)/i.test(s)) {
        cols['bakAlacak'] = idx
      } else if (/^alacak\s*bak/i.test(s)) {
        cols['bakAlacak'] = idx
      }
    })
    
    // Güvenlik kontrolü: Eğer bakiye kolonları bulunamadıysa ama borç/alacak bulunduysa (bazı mizanlarda bakiye de borç/alacak diye geçer)
    // Sadece borç/alacak varsa ve bunlar son 2 kolonsa onları bakiye kabul et
    if (cols['bakBorç'] === undefined && cols['borç'] !== undefined) {
      if (cols['borç'] > 2) cols['bakBorç'] = cols['borç']
    }
    if (cols['bakAlacak'] === undefined && cols['alacak'] !== undefined) {
      if (cols['alacak'] > 2) cols['bakAlacak'] = cols['alacak']
    }
    // code varsa yeterli — borç/alacak yoksa bile devam et
    if ('code' in cols) return { headerIdx: i, cols }
  }
  return null
}

/** Dosya adından dönem bilgisi çıkar (tarih tespiti ANNUAL döndüğünde fallback). */
function periodFromFileName(fileName: string): string | null {
  const n = fileName
    .replace(/İ/g, 'i').replace(/I/g, 'i')
    .replace(/Ğ/g, 'g').replace(/Ş/g, 's')
    .replace(/Ö/g, 'o').replace(/Ü/g, 'u').replace(/Ç/g, 'c')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ş/g, 's').replace(/ö/g, 'o')
    .replace(/ü/g, 'u').replace(/ç/g, 'c')
  if (/(?:^|[^0-9])1[\s.]*donem|ocak[\s-]*mart/.test(n))    return 'Q1'
  if (/(?:^|[^0-9])2[\s.]*donem|ocak[\s-]*haziran/.test(n)) return 'Q2'
  if (/(?:^|[^0-9])3[\s.]*donem|ocak[\s-]*eylul/.test(n))   return 'Q3'
  if (/(?:^|[^0-9])4[\s.]*donem|ocak[\s-]*aralik/.test(n))  return 'Q4'
  return null
}

function extractMizanYear(rows: unknown[][], fileName?: string): { year: number | null; period: string } {
  const DATE_RANGE_RE = /(\d{2})[.\/-](\d{2})[.\/-](20\d{2})\s*[-–]\s*(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/

  // Pass 1: "Tarih Aralığı" keyword içeren satırda tarih ara.
  // Tarih; keyword ile aynı hücrede veya aynı satırın başka hücresinde olabilir.
  // hasTarihAraligi: keyword bulunduysa ama tarih aynı satırda yoksa Pass 2'ye geçilir —
  //   bu durumda endMonth=12 → Q4 (ANNUAL değil) kuralı yine de uygulanır.
  let hasTarihAraligi = false
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] as (string | null)[]
    const rowText = row.map(c => String(c || '')).join(' ')
    if (!/tarih\s*aral[iıİ][gğĞ][iıİ]/i.test(rowText)) continue
    hasTarihAraligi = true
    // Önce birleşik satır metninde (hücreler bitişik yazıldıysa), sonra hücre hücre ara
    const mFull = rowText.match(DATE_RANGE_RE)
    if (mFull) {
      const endMonth = parseInt(mFull[5])
      const endYear  = parseInt(mFull[6])
      const period = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'Q4'
      return { year: endYear, period }
    }
    for (const cell of row) {
      if (!cell) continue
      const m = String(cell).match(DATE_RANGE_RE)
      if (m) {
        const endMonth = parseInt(m[5])
        const endYear  = parseInt(m[6])
        const period = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'Q4'
        return { year: endYear, period }
      }
    }
  }

  // Pass 2: "Tarih Aralığı" satırında tarih bulunamadıysa veya keyword hiç yoksa
  // ilk date-range'i kullan.
  // endMonth=12: "Tarih Aralığı" keyword'ü görüldüyse Q4, görülmediyse ANNUAL.
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    for (const cell of rows[i] as (string | null)[]) {
      if (!cell) continue
      const s = String(cell)
      const m = s.match(DATE_RANGE_RE)
      if (m) {
        const endMonth = parseInt(m[5])
        const endYear  = parseInt(m[6])
        const period = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3'
          : (hasTarihAraligi ? 'Q4' : (fileName ? (periodFromFileName(fileName) ?? 'ANNUAL') : 'ANNUAL'))
        return { year: endYear, period }
      }
      // Tek yıl formatı: "2024" veya "01.01.2024"
      const m2 = s.match(/\b(20[12]\d)\b/)
      if (m2) {
        const y = parseInt(m2[1])
        const monthM = s.match(/(\d{2})[.\/-](\d{2})[.\/-]20[12]\d/)
        const endMonth = monthM ? parseInt(monthM[2]) : 12
        const period = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3'
          : (hasTarihAraligi ? 'Q4' : (fileName ? (periodFromFileName(fileName) ?? 'ANNUAL') : 'ANNUAL'))
        return { year: y, period }
      }
    }
  }
  return { year: null, period: fileName ? (periodFromFileName(fileName) ?? 'ANNUAL') : 'ANNUAL' }
}

// Ters bakiye split: alt hesap bazında farklı alana yönlendirme (DETAY MİZAN'da)
// Her alt hesap borç ve alacak bakiyesine göre AYRI alanlara yazılır.
// Net değer hesaplanmaz — borç kendi hedef field'ına, alacak kendi hedef field'ına gider.
// hesap prefix → { borçField: borç bakiyeli alt hesap buraya, alacakField: alacak bakiyeli alt hesap buraya }
const SPLIT_ACCOUNT_MAP: Record<string, { borçField: string; alacakField: string }> = {
  // 120 Alıcılar: bakBorç -> tradeReceivables, bakAlacak -> advancesReceived (pasife aktar)
  '120': { borçField: 'tradeReceivables',       alacakField: 'advancesReceived'       },
  // 320 Satıcılar: bakBorç -> prepaidSuppliers (Peşin ödenen ticari borç), bakAlacak -> tradePayables
  '320': { borçField: 'prepaidSuppliers',       alacakField: 'tradePayables'          },
  // 329 Diğer Ticari Borçlar: bakBorç -> prepaidSuppliers (ters bakiye → aktife), bakAlacak -> tradePayables
  '329': { borçField: 'prepaidSuppliers',        alacakField: 'tradePayables'          },
  // 331 Ortaklara Borçlar: bakBorç -> otherReceivables (aktife aktar), bakAlacak -> otherShortTermPayables
  '331': { borçField: 'otherReceivables',       alacakField: 'otherShortTermPayables' },
  // 131 Ortaklardan Alacaklar: bakBorç -> otherReceivables, bakAlacak -> otherShortTermPayables (pasife aktar)
  '131': { borçField: 'otherReceivables',       alacakField: 'otherShortTermPayables' },
}

export function parseMizanRows(rows: unknown[][], mizanTypeUsed: 'DETAY' | 'STANDART' = 'STANDART', fileName?: string): ParsedRow[] {
  const header = findMizanHeader(rows)
  if (!header) return []
  const { headerIdx, cols } = header
  const { year, period } = extractMizanYear(rows, fileName)
  console.log('[HEADER-COLS]', JSON.stringify(cols), 'headerRow:', rows[headerIdx]?.slice(0,10))

  const fields: Record<string, number | null> = {}
  let matchedRows = 0
  let ignoredRows = 0
  let zeroBalanceRows = 0
  let unmappedRows = 0
  const reverseBalanceWarnings: string[] = []
  const parseWarnings: string[] = [`mizanTypeUsed:${mizanTypeUsed}`]
  const exactParentMatched = new Set<string>()

  const fieldLog: Record<string, Array<{ code: string; val: number }>> = {}
  const addField = (fieldName: string, value: number | null, code = '') => {
    if (value === null || isNaN(value)) return
    fields[fieldName] = (fields[fieldName] || 0) + value
    if (!fieldLog[fieldName]) fieldLog[fieldName] = []
    fieldLog[fieldName].push({ code, val: value })
  }

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] as (string | number | null)[]
    const rawCode = row[cols['code'] ?? 0]
    if (!rawCode) continue
    const code = String(rawCode).trim()
    const normalizedCode = code.replace(/[^\d]/g, '')
    if (!normalizedCode) continue

    // ── IGNORE LİSTESİ ──────────────────
    // 153 (Stoklar) aktif olmalı, listeden çıkarıldı.
    const ignoreList = ['191', '370', '391', '590', '591', '592', '697', '710', '711', '720', '721', '730', '731', '900', '901']
    if (ignoreList.includes(normalizedCode) || /^[6789]/.test(normalizedCode)) {
      ignoredRows++
      continue
    }

    // Header tespiti sonrası doğru indekslerden değerleri oku
    const bVal = parseExcelNumber(cols['bakBorç']   !== undefined ? row[cols['bakBorç']]   : null) || 0
    const aVal = parseExcelNumber(cols['bakAlacak'] !== undefined ? row[cols['bakAlacak']] : null) || 0

    // Kritik hesap debug
    if (['120','131','159','340','529'].includes(normalizedCode)) {
      console.log(`[DEBUG-${normalizedCode}] bVal=${bVal} aVal=${aVal} raw=[${row.slice(0,10).join('|')}]`)
    }
    if (['100','101','102'].includes(normalizedCode)) {
      console.log('[KASA]', normalizedCode, 'bakBorç:', bVal, 'bakAlacak:', aVal)
    }

    if (bVal === 0 && aVal === 0) {
      zeroBalanceRows++
      continue
    }

    // ── SPLIT HESAPLAR (120, 320, 329, 331, 131) ───────────────
    const splitCandidate = normalizedCode.slice(0, 3)
    const splitDef = SPLIT_ACCOUNT_MAP[splitCandidate]
    if (splitDef) {
      // Detay hesapların (120.01 vb.) işlenmesine izin ver
      if (bVal > 0 && splitDef.borçField  !== '_ignore') addField(splitDef.borçField,  bVal, normalizedCode)
      if (aVal > 0 && splitDef.alacakField !== '_ignore') addField(splitDef.alacakField, aVal, normalizedCode)
      matchedRows++
      continue
    }

    // ── CONTRA HESAPLAR ─────────────
    let contraMatched = true
    switch (normalizedCode) {
      case '257': addField('tangibleAssets', -aVal, normalizedCode); break
      case '268': addField('intangibleAssets', -aVal, normalizedCode); break
      case '302': addField('shortTermFinancialDebt', -bVal, normalizedCode); break
      case '402': addField('longTermFinancialDebt', -bVal, normalizedCode); break
      case '580': addField('retainedLosses', bVal, normalizedCode); break
      default: contraMatched = false
    }
    if (contraMatched) { matchedRows++; continue }

    // ── NORMAL MAPPINGS ────────────────────
    let mappedField: string | null = null
    let negateVal = false
    let useAlacak = false

    const directMap = MIZAN_ACCOUNT_MAP[normalizedCode]
    if (directMap) {
      mappedField = directMap.field
      negateVal = !!directMap.negative
      useAlacak = directMap.src.includes('Alacak')
      if (normalizedCode.length <= 3) exactParentMatched.add(normalizedCode)
    } else {
      const prefixes = [normalizedCode.slice(0, 3), normalizedCode.slice(0, 2), normalizedCode.slice(0, 1)]
      for (const p of prefixes) {
        if (exactParentMatched.has(p)) break
        const pm = MIZAN_ACCOUNT_MAP[p]
        if (pm) {
          mappedField = pm.field
          negateVal = !!pm.negative
          useAlacak = pm.src.includes('Alacak')
          break
        }
      }
    }

    if (mappedField && mappedField !== '_ignore') {
      const code1 = normalizedCode[0]
      const val        = useAlacak ? aVal : bVal   // beklenen bakiye yönü
      const reverseVal = useAlacak ? bVal : aVal   // ters yön

      if (val !== 0) {
        // Normal bakiye — olduğu gibi yaz
        addField(mappedField, negateVal ? -val : val, normalizedCode)
        matchedRows++
      } else if (reverseVal !== 0) {
        // ── TERS BAKİYE — kural bazlı otomatik aktar ──────────────────────
        reverseBalanceWarnings.push(`${normalizedCode}: ters bakiye (${useAlacak ? 'bakBorç' : 'bakAlacak'}=${reverseVal}) → rerouted`)
        if (code1 === '1' || code1 === '2') {
          // Aktif hesap ters bakiye → kısa vadeli diğer borçlara aktar
          addField('otherShortTermPayables', reverseVal, normalizedCode)
          matchedRows++
        } else if (code1 === '3') {
          // KV pasif hesap ters bakiye → diğer dönen varlıklara aktar
          addField('otherCurrentAssets', reverseVal, normalizedCode)
          matchedRows++
        } else if (code1 === '4') {
          // UV pasif hesap ters bakiye → UV diğer alacaklara aktar
          addField('longTermOtherReceivables', reverseVal, normalizedCode)
          matchedRows++
        } else if (code1 === '5') {
          // Özkaynak ters bakiye → kendi field'ında eksi
          addField(mappedField, -reverseVal, normalizedCode)
          matchedRows++
        } else {
          unmappedRows++
        }
      }
    } else {
      unmappedRows++
    }
  }

  // 1. Dönen Varlıklar Toplamı
  fields['totalCurrentAssets'] = (fields['cash'] || 0) + (fields['tradeReceivables'] || 0) + (fields['inventory'] || 0) +
    (fields['prepaidSuppliers'] || 0) + (fields['prepaidExpenses'] || 0) + (fields['otherCurrentAssets'] || 0) + (fields['otherReceivables'] || 0)

  // 2. Duran Varlıklar Toplamı
  fields['totalNonCurrentAssets'] = (fields['tangibleAssets'] || 0) + (fields['intangibleAssets'] || 0) + 
    (fields['longTermPrepaidExpenses'] || 0) + (fields['longTermInvestments'] || 0)

  // 3. Aktif Toplam
  fields['totalAssets'] = (fields['totalCurrentAssets'] as number) + (fields['totalNonCurrentAssets'] as number)

  // 4. Kısa Vadeli Yabancı Kaynaklar Toplamı
  fields['totalCurrentLiabilities'] = (fields['shortTermFinancialDebt'] || 0) + (fields['tradePayables'] || 0) + 
    (fields['otherShortTermPayables'] || 0) + (fields['advancesReceived'] || 0) + (fields['taxPayables'] || 0) + 
    (fields['deferredRevenue'] || 0) + (fields['constructionProgress'] || 0) + (fields['otherCurrentLiabilities'] || 0)

  // 5. Uzun Vadeli Yabancı Kaynaklar Toplamı
  fields['totalNonCurrentLiabilities'] = (fields['longTermFinancialDebt'] || 0) + (fields['longTermTradePayables'] || 0) + 
    (fields['otherNonCurrentLiabilities'] || 0)

  // 6. Özkaynak Toplamı (Bilanço dengesi için)
  // ÖNEMLİ: netProfitCurrentYear (Row 59) bu toplama DAHİL EDİLMEMEKTEDİR.
  // Çünkü dashboard UI bu alanı toplam Pasif'e kendisi ekleyerek görsel dengeyi kurar.
  fields['totalEquity'] = (fields['paidInCapital'] || 0) + 
    (fields['capitalReserves'] || 0) + 
    (fields['profitReserves'] || 0) + 
    (fields['equityOther'] || 0) + 
    (fields['retainedEarnings'] || 0) - 
    Math.abs(fields['retainedLosses'] || 0)

  // 7. Pasif Toplamı
  fields['totalLiabilitiesAndEquity'] = (fields['totalCurrentLiabilities'] as number) + 
    (fields['totalNonCurrentLiabilities'] as number) + (fields['totalEquity'] as number)
  if (Object.keys(fields).length < 3) {
    console.warn('[mizan] < 3 alan bulundu, boş döndürülüyor')
    return []
  }

  // Debug Console Logs
  console.log('=== Mizan Parse Sonuçları (Debug) ===')
  const activeFields = ['cash','tradeReceivables','otherReceivables','inventory','prepaidExpenses','otherCurrentAssets',
    'totalCurrentAssets','tangibleAssets','intangibleAssets','longTermPrepaidExpenses','longTermInvestments','totalNonCurrentAssets','totalAssets']
  const passiveFields = ['shortTermFinancialDebt','tradePayables','advancesReceived','otherShortTermPayables',
    'taxPayables','deferredRevenue','constructionProgress','otherCurrentLiabilities','totalCurrentLiabilities',
    'longTermFinancialDebt','longTermTradePayables','otherNonCurrentLiabilities','totalNonCurrentLiabilities',
    'paidInCapital','capitalReserves','profitReserves','equityOther','retainedEarnings','retainedLosses','totalEquity','totalLiabilitiesAndEquity']
  console.log('[TOPLAM KASA]', fields.cash)
  console.log('--- AKTİF ---')
  for (const f of activeFields) if (fields[f]) console.log(`  ${f}: ${fields[f]}`)
  console.log('--- PASİF ---')
  for (const f of passiveFields) if (fields[f]) console.log(`  ${f}: ${fields[f]}`)
  console.log('--- HESAP KAYNAKLARI (inventory/tradeRec/otherRec/advRec) ---')
  for (const f of ['inventory','tradeReceivables','otherReceivables','advancesReceived','prepaidSuppliers']) {
    if (fieldLog[f]?.length) console.log(`  ${f}:`, fieldLog[f].map(e => `${e.code}=${Math.round(e.val)}`).join(', '))
  }
  console.log('=====================================')

  const metaBase = {
    path: 'mizan' as const,
    totalRows: Math.max(rows.length - (headerIdx + 1), 0),
    matchedRows,
    ignoredRows,
    zeroBalanceRows,
    unmappedRows,
    reverseBalanceWarnings,
    parseWarnings,
    mizanTypeUsed,
  }

  return [{
    year: year ?? undefined,
    period,
    fields,
    unmapped: [],
    docType: 'excel' as DocType,
    meta: {
      ...metaBase,
      confidence: calcConfidence(metaBase),
    },
  }]
}

// ─── parseExcelBuffer ─────────────────────────────────────────────────────────

// ─── GELİRTABLOSU sheet parser ────────────────────────────────────────────────
/**
 * "gelir" + "tablo" içeren sheet'ten yalnızca gelir tablosu alanlarını okur.
 * Dikey (çok yıllı) veya yatay (çok dönemli) formatı destekler.
 * Bilanço alanları görmezden gelinir.
 */
function parseGelirTablosuSheet(rows: unknown[][]): ParsedRow[] {
  if (rows.length < 2) return []

  // Dikey format (başlık satırında birden fazla yıl)
  if (detectVerticalFormat(rows)) {
    return parseVerticalExcel(rows).map(r => ({
      ...r,
      fields: Object.fromEntries(Object.entries(r.fields).filter(([k]) => INCOME_FIELDS.has(k))),
      docType: 'excel-gt' as DocType,
    })).filter(r => Object.keys(r.fields).length > 0)
  }

  // Yatay format (COLUMN_MAP ile — satır=dönem, sütun=alan)
  const headerRow = rows[0] as (string | null)[]
  const results: ParsedRow[] = []

  for (const rawRow of rows.slice(1)) {
    const row = rawRow as (string | number | null)[]
    if (!row || row.every(c => c == null || c === '')) continue

    const fields: Record<string, number | null> = {}
    let year: number | undefined
    let period: string | undefined

    headerRow.forEach((header, i) => {
      if (!header) return
      const normalised = String(header).trim().toLowerCase()
      const value = row[i]
      if (normalised === 'yıl' || normalised === 'year') { year = value != null ? Number(value) : undefined; return }
      if (normalised === 'dönem' || normalised === 'period') { period = value != null ? String(value).toUpperCase() : undefined; return }
      const mapped = COLUMN_MAP[normalised]
      if (mapped && INCOME_FIELDS.has(mapped)) fields[mapped] = parseExcelNumber(value)
    })

    if (Object.keys(fields).length > 0) {
      results.push({ year, period: period ?? 'ANNUAL', fields, unmapped: [], docType: 'excel-gt' })
    }
  }
  return results
}

/**
 * GELİRTABLOSU sheet gelir alanlarını mizan bilanço alanları üzerine ekler.
 *
 * DAVRANIŞLAR:
 *  1. GT dönem = mizan dönem  → GT income overlay, mizan balance korunur → 'excel-gt'
 *  2. GT yok / o dönem GT'de yok → mizan income (6xx) kullanılır → 'excel-mizan'
 *  3. GT'de dönem var ama mizanda yok → GT income + boş balance → 'excel-gt'
 *     meta.warnings.gtOnlyPeriod = true, meta.sources.balanceSheet = null
 */
function mergeGtWithMizan(mizanRows: ParsedRow[], gtRows: ParsedRow[]): ParsedRow[] {
  // 1. Mizan satırlarına GT income overlay et (eşleşen dönem varsa) — MEVCUT MANTIK KORUNDU
  const merged: ParsedRow[] = mizanRows.map(mizanRow => {
    const gtRow = gtRows.find(r =>
      r.year === mizanRow.year &&
      (r.period ?? 'ANNUAL') === (mizanRow.period ?? 'ANNUAL')
    )
    if (!gtRow || Object.keys(gtRow.fields).length === 0) {
      // GT eşleşmesi yok → mizan income kullanılır
      return { ...mizanRow, docType: 'excel-mizan' as DocType }
    }
    return {
      ...mizanRow,
      fields: { ...mizanRow.fields, ...gtRow.fields }, // GT income, mizan balance
      docType: 'excel-gt' as DocType,
    }
  })

  // 2. GT-only dönemler: mizanda karşılığı olmayan GT satırları
  // Mizan dönemlerini Set'e al (year_period anahtarı)
  const mizanPeriodKeys = new Set(
    mizanRows.map(r => `${r.year}_${r.period ?? 'ANNUAL'}`)
  )

  for (const gtRow of gtRows) {
    const key = `${gtRow.year}_${gtRow.period ?? 'ANNUAL'}`
    if (mizanPeriodKeys.has(key)) continue // eşleşen dönem — zaten merged'de var

    // Sadece GT income'ı var, bilanço yok → uyarılı satır oluştur
    const gtOnlyRow: ParsedRow = {
      year:    gtRow.year,
      period:  gtRow.period ?? 'ANNUAL',
      fields:  { ...gtRow.fields }, // yalnızca income alanları (GT'den)
      unmapped: gtRow.unmapped ?? [],
      docType: 'excel-gt' as DocType,
      meta: {
        path:                  'vertical',
        totalRows:             0,
        matchedRows:           Object.keys(gtRow.fields).length,
        ignoredRows:           0,
        zeroBalanceRows:       0,
        unmappedRows:          0,
        reverseBalanceWarnings: [],
        parseWarnings:         [],
        sources: {
          incomeStatement: 'ExcelGT',
          balanceSheet:    null,
        },
        confidence: 0.5, // bilanço olmadığı için düşük güven
      },
    }
    merged.push(gtOnlyRow)
  }

  return merged
}

export function parseExcelBuffer(buffer: Buffer, fileName?: string): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })

  // Türkçe-safe sheet adı normalize fonksiyonu
  // NOT: Türkçe İ/ı harfleri JavaScript regex'te case-insensitive eşleşmez
  //   (İ.toLowerCase() = 'i̇' combining dot). Bu yüzden normalizasyon gerekli.
  const normalizeTR = (s: string) => s
    .replace(/İ/g, 'i').replace(/I/g, 'i')
    .replace(/Ğ/g, 'g').replace(/Ş/g, 's')
    .replace(/Ö/g, 'o').replace(/Ü/g, 'u').replace(/Ç/g, 'c')
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ş/g, 's').replace(/ö/g, 'o')
    .replace(/ü/g, 'u').replace(/ç/g, 'c')

  // ── GELİRTABLOSU sheet tespiti (beyanname yoksa income fallback 1) ───────────
  // "gelir" + "tablo" içeren sheet varsa GELİRTABLOSU sheet olarak işaretlenir.
  // Beyanname yoksa mizan 6xx yerine bu sheet'ten gelir tablosu okunur.
  let gtSheetName: string | null = null
  for (const name of workbook.SheetNames) {
    const norm = normalizeTR(name)
    if (/gelir/.test(norm) && /tablo/.test(norm)) {
      gtSheetName = name
      break
    }
  }

  // ── MİZAN sheet seçim önceliği ────────────────────────────────────────────────
  // Öncelik sırası:
  //   1. "mizan" içeren ama "detay" İÇERMEYEN sheet → STANDART MİZAN (sadece 3-hane ana hesaplar)
  //   2. "detay" + "mizan" içeren sheet → DETAY MİZAN (hiyerarşik, double-count riski var)
  //   3. "detay" içeren herhangi sheet (içerik doğrulaması ile)
  //   4. SheetNames[0] fallback
  //
  // STANDART MİZAN tercih edilir çünkü:
  //   - Sadece 3-haneli ana hesap kodları içerir
  //   - Parent-child çift sayım (double count) riski yoktur
  //   - DETAY MİZAN'da 100 (parent) + 100.01 (ara grup) + 100.01.01 (yaprak)
  //     hepsinin toplamı alınırsa değerler 2x-3x şişer
  let sheetName = workbook.SheetNames[0]
  let mizanTypeUsed: 'DETAY' | 'STANDART' = 'STANDART'

  console.info('[excel] tüm sheet isimleri:', workbook.SheetNames)

  // Geçiş 1: adında "mizan" geçen AMA "detay" GEÇMEyen sheet → STANDART MİZAN (öncelikli)
  let foundStandard = false
  for (const name of workbook.SheetNames) {
    if (name === gtSheetName) continue
    const norm = normalizeTR(name)
    if (/miz[ae]n/.test(norm) && !/detay/.test(norm)) {
      // İçerik doğrulaması: gerçekten mizan formatında mı?
      const candidateWs = workbook.Sheets[name]
      const candidateRows = XLSX.utils.sheet_to_json(candidateWs, { header: 1, defval: null }) as unknown[][]
      if (detectMizanFormat(candidateRows)) {
        sheetName = name
        mizanTypeUsed = 'STANDART'
        foundStandard = true
        console.info('[excel] STANDART MİZAN sheet seçildi (detay değil):', name)
        break
      }
    }
  }

  // Geçiş 2: STANDART bulunamazsa → adında hem "detay" hem "mizan" geçen sheet
  if (!foundStandard) {
    for (const name of workbook.SheetNames) {
      if (name === gtSheetName) continue
      const norm = normalizeTR(name)
      if (/detay/.test(norm) && /miz[ae]n/.test(norm)) {
        sheetName = name
        mizanTypeUsed = 'DETAY'
        console.info('[excel] DETAY MİZAN sheet (fallback isim eşleşmesi):', name)
        foundStandard = true
        break
      }
    }
  }

  // Geçiş 3: hâlâ bulunamadıysa → adında sadece "detay" geçen sheet, içerik doğrulaması ile
  if (!foundStandard) {
    for (const name of workbook.SheetNames) {
      if (name === gtSheetName) continue
      const norm = normalizeTR(name)
      if (/detay/.test(norm)) {
        const candidateWs = workbook.Sheets[name]
        const candidateRows = XLSX.utils.sheet_to_json(candidateWs, { header: 1, defval: null }) as unknown[][]
        if (detectMizanFormat(candidateRows)) {
          sheetName = name
          mizanTypeUsed = 'DETAY'
          console.info('[excel] DETAY sheet mizan olarak doğrulandı (fallback):', name)
        } else {
          console.warn('[excel] "detay" sheet mizan değil, atlandı:', name)
        }
        break
      }
    }
  }

  const ws = workbook.Sheets[sheetName]
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

  if (rows.length < 2) return []

  // Dikey format tespiti ÖNCE: başlık satırında birden fazla yıl sütunu varsa dikey formattır.
  // Mizan tespitinden önce yapılmalı — çünkü çok yıllı tablolar "HESAP KODU" içerse de
  // mizan değil dikey tablodur.
  if (detectVerticalFormat(rows)) {
    console.info('[excel] parse path: vertical', { sheetName, gtSheetName, rowCount: rows.length })
    const result = parseVerticalExcel(rows)
    if (result.length === 0) console.warn('[excel] vertical parse boş sonuç üretti', { sheetName, rowCount: rows.length })
    // Dikey format için de GT sheet overlay mümkün
    if (gtSheetName && result.length > 0) {
      const gtRows = parseGelirTablosuSheet(
        XLSX.utils.sheet_to_json(workbook.Sheets[gtSheetName], { header: 1, defval: null }) as unknown[][]
      )
      if (gtRows.length > 0) return mergeGtWithMizan(result, gtRows)
    }
    return result
  }

  // Mizan tespiti (tek dönem, Tek Düzen Hesap Planı)
  if (detectMizanFormat(rows)) {
    console.info('[excel] parse path: mizan', { sheetName, mizanTypeUsed, gtSheetName, rowCount: rows.length })
    const mizanResult = parseMizanRows(rows, mizanTypeUsed, fileName)
      .map(r => ({ ...r, docType: 'excel-mizan' as DocType }))
    if (mizanResult.length === 0) console.warn('[excel] mizan parse boş sonuç üretti', { sheetName, rowCount: rows.length })

    // GELİRTABLOSU sheet varsa income alanlarını mizan'ın üzerine overlay et
    if (gtSheetName && mizanResult.length > 0) {
      const gtRows = parseGelirTablosuSheet(
        XLSX.utils.sheet_to_json(workbook.Sheets[gtSheetName], { header: 1, defval: null }) as unknown[][]
      )
      if (gtRows.length > 0) {
        console.info('[excel] GT sheet overlay uygulandı', { gtSheetName, gtRows: gtRows.length })
        return mergeGtWithMizan(mizanResult, gtRows)
      }
    }
    return mizanResult
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
      docType: 'excel' as DocType,
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
