import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { sortPeriods } from '@/lib/periods'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id: analysisId } = await params

  // Mevcut analizi bul (userId güvenliği)
  const current = await prisma.analysis.findFirst({
    where: { id: analysisId, userId },
    select: { id: true, year: true, period: true, entity: { select: { id: true } } },
  })
  if (!current) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  const entityId = current.entity?.id ?? null
  if (!entityId) return jsonUtf8({ error: 'Entity bulunamadı.' }, { status: 404 })

  // Aynı entity'ye ait tüm analizler
  const all = await prisma.analysis.findMany({
    where: { entityId, userId },
    select: { id: true, year: true, period: true },
    orderBy: [{ year: 'asc' }, { period: 'asc' }],
  })

  const sorted = sortPeriods(all)

  return jsonUtf8({
    current: { id: current.id, year: current.year, period: current.period },
    options: sorted.map(a => ({ id: a.id, year: a.year, period: a.period })),
  })
}
