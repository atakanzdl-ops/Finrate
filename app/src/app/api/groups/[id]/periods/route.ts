import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/groups/[id]/periods
// Gruptaki şirketlerin verisinin olduğu yıl/dönem kombinasyonlarını döndürür
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({
    where: { id, userId },
    include: { entities: { where: { isActive: true }, select: { id: true } } },
  })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const entityIds = group.entities.map((e) => e.id)
  if (!entityIds.length) return jsonUtf8({ periods: [] })

  const rows = await prisma.financialData.findMany({
    where: { entityId: { in: entityIds } },
    select: { year: true, period: true },
    orderBy: [{ year: 'desc' }, { period: 'asc' }],
  })

  // Unique kombinasyonlar
  const seen = new Set<string>()
  const periods: { year: number; period: string }[] = []
  for (const r of rows) {
    const key = `${r.year}_${r.period}`
    if (!seen.has(key)) {
      seen.add(key)
      periods.push({ year: r.year, period: r.period })
    }
  }

  // Sırala: yıl azalan, dönem azalan (ANNUAL en sona Q4 en başa)
  periods.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year
    const order: Record<string, number> = { Q4: 0, Q3: 1, Q2: 2, Q1: 3, ANNUAL: 4 }
    return (order[a.period] ?? 5) - (order[b.period] ?? 5)
  })

  return jsonUtf8({ periods })
}
