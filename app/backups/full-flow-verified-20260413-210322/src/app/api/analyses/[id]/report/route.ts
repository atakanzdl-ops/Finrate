import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

/**
 * POST /api/analyses/[id]/report
 * Analizi "raporlandı" olarak işaretler (reportedAt = now)
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params

  const analysis = await prisma.analysis.findFirst({ where: { id, userId } })
  if (!analysis) return jsonUtf8({ error: 'Analiz bulunamadı.' }, { status: 404 })

  await prisma.analysis.update({
    where: { id },
    data: { reportedAt: new Date() },
  })

  return jsonUtf8({ ok: true })
}
