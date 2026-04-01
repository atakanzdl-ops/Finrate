import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyToken } from '@/lib/auth'

function getUserId(req: NextRequest): string | null {
  try {
    const token = req.cookies.get('finrate_token')?.value
    if (!token) return null
    const payload = verifyToken(token)
    return payload.userId
  } catch {
    return null
  }
}

// GET /api/entities — kullanıcının şirketleri
export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

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

  return NextResponse.json({ entities })
}

// POST /api/entities — yeni şirket oluştur
export async function POST(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  try {
    const body = await req.json()
    const { name, taxNumber, sector, entityType, groupId, ownershipPct, weightBasis } = body

    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Şirket adı en az 2 karakter olmalıdır.' }, { status: 400 })
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

    return NextResponse.json({ entity }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Sunucu hatası.' }, { status: 500 })
  }
}
