import { prisma } from '../src/lib/db'
import { resolveFinalScore } from '../src/lib/scoring/persistScore'

// Tek seferlik: tüm SOLO analizlerin finalScore'unu resolveFinalScore ile yeniden yazar.
// Finansal skor kaynağı: ratios.__financialScore varsa o; yoksa finalScore (o zaman saf finansaldır).
// DRY_RUN=1 ile sadece farkları listeler.
const DRY = process.env.DRY_RUN === '1'

async function main() {
  const analyses = await prisma.analysis.findMany({
    where: { mode: 'SOLO', entityId: { not: null } },
    include: { entity: { select: { name: true } } },
  })
  let changed = 0
  for (const a of analyses) {
    let ratios: Record<string, unknown> = {}
    try { ratios = a.ratios ? JSON.parse(a.ratios) : {} } catch { /* bozuk JSON → boş */ }
    const financial = typeof ratios.__financialScore === 'number' ? ratios.__financialScore : a.finalScore
    if (financial == null || !a.entityId) continue
    const r = await resolveFinalScore(a.entityId, financial)
    const diff = Math.abs((a.finalScore ?? 0) - r.finalScore) > 0.01 || a.finalRating !== r.finalRating
    if (diff) {
      changed++
      console.log(`${(a.entity?.name ?? '?').padEnd(20)} ${a.year} ${a.period.padEnd(6)} ${String(a.finalScore).padStart(6)} ${String(a.finalRating).padEnd(4)} → ${String(r.finalScore).padStart(6)} ${r.finalRating}`)
    }
    if (!DRY) {
      await prisma.analysis.update({
        where: { id: a.id },
        data: {
          finalScore: r.finalScore,
          finalRating: r.finalRating,
          ratios: JSON.stringify({ ...ratios, ...r.meta }),
        },
      })
    }
  }
  console.log(`\n${analyses.length} analiz tarandı, ${changed} değişti${DRY ? ' (DRY RUN — yazılmadı)' : ''}`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
