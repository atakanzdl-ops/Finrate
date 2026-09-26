import { prisma } from '../src/lib/db'
import { rescoreFinancialData } from '../src/lib/scoring/rescoreFinancialData'

// Bir firmanın (veya ALL ile tüm firmaların) tüm dönemlerini ortak skorlama yoluyla yeniden skorlar.
//   npx tsx --env-file=.env.local scripts/rescore-entity.ts <entityId|ALL>
// Skor motoru değişmediyse skorlar aynı kalır; guardrail/uyarı metinleri ve meta yenilenir.

async function main() {
  const arg = process.argv[2]
  if (!arg) { console.error('Kullanım: rescore-entity.ts <entityId|ALL>'); process.exit(1) }
  const rows = await prisma.financialData.findMany({
    where: arg === 'ALL' ? { analysis: { isNot: null } } : { entityId: arg, analysis: { isNot: null } },
    select: { id: true, year: true, period: true, entity: { select: { name: true } }, analysis: { select: { finalScore: true, finalRating: true } } },
    orderBy: [{ entityId: 'asc' }, { year: 'asc' }],
  })
  for (const fd of rows) {
    const before = `${fd.analysis?.finalScore} ${fd.analysis?.finalRating}`
    const r = await rescoreFinancialData(fd.id)
    const after = r ? `${r.resolved.finalScore} ${r.resolved.finalRating}` : 'atlandı'
    console.log(`${(fd.entity?.name ?? '?').padEnd(28)} ${fd.year} ${fd.period.padEnd(6)} ${before.padEnd(10)} → ${after}`)
  }
  console.log(`\n${rows.length} dönem yeniden skorlandı`)
  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
