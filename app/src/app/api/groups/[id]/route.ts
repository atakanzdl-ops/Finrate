import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/groups/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

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

  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })
  return jsonUtf8({ group })
}

// PATCH /api/groups/[id] — şirket ekle/çıkar veya adı güncelle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()

  // Şirket gruba ekle/çıkar — ownership kontrolü zorunlu
  if (body.addEntityId) {
    const entityToAdd = await prisma.entity.findFirst({ where: { id: body.addEntityId, userId } })
    if (!entityToAdd) return jsonUtf8({ error: 'Şirket bulunamadı veya erişim yetkiniz yok.' }, { status: 404 })
    await prisma.entity.update({
      where: { id: body.addEntityId },
      data: { groupId: id, entityType: body.entityType ?? 'SUBSIDIARY' },
    })
  }
  if (body.removeEntityId) {
    const entityToRemove = await prisma.entity.findFirst({ where: { id: body.removeEntityId, userId } })
    if (!entityToRemove) return jsonUtf8({ error: 'Şirket bulunamadı veya erişim yetkiniz yok.' }, { status: 404 })
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

  return jsonUtf8({ group: updated })
}

// DELETE /api/groups/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const group = await prisma.group.findFirst({ where: { id, userId } })
  if (!group) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  // Gruptaki şirketleri standalone yap
  await prisma.entity.updateMany({ where: { groupId: id }, data: { groupId: null, entityType: 'STANDALONE' } })
  await prisma.group.delete({ where: { id } })

  return jsonUtf8({ success: true })
}
