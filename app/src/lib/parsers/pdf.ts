/**
 * PDF parser — GVB (Gelir Vergisi Beyannamesi) ve KVB (Kurumlar Vergisi Beyannamesi)
 * Tüm karşılaştırmalar norm() ile yapılır; Türkçe string literal kullanılmaz.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')
import type { ParsedRow } from './excel'

// ─── norm ─────────────────────────────────────────────────────────────────────

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

// ─── Sayı ayrıştırma ──────────────────────────────────────────────────────────

// Türk formatı: 1.234.567,89
const TR_NUM  = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g
const ANY_NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g

function parseTR(s: string): number | null {
  if (!s) return null
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function firstNum(line: string): number | null {
  const m = line.match(ANY_NUM)
  return m ? parseTR(m[0]) : null
}

function twoNums(line: string): [number | null, number | null] {
  const m = line.match(ANY_NUM)
  if (!m) return [null, null]
  return [parseTR(m[0]), m[1] ? parseTR(m[1]) : null]
}

// ─── Yıl / Dönem tespiti ──────────────────────────────────────────────────────

function extractYearPeriod(text: string): { year: number | null; period: string } {
  let year: number | null = null

  // "Yılı 2025" veya "Yıl 2024" gibi
  const ym = text.match(/y[iı]l[iı]?\s+(20[12]\d)/i)
  if (ym) year = parseInt(ym[1])

  if (!year) {
    const lines = text.split('\n')
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      if (norm(lines[i]).includes('yil')) {
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const m = lines[j].match(/\b(20[12]\d)\b/)
          if (m) { year = parseInt(m[1]); break }
        }
        if (year) break
      }
    }
  }
  if (!year) {
    const m = text.match(/\b(20[12]\d)\b/)
    if (m) year = parseInt(m[1])
  }

  const top800 = norm(text.slice(0, 800))
  let period = 'ANNUAL'
  if      (/4\.\s*donem/.test(top800)) period = 'Q4'
  else if (/3\.\s*donem/.test(top800)) period = 'Q3'
  else if (/2\.\s*donem/.test(top800)) period = 'Q2'
  else if (/1\.\s*donem/.test(top800)) period = 'Q1'

  return { year, period }
}

// ─── Beyanname tipi tespiti ───────────────────────────────────────────────────

type BType = 'gelir_yillik' | 'gelir_gecici' | 'kurumlar_yillik' | 'kurumlar_gecici' | 'unknown'

function detectType(text: string): BType {
  const n = norm(text.slice(0, 900))
  if (n.includes('kurumlar vergisi beyannamesi'))                                         return 'kurumlar_yillik'
  if (n.includes('gecici vergi beyannamesi') && n.includes('kurumlar vergisi mukellefleri')) return 'kurumlar_gecici'
  if (n.includes('yillik gelir vergisi beyannamesi'))                                     return 'gelir_yillik'
  if (n.includes('gecici vergi beyannamesi') && n.includes('gelir vergisi mukellefleri')) return 'gelir_gecici'
  return 'unknown'
}

// ─── Gelir tablosu satır eşlemesi ────────────────────────────────────────────
// Tüm pattern'lar norm edilmiş

const INCOME_MAP: [string, string, boolean?][] = [
  ['net satislar',             'revenue'],
  ['satis hasilati',           'revenue'],
  ['brut satislar hasilati',   'revenue'],
  ['satislarin maliyeti',      'cogs'],
  ['brut satis kari',          'grossProfit'],
  ['faaliyet giderleri',       'operatingExpenses'],
  ['faaliyet kari',            'ebit'],
  ['diger olagan gelir',       'otherIncome'],
  ['diger olagan gider',       'otherExpense'],
  ['finansman giderleri',      'interestExpense'],
  ['faiz giderleri',           'interestExpense'],
  ['olagandisi gelir',         'extraordinaryIncome'],
  ['olagandisi gider',         'extraordinaryExpense'],
  ['olagan kar',               'ebt'],
  ['donem kari veya zarari',   'ebt'],
  ['donem net kari',           'netProfit'],
  ['donem net zarari',         'netProfit'],
  ['net kar veya zarar',       'netProfit'],
  ['net kar',                  'netProfit'],
  ['vergi gideri',             'taxExpense'],
]

function matchIncomeLine(label: string): { field: string; negate: boolean } | null {
  const n = norm(label)
  for (const [pat, field, negate] of INCOME_MAP) {
    if (n.includes(pat)) return { field, negate: !!negate }
  }
  return null
}

// ─── Bilanço bölüm tespiti ────────────────────────────────────────────────────

type EkSection = 'donen' | 'duran' | 'kv' | 'uv' | 'oz' | 'gelir' | null

function detectEkSection(line: string): EkSection | null {
  const n = norm(line)
  // [\s.\-] — nokta, boşluk veya tire ile ayrılmış (KVB PDF çeşitleri)
  if (/^i[\s.\-]\s*donen\s*varlik/.test(n))  return 'donen'
  if (/^ii[\s.\-]\s*duran\s*varlik/.test(n)) return 'duran'
  if (/^iii[\s.\-]\s*kisa\s*vadeli/.test(n)) return 'kv'
  if (/^iv[\s.\-]\s*uzun\s*vadeli/.test(n))  return 'uv'
  if (/^v[\s.\-]\s*oz\s*(kaynak|serma)/.test(n)) return 'oz'
  // Bilanço bölüm etiketleri olmadan sadece "dönen varlıklar" geçen satırlar
  if (/donen\s*varlik/.test(n) && !/toplam/.test(n) && n.length < 60) return 'donen'
  if (/duran\s*varlik/.test(n) && !/toplam/.test(n) && n.length < 60) return 'duran'
  if (/kisa\s*vadeli\s*yabanci/.test(n) && !/toplam/.test(n))         return 'kv'
  if (/uzun\s*vadeli\s*yabanci/.test(n) && !/toplam/.test(n))         return 'uv'
  if (/oz\s*kaynak/.test(n) && !/toplam/.test(n) && n.length < 60)    return 'oz'
  if (n.includes('gelir tablosu'))          return 'gelir'
  return null
}

function matchBilField(label: string, sec: EkSection): string | null {
  const n = norm(label)
  // KVB PDF'lerinde hem "A." hem "A-" hem "A " prefix'i kullanılabilir
  // ^a[\s.\-] tüm varyantları yakalar
  const PFXA = /^a[\s.\-]\s*/
  const PFXB = /^b[\s.\-]\s*/
  const PFXC = /^c[\s.\-]\s*/
  const PFXD = /^d[\s.\-]\s*/
  const PFXE = /^e[\s.\-]\s*/
  const PFXF = /^f[\s.\-]\s*/
  const PFXG = /^g[\s.\-]\s*/
  const PFXH = /^h[\s.\-]\s*/
  const PFXI = /^i[\s.\-]\s*/

  if (sec === 'donen') {
    if (PFXA.test(n) && /hazir/.test(n))          return 'cash'
    if (PFXB.test(n) && /menkul/.test(n))          return 'shortTermInvestments'
    if (PFXC.test(n) && /ticari\s*alacak/.test(n)) return 'tradeReceivables'
    if (PFXD.test(n) && /diger\s*alacak/.test(n))  return 'otherReceivables'
    if (PFXE.test(n) && /stoklar/.test(n))         return 'inventory'
    if (PFXF.test(n) && /yillara\s*yaygin/.test(n)) return 'constructionCosts'
    if (PFXG.test(n) && /gelecek\s*ay/.test(n))    return 'prepaidExpenses'
    if (PFXH.test(n) && /diger\s*donen/.test(n))   return 'otherCurrentAssets'
    if (n.includes('hazir deger') || n.includes('nakit')) return 'cash'
    if (n.includes('ticari alacak'))        return 'tradeReceivables'
    if (n.includes('stoklar'))              return 'inventory'
    if (n.includes('diger alacak'))         return 'otherReceivables'
    if (n.includes('diger donen'))          return 'otherCurrentAssets'
    if (n.includes('gelecek ay') && n.includes('gider')) return 'prepaidExpenses'
  }

  if (sec === 'duran') {
    if (PFXA.test(n) && /ticari\s*alacak/.test(n)) return 'longTermTradeReceivables'
    if (PFXB.test(n) && /diger\s*alacak/.test(n))  return 'longTermOtherReceivables'
    if (PFXC.test(n) && /mali\s*duran/.test(n))    return 'longTermInvestments'
    if (PFXD.test(n) && /maddi\s*duran/.test(n))   return 'tangibleAssets'
    if (PFXE.test(n) && /maddi\s*olmayan/.test(n)) return 'intangibleAssets'
    if (PFXF.test(n) && /ozel\s*tukenmeye/.test(n)) return 'depletableAssets'
    if (PFXG.test(n) && /gelecek\s*yil/.test(n))   return 'longTermPrepaidExpenses'
    if (PFXH.test(n) && /diger\s*duran/.test(n))   return 'otherNonCurrentAssets'
    if (n.includes('maddi duran'))    return 'tangibleAssets'
    if (n.includes('maddi olmayan'))  return 'intangibleAssets'
    if (n.includes('mali duran'))     return 'longTermInvestments'
    if (n.includes('gelecek yil') && n.includes('gider')) return 'longTermPrepaidExpenses'
    if (n.includes('diger duran'))    return 'otherNonCurrentAssets'
  }

  if (sec === 'kv') {
    if (PFXA.test(n) && /mali\s*bor/.test(n))         return 'shortTermFinancialDebt'
    if (PFXB.test(n) && /ticari\s*bor/.test(n))        return 'tradePayables'
    if (PFXC.test(n) && /diger\s*bor/.test(n))         return 'otherShortTermPayables'
    if (PFXD.test(n) && /alinan\s*avans/.test(n))      return 'advancesReceived'
    if (PFXE.test(n) && /yillara\s*yaygin/.test(n))    return 'constructionProgress'
    if (PFXF.test(n) && /odenecek\s*vergi/.test(n))    return 'taxPayables'
    if (PFXG.test(n) && /bor.?\s*ve\s*gider/.test(n))  return 'shortTermProvisions'
    if (PFXH.test(n) && /gelecek\s*ay.*gelir/.test(n)) return 'deferredRevenue'
    if (PFXI.test(n) && /diger/.test(n))               return 'otherCurrentLiabilities'
    if (n.includes('mali bor'))           return 'shortTermFinancialDebt'
    if (n.includes('ticari bor') && !n.includes('uzun')) return 'tradePayables'
    if (n.includes('diger bor') && !n.includes('uzun'))  return 'otherShortTermPayables'
    if (n.includes('alinan avans') && !n.includes('uzun')) return 'advancesReceived'
    if (n.includes('odenecek vergi'))     return 'taxPayables'
    if (n.includes('gelecek ay') && n.includes('gelir')) return 'deferredRevenue'
  }

  if (sec === 'uv') {
    if (PFXA.test(n) && /mali\s*bor/.test(n))        return 'longTermFinancialDebt'
    if (PFXB.test(n) && /ticari\s*bor/.test(n))       return 'longTermTradePayables'
    if (PFXC.test(n) && /diger\s*bor/.test(n))        return 'longTermOtherPayables'
    if (PFXD.test(n) && /alinan\s*avans/.test(n))     return 'longTermAdvancesReceived'
    if (PFXG.test(n) && /bor.?\s*ve\s*gider/.test(n)) return 'longTermProvisions'
    if (PFXI.test(n) && /diger/.test(n))              return 'otherNonCurrentLiabilities'
    if (n.includes('mali bor'))          return 'longTermFinancialDebt'
    if (n.includes('diger bor'))         return 'longTermOtherPayables'
    if (n.includes('alinan avans'))      return 'longTermAdvancesReceived'
  }

  if (sec === 'oz') {
    if (PFXA.test(n) && /odenmis\s*sermaye/.test(n))    return 'paidInCapital'
    if (PFXB.test(n) && /sermaye\s*yedeg/.test(n))      return 'capitalReserves'
    if (PFXC.test(n) && /kar\s*yedeg/.test(n))          return 'profitReserves'
    if (PFXD.test(n) && /gecmis\s*yil.*kar/.test(n))    return 'retainedEarnings'
    if (PFXE.test(n) && /gecmis\s*yil.*zarar/.test(n))  return 'retainedLosses'
    if (PFXF.test(n) && /donem\s*net\s*kar/.test(n))    return 'netProfitCurrentYear'
    if (n.includes('odenmis sermaye'))   return 'paidInCapital'
    if (n.includes('sermaye yedeg'))     return 'capitalReserves'
    if (n.includes('kar yedeg'))         return 'profitReserves'
    if (n.includes('gecmis yil') && n.includes('kar'))   return 'retainedEarnings'
    if (n.includes('gecmis yil') && n.includes('zarar')) return 'retainedLosses'
    if (n.includes('donem net kar'))     return 'netProfitCurrentYear'
  }

  // Global gelir tablosu
  const im = matchIncomeLine(label)
  if (im) return im.field

  // Global bilanço toplamları
  if (n.includes('donen varlik') && n.includes('toplam'))   return 'totalCurrentAssets'
  if (n.includes('duran varlik') && n.includes('toplam'))   return 'totalNonCurrentAssets'
  if (n.includes('aktif toplam') || n.includes('toplam aktif')) return 'totalAssets'
  if (n.includes('kisa vadeli') && n.includes('toplam'))    return 'totalCurrentLiabilities'
  if (n.includes('uzun vadeli') && n.includes('toplam'))    return 'totalNonCurrentLiabilities'
  if ((n.includes('oz kaynak') || n.includes('oz serma')) && n.includes('toplam')) return 'totalEquity'
  if (n.includes('pasif toplam') || n.includes('toplam pasif')) return 'totalLiabilitiesAndEquity'

  return null
}

