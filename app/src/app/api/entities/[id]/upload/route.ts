import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { parseExcelBuffer, parseCsvText } from '@/lib/parsers/excel'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

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
      parsedRows = parseExcelBuffer(buffer)
    } else if (isCsv) {
      parsedRows = parseCsvText(buffer.toString('utf-8'))
    } else {
      const { parsePdfBuffer } = await import('@/lib/parsers/pdf')
      parsedRows = await parsePdfBuffer(buffer)
    }

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

      const source = isExcel ? 'EXCEL' : isCsv ? 'CSV' : 'PDF'
      const period = (row.period as string) ?? 'ANNUAL'

      // Eksik toplamları otomatik hesapla
      const f = row.fields
      const n = (v: unknown) => (v != null && !isNaN(Number(v)) ? Number(v) : null)

      if (f.totalAssets == null) {
        const ca = n(f.totalCurrentAssets), nca = n(f.totalNonCurrentAssets)
        if (ca != null && nca != null) f.totalAssets = ca + nca
        else if (ca != null && nca == null) f.totalAssets = ca
      }
      if (f.totalCurrentAssets == null) {
        const cash = n(f.cash), rec = n(f.tradeReceivables), inv = n(f.inventory)
        const nums = [cash, rec, inv].filter((x): x is number => x != null)
        const sum = nums.reduce((a, b) => a + b, 0)
        if (nums.length > 0 && sum > 0) f.totalCurrentAssets = sum
      }
      if (f.totalLiabilitiesAndEquity == null) {
        const cl = n(f.totalCurrentLiabilities), ncl = n(f.totalNonCurrentLiabilities), eq = n(f.totalEquity)
        if (cl != null || ncl != null || eq != null)
          f.totalLiabilitiesAndEquity = (cl ?? 0) + (ncl ?? 0) + (eq ?? 0)
      }
      if (f.totalEquity == null && f.totalAssets != null && f.totalCurrentLiabilities != null) {
        const assetVal = n(f.totalAssets)
        const clVal    = n(f.totalCurrentLiabilities)
        const ncl      = n(f.totalNonCurrentLiabilities) ?? 0
        if (assetVal != null && clVal != null) f.totalEquity = assetVal - clVal - ncl
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

      // Mevcut kaydı bul: varsa yeni verilerle merge et (null olan alanları koru)
      const existing = await prisma.financialData.findUnique({
        where: { entityId_year_period: { entityId, year: row.year, period } },
      })
      const nextSource = existing && existing.source !== source ? 'MIXED' : source
      // Merge: yeni dosyadaki null olmayan alanlar öncelikli, eksik alanlar mevcut kayıttan gelir
      const mergedFields = existing
        ? Object.fromEntries(
            Object.entries({ ...(existing as Record<string, unknown>), ...row.fields })
              .filter(([k]) => !(k in { id:1, entityId:1, year:1, period:1, source:1, fileName:1, createdAt:1, updatedAt:1 }))
              .map(([k, v]) => {
                const newVal = (row.fields as Record<string, unknown>)[k]
                return [k, newVal != null ? newVal : v]
              })
          )
        : row.fields

      const financialData = await prisma.financialData.upsert({
        where: { entityId_year_period: { entityId, year: row.year, period } },
        update: { ...mergedFields, source: nextSource, fileName: file.name, updatedAt: new Date() },
        create: { entityId, year: row.year, period, source: nextSource, fileName: file.name, ...mergedFields },
      })

      const parseWarningsJson = row.meta?.parseWarnings ? JSON.stringify(row.meta.parseWarnings) : null
      const unmappedJson = row.unmapped?.length ? JSON.stringify(row.unmapped) : null
      const uploadId = crypto.randomUUID()
      await prisma.$executeRaw`
        INSERT INTO "financial_data_uploads"
          ("id", "entityId", "financialDataId", "year", "period", "source", "fileName", "parsedFieldCount", "unmapped", "parseWarnings", "createdAt")
        VALUES
          (${uploadId}, ${entityId}, ${financialData.id}, ${row.year}, ${period}, ${source}, ${file.name}, ${Object.keys(row.fields ?? {}).length}, ${unmappedJson}, ${parseWarningsJson}, NOW())
      `

      // Önceki yıl cirosunu sorgula (reel büyüme hesabı için)
      const prevYearData = await prisma.financialData.findFirst({
        where: { entityId, year: row.year - 1, period },
        select: { revenue: true },
      })
      const ppiRate = TURKEY_PPI[row.year] ?? TURKEY_PPI[2024]
      const enrichedFields = {
        ...mergedFields,
        prevRevenue: prevYearData?.revenue ?? null,
        ppiRate,
      }

      const ratios = calculateRatios(enrichedFields)
      const score  = calculateScore(ratios, entity.sector)
      const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, entity.sector)

      await prisma.analysis.upsert({
        where: { financialDataId: financialData.id },
        update: {
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             JSON.stringify({ ...ratios, __overallCoverage: score.overallCoverage ?? null }),
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
          ratios:             JSON.stringify({ ...ratios, __overallCoverage: score.overallCoverage ?? null }),
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
