import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/analyses/[id]/report
 * Analizi "raporlandı" olarak işaretler (reportedAt = now)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  const analysis = await prisma.analysis.findFirst({ where: { id, userId } })
  if (!analysis) return NextResponse.json({ error: 'Analiz bulunamadı.' }, { status: 404 })

  await prisma.analysis.update({
    where: { id },
    data: { reportedAt: new Date() },
  })

  return NextResponse.json({ ok: true })
}
