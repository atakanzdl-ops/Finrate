import fs from 'fs'
import path from 'path'
import { prisma } from '../src/lib/db'

const OUT = path.join(__dirname, '../src/lib/scoring/__fixtures__/golden-scores.json')

async function main() {
  const analyses = await prisma.analysis.findMany({
    where: { entity: { isActive: true } },
    include: { entity: { select: { name: true, sector: true } } },
    orderBy: [{ year: 'desc' }, { period: 'desc' }],
  })
  const rows = analyses.map(a => {
    let ratios: Record<string, unknown> = {}
    try { ratios = a.ratios ? JSON.parse(a.ratios) : {} } catch { /* bozuk JSON → boş */ }
    return {
      entity: a.entity?.name ?? '(silinmiş firma)',
      sector: a.entity?.sector ?? null,
      year: a.year,
      period: a.period,
      mode: a.mode,
      finalScore: a.finalScore,
      rating: a.finalRating,
      liquidity: a.liquidityScore,
      profitability: a.profitabilityScore,
      leverage: a.leverageScore,
      activity: a.activityScore,
      financialScore: ratios.__financialScore ?? null,
      subjectiveTotal: ratios.__subjectiveTotal ?? null,
    }
  })
  rows.sort((x, y) => x.entity.localeCompare(y.entity, 'tr') || y.year - x.year || String(y.period).localeCompare(String(x.period)))
  fs.writeFileSync(OUT, JSON.stringify({ capturedAt: new Date().toISOString(), rows }, null, 2))
  for (const r of rows) console.log(`${r.entity.padEnd(22)} ${r.year} ${String(r.period).padEnd(7)} score=${r.finalScore} rating=${r.rating} fin=${r.financialScore} subj=${r.subjectiveTotal}`)
  console.log(`\n${rows.length} analiz, ${new Set(rows.map(r => r.entity)).size} firma → ${OUT}`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
