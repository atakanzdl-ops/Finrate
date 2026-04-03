import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken, getUserIdFromRequest } from '@/lib/auth'

// PATCH /api/tenzilat/[id] — aktif/pasif toggle
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entry = await prisma.tenzilatEntry.findFirst({ where: { id, userId, deletedAt: null } })
  if (!entry) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  const body = await req.json()
  const newActive = body.isActive ?? !entry.isActive

  const updated = await prisma.tenzilatEntry.update({
    where: { id },
    data: { isActive: newActive, updatedAt: new Date() },
  })

  await prisma.tenzilatAuditLog.create({
    data: {
      entryId:  id,
      userId,
      action:   newActive ? 'ACTIVATED' : 'DEACTIVATED',
      oldValue: String(entry.isActive),
      newValue: String(newActive),
    },
  })

  return NextResponse.json({ entry: updated })
}

// DELETE /api/tenzilat/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entry = await prisma.tenzilatEntry.findFirst({ where: { id, userId, deletedAt: null } })
  if (!entry) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.tenzilatEntry.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  })

  await prisma.tenzilatAuditLog.create({
    data: {
      entryId:  id,
      userId,
      action:   'DELETED',
      ipAddress: req.headers.get('x-forwarded-for') ?? null,
    },
  })

  return NextResponse.json({ success: true })
}
