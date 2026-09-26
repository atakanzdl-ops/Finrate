import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'
import { resolveFinalScore } from '@/lib/scoring/persistScore'
import { buildRatioInput } from '@/lib/scoring/ratioInput'

/**
 * POST /api/analyses/recalculate
 * Kullanıcının tüm FinancialData kayıtlarını yeniden hesaplar.
 * score.ts eşikleri değişince mevcut analizleri günceller.
 */
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const allData = await prisma.financialData.findMany({
    where: { entity: { userId } },
    include: { analysis: true, entity: { select: { sector: true } } },
  })

  let updated = 0
  const updatedIds: string[] = []

  for (const fd of allData) {
    const fields = fd as unknown as Record<string, unknown>

    // Yıllıklandırma + önceki yıl (aynı dönem, yoksa yıllık) + ÜFE — tek kaynak: buildRatioInput
    const enriched = await buildRatioInput(fields, { entityId: fd.entityId, year: fd.year, period: fd.period, sector: fd.entity.sector })
    const ratios = calculateRatios(enriched as Parameters<typeof calculateRatios>[0])
    const score  = calculateScore(ratios, fd.entity.sector)
    const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, fd.entity.sector)

    if (fd.analysis) {
      const resolved = await resolveFinalScore(fd.entityId, score.finalScore)

      await prisma.analysis.update({
        where: { id: fd.analysis.id },
        data: {
          finalScore:         resolved.finalScore,
          finalRating:        resolved.finalRating,
          liquidityScore:     score.liquidityScore,
          profitabilityScore: score.profitabilityScore,
          leverageScore:      score.leverageScore,
          activityScore:      score.activityScore,
          ratios: JSON.stringify({
            ...ratios,
            __overallCoverage:        score.overallCoverage ?? null,
            __insufficientCategories: score.insufficientCategories,
            ...resolved.meta,
          }),
          optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
          updatedAt:          new Date(),
        },
      })
      updatedIds.push(fd.analysis.id)
      updated++
    }
  }

  // === Faz 7.3.60.1: roadmapSnapshot invalidation (sadece güncellenen analizler) ===
  if (updatedIds.length > 0) {
    await prisma.analysis.updateMany({
      where: {
        id:              { in: updatedIds },
        roadmapSnapshot: { not: null },
      },
      data: { roadmapSnapshot: null },
    })
  }

  return jsonUtf8({ recalculated: updated })
}
