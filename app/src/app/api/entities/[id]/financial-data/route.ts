import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

// POST /api/entities/[id]/financial-data — finansal veri kaydet + skor hesapla
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: entityId } = await params
  const entity = await prisma.entity.findFirst({ where: { id: entityId, userId } })
  if (!entity) return jsonUtf8({ error: 'Şirket bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const { year, period = 'ANNUAL', source = 'MANUAL', ...financialFields } = body

    if (!year || year < 2000 || year > 2100) {
      return jsonUtf8({ error: 'Geçerli bir yıl girin.' }, { status: 400 })
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
    const optimizerSnapshot = createOptimizerSnapshot(ratios, scoreResult.finalScore, entity.sector)

    // Analysis kaydını upsert et
    const analysis = await prisma.analysis.upsert({
      where: { entityId_year_period: { entityId, year, period } },
      update: {
        financialDataId:    financialData.id,
        finalScore:         scoreResult.finalScore,
        finalRating:        scoreResult.finalRating,
        liquidityScore:     scoreResult.liquidityScore,
        profitabilityScore: scoreResult.profitabilityScore,
        leverageScore:      scoreResult.leverageScore,
        activityScore:      scoreResult.activityScore,
        ratios:             JSON.stringify({ ...ratios, __overallCoverage: scoreResult.overallCoverage ?? null }),
        optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
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
        ratios:             JSON.stringify({ ...ratios, __overallCoverage: scoreResult.overallCoverage ?? null }),
        optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
      },
    })

    return jsonUtf8({ financialData, analysis, ratios, score: scoreResult }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[financial-data] error:', msg)
    return jsonUtf8({ error: 'Finansal veri işlenirken hata oluştu.' }, { status: 500 })
  }
}
