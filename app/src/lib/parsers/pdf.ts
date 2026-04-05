/**
 * GİB Vergi Beyannamesi PDF Parser
 *
 * Desteklenen formatlar:
 *  - 1001A  Yıllık Gelir Vergisi Beyannamesi  → Tam Bilanço + Gelir Tablosu (2 yıl)
 *  - 1032   Geçici Vergi (Gelir Vergisi)       → Gelir Tablosu (cari dönem)
 *  - 1010   Kurumlar Vergisi Beyannamesi       → Ticari Bilanço Karı + vergi rakamları
 *  - 1032   Geçici Vergi (Kurumlar Vergisi)    → Ticari Bilanço Karı + vergi rakamları
 *  - Dikey Mizan / Bilanço PDF                 → Satır bazlı fallback
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as {
  PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }> }
}
import type { ParsedRow } from './excel'
import { MIZAN_ACCOUNT_MAP } from './excel'

// ─── Türk sayı formatı parser ────────────────────────────────────────────────
const TR_NUM = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g

function parseTR(s: string): number | null {
  if (!s) return null
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

function firstNum(line: string): number | null {
  const m = line.match(TR_NUM)
  return m ? parseTR(m[0]) : null
}

function twoNums(line: string): [number | null, number | null] {
  const m = line.match(TR_NUM)
  if (!m) return [null, null]
  return [parseTR(m[0]), m[1] ? parseTR(m[1]) : null]
}

// ─── Beyanname tipi tespiti ──────────────────────────────────────────────────
type BType = 'gelir_yillik' | 'gelir_gecici' | 'kurumlar_yillik' | 'kurumlar_gecici' | 'unknown'

function detectType(text: string): BType {
  const top = text.slice(0, 600)
  if (/KURUMLAR VERGİSİ BEYANNAMESİ/i.test(top)) return 'kurumlar_yillik'
  if (/GEÇİCİ VERGİ BEYANNAMESİ[\s\S]{0,300}Kurumlar Vergisi Mükellefleri/i.test(text.slice(0, 800))) return 'kurumlar_gecici'
  if (/YILLIK GELİR VERGİSİ BEYANNAMESİ/i.test(top)) return 'gelir_yillik'
  if (/GEÇİCİ VERGİ BEYANNAMESİ[\s\S]{0,300}Gelir Vergisi Mükellefleri/i.test(text.slice(0, 800))) return 'gelir_gecici'
  return 'unknown'
}

// ─── Yıl / Dönem tespiti ─────────────────────────────────────────────────────
function extractYearPeriod(text: string): { year: number | null; period: string } {
  let year: number | null = null
  // "Yıl 2024" veya "Yılı\n...\n2025" (s flag olmadan satır satır ara)
  const yMatch = text.match(/Yıl[ıi]?\s+(20[12]\d)/)
  if (yMatch) year = parseInt(yMatch[1])
  if (!year) {
    // Çok satırlı "Yılı\nDönem\n2025" formatı
    const lines = text.split('\n')
    for (let i = 0; i < Math.min(30, lines.length); i++) {
      if (/Yıl[ıi]?/i.test(lines[i])) {
        for (let j = i; j < Math.min(i + 5, lines.length); j++) {
          const m = lines[j].match(/\b(20[12]\d)\b/)
          if (m) { year = parseInt(m[1]); break }
        }
        if (year) break
      }
    }
  }
  if (!year) {
    const m2 = text.match(/\b(20[12]\d)\b/)
    if (m2) year = parseInt(m2[1])
  }

  let period = 'ANNUAL'
  const top500 = text.slice(0, 500)
  if (/Yıllık/i.test(top500)) period = 'ANNUAL'
  else if (/4\.\s*Dönem/i.test(text.slice(0, 800))) period = 'Q4'
  else if (/3\.\s*Dönem/i.test(text.slice(0, 800))) period = 'Q3'
  else if (/2\.\s*Dönem/i.test(text.slice(0, 800))) period = 'Q2'
  else if (/1\.\s*Dönem/i.test(text.slice(0, 800))) period = 'Q1'

  return { year, period }
}

// ─── Bilanço/Gelir Tablosu satır → alan eşlemesi ────────────────────────────
const ROW_MAP: [RegExp, string, boolean?][] = [
  // Gelir Tablosu
  [/c\.?\s*net\s*sat[iıİ][sşŞ]lar/i,               'revenue'],
  [/net\s*sat[iıİ][sşŞ]lar/i,                      'revenue'],
  [/toplam\s*net\s*sat/i,                           'revenue'],
  [/sat[iıİ][sşŞ]\s*has[iıİ]lat[iıİ]/i,           'revenue'],
  [/brüt\s*sat[iıİ][sşŞ]\s*has[iıİ]lat/i,         'revenue'],
  [/sat[iıİ][sşŞ]lar[iıİ]n\s*maliyeti/i,          'cogs',   true],
  [/brüt\s*sat[iıİ][sşŞ]\s*kar[iıİ].*veya/i,      'grossProfit'],
  [/faaliyet\s*gider/i,                             'operatingExpenses', true],
  [/faaliyet\s*kar[iıİ].*veya/i,                   'ebit'],
  [/faaliyet\s*kar[iıİ]/i,                          'ebit'],
  [/fv[oöÖ]k/i,                                    'ebit'],
  [/amortisman/i,                                   'depreciation'],
  [/fav[oöÖ]k/i,                                   'ebitda'],
  [/finansman\s*gider/i,                            'interestExpense', true],
  [/faiz\s*gider/i,                                 'interestExpense', true],
  [/vergi\s*[oöÖ]ncesi\s*kar/i,                    'ebt'],
  [/olağan\s*kar\s*veya\s*zarar/i,                 'ebt'],
  [/d[oöÖ]nem\s*kar[iıİ]\s*veya\s*zarar/i,        'ebt'],
  [/d[oöÖ]nem\s*net\s*kar[iıİ]/i,                 'netProfit'],
  [/net\s*kar\s*veya\s*zarar/i,                    'netProfit'],
  [/net\s*kar/i,                                    'netProfit'],
  [/vergi\s*sonras[iıİ]\s*kar/i,                   'netProfit'],
  // Bilanço — Dönen Varlıklar
  [/^i\.\s*d[oöÖ]nen\s*varl/i,                    'totalCurrentAssets'],
  [/d[oöÖ]nen\s*varl[iıİ]k\s*toplam/i,            'totalCurrentAssets'],
  [/toplam\s*d[oöÖ]nen\s*varl/i,                  'totalCurrentAssets'],
  [/toplam\s*cari\s*aktif/i,                       'totalCurrentAssets'],
  [/a\.\s*haz[iıİ]r\s*de[gğĞ]erler/i,            'cash'],
  [/nakit\s*ve\s*nakit/i,                          'cash'],
  [/para\s*mevcudu/i,                              'cash'],
  [/c\.\s*ticari\s*alacak/i,                       'tradeReceivables'],
  [/ticari\s*alacak/i,                             'tradeReceivables'],
  [/e\.\s*stoklar/i,                               'inventory'],
  [/^stoklar/i,                                    'inventory'],
  // Bilanço — Duran Varlıklar
  [/^ii\.\s*duran\s*varl/i,                       'totalNonCurrentAssets'],
  [/duran\s*varl[iıİ]k\s*toplam/i,                'totalNonCurrentAssets'],
  [/toplam\s*ba[gğĞ]l[iıİ]\s*varl/i,             'totalNonCurrentAssets'],
  [/d\.\s*maddi\s*duran\s*varl/i,                 'tangibleAssets'],
  [/maddi\s*duran\s*varl/i,                        'tangibleAssets'],
  [/akt[iıİ]f\s*toplam/i,                         'totalAssets'],
  // Bilanço — Kısa Vadeli Borçlar
  [/^iii\.\s*k[iıİ]sa\s*vadeli/i,                'totalCurrentLiabilities'],
  [/k[iıİ]sa\s*vadeli\s*yabanc[iıİ]/i,           'totalCurrentLiabilities'],
  [/toplam\s*k[iıİ]sa\s*vadeli\s*bor/i,          'totalCurrentLiabilities'],
  [/b\.\s*ticari\s*bor[cçÇ]/i,                   'tradePayables'],
  [/ticari\s*bor[cçÇ]/i,                          'tradePayables'],
  // Bilanço — Uzun Vadeli Borçlar
  [/^iv\.\s*uzun\s*vadeli/i,                      'totalNonCurrentLiabilities'],
  [/uzun\s*vadeli\s*yabanc[iıİ]/i,               'totalNonCurrentLiabilities'],
  [/toplam\s*uzun\s*vadeli\s*bor/i,              'totalNonCurrentLiabilities'],
  // Öz Kaynaklar
  [/^v\.\s*[oöÖ]z\s*(kaynak|serma)/i,            'totalEquity'],
  [/[oöÖ]z\s*(kaynak|serma).*toplam/i,           'totalEquity'],
  [/toplam\s*[oöÖ]z\s*serma/i,                   'totalEquity'],
  [/pas[iıİ]f\s*toplam/i,                         'totalLiabilitiesAndEquity'],
]

// ─── Bölüm tespiti (I-V arası bilanço bölümleri) ────────────────────────────
type EkSection = 'donen' | 'duran' | 'kv' | 'uv' | 'oz' | 'gelir' | null

function detectEkSection(line: string): EkSection | null {
  if (/^i[\s.]\s*d[öo]nen\s*varl/i.test(line))        return 'donen'
  if (/^ii[\s.]\s*duran\s*varl/i.test(line))           return 'duran'
  if (/^iii[\s.]\s*k[iı]sa\s*vadeli/i.test(line))      return 'kv'
  if (/^iv[\s.]\s*uzun\s*vadeli/i.test(line))          return 'uv'
  if (/^v[\s.]\s*[öo]z\s*(kaynak|serma)/i.test(line))  return 'oz'
  if (/gelir\s*tablosu/i.test(line))                   return 'gelir'
  return null
}

// ─── Bölüme duyarlı alan eşlemesi ────────────────────────────────────────────
function matchField(label: string, sec: EkSection): string | null {
  const l = label.trim()

  // KV (III. Kısa Vadeli) — bölüme özgü eşlemeler
  if (sec === 'kv') {
    if (/mali\s*bor[çc]/i.test(l))                          return 'shortTermFinancialDebt'
    if (/c\.\s*di[gğ]er\s*bor[çc]/i.test(l))               return 'otherCurrentLiabilities'
    if (/di[gğ]er\s*bor[çc]/i.test(l) && /^c/i.test(l))    return 'otherCurrentLiabilities'
  }

  // UV (IV. Uzun Vadeli) — bölüme özgü eşlemeler
  if (sec === 'uv') {
    if (/mali\s*bor[çc]/i.test(l))                          return 'longTermFinancialDebt'
    if (/c\.\s*di[gğ]er\s*bor[çc]/i.test(l))               return 'otherNonCurrentLiabilities'
  }

  // Öz Kaynaklar (V.) — bölüme özgü eşlemeler
  if (sec === 'oz') {
    if (/[öo]denmi[şs]\s*sermaye/i.test(l))                 return 'paidInCapital'
    if (/ge[çc]mi[şs]\s*y[iı]l.*kar/i.test(l))             return 'retainedEarnings'
    if (/d[öo]nem\s*net\s*kar/i.test(l))                    return 'netProfitCurrentYear'
  }

  // Dönen Varlıklar (I.) — bölüme özgü
  if (sec === 'donen') {
    if (/di[gğ]er\s*d[öo]nen\s*varl/i.test(l))             return 'otherCurrentAssets'
  }

  // Global (bölümden bağımsız) eşlemeler
  for (const [pat, field] of ROW_MAP) {
    if (pat.test(l)) return field
  }
  return null
}

// ─── EK Bilanço/Gelir Tablosu bölüm parser ───────────────────────────────────
function parseEkSection(section: string): { cari: Record<string, number>; onceki: Record<string, number> } {
  const cari: Record<string, number> = {}
  const onceki: Record<string, number> = {}
  let currentSection: EkSection = null

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.length < 4) continue

    // Bölüm tespiti yap (değer de olabilir — skip etme)
    const detected = detectEkSection(line)
    if (detected !== null) currentSection = detected

    const nums = line.match(TR_NUM)
    if (!nums) continue

    // Etiketi sayılardan temizle
    const label = line.replace(TR_NUM, '').replace(/\(-\)/g, '').replace(/\s+/g, ' ').trim()
    if (!label || label.length < 3) continue

    const field = matchField(label, currentSection)
    if (!field) continue

    const [v1, v2] = twoNums(line)
    if (v1 !== null && !(field in cari)) cari[field] = v1
    if (v2 !== null && !(field in onceki)) onceki[field] = v2
  }

  return { cari, onceki }
}

// ─── Kurumlar/Geçici beyanname — temel alanları çek ─────────────────────────
function parseTaxForm(text: string): Record<string, number | null> {
  const fields: Record<string, number | null> = {}

  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue

    if (/ticari\s*bilan[çÇ]o\s*kar[iıİ]/i.test(t) && !('ebt' in fields)) {
      const v = firstNum(t); if (v !== null && v > 0) fields['ebt'] = v
    }
    if (/dönem\s*safi\s*kurum\s*kazanc/i.test(t) && !('ebt' in fields)) {
      const v = firstNum(t); if (v !== null) fields['ebt'] = v
    }
    if (/kurumlar\s*vergisi\s*matrah/i.test(t) && !('ebt' in fields)) {
      const v = firstNum(t); if (v !== null) fields['ebt'] = v
    }
    if (/geçici\s*vergi\s*matrah/i.test(t) && !('ebt' in fields)) {
      const v = firstNum(t); if (v !== null) fields['ebt'] = v
    }
    if (/hesaplanan\s*(kurumlar|geçici)\s*vergi/i.test(t) && !('taxExpense' in fields)) {
      const v = firstNum(t); if (v !== null) fields['taxExpense'] = v
    }
    if (/ticari\s*kazanç/i.test(t) && !('ebt' in fields)) {
      const v = firstNum(t); if (v !== null && v > 0) fields['ebt'] = v
    }
    if (/brüt\s*(satış|kazanç)\s*tutar/i.test(t) && !('revenue' in fields)) {
      const v = firstNum(t); if (v !== null) fields['revenue'] = v
    }
  }

  // Fallback: bazı PDF'lerde etiket ve değer ayrı satırlarda olabilir
  // (ör. Kurumlar Vergisi beyannamesi tablo düzeni)
  if (!('ebt' in fields)) {
    const m = text.match(/ticari\s*bilan[çÇ]o\s*kar[iıİ][^\d]{0,200}?(\d{1,3}(?:\.\d{3})*,\d{2})/)
    if (m) { const v = parseTR(m[1]); if (v !== null && v > 0) fields['ebt'] = v }
  }
  if (!('taxExpense' in fields)) {
    const m = text.match(/hesaplanan\s*(?:kurumlar|geçici)\s*vergi[^\d]{0,150}?(\d{1,3}(?:\.\d{3})*,\d{2})/)
    if (m) { const v = parseTR(m[1]); if (v !== null) fields['taxExpense'] = v }
  }

  return fields
}

// ─── PDF Mizan Parser ────────────────────────────────────────────────────────
function detectPdfMizan(text: string): boolean {
  return /miz[ae]n/i.test(text.slice(0, 500)) && /hesap\s*kodu/i.test(text.slice(0, 500))
}

function parsePdfMizan(text: string): ParsedRow[] {
  // Yıl/dönem
  const dateMatch = text.match(/(\d{2})[.\/-](\d{2})[.\/-](20\d{2})\s*[-–]\s*(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/)
  if (!dateMatch) return []
  const endMonth = parseInt(dateMatch[5])
  const year     = parseInt(dateMatch[6])
  const period   = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'ANNUAL'

  const fields: Record<string, number | null> = {}
  let salesDeductions = 0
  let netLoss = 0

  // "HESAP KODU AÇIKLAMA BORÇ ALACAK BAK. BORÇ BAK. ALACAK" satırından sonraki satırları işle
  const dataStart = text.indexOf('HESAP KODU')
  const lines = text.slice(dataStart > 0 ? dataStart : 0).split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    // Satır başındaki hesap kodu (1-3 haneli tam sayı)
    const codeMatch = line.match(/^(\d{1,3})\s+/)
    if (!codeMatch) continue
    const code = codeMatch[1]

    const mapping = MIZAN_ACCOUNT_MAP[code]
    if (!mapping) continue

    // Satırdaki tüm sayıları bul
    const nums = (line.match(TR_NUM) || []).map(s => parseTR(s)).filter((v): v is number => v !== null)
    if (nums.length === 0) continue

    let val: number | null = null

    if (nums.length === 1) {
      // Tek sayı: bakiye
      val = nums[0]
    } else if (nums.length === 2) {
      const [n1, n2] = nums
      if (Math.abs(n1 - n2) < 1) {
        // Eşit → kapatılmış gelir tablosu hesabı; gelir için n1, gider için n1
        val = n1
      } else {
        // İkisi farklı: büyük olanı bakiye olarak al
        val = Math.abs(n1) > Math.abs(n2) ? n1 : n2
      }
    } else {
      // 3+ sayı: borç=n1, alacak=n2, bakiye=n3
      const [n1, n2, n3] = nums
      // Bakiye = n3; borç-alacak tipini account map'e göre belirle
      if (mapping.src === 'bakBorç' || mapping.src === 'anyBorç') {
        val = n1 > n2 ? n3 : n1  // borç bakiyesi → n3 veya borç tutarı
      } else {
        val = n2 > n1 ? n3 : n2  // alacak bakiyesi → n3 veya alacak tutarı
      }
    }

    if (!val) continue

    if (mapping.field === '_salesDeductions') salesDeductions = val
    else if (mapping.field === '_netLoss') netLoss = val
    else if (!(mapping.field in fields)) fields[mapping.field] = val
  }

  if (salesDeductions && fields['revenue']) fields['revenue'] = (fields['revenue'] as number) - salesDeductions
  if (netLoss && !fields['netProfitCurrentYear']) fields['netProfitCurrentYear'] = -netLoss
  if (fields['netProfitCurrentYear'] && !fields['netProfit']) fields['netProfit'] = fields['netProfitCurrentYear']
  if (!fields['totalAssets'] && fields['totalCurrentAssets'] && fields['totalNonCurrentAssets']) {
    fields['totalAssets'] = (fields['totalCurrentAssets'] as number) + (fields['totalNonCurrentAssets'] as number)
  }

  if (Object.keys(fields).length < 3) return []
  return [{ year, period, fields, unmapped: [] }]
}

// ─── Ana export ──────────────────────────────────────────────────────────────
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedRow[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const { text } = await parser.getText()

  // Mizan formatı tespiti (beyanname kontrolünden önce)
  if (detectPdfMizan(text)) {
    return parsePdfMizan(text)
  }

  const type = detectType(text)
  const { year, period } = extractYearPeriod(text)

  if (!year) return []

  // ── 1001A: Yıllık Gelir Vergisi ──────────────────────────────────────────
  if (type === 'gelir_yillik') {
    const results: ParsedRow[] = []
    const bilIdx = text.indexOf('AYRINTILI BİLANÇO')
    const gelIdx = text.indexOf('AYRINTILI GELİR TABLOSU')

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
    if (Object.keys(cariFields).length > 0) {
      results.push({ year, period: 'ANNUAL', fields: cariFields, unmapped: [] })
    }

    const oncekiFields = { ...bilFields.onceki, ...gelFields.onceki }
    const hasOnceki = Object.values(oncekiFields).some(v => v !== 0)
    if (hasOnceki) {
      // isSecondary: önceki dönem verisi başka beyannameden türetildiği için varolan kaydı ezmez
      results.push({ year: year - 1, period: 'ANNUAL', fields: oncekiFields, unmapped: [], isSecondary: true })
    }

    return results
  }

  // ── 1032-GV: Geçici Vergi (Gelir Vergisi) ────────────────────────────────
  if (type === 'gelir_gecici') {
    const gelIdx = text.indexOf('GELİR TABLOSU')
    if (gelIdx !== -1) {
      const { cari } = parseEkSection(text.slice(gelIdx, gelIdx + 4000))
      return [{ year, period, fields: cari, unmapped: [] }]
    }
    // EK yoksa ana formdan kâr rakamını al
    return [{ year, period, fields: parseTaxForm(text), unmapped: [] }]
  }

  // ── 1010: Kurumlar Vergisi Yıllık ────────────────────────────────────────
  if (type === 'kurumlar_yillik') {
    const taxFields = parseTaxForm(text)

    // Kurumlar beyannamesi "TEK DÜZEN HESAP PLANI AYRINTILI BİLANÇO VE GELİR TABLOSU" EK'i içerir
    const ekIdx = text.indexOf('TEK DÜZEN HESAP PLANI')
    if (ekIdx !== -1) {
      const raw = parseEkSection(text.slice(ekIdx, ekIdx + 20000))
      // GİB sütun sırası tespiti: 2. sütun (onceki/v2) doluysa → önceki dönem ÖNCE geliyor (swap gerekli)
      // 2. sütun boşsa → tek sütunlu EK, v1 = cari dönem (swap gerekmez)
      const hasTwoColumns = Object.keys(raw.onceki).length > 0
      const cariData   = hasTwoColumns ? raw.onceki : raw.cari   // cari dönem
      const oncekiData = hasTwoColumns ? raw.cari   : {}          // önceki dönem (varsa)

      const cariFields   = { ...cariData, ...taxFields }
      const oncekiFields = { ...oncekiData }

      const results: ParsedRow[] = [{ year, period: 'ANNUAL', fields: cariFields, unmapped: [] }]
      const hasOnceki = Object.values(oncekiFields).some(v => v !== 0)
      // isSecondary: önceki dönem verisi başka beyannameden türetildiği için varolan kaydı ezmez
      if (hasOnceki) results.push({ year: year - 1, period: 'ANNUAL', fields: oncekiFields, unmapped: [], isSecondary: true })
      return results
    }

    return [{ year, period: 'ANNUAL', fields: taxFields, unmapped: [] }]
  }

  // ── 1032-KV: Kurumlar Geçici Vergi ───────────────────────────────────────
  if (type === 'kurumlar_gecici') {
    const taxFields = parseTaxForm(text)

    // Geçici beyanname "TEK DÜZEN HESAP PLANINA UYGUN GELİR TABLOSU" EK'i içerebilir
    const gelirIdx = text.indexOf('TEK DÜZEN HESAP PLANINA UYGUN GELİR TABLOSU')
    if (gelirIdx !== -1) {
      const raw = parseEkSection(text.slice(gelirIdx, gelirIdx + 5000))
      // GİB sütun sırası tespiti: 2. sütun doluysa → önceki dönem ÖNCE geliyor (swap gerekli)
      // 2. sütun boşsa → tek sütunlu EK, v1 = cari dönem (swap gerekmez)
      const hasTwoColumns = Object.keys(raw.onceki).length > 0
      const cariData   = hasTwoColumns ? raw.onceki : raw.cari
      const oncekiData = hasTwoColumns ? raw.cari   : {}

      const cariFields = { ...cariData, ...taxFields }
      const results: ParsedRow[] = [{ year, period, fields: cariFields, unmapped: [] }]
      const hasOnceki = Object.values(oncekiData).some(v => v !== 0)
      // isSecondary: önceki dönem verisi başka beyannameden türetildiği için varolan kaydı ezmez
      if (hasOnceki) results.push({ year: year - 1, period: 'ANNUAL', fields: oncekiData, unmapped: [], isSecondary: true })
      return results
    }

    return [{ year, period, fields: taxFields, unmapped: [] }]
  }

  // ── Bilinmeyen: satır bazlı fallback ─────────────────────────────────────
  return parseFallback(text, year, period)
}

function parseFallback(text: string, year: number, period: string): ParsedRow[] {
  const fields: Record<string, number | null> = {}

  const SIMPLE: [RegExp, string][] = [
    [/net\s*sat[iıİ][sşŞ]lar/i, 'revenue'],
    [/sat[iıİ][sşŞ]lar[iıİ]n\s*maliyeti/i, 'cogs'],
    [/brüt\s*kar/i, 'grossProfit'],
    [/faaliyet\s*kar[iıİ]/i, 'ebit'],
    [/fav[oöÖ]k/i, 'ebitda'],
    [/net\s*kar/i, 'netProfit'],
    [/d[oöÖ]nen\s*varl[iıİ]k/i, 'totalCurrentAssets'],
    [/duran\s*varl[iıİ]k/i, 'totalNonCurrentAssets'],
    [/akt[iıİ]f\s*toplam/i, 'totalAssets'],
    [/k[iıİ]sa\s*vadeli.*bor/i, 'totalCurrentLiabilities'],
    [/uzun\s*vadeli.*bor/i, 'totalNonCurrentLiabilities'],
    [/[oöÖ]z\s*(kaynak|serma)/i, 'totalEquity'],
    [/ticari\s*alacak/i, 'tradeReceivables'],
    [/stoklar/i, 'inventory'],
    [/nakit/i, 'cash'],
  ]

  for (const line of text.split('\n')) {
    const t = line.trim()
    for (const [pat, field] of SIMPLE) {
      if (pat.test(t) && !(field in fields)) {
        const v = firstNum(t)
        if (v !== null) fields[field] = v
      }
    }
  }

  if (Object.keys(fields).length === 0) return []
  return [{ year, period, fields, unmapped: [] }]
}