// ─── EK bölüm parser ─────────────────────────────────────────────────────────

function parseEkSection(section: string): { cari: Record<string, number>; onceki: Record<string, number> } {
  const cari:   Record<string, number> = {}
  const onceki: Record<string, number> = {}
  let sec: EkSection = null

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.length < 3) continue

    const detected = detectEkSection(line)
    if (detected !== null) sec = detected

    const nums = line.match(TR_NUM)
    if (!nums) continue

    const label = line.replace(TR_NUM, '').replace(/\(-\)/g, '').replace(/\s+/g, ' ').trim()
    if (!label || label.length < 3) continue

    const field = matchBilField(label, sec)
    if (!field) continue

    const [v1, v2] = twoNums(line)
    // Gelir tablosu satırlarında 100 TL'den küçük değerler form artefaktı
    // (satır numaraları, sıfır alanlar) — yoksay
    const minAbs = sec === 'gelir' ? 100 : 0
    if (v1 !== null && Math.abs(v1) >= minAbs && !(field in cari))   cari[field]   = v1
    if (v2 !== null && Math.abs(v2) >= minAbs && !(field in onceki)) onceki[field] = v2
  }

  return { cari, onceki }
}

// ─── Vergi formu temel alanlar ────────────────────────────────────────────────

function parseTaxForm(text: string): Record<string, number | null> {
  const fields: Record<string, number | null> = {}

  for (const line of text.split('\n')) {
    const t  = line.trim()
    const nt = norm(t)
    if (!t) continue

    if (nt.includes('ticari bilanco kari') && !('ebt' in fields)) {
      const v = firstNum(t); if (v != null && v > 0) fields['ebt'] = v
    }
    if (nt.includes('donem safi kurum kazanc') && !('ebt' in fields)) {
      const v = firstNum(t); if (v != null) fields['ebt'] = v
    }
    if ((nt.includes('kurumlar vergisi matrah') || nt.includes('gecici vergi matrah')) && !('ebt' in fields)) {
      const v = firstNum(t); if (v != null) fields['ebt'] = v
    }
    if ((nt.includes('hesaplanan kurumlar vergisi') || nt.includes('hesaplanan gecici vergi')) && !('taxExpense' in fields)) {
      const v = firstNum(t); if (v != null) fields['taxExpense'] = v
    }
    if (nt.includes('ticari kazanc') && !('ebt' in fields)) {
      const v = firstNum(t); if (v != null && v > 0) fields['ebt'] = v
    }
    if ((nt.includes('brut satis') || nt.includes('brut kazanc')) && nt.includes('tutar') && !('revenue' in fields)) {
      const v = firstNum(t); if (v != null) fields['revenue'] = v
    }
  }

  // Multiline fallback
  const nt = norm(text)
  if (!('ebt' in fields)) {
    const m = nt.match(/ticari bilanco kari[^0-9]{0,200}?(\d{1,3}(?:\.\d{3})*,\d{2})/)
    if (m) {
      // index aynı, orijinal text'ten parse et
      const idx = nt.indexOf(m[0])
      const orig = text.slice(idx, idx + m[0].length)
      const v = parseTR(orig.match(/\d{1,3}(?:\.\d{3})*,\d{2}/)?.[0] ?? '')
      if (v != null && v > 0) fields['ebt'] = v
    }
  }
  if (!('taxExpense' in fields)) {
    const m = nt.match(/hesaplanan\s*(?:kurumlar|gecici)\s*vergi[^0-9]{0,150}?(\d{1,3}(?:\.\d{3})*,\d{2})/)
    if (m) {
      const idx = nt.indexOf(m[0])
      const orig = text.slice(idx, idx + m[0].length)
      const v = parseTR(orig.match(/\d{1,3}(?:\.\d{3})*,\d{2}/)?.[0] ?? '')
      if (v != null) fields['taxExpense'] = v
    }
  }

  return fields
}

