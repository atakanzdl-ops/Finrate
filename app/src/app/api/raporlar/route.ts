import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

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

  return jsonUtf8({ reports })
}

export async function DELETE(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return jsonUtf8({ error: 'id gerekli.' }, { status: 400 })

  const analysis = await prisma.analysis.findFirst({ where: { id, userId } })
  if (!analysis) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.analysis.update({ where: { id }, data: { reportedAt: null } })

  return jsonUtf8({ ok: true })
}
