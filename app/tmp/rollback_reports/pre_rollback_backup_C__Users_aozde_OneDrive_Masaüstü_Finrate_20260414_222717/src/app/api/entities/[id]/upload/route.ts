import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { parseExcelBuffer, parseCsvText, INCOME_FIELDS, type DocType } from '@/lib/parsers/excel'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

// ── Kaynak öncelik sistemi ─────────────────────────────────────────────────────
// Gelir tablosu alanları: INCOME_FIELDS — excel.ts'ten import edilir

// Yüksek sayı = yüksek öncelik
// EXCEL_GT: GELİRTABLOSU sheet (mizan 6xx'ten daha güvenilir income)
const INCOME_PRIORITY: Record<string, number>  = { KVB: 4, YGVB: 4, GVB: 3, EXCEL_GT: 2, EXCEL: 1, CSV: 1, PDF: 1 }
const BALANCE_PRIORITY: Record<string, number> = { KVB: 4, YGVB: 4, EXCEL_GT: 2, EXCEL: 2, CSV: 2, GVB: 1, PDF: 1 }

function docTypeToSource(docType?: DocType, isExcel?: boolean, isCsv?: boolean): string {
  switch (docType) {
    case 'kvb':       return 'KVB'
    case 'ygvb':      return 'YGVB'
    case 'gvb-q1':
    case 'gvb-q2':
    case 'gvb-q3':
    case 'gvb-q4':   return 'GVB'
    case 'excel-gt':  return 'EXCEL_GT'   // GELİRTABLOSU sheet
    case 'excel-mizan':
    case 'excel':    return isExcel ? 'EXCEL' : isCsv ? 'CSV' : 'PDF'
    case 'csv':      return 'CSV'
    default:         return isExcel ? 'EXCEL' : isCsv ? 'CSV' : 'PDF'
  }
}

/** source string → incomeStatement label (__sources için) */
function toIncomeLabel(s: string | null): string | null {
  if (!s) return null
  if (['KVB', 'YGVB', 'GVB'].includes(s)) return s
  if (s === 'EXCEL_GT')                    return 'ExcelGT'
  if (['EXCEL', 'CSV', 'PDF'].includes(s)) return 'ExcelMizan'
  return s
}

/**
 * Mevcut DB kaydındaki alanları yeni yüklenen alanlarla kaynak önceliğine göre birleştirir.
 * Yüksek öncelikli kaynak kazanır; eşit öncelikte en son yüklenen kazanır.
 */
function mergeByPriority(
  existingFields: Record<string, number | null>,
  existingSource: string,
  newFields: Record<string, number | null>,
  newSource: string,
  warnings: Set<string>,
): Record<string, number | null> {
  const merged: Record<string, number | null> = { ...existingFields }

  const isBeyanname = (s: string) => ['KVB', 'YGVB', 'GVB'].includes(s)
  const isExcelLike = (s: string) => ['EXCEL', 'CSV', 'PDF'].includes(s)

  for (const [key, newVal] of Object.entries(newFields)) {
    if (newVal == null) continue
    const isIncome = INCOME_FIELDS.has(key)

    if (merged[key] != null) {
      // Alan zaten var — önceliği karşılaştır
      const existPri = isIncome ? (INCOME_PRIORITY[existingSource]  ?? 1) : (BALANCE_PRIORITY[existingSource]  ?? 1)
      const newPri   = isIncome ? (INCOME_PRIORITY[newSource]       ?? 1) : (BALANCE_PRIORITY[newSource]       ?? 1)

      if (newPri > existPri || newPri === existPri) {
        merged[key] = newVal  // yeni kaynak kazanır (eşit öncelikte = en son)
      }
      // newPri < existPri: mevcut kaynak daha güvenilir → güncelleme yok
    } else {
      merged[key] = newVal  // alan yoktu → ekle
    }

    // (eski INCOME_FROM_EXCEL uyarısı kaldırıldı — incomeSource ile replace edildi)
  }

  return merged
}