// ─── PDF Mizan tespiti & parser ───────────────────────────────────────────────

function detectPdfMizan(text: string): boolean {
  const n = norm(text.slice(0, 4000))
  return n.includes('mizan') && (n.includes('hesap kod') || /aciklama.*bor.*alacak/.test(n))
}

function parsePdfMizan(text: string): ParsedRow[] {
  const dateMatch = text.match(
    /(\d{2})[.\/-](\d{2})[.\/-](20\d{2})(?:\s*[-\u2013\u2014]\s*|\s+)(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/
  )
  if (!dateMatch) return []

  const endMonth = parseInt(dateMatch[5])
  const year     = parseInt(dateMatch[6])
  const period   = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'Q4'

  const fields: Record<string, number | null> = {}

  const dataStartIdx = norm(text).indexOf('hesap kodu')
  const lines = text.slice(dataStartIdx > 0 ? dataStartIdx : 0).split('\n')

  const CODE_MAP: Record<string, string> = {
    '100': 'cash', '101': 'cash', '102': 'cash',
    '120': 'tradeReceivables', '121': 'tradeReceivables',
    '150': 'inventory', '151': 'inventory', '153': 'inventory',
    '252': 'tangibleAssets', '253': 'tangibleAssets', '254': 'tangibleAssets', '255': 'tangibleAssets',
    '260': 'intangibleAssets',
    '300': 'shortTermFinancialDebt', '301': 'shortTermFinancialDebt',
    '320': 'tradePayables', '321': 'tradePayables',
    '400': 'longTermFinancialDebt', '401': 'longTermFinancialDebt',
    '500': 'paidInCapital', '570': 'retainedEarnings',
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = line.match(/^(\d{3})\b/)
    if (!m) continue
    const field = CODE_MAP[m[1]]
    if (!field || field in fields) continue
    const v = firstNum(line.slice(m[1].length))
    if (v != null && v !== 0) fields[field] = v
  }

  if (Object.keys(fields).length < 3) return []
  return [{ year, period, fields, unmapped: [] }]
}

// ─── Fallback parser ──────────────────────────────────────────────────────────

function parseFallback(text: string, year: number, period: string): ParsedRow[] {
  const fields: Record<string, number | null> = {}

  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const m = matchIncomeLine(t)
    if (m && !(m.field in fields)) {
      const v = firstNum(t)
      if (v != null) fields[m.field] = m.negate ? -Math.abs(v) : v
    }
    // Bilanço toplamları
    const n = norm(t)
    const num = firstNum(t)
    if (num == null) continue
    if (n.includes('donen varlik toplam') && !fields['totalCurrentAssets'])    fields['totalCurrentAssets']    = num
    if (n.includes('duran varlik toplam') && !fields['totalNonCurrentAssets']) fields['totalNonCurrentAssets'] = num
    if ((n.includes('aktif toplam') || n.includes('toplam aktif')) && !fields['totalAssets']) fields['totalAssets'] = num
    if (n.includes('oz kaynak toplam') && !fields['totalEquity'])              fields['totalEquity']           = num
  }

  if (!Object.keys(fields).length) return []
  return [{ year, period, fields, unmapped: [] }]
}

