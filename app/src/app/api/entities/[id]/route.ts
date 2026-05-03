import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/entities/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entity = await prisma.entity.findFirst({
    where: { id, userId },
    include: {
      financialData: {
        orderBy: [{ year: 'desc' }, { period: 'asc' }],
        include: { manualAdjustments: { select: { fieldName: true } } },
      },
      group: { select: { id: true, name: true } },
    },
  })

  if (!entity) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })
  return jsonUtf8({ entity })
}

// PATCH /api/entities/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  try {
    const body = await req.json()
    const { name, taxNumber, sector, entityType, groupId, ownershipPct, weightBasis } = body

    const entity = await prisma.entity.update({
      where: { id },
      data: {
        ...(name        && { name: name.trim() }),
        ...(taxNumber   !== undefined && { taxNumber }),
        ...(sector      !== undefined && { sector }),
        ...(entityType  && { entityType }),
        ...(groupId     !== undefined && { groupId }),
        ...(ownershipPct !== undefined && { ownershipPct }),
        ...(weightBasis  && { weightBasis }),
      },
    })

    return jsonUtf8({ entity })
  } catch {
    return jsonUtf8({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}

// DELETE /api/entities/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return jsonUtf8({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.entity.update({ where: { id }, data: { isActive: false } })
  return jsonUtf8({ success: true })
}
