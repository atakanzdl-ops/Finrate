import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'

function getUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return null
    return verifyToken(token).userId
  } catch {
    return null
  }
}

// POST /api/entities/[id]/financial-data — finansal veri kaydet + skor hesapla
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return NextResponse.json({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const { year, period = 'ANNUAL', source = 'MANUAL', ...financialFields } = body

    if (!year || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Geçerli bir yıl girin.' }, { status: 400 })
    }

    // Mevcut veriyi güncelle veya yeni oluştur (upsert)
    const financialData = await prisma.financialData.upsert({
      where: { entityId_year_period: { entityId, year, period } },
      update: { ...financialFields, source, updatedAt: new Date() },
      create: { entityId, year, period, source, ...financialFields },
    })

    // Otomatik skor hesapla
    const ratios = calculateRatios(financialFields)
    const scoreResult = calculateScore(ratios)

    // Analysis kaydını upsert et
    const analysis = await prisma.analysis.upsert({
      where: { financialDataId: financialData.id },
      update: {
        finalScore:         scoreResult.finalScore,
        finalRating:        scoreResult.finalRating,
        liquidityScore:     scoreResult.liquidityScore,
        profitabilityScore: scoreResult.profitabilityScore,
        leverageScore:      scoreResult.leverageScore,
        activityScore:      scoreResult.activityScore,
        ratios:             ratios as object,
        updatedAt:          new Date(),
      },
      create: {
        userId,
        entityId,
        financialDataId:    financialData.id,
        year,
        period,
        mode:               'SOLO',
        finalScore:         scoreResult.finalScore,
        finalRating:        scoreResult.finalRating,
        liquidityScore:     scoreResult.liquidityScore,
        profitabilityScore: scoreResult.profitabilityScore,
        leverageScore:      scoreResult.leverageScore,
        activityScore:      scoreResult.activityScore,
        ratios:             ratios as object,
      },
    })

    return NextResponse.json({ financialData, analysis, ratios, score: scoreResult }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
