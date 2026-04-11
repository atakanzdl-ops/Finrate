import { NextRequest, NextResponse } from 'next/server'
import { jsonUtf8 } from '@/lib/http/jsonUtf8'
import { prisma } from '@/lib/db'
import { getUserIdFromRequest } from '@/lib/auth'

// GET /api/entities — kullanıcının şirketleri
export async function GET(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  const entities = await prisma.entity.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      taxNumber: true,
      sector: true,
      entityType: true,
      groupId: true,
      ownershipPct: true,
      createdAt: true,
      group: { select: { name: true } },
      _count: { select: { financialData: true } },
    },
  })

  return jsonUtf8({ entities })
}

// POST /api/entities — yeni şirket oluştur
export async function POST(req: NextRequest) {
  const userId = getUserIdFromRequest(req)
  if (!userId) return jsonUtf8({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const body = await req.json()
    const { name, taxNumber, sector, entityType, groupId, ownershipPct, weightBasis } = body

    if (!name || name.trim().length < 2) {
      return jsonUtf8({ error: 'Şirket adı en az 2 karakter olmalıdır.' }, { status: 400 })
    }

    const entity = await prisma.entity.create({
      data: {
        userId,
        name: name.trim(),
        taxNumber: taxNumber ?? null,
        sector: sector ?? null,
        entityType: entityType ?? 'STANDALONE',
        groupId: groupId ?? null,
        ownershipPct: ownershipPct != null ? ownershipPct : null,
        weightBasis: weightBasis ?? 'REVENUE',
      },
    })

    return jsonUtf8({ entity }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[POST /api/entities]', msg)
    return jsonUtf8({ error: 'Sunucu hatası.', detail: msg }, { status: 500 })
  }
}
