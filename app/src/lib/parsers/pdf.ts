/**
 * PDF → FinancialInput dönüştürücü
 * Geçici vergi beyanı, bilanço ve gelir tablosu PDF'lerini okur.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as { PDFParse: new (opts: { data: Uint8Array }) => { getText: () => Promise<{ text: string }> } }
import type { ParsedRow } from './excel'

// PDF'de aranan anahtar kelimeler → alan eşlemesi
// 3. eleman true ise: eşleşen satır bir zarar (kayıp) ifadesidir → değer negatife çevrilmeli
const PDF_FIELD_MAP: [RegExp, string, boolean?][] = [
  // Gelir tablosu
  // "C.Net Satışlar" veya "Net Satışlar" → revenue (öncelikli)
  [/c\.?\s*net\s*sat[iıİ][sşŞ]lar/i,               'revenue'],
  [/net\s*sat[iıİ][sşŞ]lar/i,                      'revenue'],
  [/toplam\s*net\s*sat[iıİ][sşŞ]/i,                'revenue'],
  [/br[uüÜ]t\s*sat[iıİ][sşŞ]\s*has[iıİ]lat/i,     'revenue'],  // "Brüt Satış Hasılatı"
  [/sat[iıİ][sşŞ]\s*has[iıİ]lat[iıİ]/i,            'revenue'],
  // NOT: "A. Brüt Satışlar" kasıtlı olarak haritalanmadı — Net Satışlar daha doğru revenue göstergesi
  [/sat[iıİ][sşŞ]lar[iıİ]n\s*maliyeti/i,           'cogs'],
  [/br[uüÜ]t\s*k[aâÂ]r/i,                          'grossProfit'],
  [/faaliyet\s*gider/i,                              'operatingExpenses'],
  [/faaliyet\s*k[aâÂ]r/i,                           'ebit'],
  [/fv[oöÖ]k/i,                                     'ebit'],
  [/amortisman/i,                                    'depreciation'],
  [/fav[oöÖ]k/i,                                    'ebitda'],
  [/finansman\s*gider/i,                             'interestExpense'],
  [/faiz\s*gider/i,                                  'interestExpense'],
  [/vergi\s*[oöÖ]ncesi\s*k[aâÂ]r/i,                'ebt'],
  [/net\s*d[oöÖ]nem\s*k[aâÂ]r/i,                             'netProfit'],
  [/net\s*k[aâÂ]r/i,                                         'netProfit'],
  [/d[oöÖ]nem\s*net\s*k[aâÂ]r[iıİ]?(\s*[\/\-]\s*zarar[iıİ]?)?/i, 'netProfit'],
  [/d[oöÖ]nem\s*net\s*zarar[iıİ]?(\s*[\/\-]\s*k[aâÂ]r[iıİ]?)?/i, 'netProfit', true],
  [/vergi\s*sonras[iıİ]\s*k[aâÂ]r/i,                         'netProfit'],
  [/vergi\s*sonras[iıİ]\s*zarar/i,                            'netProfit', true],
  // Bilanço — dönen varlıklar
  // "A. Hazır Değerler" = Kasa + Banka (Nakit ve Nakit Benzerleri karşılığı)
  [/haz[iıİ]r\s*de[gğĞ]erler/i,                    'cash'],
  [/nakit\s*ve\s*nakit\s*benz/i,                    'cash'],
  [/nakit\s*de[gğĞ]erler/i,                         'cash'],
  [/ticari\s*alacak/i,                               'tradeReceivables'],
  [/stoklar/i,                                       'inventory'],
  [/d[oöÖ]nen\s*varl[iıİ]k\s*toplam/i,              'totalCurrentAssets'],
  [/d[oöÖ]nen\s*varl[iıİ]klar/i,                    'totalCurrentAssets'],  // "I. Dönen Varlıklar 1.234"
  // Bilanço — duran varlıklar
  [/maddi\s*duran\s*varl/i,                          'tangibleAssets'],
  [/duran\s*varl[iıİ]k\s*toplam/i,                   'totalNonCurrentAssets'],
  [/duran\s*varl[iıİ]klar\b/i,                       'totalNonCurrentAssets'],  // "II. DURAN VARLIKLAR 1.234"
  [/akt[iıİ]f\s*toplam/i,                              'totalAssets'],             // "AKTİF TOPLAMI"
  [/toplam\s*akt[iıİ]f/i,                             'totalAssets'],
  [/varl[iıİ]k\s*toplam/i,                            'totalAssets'],
  // Borçlar
  // "A. Mali Borçlar" = KV finansal borç toplamı (banka kredileri + leasing)
  [/mali\s*bor[cçÇ]/i,                               'shortTermFinancialDebt'],
  [/k[iıİ]sa\s*vadeli\s*finansal\s*bor[cçÇ]/i,      'shortTermFinancialDebt'],
  // "III. Kısa Vadeli Yabancı Kaynaklar" = toplam KV yükümlülükler
  [/k[iıİ]sa\s*vadeli\s*yabanc[iıİ]\s*kaynak/i,     'totalCurrentLiabilities'],
  [/k[iıİ]sa\s*vadeli\s*bor[cçÇ]\s*toplam/i,        'totalCurrentLiabilities'],
  [/k[iıİ]sa\s*vadeli\s*y[uüÜ]k[uüÜ]ml/i,          'totalCurrentLiabilities'],
  [/ticari\s*bor[cçÇ]/i,                             'tradePayables'],
  [/uzun\s*vadeli\s*finansal\s*bor[cçÇ]/i,           'longTermFinancialDebt'],
  [/uzun\s*vadeli\s*bor[cçÇ]\s*toplam/i,             'totalNonCurrentLiabilities'],
  [/uzun\s*vadeli\s*y[uüÜ]k[uüÜ]ml/i,               'totalNonCurrentLiabilities'],
  // Öz kaynak
  [/[oöÖ]denmi[sşŞ]\s*sermaye/i,                     'paidInCapital'],
  [/toplam\s*[oöÖ]z\s*kaynak/i,                      'totalEquity'],
  [/[oöÖ]z\s*kaynak\s*toplam/i,                      'totalEquity'],
  [/[oöÖ]z\s*kaynaklar/i,                            'totalEquity'],             // "V. Öz Kaynaklar 1.234" ($ removed)
  [/pas[iıİ]f\s*toplam/i,                              'totalLiabilitiesAndEquity'],
]

/**
 * Sayı çıkarma: "1.234.567,89" veya "1234567.89" → number
 */
