import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'

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

  for (const fd of allData) {
    const fields = fd as unknown as Record<string, unknown>

    // Önceki yıl verileri (reel büyüme + ortalama stok/alacak/borç için)
    // Önce aynı period'u dene, bulamazsan ANNUAL'ı kullan (Q4 → ANNUAL fallback)
    let prevYearData = await prisma.financialData.findFirst({
      where: { entityId: fd.entityId, year: fd.year - 1, period: fd.period },
      select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true },
    })
    if (!prevYearData) {
      prevYearData = await prisma.financialData.findFirst({
        where: { entityId: fd.entityId, year: fd.year - 1 },
        orderBy: { period: 'desc' },   // ANNUAL > Q4 > Q3 …
        select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true },
      })
    }

    const enriched = {
      ...fields,
      prevRevenue:           prevYearData?.revenue           ?? null,
      prevInventory:         prevYearData?.inventory         ?? null,
      prevTradeReceivables:  prevYearData?.tradeReceivables  ?? null,
      prevTradePayables:     prevYearData?.tradePayables     ?? null,
      ppiRate: TURKEY_PPI[fd.year] ?? TURKEY_PPI[2024],
    }

    const ratios = calculateRatios(enriched as Parameters<typeof calculateRatios>[0])
    const score  = calculateScore(ratios, fd.entity.sector)
    const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, fd.entity.sector)

    if (fd.analysis) {
      await prisma.analysis.update({
        where: { id: fd.analysis.id },
        data: {
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
      })
      updated++
    }
  }

  return jsonUtf8({ recalculated: updated })
}
