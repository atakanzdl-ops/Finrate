import { NextRequest } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/groups/[id]/tenzilat — tüm aktif kayıtlar
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const entries = await prisma.tenzilatEntry.findMany({
    where: { groupId: id, isActive: true },
    orderBy: { createdAt: 'desc' },
  })

  return jsonUtf8({ entries })
}

// POST /api/groups/[id]/tenzilat — yeni tenzilat kaydı
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()
  const { field, amount, description, year, period = 'ANNUAL' } = body

  if (!field || amount == null || !description || !year) {
    return jsonUtf8({ error: 'field, amount, description, year zorunlu.' }, { status: 400 })
  }

  const entry = await prisma.tenzilatEntry.create({
    data: {
      userId,
      groupId: id,
      adjustmentType:   field,
      adjustmentAmount: Number(amount),
      description:      String(description).trim(),
      year:             Number(year),
      period:           String(period),
      scope:            'group',
      isActive:         true,
    },
  })

  return jsonUtf8({ entry }, { status: 201 })
}
