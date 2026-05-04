/**
 * PDF parser — GVB (Gelir Vergisi Beyannamesi) ve KVB (Kurumlar Vergisi Beyannamesi)
 * Tüm karşılaştırmalar norm() ile yapılır; Türkçe string literal kullanılmaz.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse')
import type { ParsedRow } from './excel'

// ─── norm ─────────────────────────────────────────────────────────────────────

function norm(s: unknown): string {
  // ÖNEMLİ: İ (U+0130) toLowerCase() → 'i\u0307' (2 karakter) üretir.
  // Bu yüzden İ'yi ÖNCE değiştirip sonra toLowerCase çağırıyoruz.
  return String(s ?? '')
    .replace(/İ/g, 'i')   // U+0130 → 'i' (toLowerCase öncesi, 1→1 karakter)
    .toLowerCase()
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')  // ı (U+0131) ayrıca yakala
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[âÂ]/g, 'a')  // Faz 7.3.24: "Kâr" (U+00E2) → 'a' — TDHP PDF'lerde kar/kâr tutarsız
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
  ['net satislar',                        'revenue'],
  ['satis hasilati',                      'revenue'],
  ['brut satislar hasilati',              'revenue'],
  ['satislarin maliyeti',                 'cogs'],
  ['brut satis kari',                     'grossProfit'],
  ['faaliyet giderleri',                  'operatingExpenses'],
  ['faaliyet kari',                       'ebit'],
  // F./G. bölüm başlıkları → ALT SATIRLARDAN ÖNCE eşleşmeli (daha spesifik)
  // "F. Diğer Faaliyetlerden Olağan Gelir ve Karlar X Y" → cari dönem toplamı
  ['diger faaliyetlerden olagan gelir',   'otherIncome'],
  ['diger faaliyetlerden olagan gider',   'otherExpense'],
  // Alt satır fallback (F. başlığı zaten eşleşmişse !(field in cari) engeller)
  ['diger olagan gelir',                  'otherIncome'],
  ['diger olagan gider',                  'otherExpense'],
  ['finansman giderleri',                 'interestExpense'],
  ['faiz giderleri',                      'interestExpense'],
  ['olagandisi gelir',                    'extraordinaryIncome'],
  ['olagandisi gider',                    'extraordinaryExpense'],
  ['olagan kar',                          'ebt'],
  ['donem kari veya zarari',              'ebt'],
  ['donem net kari',                      'netProfit'],
  ['donem net zarari',                    'netProfit'],
  ['net kar veya zarar',                  'netProfit'],
  ['net kar',                             'netProfit'],
  ['vergi gideri',                        'taxExpense'],
  ['donem kari vergi',                    'taxExpense'],
]

function matchIncomeLine(label: string): { field: string; negate: boolean } | null {
  const n = norm(label)

  // F grubu alt satırları: enflasyon düzeltmesi kar/zarar (INCOME_MAP'ten önce yakala)
  if (n.includes('enflasyon') && n.includes('duzelt')) {
    if (n.includes('zarar')) return { field: 'otherExpense', negate: false }
    if (n.includes('kar'))   return { field: 'otherIncome',  negate: false }
  }
  // Kambiyo karları vs zararları
  if (n.includes('kambiy')) {
    if (n.includes('zarar')) return { field: 'otherExpense', negate: false }
    if (n.includes('kar'))   return { field: 'otherIncome',  negate: false }
  }
  // Faiz gelirleri (F grubu alt satırı — faiz GİDERLERİ ile karışmaz)
  if (n.includes('faiz') && n.includes('gelir')) return { field: 'otherIncome', negate: false }

  for (const [pat, field, negate] of INCOME_MAP) {
    if (n.includes(pat)) return { field, negate: !!negate }
  }
  return null
}

// ─── Bilanço bölüm tespiti ────────────────────────────────────────────────────

type EkSection = 'donen' | 'duran' | 'kv' | 'uv' | 'oz' | 'gelir' | null

function detectEkSection(line: string): EkSection | null {
  const n = norm(line)
  if (/^i[\s.\-]\s*donen\s*varlik/.test(n))  return 'donen'
  if (/^ii[\s.\-]\s*duran\s*varlik/.test(n)) return 'duran'
  if (/^iii[\s.\-]\s*kisa\s*vadeli/.test(n)) return 'kv'
  if (/^iv[\s.\-]\s*uzun\s*vadeli/.test(n))  return 'uv'
  if (/^v[\s.\-]\s*oz\s*(kaynak|serma)/.test(n)) return 'oz'
  // "gelir tablosu" sadece satır başında, bağımsız başlık olarak tetiklensin
  // (PDF'lerde bilanço içinde geçen referanslar erken bölüm değişikliğine yol açıyor)
  if (/^gelir\s*tablosu(\s|eki|$)/.test(n)) return 'gelir'
  // Prefix'siz başlıklar için fallback (bazı PDF'lerde "II-" yerine sadece "DURAN VARLIKLAR")
  if (/^donen\s*varlik/.test(n) && !n.includes('toplam'))  return 'donen'
  if (/^duran\s*varlik/.test(n) && !n.includes('toplam'))  return 'duran'
  if (/^kisa\s*vadeli/.test(n)  && !n.includes('toplam'))  return 'kv'
  if (/^uzun\s*vadeli/.test(n)  && !n.includes('toplam'))  return 'uv'
  if (/^oz\s*(kaynak|serma)/.test(n) && !n.includes('toplam')) return 'oz'
  return null
}

function matchBilField(label: string, sec: EkSection): string | null {
  const nRaw = norm(label)
  // KVB PDF'lerinde alt kalemler ". A. Hazır Değerler" gibi gelir — başındaki ". " soy
  const n = nRaw.replace(/^[\s.]+/, '')

  if (sec === 'donen') {
    if (/^a[\s.\-]\s*hazir/.test(n))           return 'cash'
    if (/^b[\s.\-]\s*menkul/.test(n))          return 'shortTermInvestments'
    if (/^c[\s.\-]\s*ticari\s*alacak/.test(n)) return 'tradeReceivables'
    if (/^d[\s.\-]\s*diger\s*alacak/.test(n))  return 'otherReceivables'
    if (/^e[\s.\-]\s*stoklar/.test(n))         return 'inventory'
    if (/^f[\s.\-]\s*(yillara\s*yaygin|sozlesme\s*varlik|insaat)/.test(n)) return 'constructionCosts'
    if (/^g[\s.\-]\s*gelecek\s*ay/.test(n))    return 'prepaidExpenses'
    if (/^h[\s.\-]\s*diger\s*donen/.test(n))   return 'otherCurrentAssets'
    // Genel keyword eşleşmeleri
    if (n.includes('hazir deger') || n.includes('nakit ve nakit')) return 'cash'
    if (n.includes('ticari alacak'))        return 'tradeReceivables'
    if (n.includes('stoklar') || n.includes('mal mevcut') || n.includes('emtia')) return 'inventory'
    if (n.includes('diger alacak'))         return 'otherReceivables'
    if (n.includes('diger donen'))          return 'otherCurrentAssets'
    if (n.includes('gelecek ay') && n.includes('gider')) return 'prepaidExpenses'
    // İnşaat şirketleri: yıllara yaygın, sözleşme varlıkları, hakediş alacakları
    if (n.includes('yillara yaygin'))        return 'constructionCosts'
    if (n.includes('sozlesme') && (n.includes('varlik') || n.includes('alacak'))) return 'constructionCosts'
    if (n.includes('hakedis') && n.includes('alacak')) return 'constructionCosts'
    if (n.includes('devam eden') && (n.includes('is') || n.includes('proje') || n.includes('insaat'))) return 'constructionCosts'
    // 159 Verilen Sipariş Avansları — TDHP'de Stoklar grubu (15x) alt hesabı.
    // Rasyo motorunda ayrı tutulur: inşaat DIO=sadece 151+153, diğer sektörler inventory+prepaidSuppliers kullanır.
    if (n.includes('verilen') && (n.includes('avansi') || n.includes('avans')) && !/^\d/.test(n)) return 'prepaidSuppliers'
    if ((n.includes('siparis avansi') || n.includes('is avansi')) && !/^\d/.test(n)) return 'prepaidSuppliers'
    if (n.includes('pesin odenen') || n.includes('pesin odenmis')) return 'prepaidExpenses'
  }

  if (sec === 'duran') {
    if (/^a[\s.\-]\s*ticari\s*alacak/.test(n)) return 'longTermTradeReceivables'
    if (/^b[\s.\-]\s*diger\s*alacak/.test(n))  return 'longTermOtherReceivables'
    if (/^c[\s.\-]\s*mali\s*duran/.test(n))    return 'longTermInvestments'
    if (/^d[\s.\-]\s*maddi\s*duran/.test(n))   return 'tangibleAssets'
    if (/^e[\s.\-]\s*maddi\s*olmayan/.test(n)) return 'intangibleAssets'
    if (/^f[\s.\-]\s*ozel\s*tukenmeye/.test(n)) return 'depletableAssets'
    if (/^g[\s.\-]\s*gelecek\s*yil/.test(n))   return 'longTermPrepaidExpenses'
    if (/^h[\s.\-]\s*diger\s*duran/.test(n))   return 'otherNonCurrentAssets'
    if (n.includes('maddi duran') || n.includes('maddi varlik') || n.includes('gayrimenkul') || n.includes('demirbas')) return 'tangibleAssets'
    if (n.includes('maddi olmayan'))  return 'intangibleAssets'
    if (n.includes('mali duran'))     return 'longTermInvestments'
    if (n.includes('gelecek yil') && n.includes('gider')) return 'longTermPrepaidExpenses'
    if (n.includes('diger duran'))    return 'otherNonCurrentAssets'
  }

  if (sec === 'kv') {
    if (/^a[\s.\-]\s*mali\s*bor/.test(n))          return 'shortTermFinancialDebt'
    if (/^b[\s.\-]\s*ticari\s*bor/.test(n))         return 'tradePayables'
    if (/^c[\s.\-]\s*diger\s*bor/.test(n))          return 'otherShortTermPayables'
    if (/^d[\s.\-]\s*alinan\s*avans/.test(n))       return 'advancesReceived'
    if (/^e[\s.\-]\s*yillara\s*yaygin/.test(n))     return 'constructionProgress'
    if (n.includes('yillara yaygin'))                return 'constructionProgress'
    if (/^f[\s.\-]\s*odenecek\s*vergi/.test(n))     return 'taxPayables'
    if (/^g[\s.\-]\s*bor.?\s*ve\s*gider/.test(n))   return 'shortTermProvisions'
    if (/^h[\s.\-]\s*gelecek\s*ay.*gelir/.test(n))  return 'deferredRevenue'
    if (/^[i][\s.\-]\s*diger/.test(n))              return 'otherCurrentLiabilities'
    if (n.includes('mali bor'))           return 'shortTermFinancialDebt'
    if (n.includes('ticari bor') && !n.includes('uzun')) return 'tradePayables'
    if (n.includes('diger bor') && !n.includes('uzun'))  return 'otherShortTermPayables'
    if (n.includes('alinan avans') && !n.includes('uzun')) return 'advancesReceived'
    if (n.includes('odenecek vergi'))     return 'taxPayables'
    if (n.includes('gelecek ay') && n.includes('gelir')) return 'deferredRevenue'
  }

  if (sec === 'uv') {
    if (/^a[\s.\-]\s*mali\s*bor/.test(n))         return 'longTermFinancialDebt'
    if (/^b[\s.\-]\s*ticari\s*bor/.test(n))        return 'longTermTradePayables'
    if (/^c[\s.\-]\s*diger\s*bor/.test(n))         return 'longTermOtherPayables'
    if (/^d[\s.\-]\s*alinan\s*avans/.test(n))      return 'longTermAdvancesReceived'
    if (/^g[\s.\-]\s*bor.?\s*ve\s*gider/.test(n))  return 'longTermProvisions'
    if (/^[i][\s.\-]\s*diger/.test(n))             return 'otherNonCurrentLiabilities'
    if (n.includes('mali bor'))          return 'longTermFinancialDebt'
    if (n.includes('diger bor'))         return 'longTermOtherPayables'
    if (n.includes('alinan avans'))      return 'longTermAdvancesReceived'
  }

  if (sec === 'oz') {
    if (/^a[\s.\-]\s*odenmis\s*sermaye/.test(n))      return 'paidInCapital'
    // Faz 7.3.24: 'yedeg' → 'yedek' — norm("Yedekleri") = "yedekleri" ('k' kalır, ğ yok)
    if (/^b[\s.\-]\s*sermaye\s*yedek/.test(n))        return 'capitalReserves'
    if (/^c[\s.\-]\s*kar\s*yedek/.test(n))            return 'profitReserves'
    if (/^d[\s.\-]\s*gecmis\s*yil.*kar/.test(n))      return 'retainedEarnings'
    if (/^e[\s.\-]\s*gecmis\s*yil.*zarar/.test(n))    return 'retainedLosses'
    if (/^f[\s.\-]\s*donem\s*net\s*kar/.test(n))      return 'netProfitCurrentYear'
    if (n.includes('odenmis sermaye'))   return 'paidInCapital'
    if (n.includes('sermaye yedek'))     return 'capitalReserves'
    if (n.includes('kar yedek'))         return 'profitReserves'
    if (n.includes('gecmis yil') && n.includes('kar'))   return 'retainedEarnings'
    if (n.includes('gecmis yil') && n.includes('zarar')) return 'retainedLosses'
    if (n.includes('donem net kar'))     return 'netProfitCurrentYear'
  }

  // ── Bölüm-bağımsız bilanço alt-kalem fallback ─────────────────────────────
  // 3-sütunlu KVB PDF'lerinde "GELİR TABLOSU" başlığı bilanço satırlarından ÖNCE
  // PDF metin akışına girer; bu yüzden sec='gelir' iken dönen alt kalemleri görülebilir.
  // Aşağıdaki kalemler GELİR TABLOSUNDA ASLA yer almaz → section'a bakılmaksızın eşle.
  if (n.includes('stoklar') || n.includes('mal mevcut') || n.includes('emtia'))
    return 'inventory'
  if (n.includes('yillara yaygin') || (n.includes('sozlesme') && n.includes('varlik') && !n.includes('bor')))
    return 'constructionCosts'
  if (n.includes('hakedis') && n.includes('alacak'))
    return 'constructionCosts'
  // 159 Verilen Sipariş Avansları — prepaidSuppliers'da tutulur (inşaat DIO için ayrı)
  if (n.includes('verilen') && (n.includes('siparis') || n.includes('avansi')) && !n.includes('bor') && !/^\d/.test(n))
    return 'prepaidSuppliers'
  if (n.includes('hazir deger') || n.includes('nakit ve nakit benzeri'))
    return 'cash'
  if (n.includes('maddi duran') && !n.includes('bor'))
    return 'tangibleAssets'
  if (n.includes('maddi olmayan') && n.includes('duran') && !n.includes('bor'))
    return 'intangibleAssets'

  // Global gelir tablosu — bilanço bölümlerinde (oz/donen/duran/kv/uv) income match yapma.
  // Aksi halde ". 2. Dönem Net Zararı (-)" gibi özkaynak alt kalemleri yanlış eşleşir.
  const isBilSection = sec === 'donen' || sec === 'duran' || sec === 'kv' || sec === 'uv' || sec === 'oz'
  if (!isBilSection) {
    const im = matchIncomeLine(label)
    if (im) return im.field
  }

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

// Bilanço bölüm toplamları — PDF'de birden fazla kez geçebilir (özet + detaylı).
// Bu alanlar için her zaman son değer alınır (alt-bölüm toplam → gerçek toplam sırası).
const TOTAL_FIELDS = new Set([
  'totalCurrentAssets', 'totalNonCurrentAssets', 'totalAssets',
  'totalCurrentLiabilities', 'totalNonCurrentLiabilities',
  'totalEquity', 'totalLiabilitiesAndEquity',
])

export function parseEkSection(section: string): { cari: Record<string, number>; onceki: Record<string, number> } {
  const cari:   Record<string, number> = {}  // cari dönem (son sütun)
  const onceki: Record<string, number> = {}  // önceki dönem (ilk sütun, varsa)
  let sec: EkSection = null

  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.length < 3) continue

    const detected = detectEkSection(line)
    if (detected !== null) {
      console.log('[ek] section=>', detected, '| line:', line.slice(0, 60))
      sec = detected
    }

    const nums = line.match(TR_NUM)
    if (!nums) continue

    const label = line.replace(TR_NUM, '').replace(/\(-\)/g, '').replace(/\s+/g, ' ').trim()
    if (!label || label.length < 3) continue

    const field = matchBilField(label, sec)
    if (!field) {
      console.log('[ek] NO MATCH sec=', sec, '| label:', label.slice(0, 60), '| nums:', nums)
      continue
    }
    console.log('[ek] MATCH field=', field, 'sec=', sec, '| nums:', nums)

    // Gelir tablosu satırlarında 100 TL'den küçük değerler form artefaktı — yoksay
    const minAbs = sec === 'gelir' ? 100 : 0

    // Cari dönem = EN SON sayı (2 sütunlu tabloda sağ kolon, tek sütunluda tek sayı)
    const vLast = parseTR(nums[nums.length - 1])
    if (vLast !== null && Math.abs(vLast) >= minAbs) {
      if (field === 'otherIncome' || field === 'otherExpense') {
        // F/G grubu alt satırları toplanır (Faiz, Kambiyo, Enflasyon, Diğer)
        cari[field] = (cari[field] ?? 0) + vLast
      } else if (TOTAL_FIELDS.has(field)) {
        // Bölüm toplamları için her zaman son değer alınır
        // (PDF'de özet + detaylı iki kez geçiyorsa gerçek toplam kazanır)
        cari[field] = vLast
      } else if (!(field in cari)) {
        cari[field] = vLast
      }
    }
    // Önceki dönem = ilk sayı (2 sütunluysa sol kolon)
    if (nums.length > 1) {
      const vFirst = parseTR(nums[0])
      if (vFirst !== null && Math.abs(vFirst) >= minAbs) {
        if (field === 'otherIncome' || field === 'otherExpense') {
          onceki[field] = (onceki[field] ?? 0) + vFirst
        } else if (TOTAL_FIELDS.has(field)) {
          onceki[field] = vFirst
        } else if (!(field in onceki)) {
          onceki[field] = vFirst
        }
      }
    }
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

/**
 * PDF'nin 'BEYANNAME' mi, 'MIZAN' mı yoksa 'UNKNOWN' mu olduğunu döner.
 * Kontrol sırası önemli: mizan PDF'leri beyanname kelimesi içerebilir,
 * bu yüzden mizan önce kontrol edilir.
 */