// ─── Bölüm arama yardımcısı ───────────────────────────────────────────────────
// norm'd text üzerinde index bulup orijinal text'i slice eder

function findNormIdx(text: string, normPattern: string): number {
  return norm(text).indexOf(normPattern)
}

// ─── Ana export: parsePdfBuffer ───────────────────────────────────────────────

export async function parsePdfBuffer(buffer: Buffer, _fileName?: string): Promise<ParsedRow[]> {
  let text: string
  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await parser.getText()
    text = result.text
  } catch (e) {
    console.error('[pdf] getText() failed:', e)
    throw e
  }

  // 1) PDF Mizan
  if (detectPdfMizan(text)) return parsePdfMizan(text)

  const type = detectType(text)
  const { year, period } = extractYearPeriod(text)
  // year null ise upload route'daki overrideYear devreye girer — erken çıkma yok
  if (!year && type === 'unknown') return []

  // 2) Yıllık Gelir Vergisi Beyannamesi (1001A)
  if (type === 'gelir_yillik') {
    const bilIdx = findNormIdx(text, 'ayrintili bilanco')
    const gelIdx = findNormIdx(text, 'ayrintili gelir tablosu')

    let bilFields = { cari: {} as Record<string, number>, onceki: {} as Record<string, number> }
    let gelFields = { cari: {} as Record<string, number>, onceki: {} as Record<string, number> }

    if (bilIdx !== -1) {
      const end = gelIdx !== -1 ? gelIdx : bilIdx + 5000
      bilFields = parseEkSection(text.slice(bilIdx, end))
    }
    if (gelIdx !== -1) {
      gelFields = parseEkSection(text.slice(gelIdx, gelIdx + 4000))
    }

    const cariFields = { ...bilFields.cari, ...gelFields.cari }
    if (Object.keys(cariFields).length > 0) return [{ year, period: 'ANNUAL', fields: cariFields, unmapped: [] }]
    return []
  }

  // 3) Geçici Gelir Vergisi (1032-GV)
  if (type === 'gelir_gecici') {
    const gelIdx = findNormIdx(text, 'gelir tablosu')
    if (gelIdx !== -1) {
      const { cari } = parseEkSection(text.slice(gelIdx, gelIdx + 4000))
      if (Object.keys(cari).length > 0) return [{ year, period, fields: cari, unmapped: [] }]
    }
    const full = parseEkSection(text)
    if (Object.keys(full.cari).length > 0) return [{ year, period, fields: full.cari, unmapped: [] }]
    return [{ year, period, fields: parseTaxForm(text), unmapped: [] }]
  }

  // 4) Kurumlar Vergisi Yıllık (1010)
  if (type === 'kurumlar_yillik') {
    const taxFields = parseTaxForm(text)

    // Bilanço + gelir tablosu başlangıç noktalarını ayrı ayrı bul
    let bilIdx = findNormIdx(text, 'tek duzen hesap planina uygun bilanco')
    if (bilIdx === -1) bilIdx = findNormIdx(text, 'tek duzen hesap plani')
    const gelirIdx = findNormIdx(text, 'tek duzen hesap planina uygun gelir tablosu')

    if (bilIdx !== -1) {
      const bilEnd = gelirIdx !== -1 && gelirIdx > bilIdx ? gelirIdx : bilIdx + 12000
      const bilRaw = parseEkSection(text.slice(bilIdx, bilEnd))
      const bilHasTwoCols = Object.keys(bilRaw.onceki).length > 0
      const bilData = bilHasTwoCols ? bilRaw.onceki : bilRaw.cari

      let gelData: Record<string, number> = {}
      if (gelirIdx !== -1) {
        const gelRaw = parseEkSection(text.slice(gelirIdx, gelirIdx + 8000))
        const gelHasTwoCols = Object.keys(gelRaw.onceki).length > 0
        gelData = gelHasTwoCols ? gelRaw.onceki : gelRaw.cari
      }

      return [{ year, period: 'ANNUAL', fields: { ...bilData, ...gelData, ...taxFields }, unmapped: [] }]
    }
    return [{ year, period: 'ANNUAL', fields: taxFields, unmapped: [] }]
  }

  // 5) Kurumlar Geçici Vergi (1032-KV)
  if (type === 'kurumlar_gecici') {
    const taxFields = parseTaxForm(text)
    const { taxExpense: _t, ...taxNoTax } = taxFields

    // ── Bilanço bölümünü bul ─────────────────────────────────
    // KVB PDF'inde bilanço gelir tablosundan ÖNCE gelir, ayrı parse et.
    let bilIdx = findNormIdx(text, 'tek duzen hesap planina uygun bilanco')
    if (bilIdx === -1) bilIdx = findNormIdx(text, 'hesap planina gore bilanco')
    if (bilIdx === -1) bilIdx = findNormIdx(text, 'hesap planina uygun bilanco')
    // Bilanço başlığı bulunamazsa, TDHP bölüm başlığı "I. DONEN VARLIK" üzerinden bul
    if (bilIdx === -1) {
      const donenIdx = norm(text).indexOf('i. donen varlik')
      if (donenIdx > 0) bilIdx = Math.max(0, donenIdx - 100)
    }
    if (bilIdx === -1) {
      const donenIdx = norm(text).indexOf('i.donen varlik')
      if (donenIdx > 0) bilIdx = Math.max(0, donenIdx - 100)
    }

    const gelirIdx = findNormIdx(text, 'tek duzen hesap planina uygun gelir tablosu')

    let bilData: Record<string, number> = {}
    let gelData: Record<string, number> = {}

    // Bilanço parse: 2 sütun (önceki dönem | cari dönem) — cari = 2. sütun = onceki
    if (bilIdx !== -1) {
      const endIdx = gelirIdx !== -1 && gelirIdx > bilIdx ? gelirIdx : bilIdx + 12000
      const bilRaw = parseEkSection(text.slice(bilIdx, endIdx))
      const hasTwoCols = Object.keys(bilRaw.onceki).length > 0
      bilData = hasTwoCols ? bilRaw.onceki : bilRaw.cari
      console.info('[pdf] kurumlar_gecici bilanco parse', {
        bilIdx,
        sliceLen: endIdx - bilIdx,
        hasTwoCols,
        fieldCount: Object.keys(bilData).length,
        cash: bilData.cash ?? null,
        inventory: bilData.inventory ?? null,
        paidInCapital: bilData.paidInCapital ?? null,
      })
    }

    // Gelir tablosu parse: 1 sütun (cari dönem kümülatif)
    if (gelirIdx !== -1) {
      const gelRaw = parseEkSection(text.slice(gelirIdx, gelirIdx + 6000))
      const hasTwoCols = Object.keys(gelRaw.onceki).length > 0
      gelData = hasTwoCols ? gelRaw.onceki : gelRaw.cari
      console.info('[pdf] kurumlar_gecici gelir parse', {
        gelirIdx,
        hasTwoCols,
        fieldCount: Object.keys(gelData).length,
        revenue: gelData.revenue ?? null,
      })
    }

    if (Object.keys(bilData).length > 0 || Object.keys(gelData).length > 0) {
      return [{ year, period, fields: { ...bilData, ...gelData, ...taxNoTax }, unmapped: [] }]
    }

    // Fallback: tüm metni parse et
    const rawFull = parseEkSection(text)
    const { taxExpense: _t2, ...taxNoTax2 } = taxFields
    if (Object.keys(rawFull.cari).length > 0) {
      console.info('[pdf] kurumlar_gecici fulltext fallback', {
        fieldCount: Object.keys(rawFull.cari).length,
        hasRevenue: rawFull.cari.revenue != null,
        hasCogs: rawFull.cari.cogs != null,
      })
      return [{ year, period, fields: { ...rawFull.cari, ...taxNoTax2 }, unmapped: [] }]
    }
    return [{ year, period, fields: taxNoTax2, unmapped: [] }]
  }

  // 6) Bilinmeyen: satır bazlı fallback
  if (!year) return []
  return parseFallback(text, year, period)
}
