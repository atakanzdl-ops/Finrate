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

// GET /api/groups/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({
    where: { id, userId },
    include: {
      entities: {
        where: { isActive: true },
        select: { id: true, name: true, entityType: true, ownershipPct: true, sector: true },
      },
    },
  })

  if (!group) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })
  return NextResponse.json({ group })
}

// PATCH /api/groups/[id] — şirket ekle/çıkar veya adı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()

  // Şirket gruba ekle/çıkar
  if (body.addEntityId) {
    await prisma.entity.update({
      where: { id: body.addEntityId },
      data: { groupId: id, entityType: body.entityType ?? 'SUBSIDIARY' },
    })
  }
  if (body.removeEntityId) {
    await prisma.entity.update({
      where: { id: body.removeEntityId },
      data: { groupId: null, entityType: 'STANDALONE' },
    })
  }

  // Ad güncellemesi
  if (body.name) {
    await prisma.group.update({ where: { id }, data: { name: body.name.trim() } })
  }

  const updated = await prisma.group.findFirst({
    where: { id },
    include: { entities: { where: { isActive: true }, select: { id: true, name: true, entityType: true } } },
  })

  return NextResponse.json({ group: updated })
}

// DELETE /api/groups/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  // Gruptaki şirketleri standalone yap
  await prisma.entity.updateMany({ where: { groupId: id }, data: { groupId: null, entityType: 'STANDALONE' } })
  await prisma.group.delete({ where: { id } })

  return NextResponse.json({ success: true })
}
