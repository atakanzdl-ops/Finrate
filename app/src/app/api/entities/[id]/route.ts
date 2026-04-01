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

// GET /api/entities/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const entity = await prisma.entity.findFirst({
    where: { id, userId },
    include: {
      financialData: { orderBy: [{ year: 'desc' }, { period: 'asc' }] },
      group: { select: { id: true, name: true } },
    },
  })

  if (!entity) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })
  return NextResponse.json({ entity })
}

// PATCH /api/entities/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

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

    return NextResponse.json({ entity })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}

// DELETE /api/entities/[id] — soft delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.entity.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Bulunamadı.' }, { status: 404 })

  await prisma.entity.update({ where: { id }, data: { isActive: false } })
  return NextResponse.json({ success: true })
}