function parseNumber(raw: string): number | null {
  // Parantez = negatif: (1.234) → -1234
  const negative = raw.includes('(') || raw.includes(')')
  let cleaned = raw.replace(/[()]/g, '').trim()

  // Türk formatı: 1.234.567,89
  if (cleaned.includes(',') && cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.')
  } else {
    // İngiliz formatı veya noktalı: 1,234,567.89
    cleaned = cleaned.replace(/,/g, '')
  }

  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return negative ? -num : num
}

/**
 * PDF metninden yıl bilgisini çıkar
 */
function extractYear(text: string): number | undefined {
  const lines = text.split('\n').map(l => l.trim())

  // GIB beyanname: "Yılı" satırının ardından 1-4 satır içinde "2025" gibi tek başına yıl
  // Örnek: "Yılı\nDönem\n2025\n4. Dönem"
  for (let i = 0; i < lines.length; i++) {
    if (/^Y[iıİ]l[ıi]?[:\s]*$/.test(lines[i])) {
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
        if (/^(20[12]\d)$/.test(lines[j])) return parseInt(lines[j])
      }
    }
  }

  // "Yıl  2025" veya "Yılı: 2025" aynı satırda
  const yilSatir = text.match(/\bY[iıİ]l[ıi]?\s*:?\s*(20[12]\d)\b/)
  if (yilSatir) return parseInt(yilSatir[1])

  // "Cari Dönem: 2025" veya "Dönem Bitişi: 2025"
  const cariMatch = text.match(/(?:cari\s*d[oöÖ]nem|d[oöÖ]nem\s*biti[sşŞ]i?)[\s:–\-]*(?:\d{2}[.\/]\d{2}[.\/])?(20[12]\d)/i)
  if (cariMatch) return parseInt(cariMatch[1])

  // "01.01.2025 - 30.09.2025" → bitiş yılı al
  const dateRange = text.match(/01[.\-]01[.\-](20[12]\d)\s*[-–]\s*\d{2}[.\-]\d{2}[.\-](20[12]\d)/)
  if (dateRange) return parseInt(dateRange[2])

  // Fallback: "Onay Zamanı" ve "Düzenleme Tarihi" satırlarını hariç tut, en sık geçeni al
  const cleaned = text
    .replace(/onay\s*zaman[iıİ][^\n]*/gi, '')
    .replace(/düzenleme\s*tarihi[^\n]*/gi, '')
    .replace(/kabul\s*tarihi[^\n]*/gi, '')
  const yearMatch = cleaned.match(/20[12]\d/g)
  if (yearMatch) {
    const counts: Record<string, number> = {}
    yearMatch.forEach(y => { counts[y] = (counts[y] || 0) + 1 })
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return parseInt(sorted[0][0])
  }
  return undefined
}

