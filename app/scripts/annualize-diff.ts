import { prisma } from '../src/lib/db'
import { calculateRatios } from '../src/lib/scoring/ratios'
import { calculateScore } from '../src/lib/scoring/score'
import { resolveFinalScore } from '../src/lib/scoring/persistScore'
import { buildRatioInput } from '../src/lib/scoring/ratioInput'

// DRY RUN: yıllıklandırma kuralıyla tüm ara dönem analizlerinin yeni skorunu hesaplar, DB'ye YAZMAZ.
async function main() {
  const rows = await prisma.financialData.findMany({
    where: { period: { in: ['Q1', 'Q2', 'Q3'] }, entity: { isActive: true } },
    include: { entity: { select: { name: true, sector: true } }, analysis: { select: { finalScore: true, finalRating: true, ratios: true } } },
    orderBy: [{ year: 'asc' }],
  })
  console.log('Firma                 Dönem     Skor: önce → sonra   | DIO gün   | Aktif devir | Ciro büyümesi')
  for (const fd of rows) {
    if (!fd.analysis) continue
    const { entity, analysis, ...rest } = fd
    const fields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) if (typeof v === 'number' || v === null) fields[k] = v
    const input = await buildRatioInput(fields, { entityId: fd.entityId, year: fd.year, period: fd.period, sector: entity.sector })
    const ratios = calculateRatios(input as Parameters<typeof calculateRatios>[0])
    const score = calculateScore(ratios, entity.sector)
    const resolved = await resolveFinalScore(fd.entityId, score.finalScore)
    const old = analysis.ratios ? JSON.parse(analysis.ratios) : {}
    const f = (v: number | null | undefined, d = 1) => v == null ? '—' : v.toFixed(d)
    console.log(
      `${entity.name.padEnd(21)} ${fd.year} ${fd.period.padEnd(3)}  ${String(analysis.finalScore).padStart(5)} ${analysis.finalRating?.padEnd(3)} → ${String(resolved.finalScore).padStart(5)} ${resolved.finalRating.padEnd(3)}` +
      ` | ${f(old.inventoryTurnoverDays,0).padStart(4)}→${f(ratios.inventoryTurnoverDays,0).padStart(4)}` +
      ` | ${f(old.assetTurnover,2).padStart(5)}→${f(ratios.assetTurnover,2).padStart(5)}` +
      ` | ${old.revenueGrowth == null ? '—' : (old.revenueGrowth*100).toFixed(0)+'%'} → ${ratios.revenueGrowth == null ? '—' : (ratios.revenueGrowth*100).toFixed(0)+'%'}`,
    )
  }
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
