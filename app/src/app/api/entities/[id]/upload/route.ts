import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { parseExcelBuffer, parseCsvText } from '@/lib/parsers/excel'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { Period, DataSource } from '@prisma/client'

function getUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return null
    return verifyToken(token).userId
  } catch {
    return null
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return NextResponse.json({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const formData = await req.formData()
    const file     = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })

    const fileName = file.name.toLowerCase()
    const isExcel  = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
    const isCsv    = fileName.endsWith('.csv')

    if (!isExcel && !isCsv) {
      return NextResponse.json({ error: 'Yalnızca .xlsx, .xls veya .csv dosyaları desteklenir.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer      = Buffer.from(arrayBuffer)

    let parsedRows
    if (isExcel) {
      parsedRows = parseExcelBuffer(buffer)
    } else {
      parsedRows = parseCsvText(buffer.toString('utf-8'))
    }

    if (parsedRows.length === 0) {
      return NextResponse.json({ error: 'Dosyada okunabilir veri bulunamadı.' }, { status: 400 })
    }

    const results = []

    for (const row of parsedRows) {
      if (!row.year) continue

      const source: DataSource = isExcel ? 'EXCEL' : 'CSV'
      const period: Period = (row.period as Period) ?? 'ANNUAL'

      const financialData = await prisma.financialData.upsert({
        where: { entityId_year_period: { entityId, year: row.year, period } },
        update: { ...row.fields, source, fileName: file.name, updatedAt: new Date() },
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
          ratios:             ratios as object,
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
          ratios:             ratios as object,
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
