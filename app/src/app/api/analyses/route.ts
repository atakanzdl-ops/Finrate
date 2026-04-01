import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function getUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return null
    return verifyToken(token).userId
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const analyses = await prisma.analysis.findMany({
    where: { userId, mode: 'SOLO' },
    orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      year: true,
      period: true,
      finalScore: true,
      finalRating: true,
      liquidityScore: true,
      profitabilityScore: true,
      leverageScore: true,
      activityScore: true,
      ratios: true,
      entity: { select: { id: true, name: true } },
    },
    take: 50,
  })

  return NextResponse.json({ analyses })
}
