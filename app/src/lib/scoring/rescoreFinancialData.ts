import { prisma } from '@/lib/db'
import { calculateRatios, TURKEY_PPI } from '@/lib/scoring/ratios'
import { calculateScore } from '@/lib/scoring/score'
import { createOptimizerSnapshot } from '@/lib/scoring/optimizerSnapshot'
import { resolveFinalScore } from '@/lib/scoring/persistScore'

/**
 * Bir FinancialData kaydını yükleme yoluyla BİREBİR aynı adımlarla yeniden skorlar:
 * önceki yıl (aynı dönem) → calculateRatios → calculateScore(sektör) → resolveFinalScore.
 * Elle düzenleme yolları (2 haneli özet, 3 haneli hesap planı) bunu kullanır; böylece
 * skor mantığı tek yerde kalır.
 */
export async function rescoreFinancialData(fdId: string) {
  const fd = await prisma.financialData.findUnique({
    where: { id: fdId },
    include: { entity: { select: { sector: true } }, analysis: { select: { id: true, ratios: true } } },
  })
  if (!fd) return null

  const { entity, analysis, ...rest } = fd
  const fields: Record<string, number | null> = {}
  for (const [k, v] of Object.entries(rest)) {
    if (typeof v === 'number') fields[k] = v
    else if (v === null) fields[k] = null
  }

  const prevYearData = await prisma.financialData.findFirst({
    where: { entityId: fd.entityId, year: fd.year - 1, period: fd.period },
    select: { revenue: true, inventory: true, tradeReceivables: true, tradePayables: true, advancesReceived: true },
  })

  const enriched = {
    ...fields,
    sector:               entity.sector,
    prevRevenue:          prevYearData?.revenue          ?? null,
    prevInventory:        prevYearData?.inventory        ?? null,
    prevTradeReceivables: prevYearData?.tradeReceivables ?? null,
    prevTradePayables:    prevYearData?.tradePayables    ?? null,
    prevAdvancesReceived: prevYearData?.advancesReceived ?? null,
    ppiRate:              TURKEY_PPI[fd.year] ?? TURKEY_PPI[2024],
  }

  const ratios = calculateRatios(enriched as Parameters<typeof calculateRatios>[0])
  const score  = calculateScore(ratios, entity.sector)
  const optimizerSnapshot = createOptimizerSnapshot(ratios, score.finalScore, entity.sector)
  const resolved = await resolveFinalScore(fd.entityId, score.finalScore)

  if (analysis) {
    await prisma.analysis.update({
      where: { id: analysis.id },
      data: {
        finalScore:         resolved.finalScore,
        finalRating:        resolved.finalRating,
        liquidityScore:     score.liquidityScore,
        profitabilityScore: score.profitabilityScore,
        leverageScore:      score.leverageScore,
        activityScore:      score.activityScore,
        ratios:             JSON.stringify({ ...ratios, __overallCoverage: score.overallCoverage ?? null, ...resolved.meta }),
        optimizerSnapshot:  JSON.stringify(optimizerSnapshot),
        roadmapSnapshot:    null,
        updatedAt:          new Date(),
      },
    })
  }

  return { ratios, score, resolved, analysisId: analysis?.id ?? null }
}
