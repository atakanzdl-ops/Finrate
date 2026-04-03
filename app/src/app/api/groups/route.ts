import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getUserIdFromRequest } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const groups = await prisma.group.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { entities: true } },
      entities: { select: { id: true, name: true, entityType: true, ownershipPct: true } },
    },
  })

  return NextResponse.json({ groups })
}

export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const body = await req.json()
  const { name, baseCurrency = 'TRY' } = body

  if (!name || name.trim().length < 2) {
    return NextResponse.json({ error: 'Grup adı en az 2 karakter olmalıdır.' }, { status: 400 })
  }

  const group = await prisma.group.create({
    data: { userId, name: name.trim(), baseCurrency },
  })

  return NextResponse.json({ group }, { status: 201 })
}
