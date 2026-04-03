import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getUserIdFromRequest } from '@/lib/auth'
import { parseExcelBuffer, parseCsvText } from '@/lib/parsers/excel'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return NextResponse.json({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })

    // Yıl / dönem override (form'dan gelen)
    const overrideYear   = formData.get('year')   ? Number(formData.get('year'))          : null
    const overridePeriod = formData.get('period')  ? String(formData.get('period'))        : null

    const fileName = file.name.toLowerCase()
    const isExcel  = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    const isCsv    = fileName.endsWith('.csv')
    const isPdf    = fileName.endsWith('.pdf')

    if (!isExcel && !isCsv && !isPdf) {
      return NextResponse.json({ error: 'Yalnızca .xlsx, .xls, .csv veya .pdf dosyaları desteklenir.' }, { status: 400 })
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
      parsedRows = parsedRows.map(row => ({
        ...row,
        year:   overrideYear   ?? row.year,
        period: overridePeriod ?? row.period,
      }))
      // Hiç satır yoksa boş bir satır oluştur (PDF parse edemediyse bile yıl/dönem kaydedilsin)
      if (parsedRows.length === 0 && overrideYear) {
        parsedRows = [{ year: overrideYear, period: overridePeriod ?? 'ANNUAL', fields: {}, unmapped: [] }]
      }
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ error: 'Dosyada okunabilir veri bulunamadı.' }, { status: 400 })
    }

    const results = []

    for (const row of parsedRows) {
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
        const sum = [cash, rec, inv].filter(x => x != null).reduce((a, b) => a! + b!, 0)
        if (sum! > 0) f.totalCurrentAssets = sum
      }
      if (f.totalLiabilitiesAndEquity == null) {
        const cl = n(f.totalCurrentLiabilities), ncl = n(f.totalNonCurrentLiabilities), eq = n(f.totalEquity)
        if (cl != null || ncl != null || eq != null)
          f.totalLiabilitiesAndEquity = (cl ?? 0) + (ncl ?? 0) + (eq ?? 0)
      }
      if (f.totalEquity == null && f.totalAssets != null && f.totalCurrentLiabilities != null) {
        const ncl = n(f.totalNonCurrentLiabilities) ?? 0
        f.totalEquity = n(f.totalAssets)! - n(f.totalCurrentLiabilities)! - ncl
      }
      if (f.grossProfit == null && f.revenue != null && f.cogs != null) {
        f.grossProfit = n(f.revenue)! - n(f.cogs)!
      }
      if (f.ebitda == null && f.ebit != null) {
        f.ebitda = n(f.ebit) // depreciation yoksa ebit = ebitda yaklaşımı
      }

      // Mevcut kaydı bul: varsa yeni verilerle merge et (null olan alanları koru)
      const existing = await prisma.financialData.findUnique({
        where: { entityId_year_period: { entityId, year: row.year, period } },
      })
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
        update: { ...mergedFields, source, fileName: file.name, updatedAt: new Date() },
        create: { entityId, year: row.year, period, source, fileName: file.name, ...row.fields },
      })

      const ratios = calculateRatios(row.fields)
      const score  = calculateScore(ratios)

      await prisma.analysis.upsert({
        where: { financialDataId: financialData.id },
        update: {
          finalScore:         score.finalScore,
          finalRating:        score.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios:             JSON.stringify(ratios),
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
          ratios:             JSON.stringify(ratios),
        },
      })

      results.push({ year: row.year, period: row.period, rating: score.finalRating, score: score.finalScore, unmapped: row.unmapped })
    }

    return NextResponse.json({ imported: results.length, results })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Dosya işlenirken hata oluştu.' }, { status: 500 })
  }
}
