import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const reports = await prisma.analysis.findMany({
    where: { userId, mode: 'SOLO', reportedAt: { not: null } },
    orderBy: { reportedAt: 'desc' },
    select: {
      id: true,
      year: true,
      period: true,
      finalScore: true,
      finalRating: true,
      reportedAt: true,
      entity: { select: { id: true, name: true, sector: true } },
    },
    take: 200,
  })

  return NextResponse.json({ reports })
}