function extractMissingColumn(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error)
  const matchQualified = msg.match(/financial_data\.([A-Za-z0-9_]+)/i)
  const matchRelation = msg.match(/column\s+[`"]?([A-Za-z0-9_]+)[`"]?\s+of relation\s+[`"]?financial_data[`"]?/i)
  const col = matchQualified?.[1] ?? matchRelation?.[1]
  if (!col) return null
  if (col.includes('_')) {
    return col.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  }
  return col
}

function extractUnknownArgument(error: unknown): string | null {
  const msg = error instanceof Error ? error.message : String(error)
  const match = msg.match(/Unknown argument\s+[`"']?([A-Za-z0-9_]+)[`"']?/i)
  return match?.[1] ?? null
}

function nonNullFields(input: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v != null && !Number.isNaN(Number(v)))
      .map(([k, v]) => [k, Number(v)])
  )
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return jsonUtf8({ error: 'Dosya bulunamadı.' }, { status: 400 })

    // Yıl / dönem override (form'dan gelen)
    const overrideYear   = formData.get('year')   ? Number(formData.get('year'))          : null
    const overridePeriod = formData.get('period')  ? String(formData.get('period'))        : null

    const fileName = file.name.toLowerCase()
    const isExcel  = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    const isCsv    = fileName.endsWith('.csv')
    const isPdf    = fileName.endsWith('.pdf')

    if (!isExcel && !isCsv && !isPdf) {
      return jsonUtf8({ error: 'Yalnızca .xlsx, .xls, .csv veya .pdf dosyaları desteklenir.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    let parsedRows
    if (isExcel) {
      parsedRows = parseExcelBuffer(buffer, file.name)
    } else if (isCsv) {
      parsedRows = parseCsvText(buffer.toString('utf-8'))
    } else {
      const { parsePdfBuffer } = await import('@/lib/parsers/pdf')
      parsedRows = await parsePdfBuffer(buffer)
    }

    // ── DEBUG: parse sonucu (override öncesi) ────────────────────────────────
    if (isExcel) {
      console.log('━━━ [UPLOAD DEBUG] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('[D] overrideYear:', overrideYear, '| overridePeriod:', overridePeriod)
      console.log('[D] parsedRows.length (override öncesi):', parsedRows.length)
      parsedRows.forEach((row, i) => {
        console.log(`[D] row[${i}] year=${row.year ?? 'undefined'} period=${row.period} docType=${row.docType}`)
        console.log(`[D] row[${i}] mizanTypeUsed=${row.meta?.mizanTypeUsed ?? 'N/A'}`)
        console.log(`[D] row[${i}] field sayısı=${Object.keys(row.fields).length}`)
        console.log(`[D] row[${i}] totalAssets=${row.fields['totalAssets'] ?? 'YOK'}`)
        console.log(`[D] row[${i}] totalCurrentAssets=${row.fields['totalCurrentAssets'] ?? 'YOK'}`)
        console.log(`[D] row[${i}] totalNonCurrentAssets=${row.fields['totalNonCurrentAssets'] ?? 'YOK'}`)
        console.log(`[D] row[${i}] tüm alanlar: ${Object.keys(row.fields).join(', ') || '(boş)'}`)
        if (row.meta?.parseWarnings?.length) {
          console.log(`[D] row[${i}] parseWarnings:`, row.meta.parseWarnings)
        }
      })
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    }
    // ── /DEBUG ────────────────────────────────────────────────────────────────

    // Yıl/dönem override mantığı:
    // - Birden fazla satır varsa ve her satırın zaten yılı tespit edildiyse (dikey Excel gibi)
    //   override UYGULANMAZ — her satır kendi yıl/dönemini korur.
    // - Tek satır veya yılsız satır varsa (PDF, yatay Excel) override uygulanır.
    const multiRowWithYears = parsedRows.length > 1 && parsedRows.every(r => r.year != null)

    if (!multiRowWithYears && (overrideYear || overridePeriod)) {
      // Hiç satır yoksa boş bir satır oluştur ÖNCE — override sonrası kaybolmasın
      if (parsedRows.length === 0 && overrideYear) {
        parsedRows = [{ year: overrideYear, period: overridePeriod ?? 'ANNUAL', fields: {}, unmapped: [] }]
      }
      // Override yıl/dönemini uygula
      parsedRows = parsedRows.map(row => ({
        ...row,
        year:   overrideYear   ?? row.year,
        period: overridePeriod ?? row.period,
      }))
    }
    // ── DEBUG: override sonrası ────────────────────────────────────────────────
    if (isExcel) {
      console.log('[D] multiRowWithYears:', multiRowWithYears)
      console.log('[D] parsedRows.length (override sonrası):', parsedRows.length)
      parsedRows.forEach((row, i) => {
        console.log(`[D] override sonrası row[${i}] year=${row.year} field sayısı=${Object.keys(row.fields).length} totalAssets=${row.fields['totalAssets'] ?? 'YOK'}`)
      })
    }
    // ── /DEBUG ─────────────────────────────────────────────────────────────────

    if (parsedRows.length === 0) {
      return jsonUtf8({
        error: 'Dosyada okunabilir veri bulunamadı.',
        parseSummary: {
          parsedRows: 0,
          processedRows: 0,
          skippedRows: 0,
          parseWarnings: ['Parser okunabilir Excel satırı üretemedi.'],
        },
      }, { status: 400 })
    }

    const results = []
    const skippedRows: Array<{ index: number; reason: string; year?: number; period?: string; meta?: unknown }> = []
    const parseWarnings = new Set<string>()

    parsedRows.forEach((row, index) => {
      row.meta?.parseWarnings.forEach(w => parseWarnings.add(w))
      row.meta?.reverseBalanceWarnings.forEach(w => parseWarnings.add(w))
      if (!row.year) {
        skippedRows.push({
          index,
          reason: 'Row year bulunamadığı için işlenemedi',
          period: row.period,
          meta: row.meta,
        })
      }
    })

    for (const [index, row] of parsedRows.entries()) {
      if (!row.year) continue

      const source = docTypeToSource(row.docType, isExcel, isCsv)
      const period = (row.period as string) ?? 'ANNUAL'

      // Eksik toplamları otomatik hesapla
      // DETAY MİZAN'da ana hesap toplamları (1, 2, 3, 4, 5) dosyada bulunmayabilir.
      // Alt hesap alanlarından TDHP gruplarını yeniden hesapla.
      const f = row.fields
      const n = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : null)
      const sum = (...keys: string[]) => {
        const parts = keys.map(k => n(f[k])).filter((x): x is number => x != null)
        return parts.length > 0 ? parts.reduce((a, b) => a + b, 0) : null
      }

      // ── Dönen Varlıklar toplamı ───────────────────────────────────────────
      if (f.totalCurrentAssets == null) {
        const s = sum(
          'cash', 'shortTermInvestments', 'tradeReceivables', 'otherReceivables',
          'inventory', 'prepaidExpenses', 'prepaidSuppliers', 'otherCurrentAssets', 'constructionCosts',
        )
        if (s != null) f.totalCurrentAssets = s
      }
      // ── Duran Varlıklar toplamı ───────────────────────────────────────────
      if (f.totalNonCurrentAssets == null) {
        const s = sum(
          'tangibleAssets', 'intangibleAssets', 'longTermInvestments',
          'longTermTradeReceivables', 'longTermOtherReceivables',
          'longTermPrepaidExpenses', 'otherNonCurrentAssets', 'depletableAssets',
        )
        if (s != null) f.totalNonCurrentAssets = s
      }
      // ── Toplam Aktif ──────────────────────────────────────────────────────
      if (f.totalAssets == null) {
        const ca = n(f.totalCurrentAssets), nca = n(f.totalNonCurrentAssets)
        if (ca != null && nca != null) f.totalAssets = ca + nca
        else if (ca != null)  f.totalAssets = ca
        else if (nca != null) f.totalAssets = nca
      }
      // ── Kısa Vadeli Borçlar toplamı ───────────────────────────────────────
      if (f.totalCurrentLiabilities == null) {
        const s = sum(
          'shortTermFinancialDebt', 'tradePayables', 'advancesReceived',
          'otherShortTermPayables', 'constructionProgress',
          'taxPayables', 'deferredRevenue', 'shortTermProvisions', 'otherCurrentLiabilities',
        )
        if (s != null) f.totalCurrentLiabilities = s
      }
      // ── Uzun Vadeli Borçlar toplamı ───────────────────────────────────────
      if (f.totalNonCurrentLiabilities == null) {
        const s = sum(
          'longTermFinancialDebt', 'longTermTradePayables', 'longTermOtherPayables',
          'longTermAdvancesReceived', 'longTermProvisions', 'otherNonCurrentLiabilities',
        )
        if (s != null) f.totalNonCurrentLiabilities = s
      }
      // ── Öz Kaynak toplamı ─────────────────────────────────────────────────
      // Not: retainedLosses negatif sayı olarak saklanır (580 hesabı negative:true)
      // Bu nedenle toplama dahil edilir — pos - neg yerine pos + losses (signed)
      if (f.totalEquity == null) {
        const pos = sum('paidInCapital', 'capitalReserves', 'profitReserves', 'retainedEarnings', 'netProfitCurrentYear')
        const losses = n(f.retainedLosses) ?? 0  // negatif değer (contra), direkt toplamaya dahil
        if (pos != null) f.totalEquity = pos + losses
      }
      // ── Pasif toplamı ─────────────────────────────────────────────────────
      if (f.totalLiabilitiesAndEquity == null) {
        const cl = n(f.totalCurrentLiabilities), ncl = n(f.totalNonCurrentLiabilities), eq = n(f.totalEquity)
        if (cl != null || ncl != null || eq != null)
          f.totalLiabilitiesAndEquity = (cl ?? 0) + (ncl ?? 0) + (eq ?? 0)
      }
      // ── Öz Kaynak son çare: Aktif − Borçlar ──────────────────────────────
      if (f.totalEquity == null && f.totalAssets != null) {
        const assetVal = n(f.totalAssets)
        const clVal    = n(f.totalCurrentLiabilities) ?? 0
        const ncl      = n(f.totalNonCurrentLiabilities) ?? 0
        if (assetVal != null) f.totalEquity = assetVal - clVal - ncl
      }
      if (f.grossProfit == null && f.revenue != null && f.cogs != null) {
        const rev  = n(f.revenue)
        const cogs = n(f.cogs)
        if (rev != null && cogs != null) f.grossProfit = rev - cogs
      }
      if (f.ebitda == null && f.ebit != null) {
        f.ebitda = n(f.ebit) // depreciation yoksa ebit = ebitda yaklaşımı
      }
      // netProfit: önce netProfitCurrentYear (590 hesabı / mizan), sonra ebt-taxExpense
      if (f.netProfit == null) {
        if (f.netProfitCurrentYear != null) {
          f.netProfit = n(f.netProfitCurrentYear)
        } else if (f.ebt != null && f.taxExpense != null) {
          const ebtVal = n(f.ebt), taxVal = n(f.taxExpense)
          if (ebtVal != null && taxVal != null) f.netProfit = ebtVal - taxVal
        } else if (f.ebt != null) {
          f.netProfit = n(f.ebt) // vergi bilinmiyorsa ebt ≈ netProfit
        }
      }
      // netProfitCurrentYear (bilanço 59) yoksa netProfit ile eşitle — eski yanlış kayıtların üstüne yazar
      if (f.netProfitCurrentYear == null && f.netProfit != null) {
        f.netProfitCurrentYear = n(f.netProfit)
      }

      // ── Kaynak öncelik birleştirmesi ─────────────────────────────────────
      // Önce mevcut kaydı çek; sonraki belge eskiyi ezmez kuralını uygula
      const existingRecord = await prisma.financialData.findUnique({
        where: { entityId_year_period: { entityId, year: row.year!, period } },
      })
      const rawNewFields = nonNullFields(row.fields as Record<string, unknown>)
      const existingSource = existingRecord?.source ?? ''
      let mergedFields: Record<string, number>

      if (existingRecord) {
        // DB'deki mevcut sayısal alanları çıkar
        const existingNumericFields = nonNullFields(
          Object.fromEntries(
            Object.entries(existingRecord as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'number')
          )
        )
        mergedFields = mergeByPriority(existingNumericFields, existingSource, rawNewFields, source, parseWarnings) as Record<string, number>
      } else {
        mergedFields = rawNewFields
      }

      // GVB uyarısı: bilanço alanı olmadığı için sadece gelir tablosu güncellendi
      if (source === 'GVB' && existingRecord && Object.keys(rawNewFields).every(k => INCOME_FIELDS.has(k))) {
        parseWarnings.add('GVB_NO_BALANCE: Geçici beyannamede bilanço yoktur. Bilanço bilgileri önceki kayıttan korundu.')
      }

      const blockedFields = new Set<string>()
      let financialData

      // DB şeması geride kaldığında (P2022), eksik kolonu payload'dan düşürüp retry et.
      while (true) {
        const filteredFields = Object.fromEntries(
          Object.entries(mergedFields).filter(([k]) => !blockedFields.has(k))
        )
        // finalSource: DB'de saklanacak kaynak.
        // Beyanname (GVB/KVB/YGVB) kaynaklı income, Excel re-upload ile ezilmemeli.
        //   - Yeni kaynak beyanname  → beyanname kullan
        //   - Yeni kaynak Excel ama mevcut beyanname → mevcut kaynak korunur
        //   - Her ikisi de Excel     → yeni kaynak (en son)
        const DECLARATION_SOURCES = ['GVB', 'KVB', 'YGVB', 'GVB-Q1', 'GVB-Q2', 'GVB-Q3', 'GVB-Q4']
        const finalSource = DECLARATION_SOURCES.includes(source)
          ? source
          : (existingRecord && DECLARATION_SOURCES.includes(existingSource))
            ? existingSource
            : source
        const updatePayload = { ...filteredFields, source: finalSource, fileName: file.name, updatedAt: new Date() }
        const createPayload = { entityId, year: row.year, period, source, fileName: file.name, ...filteredFields }

        try {
          financialData = await prisma.financialData.upsert({
            where: { entityId_year_period: { entityId, year: row.year, period } },
            update: updatePayload,
            create: createPayload,
            select: { id: true, entityId: true, year: true, period: true },
          })
          break
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          const maybeKnown = error as { code?: string }
          const missing = extractMissingColumn(error)
          const unknownArg = extractUnknownArgument(error)
          const isMissingColumnError =
            maybeKnown?.code === 'P2022' ||
            (/financial_data/i.test(msg) && /does not exist|exist in the current database/i.test(msg) && missing != null)
          const isUnknownArgumentError = /Unknown argument/i.test(msg) && unknownArg != null

          if (isMissingColumnError && missing) {
            if (blockedFields.has(missing)) throw error
            if (!(missing in mergedFields)) throw error

            blockedFields.add(missing)
            parseWarnings.add(`DB şemasında eksik kolon atlandı: ${missing}`)
            continue
          }

          if (isUnknownArgumentError && unknownArg) {
            if (blockedFields.has(unknownArg)) throw error
            if (!(unknownArg in mergedFields)) throw error

            blockedFields.add(unknownArg)
            parseWarnings.add(`Prisma client'ta tanımsız alan atlandı: ${unknownArg}`)
            continue
          }

          throw error
        }
      }

      const parseWarningsJson = row.meta?.parseWarnings ? JSON.stringify(row.meta.parseWarnings) : null
      const unmappedJson = row.unmapped?.length ? JSON.stringify(row.unmapped) : null
      const uploadId = crypto.randomUUID()
      try {
        await prisma.$executeRaw`
          INSERT INTO "financial_data_uploads"
            ("id", "entityId", "financialDataId", "year", "period", "source", "fileName", "parsedFieldCount", "unmapped", "parseWarnings", "createdAt")
          VALUES
            (${uploadId}, ${entityId}, ${financialData.id}, ${row.year}, ${period}, ${source}, ${file.name}, ${Object.keys(row.fields ?? {}).length}, ${unmappedJson}, ${parseWarningsJson}, NOW())
        `
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        if (/financial_data_uploads/i.test(msg) && /does not exist|42P01/i.test(msg)) {
          parseWarnings.add('financial_data_uploads tablosu bulunamadı: upload log kaydı atlandı')
        } else {
          throw error
        }
      }

      // Önceki yıl cirosunu sorgula (reel büyüme hesabı için)
      const prevYearData = await prisma.financialData.findFirst({
        where: { entityId, year: row.year - 1, period },
        select: { revenue: true },
      })
      const ppiRate = TURKEY_PPI[row.year] ?? TURKEY_PPI[2024]
      const enrichedFields = {
        ...nonNullFields(row.fields as Record<string, unknown>),
        prevRevenue: prevYearData?.revenue ?? null,
        ppiRate,
      }

      const ratios = calculateRatios(enrichedFields)
      const score  = calculateScore(ratios, entity.sector)
      const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, entity.sector)

      // Kaynak metadata — UI badge ve uyarılar için
      const isBeyanname = (s: string) => ['KVB', 'YGVB', 'GVB'].includes(s)
      const isExcelLike  = (s: string) => ['EXCEL', 'EXCEL_GT', 'CSV', 'PDF'].includes(s)

      // Gelir tablosu ve bilanço için efektif kaynak (beyanname > ExcelGT > Excel)
      const effectiveIncomeSource =
        isBeyanname(source)       ? source :
        isBeyanname(existingSource) ? existingSource :
        source  // EXCEL_GT veya EXCEL

      const effectiveBalanceSource =
        ['KVB', 'YGVB'].includes(source)        ? source :
        ['KVB', 'YGVB'].includes(existingSource) ? existingSource :
        source !== 'GVB'                          ? source :
        (existingSource || null)

      const sourceMeta = {
        incomeStatement: toIncomeLabel(effectiveIncomeSource),
        balanceSheet:    toIncomeLabel(effectiveBalanceSource),
        lastUpload:      source,
        lastUploadFile:  file.name,
      }
      // row.meta?.sources varsa __sources'a merge et (parser tarafından set edilmiş kesin değerler)
      if (row.meta?.sources?.incomeStatement) {
        sourceMeta.incomeStatement = row.meta.sources.incomeStatement
      }
      if ('balanceSheet' in (row.meta?.sources ?? {})) {
        sourceMeta.balanceSheet = row.meta!.sources!.balanceSheet
      }

      // ── incomeMismatch: EK KURAL 1 ─────────────────────────────────────────
      // Yalnızca aynı dönemde hem beyanname hem Excel (GT veya mizan) mevcut
      // olduğunda hesaplanır. Her iki tarafta da netProfit parse edildiyse hesapla.
      let incomeMismatch = 0
      if (existingRecord) {
        const isMixedSources =
          (isBeyanname(existingSource) && isExcelLike(source)) ||
          (isExcelLike(existingSource) && isBeyanname(source))
        if (isMixedSources) {
          const existNetProfit = (existingRecord as Record<string, unknown>)['netProfit']
          const newNetProfit   = rawNewFields['netProfit']
          if (existNetProfit != null && newNetProfit != null &&
              typeof existNetProfit === 'number' && typeof newNetProfit === 'number') {
            incomeMismatch = Math.round(Math.abs(existNetProfit - newNetProfit))
          }
        }
      }

      // incomeSource: Declaration | ExcelGT | ExcelMizan | null
      const incomeSourceLabel: 'Declaration' | 'ExcelGT' | 'ExcelMizan' | null =
        isBeyanname(effectiveIncomeSource)    ? 'Declaration' :
        effectiveIncomeSource === 'EXCEL_GT'  ? 'ExcelGT' :
        isExcelLike(effectiveIncomeSource)    ? 'ExcelMizan' :
        null

      // GT-only dönem tespiti: parser meta.sources'tan oku (string parse yerine yapısal)
      const gtOnlyPeriod = !!(
        row.meta?.sources &&
        row.meta.sources.balanceSheet === null &&
        row.meta.sources.incomeStatement != null
      )
      const gtOnlyWarning = gtOnlyPeriod
        ? 'Bu dönem için mizan bulunamadı, sadece gelir tablosu gösteriliyor'
        : null

      const warningsMeta = {
        incomeSource:       incomeSourceLabel,  // incomeFromExcel yerine detaylı kaynak
        declarationMissing: !isBeyanname(source) && !isBeyanname(existingSource),
        gvbNoBalance:       source === 'GVB',
        incomeMismatch,     // TL fark; 0 = temiz veya koşul sağlanmadı
        mizanTypeUsed:      (row.meta?.mizanTypeUsed ?? null) as 'DETAY' | 'STANDART' | null,
        gtOnlyPeriod,       // true = mizanda karşılığı olmayan GT-only dönem
        gtOnlyWarning,      // string mesaj veya null
      }

      const ratiosJson = JSON.stringify({
        ...ratios,
        __overallCoverage: score.overallCoverage ?? null,
        __sources: sourceMeta,
        __warnings: warningsMeta,
      })

      await prisma.analysis.upsert({
        where: { financialDataId: financialData.id },
        update: {
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             ratiosJson,
          optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
          updatedAt:          new Date(),
        },
        create: {
          userId,
          entityId,
          financialDataId:    financialData.id,
          year:               row.year,
          period:             period,
          mode:               'SOLO',
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             ratiosJson,
          optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
        },
      })

      results.push({
        index,
        year: row.year,
        period: row.period,
        rating: score.finalRating,
        score: score.finalScore,
        unmapped: row.unmapped,
        meta: row.meta,
      })
    }

    if (results.length === 0) {
      return jsonUtf8({
        error: 'Excel satırları parse edildi ancak işlenebilir yıl/dönem bilgisi üretilemedi.',
        parseSummary: {
          parsedRows: parsedRows.length,
          processedRows: 0,
          skippedRows: skippedRows.length,
          skippedDetails: skippedRows,
          parseWarnings: Array.from(parseWarnings),
        },
      }, { status: 400 })
    }

    return jsonUtf8({
      imported: results.length,
      results,
      parseSummary: {
        parsedRows: parsedRows.length,
        processedRows: results.length,
        skippedRows: skippedRows.length,
        skippedDetails: skippedRows,
        parseWarnings: Array.from(parseWarnings),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[upload] error:', msg)
    return jsonUtf8({ error: `Dosya işlenirken hata oluştu: ${msg}` }, { status: 500 })
  }
}