/**
 * PDF metninden dönem bilgisini çıkar
 */
function extractPeriod(text: string): string {
  const t = text.toLowerCase()

  // Tarih aralığı tespiti (en güvenilir yöntem)
  if (/01[\.\-]01[\.\-]20\d\d\s*[-–]\s*31[\.\-]03[\.\-]20\d\d/.test(t)) return 'Q1'
  if (/01[\.\-]01[\.\-]20\d\d\s*[-–]\s*30[\.\-]06[\.\-]20\d\d/.test(t)) return 'Q2'
  if (/01[\.\-]01[\.\-]20\d\d\s*[-–]\s*30[\.\-]09[\.\-]20\d\d/.test(t)) return 'Q3'
  if (/01[\.\-]01[\.\-]20\d\d\s*[-–]\s*31[\.\-]12[\.\-]20\d\d/.test(t)) {
    // 01.01-31.12 → 4. geçici vergi mi yoksa kesin beyan mı?
    if (t.includes('geçici') || t.includes('4. dönem') || t.includes('dördüncü')) return 'Q4'
    return 'ANNUAL'
  }

  // GIB formu: "Dönem  4. Dönem" veya sadece "4. Dönem" satırı
  if (/\b1\.?\s*d[oö]nem\b|birinci\s*d[oö]nem|1\.\s*çeyrek/.test(t)) return 'Q1'
  if (/\b2\.?\s*d[oö]nem\b|ikinci\s*d[oö]nem|2\.\s*çeyrek/.test(t))  return 'Q2'
  if (/\b3\.?\s*d[oö]nem\b|üçüncü\s*d[oö]nem|3\.\s*çeyrek/.test(t)) return 'Q3'
  if (/\b4\.?\s*d[oö]nem\b|dördüncü\s*d[oö]nem|4\.\s*çeyrek/.test(t)) return 'Q4'

  // Geçici vergi ifadesi varsa + ay/tarih aralığından çıkar
  if (t.includes('geçici vergi')) {
    if (/mart|31[\.\-]03/.test(t))       return 'Q1'
    if (/haziran|30[\.\-]06/.test(t))    return 'Q2'
    if (/eylül|30[\.\-]09/.test(t))      return 'Q3'
    if (/aral[ıi]k|31[\.\-]12/.test(t)) return 'Q4'
    // Dönem numarası rakamla belirtilmişse (ör. "4. dönem" zaten yukarıda yakalandı)
  }

  return 'ANNUAL'
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedRow[]> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  const text = result.text

  const year = extractYear(text)
  const period = extractPeriod(text)

  // Kurumlar Vergisi YILLIK beyannamesi: sütun sırası [Önceki] [Cari] (cari = son sayı)
  // Geçici vergi beyannamesi (GV veya KV mükellefleri için): sütun sırası [Cari] [Önceki] (cari = ilk sayı)
  // "GEÇİCİ VERGİ BEYANNAMESİ" → her zaman GV formatı (Cari = ilk sayı), KV mükellef olsa bile
  // "KURUMLAR VERGİSİ BEYANNAMESİ" (yıllık, geçici değil) → KV formatı (Cari = son sayı)
  // Türkçe İ (U+0130) JS /i flag ile eşleşmez → karakter sınıfları kullan
  const isGecici   = /ge[çÇ][iıİ][cC][iıİ]\s*verg[iıİ]\s*beyanname/i.test(text)
  const isKVYillik = /kurumlar\s*verg[iıİ][sS][iıİ]\s*beyanname/i.test(text) && !isGecici
  const isKV = isKVYillik

  const fields: Record<string, number | null> = {}
  const unmapped: string[] = []
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  for (const line of lines) {
    let matched = false

    for (const [pattern, fieldName, negateIfPositive] of PDF_FIELD_MAP) {
      if (pattern.test(line)) {
        // Satırdaki tüm sayıları bul
        const numbers = line.match(/-?[\d.,()]+(?:\s*[\d.,()]+)*/g)
          ?.map(n => n.trim()).filter(n => /\d/.test(n)) ?? []

        if (numbers.length > 0) {
          let val: number | null = null

          if (isKV && numbers.length >= 2) {
            // KV formatı: [Önceki] [Cari] — cari = son geçerli sayı
            for (const n of [...numbers].reverse()) {
              const candidate = parseNumber(n)
              if (candidate !== null && Math.abs(candidate) > 1) {
                val = candidate
                break
              }
            }
          } else {
            // GV / diğer: [Cari] [Önceki] — cari = ilk geçerli sayı
            for (const n of numbers) {
              const candidate = parseNumber(n)
              if (candidate !== null && Math.abs(candidate) > 1) {
                val = candidate
                break
              }
            }
          }

          // "Dönem Net Zararı" gibi kayıp satırlarında pozitif değer → negatife çevir
          if (val !== null && negateIfPositive && val > 0) {
            val = -val
          }

          if (val !== null && !fields[fieldName]) {
            fields[fieldName] = val
            matched = true
          }
        }
        break
      }
    }

    // Eşlenemeyen ama sayı içeren satırlar
    if (!matched && /\d/.test(line) && line.length > 3 && line.length < 200) {
      const label = line.replace(/-?[\d.,()]+/g, '').trim()
      if (label.length > 2 && label.length < 60) {
        unmapped.push(label)
      }
    }
  }

  // Hesaplanabilir alanları türet
  if (!fields.totalAssets && fields.totalCurrentAssets && fields.totalNonCurrentAssets) {
    fields.totalAssets = fields.totalCurrentAssets + fields.totalNonCurrentAssets
  }
  if (!fields.grossProfit && fields.revenue && fields.cogs) {
    fields.grossProfit = fields.revenue - Math.abs(fields.cogs)
  }
  if (!fields.ebitda && fields.ebit && fields.depreciation) {
    fields.ebitda = fields.ebit + Math.abs(fields.depreciation)
  }

  // En az birkaç alan eşlendi mi?
  const mappedCount = Object.values(fields).filter(v => v !== null).length
  if (mappedCount === 0) {
    return []
  }

  return [{ year, period, fields, unmapped: unmapped.slice(0, 20) }]
}
