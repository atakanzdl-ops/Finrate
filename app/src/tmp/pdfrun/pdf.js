"use strict";
/**
 * PDF parser — GVB (Gelir Vergisi Beyannamesi) ve KVB (Kurumlar Vergisi Beyannamesi)
 * Tüm karşılaştırmalar norm() ile yapılır; Türkçe string literal kullanılmaz.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePdfBuffer = parsePdfBuffer;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse');
// ─── norm ─────────────────────────────────────────────────────────────────────
function norm(s) {
    return String(s ?? '')
        .toLowerCase()
        .replace(/[şŞ]/g, 's')
        .replace(/[ıİ]/g, 'i')
        .replace(/[ğĞ]/g, 'g')
        .replace(/[üÜ]/g, 'u')
        .replace(/[öÖ]/g, 'o')
        .replace(/[çÇ]/g, 'c');
}
// ─── Sayı ayrıştırma ──────────────────────────────────────────────────────────
// Türk formatı: 1.234.567,89
const TR_NUM = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const ANY_NUM = /-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;
function parseTR(s) {
    if (!s)
        return null;
    const t = s.trim().replace(/\./g, '').replace(',', '.');
    const n = parseFloat(t);
    return isNaN(n) ? null : n;
}
function firstNum(line) {
    const m = line.match(ANY_NUM);
    return m ? parseTR(m[0]) : null;
}
function twoNums(line) {
    const m = line.match(ANY_NUM);
    if (!m)
        return [null, null];
    return [parseTR(m[0]), m[1] ? parseTR(m[1]) : null];
}
// ─── Yıl / Dönem tespiti ──────────────────────────────────────────────────────
function extractYearPeriod(text) {
    let year = null;
    // "Yılı 2025" veya "Yıl 2024" gibi
    const ym = text.match(/y[iı]l[iı]?\s+(20[12]\d)/i);
    if (ym)
        year = parseInt(ym[1]);
    if (!year) {
        const lines = text.split('\n');
        for (let i = 0; i < Math.min(30, lines.length); i++) {
            if (norm(lines[i]).includes('yil')) {
                for (let j = i; j < Math.min(i + 5, lines.length); j++) {
                    const m = lines[j].match(/\b(20[12]\d)\b/);
                    if (m) {
                        year = parseInt(m[1]);
                        break;
                    }
                }
                if (year)
                    break;
            }
        }
    }
    if (!year) {
        const m = text.match(/\b(20[12]\d)\b/);
        if (m)
            year = parseInt(m[1]);
    }
    const top800 = norm(text.slice(0, 800));
    let period = 'ANNUAL';
    if (/4\.\s*donem/.test(top800))
        period = 'Q4';
    else if (/3\.\s*donem/.test(top800))
        period = 'Q3';
    else if (/2\.\s*donem/.test(top800))
        period = 'Q2';
    else if (/1\.\s*donem/.test(top800))
        period = 'Q1';
    return { year, period };
}
function detectType(text) {
    const n = norm(text.slice(0, 900));
    if (n.includes('kurumlar vergisi beyannamesi'))
        return 'kurumlar_yillik';
    if (n.includes('gecici vergi beyannamesi') && n.includes('kurumlar vergisi mukellefleri'))
        return 'kurumlar_gecici';
    if (n.includes('yillik gelir vergisi beyannamesi'))
        return 'gelir_yillik';
    if (n.includes('gecici vergi beyannamesi') && n.includes('gelir vergisi mukellefleri'))
        return 'gelir_gecici';
    return 'unknown';
}
// ─── Gelir tablosu satır eşlemesi ────────────────────────────────────────────
// Tüm pattern'lar norm edilmiş
const INCOME_MAP = [
    ['net satislar', 'revenue'],
    ['satis hasilati', 'revenue'],
    ['brut satislar hasilati', 'revenue'],
    ['satislarin maliyeti', 'cogs'],
    ['brut satis kari', 'grossProfit'],
    ['faaliyet giderleri', 'operatingExpenses'],
    ['faaliyet kari', 'ebit'],
    ['diger olagan gelir', 'otherIncome'],
    ['diger olagan gider', 'otherExpense'],
    ['finansman giderleri', 'interestExpense'],
    ['faiz giderleri', 'interestExpense'],
    ['olagandisi gelir', 'extraordinaryIncome'],
    ['olagandisi gider', 'extraordinaryExpense'],
    ['olagan kar', 'ebt'],
    ['donem kari veya zarari', 'ebt'],
    ['donem net kari', 'netProfit'],
    ['donem net zarari', 'netProfit'],
    ['net kar veya zarar', 'netProfit'],
    ['net kar', 'netProfit'],
    ['vergi gideri', 'taxExpense'],
];
function matchIncomeLine(label) {
    const n = norm(label);
    for (const [pat, field, negate] of INCOME_MAP) {
        if (n.includes(pat))
            return { field, negate: !!negate };
    }
    return null;
}
function detectEkSection(line) {
    const n = norm(line);
    if (/^i[\s.]\s*donen\s*varlik/.test(n))
        return 'donen';
    if (/^ii[\s.]\s*duran\s*varlik/.test(n))
        return 'duran';
    if (/^iii[\s.]\s*kisa\s*vadeli/.test(n))
        return 'kv';
    if (/^iv[\s.]\s*uzun\s*vadeli/.test(n))
        return 'uv';
    if (/^v[\s.]\s*oz\s*(kaynak|serma)/.test(n))
        return 'oz';
    if (n.includes('gelir tablosu'))
        return 'gelir';
    return null;
}
function matchBilField(label, sec) {
    const n = norm(label);
    if (sec === 'donen') {
        if (/^a[\s.]\s*hazir/.test(n))
            return 'cash';
        if (/^b[\s.]\s*menkul/.test(n))
            return 'shortTermInvestments';
        if (/^c[\s.]\s*ticari\s*alacak/.test(n))
            return 'tradeReceivables';
        if (/^d[\s.]\s*diger\s*alacak/.test(n))
            return 'otherReceivables';
        if (/^e[\s.]\s*stoklar/.test(n))
            return 'inventory';
        if (/^f[\s.]\s*yillara\s*yaygin/.test(n))
            return 'constructionCosts';
        if (/^g[\s.]\s*gelecek\s*ay/.test(n))
            return 'prepaidExpenses';
        if (/^h[\s.]\s*diger\s*donen/.test(n))
            return 'otherCurrentAssets';
        if (n.includes('hazir deger') || n.includes('nakit'))
            return 'cash';
        if (n.includes('ticari alacak'))
            return 'tradeReceivables';
        if (n.includes('stoklar'))
            return 'inventory';
        if (n.includes('diger alacak'))
            return 'otherReceivables';
        if (n.includes('diger donen'))
            return 'otherCurrentAssets';
        if (n.includes('gelecek ay') && n.includes('gider'))
            return 'prepaidExpenses';
    }
    if (sec === 'duran') {
        if (/^a[\s.]\s*ticari\s*alacak/.test(n))
            return 'longTermTradeReceivables';
        if (/^b[\s.]\s*diger\s*alacak/.test(n))
            return 'longTermOtherReceivables';
        if (/^c[\s.]\s*mali\s*duran/.test(n))
            return 'longTermInvestments';
        if (/^d[\s.]\s*maddi\s*duran/.test(n))
            return 'tangibleAssets';
        if (/^e[\s.]\s*maddi\s*olmayan/.test(n))
            return 'intangibleAssets';
        if (/^f[\s.]\s*ozel\s*tukenmeye/.test(n))
            return 'depletableAssets';
        if (/^g[\s.]\s*gelecek\s*yil/.test(n))
            return 'longTermPrepaidExpenses';
        if (/^h[\s.]\s*diger\s*duran/.test(n))
            return 'otherNonCurrentAssets';
        if (n.includes('maddi duran'))
            return 'tangibleAssets';
        if (n.includes('maddi olmayan'))
            return 'intangibleAssets';
        if (n.includes('mali duran'))
            return 'longTermInvestments';
        if (n.includes('gelecek yil') && n.includes('gider'))
            return 'longTermPrepaidExpenses';
        if (n.includes('diger duran'))
            return 'otherNonCurrentAssets';
    }
    if (sec === 'kv') {
        if (/^a[\s.]\s*mali\s*bor/.test(n))
            return 'shortTermFinancialDebt';
        if (/^b[\s.]\s*ticari\s*bor/.test(n))
            return 'tradePayables';
        if (/^c[\s.]\s*diger\s*bor/.test(n))
            return 'otherShortTermPayables';
        if (/^d[\s.]\s*alinan\s*avans/.test(n))
            return 'advancesReceived';
        if (/^e[\s.]\s*yillara\s*yaygin/.test(n))
            return 'constructionProgress';
        if (/^f[\s.]\s*odenecek\s*vergi/.test(n))
            return 'taxPayables';
        if (/^g[\s.]\s*bor.?\s*ve\s*gider/.test(n))
            return 'shortTermProvisions';
        if (/^h[\s.]\s*gelecek\s*ay.*gelir/.test(n))
            return 'deferredRevenue';
        if (/^[i][\s.]\s*diger/.test(n))
            return 'otherCurrentLiabilities';
        if (n.includes('mali bor'))
            return 'shortTermFinancialDebt';
        if (n.includes('ticari bor') && !n.includes('uzun'))
            return 'tradePayables';
        if (n.includes('diger bor') && !n.includes('uzun'))
            return 'otherShortTermPayables';
        if (n.includes('alinan avans') && !n.includes('uzun'))
            return 'advancesReceived';
        if (n.includes('odenecek vergi'))
            return 'taxPayables';
        if (n.includes('gelecek ay') && n.includes('gelir'))
            return 'deferredRevenue';
    }
    if (sec === 'uv') {
        if (/^a[\s.]\s*mali\s*bor/.test(n))
            return 'longTermFinancialDebt';
        if (/^b[\s.]\s*ticari\s*bor/.test(n))
            return 'longTermTradePayables';
        if (/^c[\s.]\s*diger\s*bor/.test(n))
            return 'longTermOtherPayables';
        if (/^d[\s.]\s*alinan\s*avans/.test(n))
            return 'longTermAdvancesReceived';
        if (/^g[\s.]\s*bor.?\s*ve\s*gider/.test(n))
            return 'longTermProvisions';
        if (/^[i][\s.]\s*diger/.test(n))
            return 'otherNonCurrentLiabilities';
        if (n.includes('mali bor'))
            return 'longTermFinancialDebt';
        if (n.includes('diger bor'))
            return 'longTermOtherPayables';
        if (n.includes('alinan avans'))
            return 'longTermAdvancesReceived';
    }
    if (sec === 'oz') {
        if (/^a[\s.]\s*odenmis\s*sermaye/.test(n))
            return 'paidInCapital';
        if (/^b[\s.]\s*sermaye\s*yedeg/.test(n))
            return 'capitalReserves';
        if (/^c[\s.]\s*kar\s*yedeg/.test(n))
            return 'profitReserves';
        if (/^d[\s.]\s*gecmis\s*yil.*kar/.test(n))
            return 'retainedEarnings';
        if (/^e[\s.]\s*gecmis\s*yil.*zarar/.test(n))
            return 'retainedLosses';
        if (/^f[\s.]\s*donem\s*net\s*kar/.test(n))
            return 'netProfitCurrentYear';
        if (n.includes('odenmis sermaye'))
            return 'paidInCapital';
        if (n.includes('sermaye yedeg'))
            return 'capitalReserves';
        if (n.includes('kar yedeg'))
            return 'profitReserves';
        if (n.includes('gecmis yil') && n.includes('kar'))
            return 'retainedEarnings';
        if (n.includes('gecmis yil') && n.includes('zarar'))
            return 'retainedLosses';
        if (n.includes('donem net kar'))
            return 'netProfitCurrentYear';
    }
    // Global gelir tablosu
    const im = matchIncomeLine(label);
    if (im)
        return im.field;
    // Global bilanço toplamları
    if (n.includes('donen varlik') && n.includes('toplam'))
        return 'totalCurrentAssets';
    if (n.includes('duran varlik') && n.includes('toplam'))
        return 'totalNonCurrentAssets';
    if (n.includes('aktif toplam') || n.includes('toplam aktif'))
        return 'totalAssets';
    if (n.includes('kisa vadeli') && n.includes('toplam'))
        return 'totalCurrentLiabilities';
    if (n.includes('uzun vadeli') && n.includes('toplam'))
        return 'totalNonCurrentLiabilities';
    if ((n.includes('oz kaynak') || n.includes('oz serma')) && n.includes('toplam'))
        return 'totalEquity';
    if (n.includes('pasif toplam') || n.includes('toplam pasif'))
        return 'totalLiabilitiesAndEquity';
    return null;
}
// ─── EK bölüm parser ─────────────────────────────────────────────────────────
function parseEkSection(section) {
    const cari = {};
    const onceki = {};
    let sec = null;
    for (const rawLine of section.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.length < 3)
            continue;
        const detected = detectEkSection(line);
        if (detected !== null)
            sec = detected;
        const nums = line.match(TR_NUM);
        if (!nums)
            continue;
        const label = line.replace(TR_NUM, '').replace(/\(-\)/g, '').replace(/\s+/g, ' ').trim();
        if (!label || label.length < 3)
            continue;
        const field = matchBilField(label, sec);
        if (!field)
            continue;
        const [v1, v2] = twoNums(line);
        if (v1 !== null && !(field in cari))
            cari[field] = v1;
        if (v2 !== null && !(field in onceki))
            onceki[field] = v2;
    }
    return { cari, onceki };
}
// ─── Vergi formu temel alanlar ────────────────────────────────────────────────
function parseTaxForm(text) {
    const fields = {};
    for (const line of text.split('\n')) {
        const t = line.trim();
        const nt = norm(t);
        if (!t)
            continue;
        if (nt.includes('ticari bilanco kari') && !('ebt' in fields)) {
            const v = firstNum(t);
            if (v != null && v > 0)
                fields['ebt'] = v;
        }
        if (nt.includes('donem safi kurum kazanc') && !('ebt' in fields)) {
            const v = firstNum(t);
            if (v != null)
                fields['ebt'] = v;
        }
        if ((nt.includes('kurumlar vergisi matrah') || nt.includes('gecici vergi matrah')) && !('ebt' in fields)) {
            const v = firstNum(t);
            if (v != null)
                fields['ebt'] = v;
        }
        if ((nt.includes('hesaplanan kurumlar vergisi') || nt.includes('hesaplanan gecici vergi')) && !('taxExpense' in fields)) {
            const v = firstNum(t);
            if (v != null)
                fields['taxExpense'] = v;
        }
        if (nt.includes('ticari kazanc') && !('ebt' in fields)) {
            const v = firstNum(t);
            if (v != null && v > 0)
                fields['ebt'] = v;
        }
        if ((nt.includes('brut satis') || nt.includes('brut kazanc')) && nt.includes('tutar') && !('revenue' in fields)) {
            const v = firstNum(t);
            if (v != null)
                fields['revenue'] = v;
        }
    }
    // Multiline fallback
    const nt = norm(text);
    if (!('ebt' in fields)) {
        const m = nt.match(/ticari bilanco kari[^0-9]{0,200}?(\d{1,3}(?:\.\d{3})*,\d{2})/);
        if (m) {
            // index aynı, orijinal text'ten parse et
            const idx = nt.indexOf(m[0]);
            const orig = text.slice(idx, idx + m[0].length);
            const v = parseTR(orig.match(/\d{1,3}(?:\.\d{3})*,\d{2}/)?.[0] ?? '');
            if (v != null && v > 0)
                fields['ebt'] = v;
        }
    }
    if (!('taxExpense' in fields)) {
        const m = nt.match(/hesaplanan\s*(?:kurumlar|gecici)\s*vergi[^0-9]{0,150}?(\d{1,3}(?:\.\d{3})*,\d{2})/);
        if (m) {
            const idx = nt.indexOf(m[0]);
            const orig = text.slice(idx, idx + m[0].length);
            const v = parseTR(orig.match(/\d{1,3}(?:\.\d{3})*,\d{2}/)?.[0] ?? '');
            if (v != null)
                fields['taxExpense'] = v;
        }
    }
    return fields;
}
// ─── PDF Mizan tespiti & parser ───────────────────────────────────────────────
function detectPdfMizan(text) {
    const n = norm(text.slice(0, 4000));
    return n.includes('mizan') && (n.includes('hesap kod') || /aciklama.*bor.*alacak/.test(n));
}
function parsePdfMizan(text) {
    const dateMatch = text.match(/(\d{2})[.\/-](\d{2})[.\/-](20\d{2})(?:\s*[-\u2013\u2014]\s*|\s+)(\d{2})[.\/-](\d{2})[.\/-](20\d{2})/);
    if (!dateMatch)
        return [];
    const endMonth = parseInt(dateMatch[5]);
    const year = parseInt(dateMatch[6]);
    const period = endMonth <= 3 ? 'Q1' : endMonth <= 6 ? 'Q2' : endMonth <= 9 ? 'Q3' : 'ANNUAL';
    const fields = {};
    const dataStartIdx = norm(text).indexOf('hesap kodu');
    const lines = text.slice(dataStartIdx > 0 ? dataStartIdx : 0).split('\n');
    const CODE_MAP = {
        '100': 'cash', '101': 'cash', '102': 'cash',
        '120': 'tradeReceivables', '121': 'tradeReceivables',
        '150': 'inventory', '151': 'inventory', '153': 'inventory',
        '252': 'tangibleAssets', '253': 'tangibleAssets', '254': 'tangibleAssets', '255': 'tangibleAssets',
        '260': 'intangibleAssets',
        '300': 'shortTermFinancialDebt', '301': 'shortTermFinancialDebt',
        '320': 'tradePayables', '321': 'tradePayables',
        '400': 'longTermFinancialDebt', '401': 'longTermFinancialDebt',
        '500': 'paidInCapital', '570': 'retainedEarnings',
    };
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const m = line.match(/^(\d{3})\b/);
        if (!m)
            continue;
        const field = CODE_MAP[m[1]];
        if (!field || field in fields)
            continue;
        const v = firstNum(line.slice(m[1].length));
        if (v != null && v !== 0)
            fields[field] = v;
    }
    if (Object.keys(fields).length < 3)
        return [];
    return [{ year, period, fields, unmapped: [] }];
}
// ─── Fallback parser ──────────────────────────────────────────────────────────
function parseFallback(text, year, period) {
    const fields = {};
    for (const line of text.split('\n')) {
        const t = line.trim();
        if (!t)
            continue;
        const m = matchIncomeLine(t);
        if (m && !(m.field in fields)) {
            const v = firstNum(t);
            if (v != null)
                fields[m.field] = m.negate ? -Math.abs(v) : v;
        }
        // Bilanço toplamları
        const n = norm(t);
        const num = firstNum(t);
        if (num == null)
            continue;
        if (n.includes('donen varlik toplam') && !fields['totalCurrentAssets'])
            fields['totalCurrentAssets'] = num;
        if (n.includes('duran varlik toplam') && !fields['totalNonCurrentAssets'])
            fields['totalNonCurrentAssets'] = num;
        if ((n.includes('aktif toplam') || n.includes('toplam aktif')) && !fields['totalAssets'])
            fields['totalAssets'] = num;
        if (n.includes('oz kaynak toplam') && !fields['totalEquity'])
            fields['totalEquity'] = num;
    }
    if (!Object.keys(fields).length)
        return [];
    return [{ year, period, fields, unmapped: [] }];
}
// ─── Bölüm arama yardımcısı ───────────────────────────────────────────────────
// norm'd text üzerinde index bulup orijinal text'i slice eder
function findNormIdx(text, normPattern) {
    return norm(text).indexOf(normPattern);
}
// ─── Ana export: parsePdfBuffer ───────────────────────────────────────────────
async function parsePdfBuffer(buffer, _fileName) {
    let text;
    try {
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await parser.getText();
        text = result.text;
    }
    catch (e) {
        console.error('[pdf] getText() failed:', e);
        throw e;
    }
    // 1) PDF Mizan
    if (detectPdfMizan(text))
        return parsePdfMizan(text);
    const type = detectType(text);
    const { year, period } = extractYearPeriod(text);
    if (!year)
        return [];
    // 2) Yıllık Gelir Vergisi Beyannamesi (1001A)
    if (type === 'gelir_yillik') {
        const bilIdx = findNormIdx(text, 'ayrintili bilanco');
        const gelIdx = findNormIdx(text, 'ayrintili gelir tablosu');
        let bilFields = { cari: {}, onceki: {} };
        let gelFields = { cari: {}, onceki: {} };
        if (bilIdx !== -1) {
            const end = gelIdx !== -1 ? gelIdx : bilIdx + 5000;
            bilFields = parseEkSection(text.slice(bilIdx, end));
        }
        if (gelIdx !== -1) {
            gelFields = parseEkSection(text.slice(gelIdx, gelIdx + 4000));
        }
        const cariFields = { ...bilFields.cari, ...gelFields.cari };
        if (Object.keys(cariFields).length > 0)
            return [{ year, period: 'ANNUAL', fields: cariFields, unmapped: [] }];
        return [];
    }
    // 3) Geçici Gelir Vergisi (1032-GV)
    if (type === 'gelir_gecici') {
        const gelIdx = findNormIdx(text, 'gelir tablosu');
        if (gelIdx !== -1) {
            const { cari } = parseEkSection(text.slice(gelIdx, gelIdx + 4000));
            if (Object.keys(cari).length > 0)
                return [{ year, period, fields: cari, unmapped: [] }];
        }
        const full = parseEkSection(text);
        if (Object.keys(full.cari).length > 0)
            return [{ year, period, fields: full.cari, unmapped: [] }];
        return [{ year, period, fields: parseTaxForm(text), unmapped: [] }];
    }
    // 4) Kurumlar Vergisi Yıllık (1010)
    if (type === 'kurumlar_yillik') {
        const taxFields = parseTaxForm(text);
        const ekIdx = findNormIdx(text, 'tek duzen hesap plani');
        if (ekIdx !== -1) {
            const raw = parseEkSection(text.slice(ekIdx, ekIdx + 20000));
            const hasTwoColumns = Object.keys(raw.onceki).length > 0;
            const cariData = hasTwoColumns ? raw.onceki : raw.cari;
            return [{ year, period: 'ANNUAL', fields: { ...cariData, ...taxFields }, unmapped: [] }];
        }
        return [{ year, period: 'ANNUAL', fields: taxFields, unmapped: [] }];
    }
    // 5) Kurumlar Geçici Vergi (1032-KV)
    if (type === 'kurumlar_gecici') {
        const taxFields = parseTaxForm(text);
        const gelirIdx = findNormIdx(text, 'tek duzen hesap planina uygun gelir tablosu');
        if (gelirIdx !== -1) {
            const raw = parseEkSection(text.slice(gelirIdx, gelirIdx + 5000));
            const hasTwoColumns = Object.keys(raw.onceki).length > 0;
            const cariData = hasTwoColumns ? raw.onceki : raw.cari;
            // Geçici vergide taxExpense gelir tablosu kalemi değil
            const { taxExpense: _t, ...taxNoTax } = taxFields;
            return [{ year, period, fields: { ...cariData, ...taxNoTax }, unmapped: [] }];
        }
        const rawFull = parseEkSection(text);
        const { taxExpense: _t2, ...taxNoTax2 } = taxFields;
        if (Object.keys(rawFull.cari).length > 0) {
            console.info('[pdf] kurumlar_gecici fulltext fallback', {
                fieldCount: Object.keys(rawFull.cari).length,
                hasRevenue: rawFull.cari.revenue != null,
                hasCogs: rawFull.cari.cogs != null,
            });
            return [{ year, period, fields: { ...rawFull.cari, ...taxNoTax2 }, unmapped: [] }];
        }
        return [{ year, period, fields: taxNoTax2, unmapped: [] }];
    }
    // 6) Bilinmeyen: satır bazlı fallback
    return parseFallback(text, year, period);
}
