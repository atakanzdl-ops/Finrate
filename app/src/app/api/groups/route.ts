import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const groups = await prisma.group.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { entities: true } },
      entities: { select: { id: true, name: true, entityType: true, ownershipPct: true } },
    },
  })

  return jsonUtf8({ groups })
}

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json()
  const { name, baseCurrency = 'TRY' } = body

  if (!name || name.trim().length < 2) {
    return jsonUtf8({ error: 'Grup adı en az 2 karakter olmalıdır.' }, { status: 400 })
  }

  const group = await prisma.group.create({
    data: { userId, name: name.trim(), baseCurrency },
  })

  return jsonUtf8({ group }, { status: 201 })
}