export function detectPdfType(text: string): 'BEYANNAME' | 'MIZAN' | 'UNKNOWN' {
  if (detectPdfMizan(text)) return 'MIZAN'
  const t = detectType(text)
  if (t !== 'unknown') return 'BEYANNAME'
  return 'UNKNOWN'
}

function parsePdfMizan(text: string): ParsedRow[] {
  const dateMatch = text.match(
    /(\d{2})[.\/-](\d{2})[.\/-](20\d{2})(?:\s*[-\u2013\u2014]\s*|\s+)(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/
  )
  if (!dateMatch) return []

  const endMonth = parseInt(dateMatch[5])
  const year     = parseInt(dateMatch[6])
  const period   = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'ANNUAL'

  const fields: Record<string, number | null> = {}

  const dataStartIdx = norm(text).indexOf('hesap kodu')
  const lines = text.slice(dataStartIdx > 0 ? dataStartIdx : 0).split('\n')

  const CODE_MAP: Record<string, string> = {
    '100': 'cash', '101': 'cash', '102': 'cash',
    '120': 'tradeReceivables', '121': 'tradeReceivables',
    '150': 'inventory', '151': 'inventory', '153': 'inventory', '159': 'prepaidSuppliers',
    '252': 'tangibleAssets', '253': 'tangibleAssets', '254': 'tangibleAssets', '255': 'tangibleAssets',
    '260': 'intangibleAssets',
    '300': 'shortTermFinancialDebt', '301': 'shortTermFinancialDebt',
    '320': 'tradePayables', '321': 'tradePayables',
    '340': 'advancesReceived',
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
  return [{ year, period, fields, unmapped: [], docType: 'MIZAN' }]
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

// ─── TDHP Ayrıntılı Bilanço/Gelir Tablosu Parser ────────────────────────────

// Ana bölüm türleri
type TdhpMainSection = 'AKTIF' | 'PASIF' | 'INCOME_STATEMENT' | null

// Alt bölüm türleri
type TdhpSubSection =
  // AKTİF alt bölümleri
  | 'HAZIR_DEGERLER'
  | 'TICARI_ALACAKLAR'
  | 'DIGER_ALACAKLAR'
  | 'STOKLAR'
  | 'GELECEK_AYLARA_AIT_GIDERLER'
  | 'DIGER_DONEN_VARLIKLAR'
  | 'TICARI_ALACAKLAR_UV'
  | 'DIGER_ALACAKLAR_UV'
  | 'MALI_DURAN_VARLIKLAR'
  | 'MADDI_DURAN_VARLIKLAR'
  | 'MADDI_OLMAYAN_DURAN_VARLIKLAR'
  | 'GELECEK_YILLARA_AIT_GIDERLER'
  // PASİF alt bölümleri
  | 'MALI_BORCLAR_KV'
  | 'TICARI_BORCLAR_KV'
  | 'DIGER_BORCLAR_KV'
  | 'ALINAN_AVANSLAR_KV'
  | 'YILLARA_YAYGIN_INSAAT_KV'
  | 'ODENEN_VERGI_KV'
  | 'MALI_BORCLAR_UV'
  | 'TICARI_BORCLAR_UV'
  | 'DIGER_BORCLAR_UV'
  | 'OZKAYNAKLAR'
  // GELİR TABLOSU alt bölümleri
  | 'BRUT_SATISLAR'
  | 'SATIS_INDIRIMLERI'
  | 'SATIS_MALIYETI'
  | 'FAALIYET_GIDERLERI'
  | 'DIGER_OLAGAN_GELIR_KARLAR'
  | 'DIGER_OLAGAN_GIDER_ZARARLAR'
  | 'FINANSMAN_GIDERLERI'
  | 'OLAGANDISI_GELIR_KARLAR'
  | 'OLAGANDISI_GIDER_ZARARLAR'
  | 'DONEM_KARI_VERGI'
  | null

interface TdhpContext {
  main: TdhpMainSection
  sub: TdhpSubSection
}

// ─── TDHP Ana Bölüm Tespiti ───────────────────────────────────────────────────

function detectTdhpMainSection(n: string): TdhpMainSection | null {
  // Aktif tarafı — bilanço bölüm başlıkları (I/II ile başlar veya tek kelime başlık)
  if (/^i[\s.\-]\s*donen\s*varlik/.test(n) && !n.includes('toplam')) return 'AKTIF'
  if (/^ii[\s.\-]\s*duran\s*varlik/.test(n) && !n.includes('toplam')) return 'AKTIF'
  // Prefix'siz donen/duran varlık: Sadece başlık satırı olarak — çok kısa satırlar (veri yok)
  if (/^donen\s*varliklar?$/.test(n)) return 'AKTIF'
  if (/^duran\s*varliklar?$/.test(n)) return 'AKTIF'
  // Pasif tarafı — "yabancı kaynaklar" ile birlikte gelir (veri satırları sadece bir kavram içerir)
  if (/^iii[\s.\-]\s*kisa\s*vadeli/.test(n) && !n.includes('toplam')) return 'PASIF'
  if (/^iv[\s.\-]\s*uzun\s*vadeli/.test(n) && !n.includes('toplam')) return 'PASIF'
  // Prefix'siz kisa/uzun: sadece "yabancı kaynaklar" ile birlikte olan başlıklar
  if (/^kisa\s*vadeli\s*(yabanci|kaynaklar)/.test(n) && !n.includes('toplam')) return 'PASIF'
  if (/^uzun\s*vadeli\s*(yabanci|kaynaklar)/.test(n) && !n.includes('toplam')) return 'PASIF'
  if (/^(v[\s.\-]\s*)?oz\s*(kaynak|serma)/.test(n) && !n.includes('toplam')) return 'PASIF'
  // Gelir tablosu
  if (/^(ayrintili\s*)?gelir\s*tablosu/.test(n)) return 'INCOME_STATEMENT'
  if (/^a[\s.\-]\s*brut\s*satis/.test(n)) return 'INCOME_STATEMENT'
  return null
}

// ─── TDHP Alt Bölüm Tespiti ───────────────────────────────────────────────────

function detectTdhpSubSection(n: string, main: TdhpMainSection, isUzunVadeli = false): TdhpSubSection | null {
  if (main === 'AKTIF') {
    // Dönen varlık alt bölümleri (A-H harfleriyle başlayan başlıklar)
    if (/^a[\s.\-]\s*hazir\s*deger/.test(n))                     return 'HAZIR_DEGERLER'
    if (/^c[\s.\-]\s*ticari\s*alacak/.test(n))                   return 'TICARI_ALACAKLAR'
    if (/^d[\s.\-]\s*diger\s*alacak/.test(n))                    return 'DIGER_ALACAKLAR'
    if (/^e[\s.\-]\s*stoklar/.test(n))                           return 'STOKLAR'
    if (/^g[\s.\-]\s*gelecek\s*ay/.test(n))                      return 'GELECEK_AYLARA_AIT_GIDERLER'
    if (/^h[\s.\-]\s*diger\s*donen/.test(n))                     return 'DIGER_DONEN_VARLIKLAR'
    // Duran varlık alt bölümleri (A-G harfleriyle başlayan başlıklar)
    if (/^a[\s.\-]\s*ticari\s*alacak/.test(n))                   return 'TICARI_ALACAKLAR_UV'
    if (/^b[\s.\-]\s*diger\s*alacak/.test(n))                    return 'DIGER_ALACAKLAR_UV'
    if (/^c[\s.\-]\s*mali\s*duran/.test(n))                      return 'MALI_DURAN_VARLIKLAR'
    if (/^d[\s.\-]\s*maddi\s*duran/.test(n))                     return 'MADDI_DURAN_VARLIKLAR'
    if (/^e[\s.\-]\s*maddi\s*olmayan/.test(n))                   return 'MADDI_OLMAYAN_DURAN_VARLIKLAR'
    if (/^g[\s.\-]\s*gelecek\s*yil/.test(n))                     return 'GELECEK_YILLARA_AIT_GIDERLER'
    // Keyword fallback: sadece başlık satırları olarak gelen tam eşleşmeler
    // (veri satırlarından ayırt etmek için sayı içermeyen kısa satırlar)
    if (/^hazir\s*degerler?$/.test(n))                            return 'HAZIR_DEGERLER'
    if (/^(e[\s.\-]\s*)?stoklar$/.test(n))                       return 'STOKLAR'
    if (/^maddi\s*olmayan\s*duran\s*varliklar?$/.test(n))         return 'MADDI_OLMAYAN_DURAN_VARLIKLAR'
    if (/^maddi\s*duran\s*varliklar?$/.test(n))                   return 'MADDI_DURAN_VARLIKLAR'
    if (/^mali\s*duran\s*varliklar?$/.test(n))                    return 'MALI_DURAN_VARLIKLAR'
  }

  if (main === 'PASIF') {
    // Uzun vadeli bölümdeyiz → UV sub-section'ları döndür
    if (isUzunVadeli) {
      if (/^a[\s.\-]\s*mali\s*bor/.test(n))    return 'MALI_BORCLAR_UV'
      if (/^b[\s.\-]\s*ticari\s*bor/.test(n))  return 'TICARI_BORCLAR_UV'
      if (/^c[\s.\-]\s*diger\s*bor/.test(n))   return 'DIGER_BORCLAR_UV'
    }
    // Kısa vadeli (veya UV öncesi) bölüm
    if (/^a[\s.\-]\s*mali\s*bor/.test(n))      return 'MALI_BORCLAR_KV'
    if (/^b[\s.\-]\s*ticari\s*bor/.test(n))    return 'TICARI_BORCLAR_KV'
    if (/^c[\s.\-]\s*diger\s*bor/.test(n))     return 'DIGER_BORCLAR_KV'
    if (/^d[\s.\-]\s*alinan\s*avans/.test(n))  return 'ALINAN_AVANSLAR_KV'
    if (/^e[\s.\-]\s*yillara\s*yaygin/.test(n)) return 'YILLARA_YAYGIN_INSAAT_KV'
    if (/^f[\s.\-]\s*odenecek/.test(n))           return 'ODENEN_VERGI_KV'
    if (/^(v[\s.\-]\s*)?oz\s*(kaynak|serma)/.test(n) && !n.includes('toplam')) return 'OZKAYNAKLAR'
    if (/^oz\s*(kaynak|serma)/.test(n) && !n.includes('toplam'))               return 'OZKAYNAKLAR'
  }

  if (main === 'INCOME_STATEMENT') {
    if (/^a[\s.\-]\s*brut\s*satis/.test(n))           return 'BRUT_SATISLAR'
    if (/^b[\s.\-]\s*satis\s*indiri/.test(n))         return 'SATIS_INDIRIMLERI'
    if (/^[cd][\s.\-]\s*satis.*(maliyet|smm)/.test(n)) return 'SATIS_MALIYETI'
    if (/^d[\s.\-]\s*faaliyet\s*gider/.test(n))       return 'FAALIYET_GIDERLERI'
    if (/^e[\s.\-]\s*diger.*olagan.*gelir/.test(n))   return 'DIGER_OLAGAN_GELIR_KARLAR'
    if (/^f[\s.\-]\s*diger.*olagan.*gider/.test(n))   return 'DIGER_OLAGAN_GIDER_ZARARLAR'
    if (/^g[\s.\-]\s*finansman\s*gider/.test(n))      return 'FINANSMAN_GIDERLERI'
    if (/^h[\s.\-]\s*olagandisi.*gelir/.test(n))      return 'OLAGANDISI_GELIR_KARLAR'
    if (/^i[\s.\-]\s*olagandisi.*gider/.test(n))      return 'OLAGANDISI_GIDER_ZARARLAR'
    if (/donem\s*kari\s*vergi/.test(n))               return 'DONEM_KARI_VERGI'
    // keyword fallback
    if (n.includes('brut satis') && !n.includes('toplam')) return 'BRUT_SATISLAR'
    if (n.includes('satis indiri'))                        return 'SATIS_INDIRIMLERI'
    if (n.includes('finansman gider'))                     return 'FINANSMAN_GIDERLERI'
    if (n.includes('faaliyet gider') && !n.includes('toplam')) return 'FAALIYET_GIDERLERI'
  }

  return null
}

// ─── TDHP Sayı Parse ──────────────────────────────────────────────────────────

function parseTdhpNum(s: string): number | null {
  if (!s) return null
  // Türkçe format: 1.234.567,89 → 1234567.89
  const t = s.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(t)
  return isNaN(n) ? null : Math.abs(n) // POZİTİF MUTLAK
}

/**
 * KVB beyanname sütun formatı:
 *   2022: [önceki(2021)] [cari(2022)]
 *   2023: [önceki(2022)] [cari(2023)] [enflasyon_düz(2023)]
 *   2024: [önceki(2023_enfl)] [cari(2024)]
 *
 * Satırdaki cari dönem değeri = 2. TR sayısı (virgülle biten format zorunlu).
 * Tek sayı varsa onu döndür (zaten cari dönem).
 * Virgülsüz sayılar (satır numaraları "1.", "2.") yakalanmaz.
 */
function cariDonemNum(line: string): number | null {
  // Önce: virgüllü TR formatı (katı) — 1.234.567,89 veya 0,00
  // Satır numarası "1." atlanır (nokta grubu + virgül zorunlu)
  let m = line.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g)
  // Faz 7.3.23 fallback: ondalıksız tamsayı — "51.184.000" (en az 1 nokta grubu zorunlu)
  // parseTdhpNum dots-stripped → doğru parse; sadece katı format null döndürdüğünde devreye girer
  if (!m || m.length === 0) m = line.match(/\d{1,3}(?:\.\d{3})+/g)
  if (!m || m.length === 0) return null
  const val = m.length >= 2 ? m[1] : m[0]   // index 1 = cari dönem
  return parseTdhpNum(val)
}

// ─── TDHP Satır → Hesap Kodu Eşlemesi ───────────────────────────────────────

type TdhpRowEntry = { code: string; patterns: string[] }

// Her satır için: label norm edilmiş pattern listesi → hesap kodu
// Daha spesifik pattern'lar önce yazılır (ilk eşleşen kazanır)
const TDHP_ROW_MAP: Array<{ sub: TdhpSubSection; entries: TdhpRowEntry[] }> = [
  {
    sub: 'HAZIR_DEGERLER',
    entries: [
      { code: '100', patterns: ['kasa'] },
      { code: '101', patterns: ['alinan cekler'] },
      { code: '102', patterns: ['bankalar'] },
      { code: '103', patterns: ['verilen cekler', 'odeme emirleri'] },
    ],
  },
  {
    sub: 'TICARI_ALACAKLAR',
    entries: [
      { code: '120', patterns: ['alicilar'] },
      { code: '122', patterns: ['alacak senetleri reeskontu'] }, // reeskont önce (122)
      { code: '121', patterns: ['alacak senetleri'] }, // sonra net (121)
      { code: '126', patterns: ['verilen depozito', 'teminatlar'] },
      { code: '129', patterns: ['supheli ticari alacaklar karsil'] }, // karşılık önce (129)
      { code: '128', patterns: ['supheli ticari alacaklar'] }, // sonra brüt (128)
    ],
  },
  {
    sub: 'DIGER_ALACAKLAR',
    entries: [
      { code: '131', patterns: ['ortaklardan alacaklar'] },
      { code: '132', patterns: ['istiraklerden alacaklar'] },
      { code: '133', patterns: ['bagli ortakliklardan alacaklar'] },
      { code: '135', patterns: ['personelden alacaklar'] },
      { code: '136', patterns: ['diger cesitli alacaklar'] },
      { code: '139', patterns: ['supheli diger alacaklar karsil'] }, // karşılık önce (139)
      { code: '138', patterns: ['supheli diger alacaklar'] }, // sonra brüt (138)
    ],
  },
  {
    sub: 'STOKLAR',
    entries: [
      { code: '150', patterns: ['ilk madde ve malzeme'] },
      { code: '151', patterns: ['yari mamuller'] },
      { code: '152', patterns: ['mamuller'] },
      { code: '153', patterns: ['ticari mallar'] },
      { code: '157', patterns: ['diger stoklar'] },
      { code: '158', patterns: ['stok deger dusukl'] },
      { code: '159', patterns: ['verilen siparis avanslari'] },
      { code: '170', patterns: ['yillara yaygin insaat ve onarim maliyetleri', 'yillara yaygin insaat maliyetleri'] },
    ],
  },
  {
    sub: 'GELECEK_AYLARA_AIT_GIDERLER',
    entries: [
      { code: '180', patterns: ['gelecek aylara ait giderler'] },
      { code: '181', patterns: ['gelir tahakkuklari'] },
    ],
  },
  {
    sub: 'DIGER_DONEN_VARLIKLAR',
    entries: [
      { code: '191', patterns: ['indirilecek kdv'] },
      { code: '190', patterns: ['devreden kdv', 'indirilecek kdv'] }, // indirilecek fallback
      { code: '196', patterns: ['personel avanslari'] },
    ],
  },
  {
    sub: 'TICARI_ALACAKLAR_UV',
    entries: [
      { code: '226', patterns: ['verilen depozito', 'teminatlar'] },
    ],
  },
  {
    sub: 'DIGER_ALACAKLAR_UV',
    entries: [
      { code: '231', patterns: ['ortaklardan alacaklar'] },
      { code: '232', patterns: ['istiraklerden alacaklar'] },
      { code: '233', patterns: ['bagli ortakliklardan alacaklar'] },
      { code: '236', patterns: ['diger cesitli alacaklar'] },
    ],
  },
  {
    sub: 'MALI_DURAN_VARLIKLAR',
    entries: [
      { code: '240', patterns: ['bagli menkul kiymetler'] },
      { code: '242', patterns: ['istirakler'] },
      { code: '245', patterns: ['bagli ortakliklar'] },
    ],
  },
  {
    sub: 'MADDI_DURAN_VARLIKLAR',
    entries: [
      { code: '250', patterns: ['arazi ve arsalar'] },
      { code: '251', patterns: ['yeralti ve yerüstü', 'yerüstü duzenl'] },
      { code: '252', patterns: ['binalar'] },
      { code: '253', patterns: ['tesis, makine', 'tesis makine', 'makine ve cihaz'] },
      { code: '254', patterns: ['tasitlar'] },
      { code: '255', patterns: ['demirbas'] },
      { code: '256', patterns: ['diger maddi duran varliklar'] },
      { code: '257', patterns: ['birikm'] }, // Birikmiş Amortismanlar (MDV altında)
      { code: '258', patterns: ['yapilmakta olan yatirimlar'] },
      { code: '259', patterns: ['verilen avanslar'] },
    ],
  },
  {
    sub: 'MADDI_OLMAYAN_DURAN_VARLIKLAR',
    entries: [
      { code: '260', patterns: ['haklar'] },
      { code: '261', patterns: ['serefiye'] },
      { code: '262', patterns: ['kurulus ve orgutlenme giderleri'] },
      { code: '263', patterns: ['arastirma ve gelistirme giderleri'] },
      { code: '264', patterns: ['ozel maliyetler'] },
      { code: '267', patterns: ['diger maddi olmayan duran varliklar'] },
      { code: '268', patterns: ['birikm'] }, // Birikmiş Amortismanlar (MODV altında)
    ],
  },
  {
    sub: 'GELECEK_YILLARA_AIT_GIDERLER',
    entries: [
      { code: '280', patterns: ['gelecek yillara ait giderler'] },
    ],
  },
  {
    sub: 'MALI_BORCLAR_KV',
    entries: [
      { code: '300', patterns: ['banka kredileri'] },
      { code: '301', patterns: ['finansal kiralama islemlerinden borclar'] },
      { code: '302', patterns: ['ertelenmis finansal kiralama'] },
      { code: '309', patterns: ['diger mali borclar'] },
    ],
  },
  {
    sub: 'TICARI_BORCLAR_KV',
    entries: [
      { code: '320', patterns: ['saticilar'] },
      { code: '321', patterns: ['bor senetleri', 'borc senetleri'] },
      { code: '326', patterns: ['alinan depozito', 'teminatlar'] },
      { code: '329', patterns: ['diger ticari borclar'] },
    ],
  },
  {
    sub: 'DIGER_BORCLAR_KV',
    entries: [
      { code: '331', patterns: ['ortaklara borclar'] },
      { code: '332', patterns: ['iştiraklere borclar', 'istiraklere borclar'] },
      { code: '333', patterns: ['bagli ortakl'] },
      { code: '335', patterns: ['personele borclar'] },
      { code: '336', patterns: ['diger cesitli borclar'] },
    ],
  },
  {
    sub: 'ALINAN_AVANSLAR_KV',
    entries: [
      { code: '340', patterns: ['alinan siparis avanslari'] },
      { code: '349', patterns: ['alinan diger avanslar'] },
    ],
  },
  {
    sub: 'YILLARA_YAYGIN_INSAAT_KV',
    entries: [
      { code: '350', patterns: ['yillara yaygin insaat ve onarim hakedis', 'yillara yaygin insaat ve onarim hakedle'] },
      { code: '358', patterns: ['yillara yaygin insaat enflasyon', 'enflasyon duzeltme'] },
    ],
  },
  {
    sub: 'ODENEN_VERGI_KV',
    entries: [
      { code: '360', patterns: ['odenecek vergi ve fonlar'] },
      { code: '361', patterns: ['odenecek sosyal guvenlik'] },
      { code: '370', patterns: ['donem kari vergi ve diger yasal yukuml'] },
      { code: '371', patterns: ['donem karinin pesin odenen vergi'] },
      { code: '391', patterns: ['hesaplanan kdv'] },
    ],
  },
  {
    sub: 'MALI_BORCLAR_UV',
    entries: [
      { code: '400', patterns: ['banka kredileri'] },
      { code: '401', patterns: ['finansal kiralama islemlerinden borclar'] },
      { code: '405', patterns: ['cikarilmis tahviller'] },
    ],
  },
  {
    sub: 'TICARI_BORCLAR_UV',
    entries: [
      { code: '420', patterns: ['saticilar'] },
      { code: '421', patterns: ['bor senetleri', 'borc senetleri'] },
    ],
  },
  {
    sub: 'DIGER_BORCLAR_UV',
    entries: [
      { code: '431', patterns: ['ortaklara borclar'] },
      { code: '436', patterns: ['diger cesitli borclar'] },
    ],
  },
  {
    sub: 'OZKAYNAKLAR',
    entries: [
      { code: '501', patterns: ['odenmemis sermaye'] },           // daha spesifik önce
      { code: '502', patterns: ['sermaye duzeltmesi olumlu'] },   // daha spesifik önce
      // Faz 7.3.23: 'B. Sermaye Yedekleri' satırı '500-sermaye' ile çakışıyor;
      // '529' öne alındı + 'sermaye yedeg' pattern eklendi → dedup hatası giderildi
      { code: '529', patterns: ['diger sermaye yedekleri', 'sermaye yedek'] },
      { code: '500', patterns: ['sermaye'] },                     // en geniş en son
      { code: '520', patterns: ['hisse senedi ihrac primleri'] },
      { code: '522', patterns: ['m.d.v. yeniden degerleme', 'mdv yeniden degerleme'] },
      { code: '523', patterns: ['istirakler yeniden degerleme'] },
      { code: '540', patterns: ['yasal yedekler'] },
      { code: '541', patterns: ['statu yedekleri'] },
      { code: '542', patterns: ['olaganustu yedekler'] },
      { code: '548', patterns: ['diger kar yedekleri'] },
      { code: '549', patterns: ['ozel fonlar'] },
      { code: '570', patterns: ['gecmis yil karlari'] },
      { code: '580', patterns: ['gecmis yillar zararlari'] },
      { code: '590', patterns: ['donem net kari'] },
      { code: '591', patterns: ['donem net zarari'] },
    ],
  },
  {
    sub: 'BRUT_SATISLAR',
    entries: [
      { code: '600', patterns: ['yurtici satislar', 'yurt ici satislar', 'yurticisatislar'] },
      { code: '601', patterns: ['yurtdisi satislar', 'yurt disi satislar'] },
      { code: '602', patterns: ['diger gelirler'] },
    ],
  },
  {
    sub: 'SATIS_INDIRIMLERI',
    entries: [
      { code: '610', patterns: ['satistan iadeler'] },
      { code: '611', patterns: ['satis iskontoları', 'satis iskontolari'] },
      { code: '612', patterns: ['diger indirimler'] },
    ],
  },
  {
    sub: 'SATIS_MALIYETI',
    entries: [
      { code: '620', patterns: ['satilan mamuller maliyeti'] },
      { code: '621', patterns: ['satilan ticari mallar maliyeti'] },
      { code: '622', patterns: ['satilan hizmet maliyeti'] },
    ],
  },
  {
    sub: 'FAALIYET_GIDERLERI',
    entries: [
      { code: '630', patterns: ['arastirma ve gelistirme giderleri'] },
      { code: '631', patterns: ['pazarlama, satis ve dagitim giderleri', 'pazarlama satis ve dagitim'] },
      { code: '632', patterns: ['genel yonetim giderleri'] },
    ],
  },
  {
    sub: 'DIGER_OLAGAN_GELIR_KARLAR',
    entries: [
      { code: '640', patterns: ['istiraklerden temettu gelirleri'] },
      { code: '642', patterns: ['faiz gelirleri'] },
      { code: '644', patterns: ['konusu kalmayan karsil'] },
      { code: '646', patterns: ['kambiyo karlari'] },
      { code: '648', patterns: ['enflasyon duzeltmesi karlari'] },
      { code: '649', patterns: ['diger olagan gelir ve karlar'] },
    ],
  },
  {
    sub: 'DIGER_OLAGAN_GIDER_ZARARLAR',
    entries: [
      { code: '654', patterns: ['karsilik giderleri'] },
      { code: '656', patterns: ['kambiyo zararlari'] },
      { code: '658', patterns: ['enflasyon duzeltmesi zararlari'] },
      { code: '659', patterns: ['diger olagan gider ve zararlar'] },
    ],
  },
  {
    sub: 'FINANSMAN_GIDERLERI',
    entries: [
      { code: '660', patterns: ['kisa vadeli borclanma giderleri'] },
      { code: '661', patterns: ['uzun vadeli borclanma giderleri'] },
    ],
  },
  {
    sub: 'OLAGANDISI_GELIR_KARLAR',
    entries: [
      { code: '671', patterns: ['onceki donem gelir ve karlari'] },
      { code: '679', patterns: ['diger olagandisi gelir ve karlar'] },
    ],
  },
  {
    sub: 'OLAGANDISI_GIDER_ZARARLAR',
    entries: [
      { code: '680', patterns: ['calismayan kisim gider ve zararlari'] },
      { code: '681', patterns: ['onceki donem gider ve zararlari'] },
      { code: '689', patterns: ['diger olagandisi gider ve zararlar'] },
    ],
  },
  {
    sub: 'DONEM_KARI_VERGI',
    entries: [
      { code: '691', patterns: ['donem kari vergi ve diger yasal yukuml'] },
      // 692 SKIP — üretilmez
    ],
  },
]

// TDHP_ROW_MAP'i sub bölümüne göre hızlı erişim için Map'e dönüştür
const TDHP_SUB_MAP = new Map<TdhpSubSection, TdhpRowEntry[]>()
for (const group of TDHP_ROW_MAP) {
  TDHP_SUB_MAP.set(group.sub, group.entries)
}

// ─── TDHP satır eşleme yardımcı fonksiyonu ───────────────────────────────────

function matchTdhpCode(labelNorm: string, sub: TdhpSubSection | null): string | null {
  if (!sub) return null
  const entries = TDHP_SUB_MAP.get(sub)
  if (!entries) return null

  for (const entry of entries) {
    for (const pat of entry.patterns) {
      if (labelNorm.includes(pat)) return entry.code
    }
  }
  return null
}

// ─── TDHP Ana Parser ─────────────────────────────────────────────────────────

/**
 * TDHP ayrıntılı bilanço ve gelir tablosu satırlarından ham hesap kodlarını çıkarır.
 * - Tüm amount değerleri POZİTİF MUTLAK (Math.abs)
 * - 692 üretilmez (SKIP)
 * - 0 tutarlar yazılmaz
 * - Code deduplikasyon: ilk eşleşen kazanır
 */
export function extractTdhpRawAccountsFromText(
  text: string
): Array<{ code: string; amount: number }> {
  const resultMap = new Map<string, number>()

  const ctx: TdhpContext = { main: null, sub: null }
  let isDuranVarlik = false  // Duran varlık bölümündeyiz mi?
  let isUzunVadeli = false   // Uzun vadeli pasif bölümündeyiz mi?

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.length < 3) continue

    const n = norm(line)
      .replace(/^[\s.]+/, '')
      .replace(/\s+/g, ' ')
      .trim()

    // ── Ana bölüm tespiti ────────────────────────────────────────────────────
    const detectedMain = detectTdhpMainSection(n)
    if (detectedMain !== null) {
      ctx.main = detectedMain
      // Duran varlık takibi
      if (/^ii[\s.\-]\s*duran\s*varlik/.test(n) || /^duran\s*varliklar?$/.test(n)) {
        isDuranVarlik = true
        isUzunVadeli = false
      } else if (/^i[\s.\-]\s*donen\s*varlik/.test(n) || /^donen\s*varliklar?$/.test(n)) {
        isDuranVarlik = false
        isUzunVadeli = false
      } else if (/^iii[\s.\-]\s*kisa\s*vadeli/.test(n) || /^kisa\s*vadeli\s*(yabanci|kaynaklar)/.test(n)) {
        isDuranVarlik = false
        isUzunVadeli = false
      } else if (/^iv[\s.\-]\s*uzun\s*vadeli/.test(n) || /^uzun\s*vadeli\s*(yabanci|kaynaklar)/.test(n)) {
        isDuranVarlik = false
        isUzunVadeli = true
      } else if (/^(v[\s.\-]\s*)?oz\s*(kaynak|serma)/.test(n)) {
        isUzunVadeli = false
      }
      // Aynı satır hem ana bölüm hem alt bölüm olabilir (örn. "A- Brüt Satışlar")
      // Bu nedenle sub-section tespitini ana bölüm sonrasında da dene
      const subOnMainLine = detectTdhpSubSection(n, ctx.main, isUzunVadeli)
      ctx.sub = subOnMainLine ?? null
      continue
    }

    // ── Sayı var mı? ─────────────────────────────────────────────────────────
    const amount = cariDonemNum(line)

    // Alt bölüm tespiti: sayısı olmayan satırlar OR sayı var ama önce sub-section dene
    if (amount === null || amount === 0) {
      const detectedSub = detectTdhpSubSection(n, ctx.main, isUzunVadeli)
      if (detectedSub !== null) {
        ctx.sub = detectedSub
      }
      continue
    }

    // Satır etiketini temizle (sayıları çıkar, (-) temizle)
    const labelRaw = line
      .replace(/-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g, '')
      .replace(/\(-\)/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!labelRaw || labelRaw.length < 2) continue

    const labelNorm = norm(labelRaw).replace(/^[\s.]+/, '').trim()

    // Önce bu satırın sub-section başlığı olup olmadığını da kontrol et
    // (bazı satırlar hem bölüm başlığı hem veri içerir — örn. "Dönem Karı Vergi... 320.000")
    // Bu durumda sub-section'ı güncelle ama data olarak da işle
    const detectedSubWithData = detectTdhpSubSection(n, ctx.main, isUzunVadeli)
    if (detectedSubWithData !== null) {
      ctx.sub = detectedSubWithData
    }

    // ── Hesap kodu eşleme ────────────────────────────────────────────────────
    let code: string | null = null

    // AKTIF tarafında context'e göre UV alacak alt bölümlerini düzelt
    if (ctx.main === 'AKTIF' && isDuranVarlik) {
      // Duran varlık bölümünde "Verilen Depozito" → 226
      if (ctx.sub === null || ctx.sub === 'TICARI_ALACAKLAR_UV') {
        if (labelNorm.includes('verilen depozito') || (labelNorm.includes('verilen') && labelNorm.includes('teminat'))) {
          code = '226'
        }
      }
      // Duran varlık alacaklar bölümü
      if (!code && ctx.sub === 'DIGER_ALACAKLAR_UV') {
        code = matchTdhpCode(labelNorm, 'DIGER_ALACAKLAR_UV')
      }
    }

    if (!code) {
      // Dönen varlik bölümü "Verilen Depozito" → 126
      if (ctx.main === 'AKTIF' && !isDuranVarlik && ctx.sub === 'TICARI_ALACAKLAR') {
        if (labelNorm.includes('verilen depozito') || (labelNorm.includes('verilen') && labelNorm.includes('teminat'))) {
          code = '126'
        }
      }
    }

    // Genel alt bölüm eşleme
    if (!code) {
      code = matchTdhpCode(labelNorm, ctx.sub)
    }

    // Bağımsız duran varlık kalemleri: Yıllara Yaygın (AKTIF tarafında)
    if (!code && ctx.main === 'AKTIF') {
      if (labelNorm.includes('yillara yaygin insaat ve onarim maliyetleri') || labelNorm.includes('yillara yaygin insaat maliyetleri')) {
        code = '170'
      }
    }

    // İndirilecek KDV özel durumu
    if (!code && ctx.sub === 'DIGER_DONEN_VARLIKLAR') {
      if (labelNorm.includes('indirilecek kdv')) {
        code = '191'
      } else if (labelNorm.includes('devreden kdv') || labelNorm.includes('kdv')) {
        code = '190'
      }
    }

    if (!code) continue

    // 692 SKIP
    if (code === '692') continue

    // 590/591 karşılıklı dışlama: Dönem Net Zararı (591) yazılırsa Dönem Net Kârı (590) silinir
    // KVB PDF'lerinde 590 başlığı altında 591 değeri de gözüktüğünden her ikisi eşleşebilir.
    // Zarar (591) baskın — 590 override.
    if (code === '591' && resultMap.has('590')) { resultMap.delete('590') }
    if (code === '590' && resultMap.has('591')) continue

    // Code deduplikasyon: ilk eşleşen kazanır
    if (!resultMap.has(code)) {
      resultMap.set(code, amount)
    }
  }

  return Array.from(resultMap.entries()).map(([code, amount]) => ({ code, amount }))
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

  // TDHP ayrıntılı bilanço/gelir tablosu ham hesap kodlarını çıkar
  const tdhpRawAccounts = extractTdhpRawAccountsFromText(text)

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

    // 1001A'da kolon sırası KVB'den TERS: sol kolon = cari dönem, sağ = önceki.
    // parseEkSection: vLast (sağ) → .cari, vFirst (sol) → .onceki
    // Bu nedenle 1001A için .onceki (sol = cari dönem) kullanılır.
    // Tek sütunlu PDF'lerde onceki boş kalır → .cari fallback.
    const fromLeft  = { ...bilFields.onceki, ...gelFields.onceki }  // sol sütun
    const fromRight = { ...bilFields.cari,   ...gelFields.cari   }  // sağ sütun
    const fields1001A = Object.keys(fromLeft).length > 0 ? fromLeft : fromRight
    const rawAcc1001A = tdhpRawAccounts.length > 0 ? tdhpRawAccounts : undefined
    if (Object.keys(fields1001A).length > 0) return [{ year, period: 'ANNUAL', fields: fields1001A, unmapped: [], rawAccounts: rawAcc1001A, docType: 'BEYANNAME' }]
    return []
  }

  // 3) Geçici Gelir Vergisi (1032-GV)
  if (type === 'gelir_gecici') {
    const rawAccGV = tdhpRawAccounts.length > 0 ? tdhpRawAccounts : undefined
    const gelIdx = findNormIdx(text, 'gelir tablosu')
    if (gelIdx !== -1) {
      const { cari } = parseEkSection(text.slice(gelIdx, gelIdx + 4000))
      if (Object.keys(cari).length > 0) return [{ year, period, fields: cari, unmapped: [], rawAccounts: rawAccGV, docType: 'BEYANNAME' }]
    }
    const full = parseEkSection(text)
    if (Object.keys(full.cari).length > 0) return [{ year, period, fields: full.cari, unmapped: [], rawAccounts: rawAccGV, docType: 'BEYANNAME' }]
    return [{ year, period, fields: parseTaxForm(text), unmapped: [], rawAccounts: rawAccGV, docType: 'BEYANNAME' }]
  }

  // 4) Kurumlar Vergisi Yıllık (1010)
  if (type === 'kurumlar_yillik') {
    const taxFields = parseTaxForm(text)
    const rawAccKV = tdhpRawAccounts.length > 0 ? tdhpRawAccounts : undefined
    // 'ayrintili bilanco' ile arama: form referansını değil gerçek tablo başlığını bulur
    let ekIdx = findNormIdx(text, 'ayrintili bilanco')
    if (ekIdx === -1) ekIdx = findNormIdx(text, 'tek duzen hesap plani')
    console.log('[pdf] kurumlar_yillik ekIdx=', ekIdx, 'year=', year)
    if (ekIdx !== -1) {
      const slice = text.slice(ekIdx, ekIdx + 20000)
      console.log('[pdf] ek slice ilk 800 char:\n', slice.slice(0, 800))
      const raw = parseEkSection(slice)
      console.log('[pdf] raw.cari=', JSON.stringify(raw.cari))
      console.log('[pdf] raw.onceki keys=', Object.keys(raw.onceki))
      // raw.cari = her satırın SON sayısı = cari dönem (2 sütunluda sağ, tek sütunluda tek)
      return [{ year, period: 'ANNUAL', fields: { ...raw.cari, ...taxFields }, unmapped: [], rawAccounts: rawAccKV, docType: 'BEYANNAME' }]
    }
    return [{ year, period: 'ANNUAL', fields: taxFields, unmapped: [], rawAccounts: rawAccKV, docType: 'BEYANNAME' }]
  }

  // 5) Kurumlar Geçici Vergi (1032-KV)
  if (type === 'kurumlar_gecici') {
    const taxFields = parseTaxForm(text)
    const rawAccKVG = tdhpRawAccounts.length > 0 ? tdhpRawAccounts : undefined
    const gelirIdx  = findNormIdx(text, 'tek duzen hesap planina uygun gelir tablosu')
    if (gelirIdx !== -1) {
      const raw = parseEkSection(text.slice(gelirIdx, gelirIdx + 5000))
      // Geçici vergide taxExpense gelir tablosu kalemi değil
      const { taxExpense: _t, ...taxNoTax } = taxFields
      return [{ year, period, fields: { ...raw.cari, ...taxNoTax }, unmapped: [], rawAccounts: rawAccKVG, docType: 'BEYANNAME' }]
    }
    const rawFull = parseEkSection(text)
    const { taxExpense: _t2, ...taxNoTax2 } = taxFields
    if (Object.keys(rawFull.cari).length > 0) {
      console.info('[pdf] kurumlar_gecici fulltext fallback', {
        fieldCount: Object.keys(rawFull.cari).length,
        hasRevenue: rawFull.cari.revenue != null,
        hasCogs: rawFull.cari.cogs != null,
      })
      return [{ year, period, fields: { ...rawFull.cari, ...taxNoTax2 }, unmapped: [], rawAccounts: rawAccKVG, docType: 'BEYANNAME' }]
    }
    return [{ year, period, fields: taxNoTax2, unmapped: [], rawAccounts: rawAccKVG, docType: 'BEYANNAME' }]
  }

  // 6) Bilinmeyen: satır bazlı fallback
  const fallbackRows = parseFallback(text, year, period)
  const rawAccFallback = tdhpRawAccounts.length > 0 ? tdhpRawAccounts : undefined
  return fallbackRows.map(r => ({ ...r, rawAccounts: rawAccFallback, docType: 'BEYANNAME' }))
}
